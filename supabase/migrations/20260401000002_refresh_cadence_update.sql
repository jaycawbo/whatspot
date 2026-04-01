-- Refresh cadence update
-- Replaces the daily refresh-venue-hours cron with the revised schedule:
--   Weekly  (Mon 6am UTC): refresh-venue-weekly  — Enterprise fields only
--   Quarterly (1 Jan/Apr/Jul/Oct 5am UTC): refresh-venue-photos — Atmosphere fields only
--
-- The old refresh-venue-hours-daily job is removed; refresh-venue-hours edge function
-- is superseded by refresh-venue-weekly and refresh-venue-photos.

-- Remove old daily hours job if it was applied
SELECT cron.unschedule('refresh-venue-hours-daily');

-- Weekly Enterprise refresh: rating, review_count, hours, phone, website
-- Runs Monday 6am UTC. Processes up to 50 stale venues per run.
SELECT cron.schedule(
  'refresh-venue-weekly',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/refresh-venue-weekly',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"batch_size": 50}'::jsonb
  );
  $$
);

-- Quarterly Atmosphere refresh: photos only
-- Runs 1st of Jan, Apr, Jul, Oct at 5am UTC.
SELECT cron.schedule(
  'refresh-venue-photos-quarterly',
  '0 5 1 1,4,7,10 *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/refresh-venue-photos',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"batch_size": 50}'::jsonb
  );
  $$
);
