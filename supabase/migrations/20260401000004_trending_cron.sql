-- Daily trending score calculation job
-- Runs at 3am UTC every day
SELECT cron.schedule(
  'calculate-trending-scores-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://rtihqiogvamfaqitmowx.supabase.co/functions/v1/calculate-trending-scores',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aWhxaW9ndmFtZmFxaXRtb3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTA0MzcsImV4cCI6MjA4NzE2NjQzN30.yb7WiO6qtgl5lw4lGXgICL1Df20plVyds52SL5cFTlo"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
