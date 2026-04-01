-- Schedule daily hours refresh at 2am Toronto time (7am UTC)
-- Runs after aggregate-venue-signals (3am UTC) to avoid contention.
-- Processes up to 50 stale venues per run; will catch up across days for large venue sets.
SELECT cron.schedule(
  'refresh-venue-hours-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/refresh-venue-hours',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body   := '{"batch_size": 50}'::jsonb
  );
  $$
);
