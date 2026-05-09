CREATE TABLE IF NOT EXISTS api_call_log (
  id          bigserial    PRIMARY KEY,
  service     text         NOT NULL DEFAULT 'google_places',
  call_type   text         NOT NULL,
  venue_id    text,
  called_at   timestamptz  NOT NULL DEFAULT now(),
  month_key   text         NOT NULL
);

CREATE INDEX IF NOT EXISTS api_call_log_service_month_idx ON api_call_log(service, month_key);

ALTER TABLE api_call_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (for the dashboard)
CREATE POLICY "Authenticated users can read api_call_log"
  ON api_call_log FOR SELECT
  TO authenticated
  USING (true);

-- Edge functions use service role key which bypasses RLS — no insert policy needed
