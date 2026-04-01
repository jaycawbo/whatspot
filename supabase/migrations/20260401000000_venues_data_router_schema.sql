-- Data Router Schema Additions
-- Adds staleness-tracking columns, enrichment fields, and data_source marker to venues table.
--
-- HOURS FORMAT WARNING:
-- opening_hours is stored as jsonb. The Google Places API (New) returns
-- weekdayDescriptions as an array of human-readable strings (e.g. "Monday: 11:00 AM – 10:00 PM").
-- This format is NOT machine-readable for client-side "open now" computation.
-- Before wiring up open-now logic, the hours data must be stored in a structured format:
--   [{ day: 0, open: "11:00", close: "22:00" }, ...]
-- where day 0 = Sunday. Do not implement open-now until this format is confirmed.

-- ── Tier 1 enrichment fields (refresh annually) ──────────────────────────────
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS neighbourhood  text,
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS website        text;

-- ── Tier 2 enrichment fields (refresh monthly) ───────────────────────────────
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS ai_description      text,
  ADD COLUMN IF NOT EXISTS photos_last_updated timestamptz,
  ADD COLUMN IF NOT EXISTS rating_last_updated timestamptz;

-- ── Tier 3 enrichment fields (refresh weekly, non-blocking) ──────────────────
-- opening_hours: store as jsonb array of structured objects, NOT raw strings.
--   Expected shape: [{ day: 0-6, open: "HH:MM", close: "HH:MM" }]
--   day 0 = Sunday, following JS Date.getDay() convention.
-- is_temporarily_closed: true when Google reports the venue as temporarily closed.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS opening_hours         jsonb,
  ADD COLUMN IF NOT EXISTS is_temporarily_closed boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS hours_last_updated    timestamptz;

-- ── Data provenance ───────────────────────────────────────────────────────────
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'google_places';

-- Index for staleness queries (background refresh jobs)
CREATE INDEX IF NOT EXISTS venues_hours_last_updated_idx  ON public.venues (hours_last_updated);
CREATE INDEX IF NOT EXISTS venues_rating_last_updated_idx ON public.venues (rating_last_updated);
CREATE INDEX IF NOT EXISTS venues_photos_last_updated_idx ON public.venues (photos_last_updated);
