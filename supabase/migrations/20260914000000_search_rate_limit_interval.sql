-- ─────────────────────────────────────────────────────────────
-- Search rate limit: switch from a 5/calendar-day counter to a
-- rolling minimum-interval cooldown (issue #319 follow-up).
--
-- "5 searches per 24h" is reframed as "one search every 4.8 hours"
-- (24h / 5 = 4h48m) — a single last_search_at timestamp per user,
-- rather than a per-day counter, so the client can be told exactly
-- when the next search unlocks and show a live countdown instead of
-- a flat "come back tomorrow".
--
-- Replaces search_quota_usage / increment_search_quota from
-- 20260913000000_search_quota.sql, which is not yet in real use
-- (edge functions enforcing it hadn't been deployed).
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.increment_search_quota(uuid);
DROP TABLE IF EXISTS public.search_quota_usage;

CREATE TABLE public.search_rate_limit (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_search_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.search_rate_limit ENABLE ROW LEVEL SECURITY;

-- Users can read their own row (e.g. to show a countdown on load, not just on block)
CREATE POLICY "search_rate_limit_select_own" ON public.search_rate_limit
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- All writes go through try_consume_search_slot() (SECURITY DEFINER), called
-- with the service role from edge functions — no direct write policy for users.
CREATE POLICY "search_rate_limit_service_all" ON public.search_rate_limit
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Atomically tries to consume a search slot: allowed if last_search_at was
-- more than p_interval_seconds ago (or this is the user's first search ever).
-- The UPDATE's WHERE clause makes the whole statement a single atomic
-- compare-and-swap, so concurrent requests from the same user can't both
-- pass — RETURNING is empty on the losing side rather than erroring.
CREATE OR REPLACE FUNCTION public.try_consume_search_slot(
  p_user_id uuid,
  p_interval_seconds integer DEFAULT 17280 -- 4h48m = 24h / 5
)
RETURNS TABLE(allowed boolean, next_allowed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consumed_at timestamptz;
  v_existing timestamptz;
BEGIN
  INSERT INTO public.search_rate_limit (user_id, last_search_at)
  VALUES (p_user_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_search_at = now()
    WHERE public.search_rate_limit.last_search_at <= now() - make_interval(secs => p_interval_seconds)
  RETURNING last_search_at INTO v_consumed_at;

  IF v_consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT true, v_consumed_at;
    RETURN;
  END IF;

  SELECT last_search_at INTO v_existing FROM public.search_rate_limit WHERE user_id = p_user_id;
  RETURN QUERY SELECT false, v_existing + make_interval(secs => p_interval_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.try_consume_search_slot(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_consume_search_slot(uuid, integer) TO service_role;
