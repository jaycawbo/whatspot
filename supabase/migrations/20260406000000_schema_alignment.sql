-- ============================================================
-- Schema Alignment Migration
-- 2026-04-06
--
-- Operations:
--   1. venues — rename columns to canonical names, fix types
--   2. favorites → saved_venues + add list_name, notes, rating
--   3. user_labels — rename label_name → label
--   4. venue_user_labels — rename venue_id → google_place_id, add FK
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- PART 1: venues column renames + type fixes
-- ─────────────────────────────────────────────────────────────

-- Write-once ingestion count (was: snapshot_review_count_at_ingestion)
ALTER TABLE venues RENAME COLUMN snapshot_review_count_at_ingestion TO review_count_at_ingestion;

-- Trending review count fields
ALTER TABLE venues RENAME COLUMN trending_current_review_count TO review_count_current;
ALTER TABLE venues RENAME COLUMN trending_previous_review_count TO review_count_30d_ago;

-- trending_score_date: DATE → TIMESTAMPTZ
ALTER TABLE venues ALTER COLUMN trending_score_date TYPE TIMESTAMPTZ USING trending_score_date::timestamptz;

-- types JSONB → venue_types text[]
-- Assumes types stores a JSON array of strings e.g. ["restaurant","food"]
ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_types text[];
UPDATE venues
  SET venue_types = ARRAY(SELECT jsonb_array_elements_text(types))
  WHERE types IS NOT NULL
    AND jsonb_typeof(types) = 'array';
ALTER TABLE venues DROP COLUMN IF EXISTS types;

-- Confirmed already correct — no changes needed:
--   opening_hours jsonb    (added 20260401000000)
--   trending_score float   (added 20260401000003)
--   price_level integer    (added 20260401000003)


-- Update trigger function to reference renamed column
CREATE OR REPLACE FUNCTION protect_snapshot_review_count()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.review_count_at_ingestion IS NOT NULL THEN
    NEW.review_count_at_ingestion := OLD.review_count_at_ingestion;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger binding is on the table, not the column name — no DROP/CREATE needed.
-- The function update above is sufficient.

-- Update index to match renamed column
DROP INDEX IF EXISTS venues_snapshot_review_count_idx;
CREATE INDEX IF NOT EXISTS venues_review_count_at_ingestion_idx ON venues (review_count_at_ingestion);


-- ─────────────────────────────────────────────────────────────
-- PART 2: favorites → saved_venues
-- ─────────────────────────────────────────────────────────────

ALTER TABLE favorites RENAME TO saved_venues;

-- Existing columns preserved: id, user_id, venue_id (uuid FK venues.id), labels text[], created_at
-- Existing RLS policies follow the rename automatically in Postgres.

ALTER TABLE saved_venues
  ADD COLUMN IF NOT EXISTS list_name text
    CHECK (list_name IN ('Favourites', 'Interested', 'Been To', 'Not Interested', 'Didn''t Like'));

ALTER TABLE saved_venues
  ADD COLUMN IF NOT EXISTS notes text
    CHECK (char_length(notes) <= 350);

ALTER TABLE saved_venues
  ADD COLUMN IF NOT EXISTS rating integer
    CHECK (rating IN (0, 1, 2));


-- ─────────────────────────────────────────────────────────────
-- PART 3: user_labels — rename label_name → label
-- ─────────────────────────────────────────────────────────────

ALTER TABLE user_labels DROP CONSTRAINT IF EXISTS user_labels_user_label_key;
ALTER TABLE user_labels RENAME COLUMN label_name TO label;
ALTER TABLE user_labels ADD CONSTRAINT user_labels_user_label_key UNIQUE (user_id, label);

-- RLS policies do not reference column names — no changes needed.


-- ─────────────────────────────────────────────────────────────
-- PART 4: venue_user_labels — rename venue_id → google_place_id, add FK
-- ─────────────────────────────────────────────────────────────

ALTER TABLE venue_user_labels RENAME COLUMN venue_id TO google_place_id;

ALTER TABLE venue_user_labels DROP CONSTRAINT IF EXISTS venue_user_labels_unique;

-- Add FK to venues(google_place_id)
-- NOTE: will fail if orphaned rows exist — safe on empty/dev DB.
ALTER TABLE venue_user_labels
  ADD CONSTRAINT venue_user_labels_google_place_id_fkey
    FOREIGN KEY (google_place_id) REFERENCES venues(google_place_id) ON DELETE CASCADE;

ALTER TABLE venue_user_labels
  ADD CONSTRAINT venue_user_labels_unique
    UNIQUE (user_id, google_place_id, label_id);

DROP INDEX IF EXISTS idx_vul_venue_id;
CREATE INDEX IF NOT EXISTS idx_vul_google_place_id ON venue_user_labels(google_place_id);
