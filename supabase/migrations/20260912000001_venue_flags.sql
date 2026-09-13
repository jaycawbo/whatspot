-- ─────────────────────────────────────────────────────────────
-- Venue flagging + admin removal (issue #312)
--
-- venue_flags: append-only user reports ("this venue doesn't
-- belong here"). venue_id is the google_place_id text, matching
-- the convention already used by skip_history/user_venue_interactions
-- (not the internal venues.id uuid).
--
-- venues.is_removed: soft-hide flag an admin can set to pull a
-- venue out of Feed/Search without deleting its row or history.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.venue_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX venue_flags_venue_id_idx ON public.venue_flags (venue_id);

ALTER TABLE public.venue_flags ENABLE ROW LEVEL SECURITY;

-- Users can flag venues as themselves
CREATE POLICY "venue_flags_insert_own" ON public.venue_flags
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only admins can read/manage flags (moderation queue, not user-facing)
CREATE POLICY "venue_flags_admin_select" ON public.venue_flags
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE);

CREATE POLICY "venue_flags_admin_delete" ON public.venue_flags
  FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE);

-- Service-role full access — edge functions if needed later
CREATE POLICY "venue_flags_service_all" ON public.venue_flags
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Soft-hide flag on venues
ALTER TABLE public.venues ADD COLUMN is_removed boolean NOT NULL DEFAULT false;

-- Only admins may flip is_removed (or any column) via this policy
CREATE POLICY "venues_admin_update" ON public.venues
  FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE)
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE);
