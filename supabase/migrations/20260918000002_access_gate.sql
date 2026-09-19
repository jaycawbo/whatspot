-- ─────────────────────────────────────────────────────────────
-- Soft-launch access gate + waitlist (issue #358)
--
-- invite_codes: one row per tester. Never readable by anon; the client
-- can only ask "is this code valid?" via redeem_invite_code().
-- waitlist: public email capture. Writes only via join_waitlist().
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.invite_codes (
  code text PRIMARY KEY,
  label text,
  active boolean NOT NULL DEFAULT true,
  redeem_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  referral_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX waitlist_email_lower_idx ON public.waitlist (lower(email));

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated write or read policies on either table.
-- Admins can read; service role can do everything.
CREATE POLICY "invite_codes_admin_select" ON public.invite_codes
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE);

CREATE POLICY "invite_codes_service_all" ON public.invite_codes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "waitlist_admin_select" ON public.waitlist
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE);

CREATE POLICY "waitlist_service_all" ON public.waitlist
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Validate a code. p_count = true bumps redeem_count (used on first redeem
-- only; the once-per-session revalidation passes false).
CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code text, p_count boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean;
BEGIN
  IF p_code IS NULL OR length(p_code) = 0 OR length(p_code) > 128 THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.invite_codes WHERE code = p_code AND active
  ) INTO v_found;

  IF v_found AND p_count THEN
    UPDATE public.invite_codes SET redeem_count = redeem_count + 1 WHERE code = p_code;
  END IF;

  RETURN v_found;
END;
$$;

-- Add an email to the waitlist. Always returns true for a well-formed
-- email (duplicates are silently ignored so existence is not leaked).
CREATE OR REPLACE FUNCTION public.join_waitlist(p_email text, p_source text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN false;
  END IF;

  INSERT INTO public.waitlist (email, referral_source)
  VALUES (v_email, nullif(left(btrim(coalesce(p_source, '')), 100), ''))
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite_code(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_waitlist(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_waitlist(text, text) TO anon, authenticated;
