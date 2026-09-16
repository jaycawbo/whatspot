-- ─────────────────────────────────────────────────────────────
-- Search rate limit: switch from a strict "one search every 4.8h"
-- cooldown to a token bucket — 5 searches available up front (a
-- burst), each refilling independently at 1 token / 4.8h (issue
-- #319 follow-up #2). This is what "5 searches per 24h" actually
-- means: a user can spend all 5 back-to-back, then waits on a
-- per-token cooldown, rather than being throttled after every
-- single search.
--
-- Alters search_rate_limit / try_consume_search_slot from
-- 20260914000000_search_rate_limit_interval.sql in place rather
-- than dropping — that migration is already deployed and live.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.search_rate_limit RENAME COLUMN last_search_at TO last_refill_at;
ALTER TABLE public.search_rate_limit ADD COLUMN tokens integer NOT NULL DEFAULT 5;

DROP FUNCTION IF EXISTS public.try_consume_search_slot(uuid, integer);

-- Lazy-refill token bucket: tokens accrue at 1 per p_refill_seconds, capped at
-- p_capacity, computed on read rather than via a background job. Row is
-- locked (FOR UPDATE) for the duration of the call so concurrent requests
-- from the same user serialize correctly instead of both spending the same
-- token.
CREATE OR REPLACE FUNCTION public.try_consume_search_slot(
  p_user_id uuid,
  p_capacity integer DEFAULT 5,
  p_refill_seconds integer DEFAULT 17280 -- 4h48m per token = 24h / 5
)
RETURNS TABLE(allowed boolean, next_allowed_at timestamptz, tokens_remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tokens integer;
  v_last_refill timestamptz;
  v_tokens_to_add integer;
BEGIN
  INSERT INTO public.search_rate_limit (user_id, tokens, last_refill_at)
  VALUES (p_user_id, p_capacity, now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT tokens, last_refill_at INTO v_tokens, v_last_refill
  FROM public.search_rate_limit
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- How many whole refill intervals have passed since the clock last advanced?
  v_tokens_to_add := LEAST(
    p_capacity - v_tokens,
    FLOOR(EXTRACT(EPOCH FROM (now() - v_last_refill)) / p_refill_seconds)::integer
  );

  IF v_tokens_to_add > 0 THEN
    v_tokens := v_tokens + v_tokens_to_add;
    -- Advance the clock by exactly the whole intervals consumed, not to `now()`,
    -- so partial progress toward the next token isn't lost/reset.
    v_last_refill := v_last_refill + make_interval(secs => v_tokens_to_add * p_refill_seconds);
  END IF;

  IF v_tokens >= 1 THEN
    v_tokens := v_tokens - 1;
    UPDATE public.search_rate_limit
      SET tokens = v_tokens, last_refill_at = v_last_refill
      WHERE user_id = p_user_id;
    RETURN QUERY SELECT true, now(), v_tokens;
    RETURN;
  END IF;

  UPDATE public.search_rate_limit
    SET last_refill_at = v_last_refill
    WHERE user_id = p_user_id;

  RETURN QUERY SELECT false, v_last_refill + make_interval(secs => p_refill_seconds), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.try_consume_search_slot(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_consume_search_slot(uuid, integer, integer) TO service_role;
