-- Fill swept venues at $0 (issue #382 follow-up). Replaces the paid per-venue Place Details
-- fetch (~$0.02 each) with two phases that stay inside Google's monthly free allowances:
--   locate: Place Details Essentials (id, location, types; ~10,000 free/month) per candidate,
--           dropping candidates that could never appear in the feed.
--   fill:   Text Search Enterprise (~1,000 free/month, up to 20 full venues per call) over the
--           grid squares with the most pending candidates, capped at 800 calls/month.

ALTER TABLE venue_sweep_candidates
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS types text[],
  ADD COLUMN IF NOT EXISTS cell_idx integer,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS located_at timestamptz;

CREATE INDEX IF NOT EXISTS venue_sweep_candidates_fill
  ON venue_sweep_candidates (cell_idx) WHERE fetched_at IS NULL AND located_at IS NOT NULL;

-- Phases are now discover -> locate -> fill -> done ('fetch' retired).
ALTER TABLE venue_sweep_state DROP CONSTRAINT IF EXISTS venue_sweep_state_phase_check;
UPDATE venue_sweep_state SET phase = 'locate' WHERE phase = 'fetch';
ALTER TABLE venue_sweep_state ADD CONSTRAINT venue_sweep_state_phase_check
  CHECK (phase IN ('discover', 'locate', 'fill', 'done'));

-- Daily drip for the fill phase (~25 calls/day stays under the 800/month cap). Works on whichever
-- quarter still has candidates to locate or fill; a no-op once everything is done.
SELECT cron.schedule(
  'new-venue-fill-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://rtihqiogvamfaqitmowx.supabase.co/functions/v1/census-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aWhxaW9ndmFtZmFxaXRtb3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTA0MzcsImV4cCI6MjA4NzE2NjQzN30.yb7WiO6qtgl5lw4lGXgICL1Df20plVyds52SL5cFTlo',
      'x-sweep-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sweep_secret')
    ),
    body    := '{"mode": "drip"}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
