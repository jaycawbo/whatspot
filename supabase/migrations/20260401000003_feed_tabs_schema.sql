-- Feed Mode Tabs + Filter System — venue table additions
-- price_level already exists (renamed from price_range in earlier migration, likely TEXT)
-- Convert to INTEGER (1=Inexpensive, 2=Moderate, 3=Expensive, 4=Very Expensive)
-- SAFE on empty/new project — no existing rows to lose data on
ALTER TABLE venues ALTER COLUMN price_level TYPE INTEGER USING
  CASE price_level
    WHEN '$'    THEN 1
    WHEN '$$'   THEN 2
    WHEN '$$$'  THEN 3
    WHEN '$$$$' THEN 4
    ELSE NULL
  END;

-- opening_hours already exists (currentOpeningHours)

-- Annual refresh fields
ALTER TABLE venues ADD COLUMN IF NOT EXISTS types JSONB;

-- Weekly refresh fields
ALTER TABLE venues ADD COLUMN IF NOT EXISTS regular_opening_hours JSONB;

-- Write-once at first ingestion — never updated by any subsequent refresh
ALTER TABLE venues ADD COLUMN IF NOT EXISTS snapshot_review_count_at_ingestion INTEGER;

-- Trending score fields — owned exclusively by calculate-trending-scores daily job
ALTER TABLE venues ADD COLUMN IF NOT EXISTS trending_current_review_count INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS trending_previous_review_count INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS trending_score FLOAT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS trending_score_date DATE;

-- Indexes for tab queries
CREATE INDEX IF NOT EXISTS venues_trending_score_idx ON venues (trending_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS venues_created_at_idx ON venues (created_at DESC);
CREATE INDEX IF NOT EXISTS venues_snapshot_review_count_idx ON venues (snapshot_review_count_at_ingestion);

-- Function for the New tab query: check if a venue qualifies as "new"
-- (snapshot_review_count_at_ingestion < 75 AND created_at within last 90 days)
-- No additional schema needed — handled at query time.

-- Protect snapshot_review_count_at_ingestion from being overwritten on upsert.
-- This trigger fires BEFORE UPDATE and preserves the value if already set.
CREATE OR REPLACE FUNCTION protect_snapshot_review_count()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.snapshot_review_count_at_ingestion IS NOT NULL THEN
    NEW.snapshot_review_count_at_ingestion := OLD.snapshot_review_count_at_ingestion;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_snapshot_review_count_trigger ON venues;
CREATE TRIGGER protect_snapshot_review_count_trigger
  BEFORE UPDATE ON venues
  FOR EACH ROW
  EXECUTE FUNCTION protect_snapshot_review_count();
