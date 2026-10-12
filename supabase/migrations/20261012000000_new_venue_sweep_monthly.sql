-- New-venue sweep: monthly discovery instead of quarterly (issue #407).
-- census-sweep now keys runs by month ("2026-11"). Days 1-3 stay as buffer: one discovery pass is
-- ~100 batches at 15-minute spacing. Discovery is free (IDs-only); the locate and fill monthly caps
-- in api_call_log are unchanged, and the daily drip still finishes whichever run is oldest.

DO $$
BEGIN
  PERFORM cron.unschedule('new-venue-sweep-quarterly');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled
END $$;

SELECT cron.schedule(
  'new-venue-sweep-monthly',
  '*/15 * 1-3 * *',
  $$
  SELECT net.http_post(
    url     := 'https://rtihqiogvamfaqitmowx.supabase.co/functions/v1/census-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aWhxaW9ndmFtZmFxaXRtb3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTA0MzcsImV4cCI6MjA4NzE2NjQzN30.yb7WiO6qtgl5lw4lGXgICL1Df20plVyds52SL5cFTlo',
      'x-sweep-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sweep_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
