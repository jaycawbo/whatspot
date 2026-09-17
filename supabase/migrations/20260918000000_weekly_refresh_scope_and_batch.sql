-- Issue #341: refresh-venue-weekly's candidate query was unscoped, pulling
-- from all ~39k venues in the table in oldest-refreshed-first order. Every
-- live Feed tab (New, Popular, Walk-In Friendly, For You's primary pass)
-- only ever shows venues with is_chain = false AND rating >= 4.0 (~5k
-- venues) — the other ~87% of the table (chains, sub-4.0-rated venues) can
-- never surface there regardless of freshness. Trending, which previously
-- justified broader unscoped sampling, is disabled.
--
-- The function code (refresh-venue-weekly/index.ts, venue-refresh-health/
-- index.ts, search-venues-db/index.ts) now scopes its candidate query to
-- that same eligible cohort and the staleness window moved from 7 to 30
-- days. This migration just resizes the weekly cron's batch so the ~5k
-- cohort actually cycles within that 30-day window instead of the old
-- 50/week rate, which could never keep pace (at 50/week, the pre-scoping
-- 39k-venue backlog would have taken ~15 years to clear once).
--
-- Batch size: 1200/week ≈ 5,200 calls/month, comfortably under the shared
-- apiCallLog 'weekly' cap of 10,000/month (issue #324), leaving headroom for
-- on-demand refreshes queued by search-venues-db under the same cap.
-- cron.schedule() re-registering the same job name updates it in place.

SELECT cron.schedule(
  'refresh-venue-weekly',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://rtihqiogvamfaqitmowx.supabase.co/functions/v1/refresh-venue-weekly',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aWhxaW9ndmFtZmFxaXRtb3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTA0MzcsImV4cCI6MjA4NzE2NjQzN30.yb7WiO6qtgl5lw4lGXgICL1Df20plVyds52SL5cFTlo"}'::jsonb,
    body    := '{"batch_size": 1200}'::jsonb
  );
  $$
);
