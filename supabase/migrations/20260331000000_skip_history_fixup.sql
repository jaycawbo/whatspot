-- ─────────────────────────────────────────────────────────────
-- Skip history fixup: unique index + missing RLS policies
--
-- The brantford migration created the skip_history table but
-- omitted the unique index (required for upserts) and the
-- UPDATE policy (required for upserts to overwrite existing rows).
-- ─────────────────────────────────────────────────────────────

-- Unique index on (user_id, venue_id) — enables upsert with onConflict
CREATE UNIQUE INDEX IF NOT EXISTS skip_history_user_venue_idx
  ON public.skip_history (user_id, venue_id);

-- UPDATE policy — required for upserts that overwrite existing rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'skip_history'
      AND policyname = 'skip_history_update_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "skip_history_update_own"
        ON public.skip_history
        FOR UPDATE TO authenticated
        USING (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- Service-role full access — allows edge functions to query/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'skip_history'
      AND policyname = 'skip_history_service_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "skip_history_service_all"
        ON public.skip_history
        FOR ALL TO service_role
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;
