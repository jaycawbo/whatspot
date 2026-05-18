DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'api_call_log' AND policyname = 'anon read api_call_log'
  ) THEN
    CREATE POLICY "anon read api_call_log"
      ON api_call_log FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
