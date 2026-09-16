-- ─────────────────────────────────────────────────────────────
-- Dedup marker for the on-demand weekly refresh (issue #324).
--
-- search-venues-db fires a fire-and-forget refresh-venue-weekly call for
-- every stale venue in a DB response, with no dedup — the same popular-but-
-- stale venue served to many concurrent requests could queue many redundant
-- Enterprise-tier Places API calls before any of them finished. This column
-- lets search-venues-db "claim" a venue for refresh so it isn't re-queued
-- while a refresh is presumably still in flight.
--
-- Does not affect the weekly/quarterly pg_cron jobs themselves (Popular/New
-- feed tabs depend only on those, via feed-tabs, which never calls
-- search-venues-db or refresh-venue-weekly) — this only dedups the separate
-- on-demand path used by search.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS weekly_refresh_queued_at timestamptz;

CREATE INDEX IF NOT EXISTS venues_weekly_refresh_queued_at_idx
  ON public.venues (weekly_refresh_queued_at);
