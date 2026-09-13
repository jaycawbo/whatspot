-- ─────────────────────────────────────────────────────────────
-- Admin role (minimal): mark a single auth user as admin via
-- app_metadata, which is embedded in the JWT and cannot be
-- edited by the user themselves (unlike user_metadata). RLS
-- policies can check it with auth.jwt() -> 'app_metadata'.
-- ─────────────────────────────────────────────────────────────

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{is_admin}',
  'true'
)
WHERE email = 'jake.k.shipman@gmail.com';
