-- Store business_status and current_opening_hours from Google Places API.
-- business_status already exists in prod (added via dashboard) — IF NOT EXISTS is safe.
-- current_opening_hours and current_hours_cached_at are new columns.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS business_status         text,
  ADD COLUMN IF NOT EXISTS current_opening_hours   jsonb,
  ADD COLUMN IF NOT EXISTS current_hours_cached_at timestamptz;

CREATE INDEX IF NOT EXISTS venues_business_status_idx
  ON venues (business_status);

CREATE INDEX IF NOT EXISTS venues_current_hours_cached_at_idx
  ON venues (current_hours_cached_at);
