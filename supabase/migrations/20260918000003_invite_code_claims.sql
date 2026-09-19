-- ─────────────────────────────────────────────────────────────
-- Link invite codes to sign-in accounts (issue #358)
--
-- Flow: visitor redeems a code > signs in > claim_invite_code() binds
-- the account to the code. Later, a signed-in account (or an admin)
-- gets back in without re-entering the code via get_my_access().
-- One account per code, and one code per account.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.invite_codes
  ADD COLUMN claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN claimed_at timestamptz;

CREATE UNIQUE INDEX invite_codes_claimed_by_idx
  ON public.invite_codes (claimed_by) WHERE claimed_by IS NOT NULL;

-- Bind the signed-in account to a code.
-- Returns: 'ok' | 'invalid' | 'taken' | 'unauthenticated'
--   ok    : code now linked to this account (or already was, or the account
--           already holds a different code and keeps its access)
--   taken : code is linked to a different account
CREATE OR REPLACE FUNCTION public.claim_invite_code(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_active boolean;
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT claimed_by, active INTO v_owner, v_active
  FROM public.invite_codes WHERE code = p_code;

  IF NOT FOUND OR NOT v_active THEN
    RETURN 'invalid';
  END IF;

  IF v_owner = v_uid THEN
    RETURN 'ok';
  END IF;

  IF v_owner IS NOT NULL THEN
    RETURN 'taken';
  END IF;

  -- Account already linked to another code: keep that link, allow entry.
  IF EXISTS (SELECT 1 FROM public.invite_codes WHERE claimed_by = v_uid) THEN
    RETURN 'ok';
  END IF;

  UPDATE public.invite_codes
  SET claimed_by = v_uid, claimed_at = now()
  WHERE code = p_code AND claimed_by IS NULL AND active;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 THEN
    RETURN 'ok';
  END IF;
  RETURN 'taken';
END;
$$;

-- What access does the signed-in account already have?
-- Returns the linked active code, 'admin' for admins, or NULL for none.
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  IF (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean IS TRUE THEN
    RETURN 'admin';
  END IF;

  SELECT code INTO v_code
  FROM public.invite_codes WHERE claimed_by = v_uid AND active;

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_invite_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
