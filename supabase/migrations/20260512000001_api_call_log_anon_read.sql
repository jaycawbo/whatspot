CREATE POLICY "anon read api_call_log"
  ON api_call_log FOR SELECT
  TO anon
  USING (true);
