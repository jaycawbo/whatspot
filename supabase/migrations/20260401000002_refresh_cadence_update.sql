-- Refresh cadence: weekly Enterprise call + quarterly Atmosphere call
-- Replaces the old refresh-venue-hours-daily job if it exists.

-- Safe unschedule (no-op if the job was never created)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-venue-hours-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Weekly Enterprise refresh: rating, review_count, hours, phone, website
-- One Enterprise-tier Places API call per venue. Photos deliberately excluded.
-- Runs Monday 6am UTC. Processes up to 50 stale venues per run.
SELECT cron.schedule(
  'refresh-venue-weekly',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://rtihqiogvamfaqitmowx.supabase.co/functions/v1/refresh-venue-weekly',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aWhxaW9ndmFtZmFxaXRtb3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTA0MzcsImV4cCI6MjA4NzE2NjQzN30.yb7WiO6qtgl5lw4lGXgICL1Df20plVyds52SL5cFTlo"}'::jsonb,
    body    := '{"batch_size": 50}'::jsonb
  );
  $$
);

-- Quarterly Atmosphere refresh: photos only, never batched with other fields.
-- Runs 1st of Jan, Apr, Jul, Oct at 5am UTC.
SELECT cron.schedule(
  'refresh-venue-photos-quarterly',
  '0 5 1 1,4,7,10 *',
  $$
  SELECT net.http_post(
    url     := 'https://rtihqiogvamfaqitmowx.supabase.co/functions/v1/refresh-venue-photos',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aWhxaW9ndmFtZmFxaXRtb3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTA0MzcsImV4cCI6MjA4NzE2NjQzN30.yb7WiO6qtgl5lw4lGXgICL1Df20plVyds52SL5cFTlo"}'::jsonb,
    body    := '{"batch_size": 50}'::jsonb
  );
  $$
);
