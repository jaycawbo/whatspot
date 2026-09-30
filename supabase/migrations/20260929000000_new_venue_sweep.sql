-- "New" tab supply + eligibility (issue #382).

-- 1. Record the review count a venue had when WhatSpot first saw it, on every insert path.
--    "New" = review_count_at_ingestion <= 100 and first seen in the last 6 months. Until now
--    no insert path set this column, so no venue added since the April 2026 import could qualify.
CREATE OR REPLACE FUNCTION venues_set_ingestion_review_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.review_count_at_ingestion := coalesce(NEW.review_count_at_ingestion, NEW.review_count);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_set_ingestion_review_count ON venues;
CREATE TRIGGER venues_set_ingestion_review_count
  BEFORE INSERT ON venues
  FOR EACH ROW EXECUTE FUNCTION venues_set_ingestion_review_count();

-- 2. New-venue sweep (census-sweep edge function). Discovery uses Google Text Search IDs-only
--    (free); only IDs not already in venues are paid for with a Place Details lookup.

-- Grid squares worth sweeping: the 0.005-degree Toronto grid (43.580 to 43.773 N,
-- -79.640 to -79.270 W) minus squares with no known venue within 600 m (lake, parks,
-- industrial). Snapshot taken when this migration ran.
CREATE TABLE IF NOT EXISTS venue_sweep_grid (
  idx integer PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL
);

INSERT INTO venue_sweep_grid (idx, lat, lng)
SELECT row_number() OVER (ORDER BY g.lat, g.lng) - 1, g.lat, g.lng
FROM (
  SELECT round((43.580 + i * 0.005)::numeric, 3)::float8 AS lat,
         round((-79.640 + j * 0.005)::numeric, 3)::float8 AS lng
  FROM generate_series(0, 38) i, generate_series(0, 74) j
) g
WHERE EXISTS (
  SELECT 1 FROM venues v
  WHERE v.geo IS NOT NULL
    AND ST_DWithin(v.geo, ST_SetSRID(ST_MakePoint(g.lng, g.lat), 4326)::geography, 600)
)
ON CONFLICT (idx) DO NOTHING;

-- One row per quarterly run. phase: discover -> fetch -> done. fetch_approved lets a run stop
-- after the free discovery phase until someone reviews the candidate count (first run).
CREATE TABLE IF NOT EXISTS venue_sweep_state (
  quarter_key    text PRIMARY KEY,
  phase          text NOT NULL DEFAULT 'discover' CHECK (phase IN ('discover', 'fetch', 'done')),
  next_cell      integer NOT NULL DEFAULT 0,
  fetch_approved boolean NOT NULL DEFAULT true,
  ids_seen       integer NOT NULL DEFAULT 0,
  candidates     integer NOT NULL DEFAULT 0,
  fetched        integer NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

-- Place IDs found by discovery that weren't in venues, awaiting a paid Details lookup.
CREATE TABLE IF NOT EXISTS venue_sweep_candidates (
  google_place_id text PRIMARY KEY,
  quarter_key     text NOT NULL,
  found_at        timestamptz NOT NULL DEFAULT now(),
  fetched_at      timestamptz,
  outcome         text
);
CREATE INDEX IF NOT EXISTS venue_sweep_candidates_pending
  ON venue_sweep_candidates (quarter_key) WHERE fetched_at IS NULL;

-- Service role only (the edge function); no anon/authenticated access.
ALTER TABLE venue_sweep_grid ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_sweep_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_sweep_candidates ENABLE ROW LEVEL SECURITY;

-- 3. Quarterly schedule: every 15 minutes on the 1st to 3rd of Jan/Apr/Jul/Oct. Each call does
--    one batch and saves progress; once the quarter's run is done, calls are no-ops. The sweep
--    secret lives in Vault (vault.create_secret(..., 'sweep_secret')), never in git.
SELECT cron.schedule(
  'new-venue-sweep-quarterly',
  '*/15 * 1-3 1,4,7,10 *',
  $$
  SELECT net.http_post(
    url     := 'https://rtihqiogvamfaqitmowx.supabase.co/functions/v1/census-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aWhxaW9ndmFtZmFxaXRtb3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTA0MzcsImV4cCI6MjA4NzE2NjQzN30.yb7WiO6qtgl5lw4lGXgICL1Df20plVyds52SL5cFTlo',
      'x-sweep-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sweep_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
