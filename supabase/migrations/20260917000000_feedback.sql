-- ─────────────────────────────────────────────────────────────
-- General feedback (issue #318)
--
-- Single sink for bug reports / feature requests / venue issues /
-- general feedback, replacing the narrower venue_flags table.
-- venue_id remains the google_place_id text (nullable — only set
-- for venue-scoped submissions), matching venue_flags' convention.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  closed_reason text NOT NULL,
  open_text text,
  venue_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_venue_id_idx ON public.feedback (venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX feedback_category_idx ON public.feedback (category);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can submit feedback as themselves
CREATE POLICY "feedback_insert_own" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only admins can read/manage feedback (no notifications/triage UI in v1)
CREATE POLICY "feedback_admin_select" ON public.feedback
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE);

CREATE POLICY "feedback_admin_delete" ON public.feedback
  FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE);

-- Service-role full access — edge functions if needed later
CREATE POLICY "feedback_service_all" ON public.feedback
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- venue_flags is superseded by feedback (no valuable data, no backfill needed).
DROP TABLE public.venue_flags;

-- NOTE: venues.is_removed and its venues_admin_update RLS policy (added in
-- 20260912000001_venue_flags.sql) are unrelated to venue_flags/feedback and
-- are intentionally left untouched here.
