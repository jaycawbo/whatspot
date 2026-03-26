
CREATE TABLE public.skip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id text NOT NULL,
  interaction_type text NOT NULL,
  previous_interaction_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX skip_history_user_venue_idx ON public.skip_history (user_id, venue_id);

ALTER TABLE public.skip_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skip_history_select_own" ON public.skip_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "skip_history_insert_own" ON public.skip_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "skip_history_update_own" ON public.skip_history
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "skip_history_delete_own" ON public.skip_history
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "skip_history_service_all" ON public.skip_history
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
