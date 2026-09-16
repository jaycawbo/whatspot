-- ─────────────────────────────────────────────────────────────
-- Per-user daily search quota (issue #319)
--
-- Search is now gated to authenticated users, capped at 5 searches/day
-- per user (admins bypass in application code via app_metadata.is_admin —
-- see supabase/functions/_shared/searchQuota.ts). This table just stores
-- the count; increment_search_quota() below does the atomic check-and-
-- increment so concurrent requests from the same user can't race past
-- the cap.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.search_quota_usage (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date   date NOT NULL,
  search_count integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.search_quota_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own quota (e.g. to show "3/5 used today" in the UI later)
CREATE POLICY "search_quota_usage_select_own" ON public.search_quota_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No insert/update policy for authenticated users — all writes go through
-- increment_search_quota() (SECURITY DEFINER) called with the service role
-- from edge functions, so a client can't reset or inflate its own quota.
CREATE POLICY "search_quota_usage_service_all" ON public.search_quota_usage
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.increment_search_quota(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.search_quota_usage (user_id, usage_date, search_count)
  VALUES (p_user_id, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET search_count = search_quota_usage.search_count + 1, updated_at = now()
  RETURNING search_count INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_search_quota(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_search_quota(uuid) TO service_role;
