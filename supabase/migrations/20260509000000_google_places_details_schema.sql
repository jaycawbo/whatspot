-- google-places-details write-back columns
-- Adds venue columns for editorial/dining enrichment and reviews tracking.
-- Adds review columns for Google write-back with external dedup.

-- ── venues: new enrichment columns ────────────────────────────────────────────
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS editorial_summary   text,
  ADD COLUMN IF NOT EXISTS generative_summary  text,
  ADD COLUMN IF NOT EXISTS dining_attributes   jsonb,
  ADD COLUMN IF NOT EXISTS reviews_last_updated timestamptz;

-- ── reviews: columns for Google write-back ────────────────────────────────────
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS source_platform    text,
  ADD COLUMN IF NOT EXISTS external_review_id text,
  ADD COLUMN IF NOT EXISTS author             text,
  ADD COLUMN IF NOT EXISTS rating             numeric,
  ADD COLUMN IF NOT EXISTS review_text        text,
  ADD COLUMN IF NOT EXISTS published_at       timestamptz;

-- Unique index used by upsert ON CONFLICT for dedup
CREATE UNIQUE INDEX IF NOT EXISTS reviews_external_review_id_idx
  ON reviews(external_review_id)
  WHERE external_review_id IS NOT NULL;
