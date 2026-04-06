-- Photos hydration tracking columns
-- photos_complete = true means all available photos have been fetched; zero API calls on future serves
-- photos_fetched_count tracks how many photos have been resolved so far (one per serve)

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS photos_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS photos_fetched_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS venues_photos_complete_idx ON venues (photos_complete);
