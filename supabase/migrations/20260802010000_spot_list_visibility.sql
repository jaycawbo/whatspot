-- Per-list visibility + sharing.
-- spot_lists (custom user-created lists) gets is_public/share_token directly.
-- Status lists (Favourites/Interested/Been To/Not Interested/Didn't Like It)
-- have no table row today, so status_list_settings holds their visibility,
-- lazily upserted the first time a user opens the Edit dialog for that list.
--
-- No public SELECT policy is added on any of these tables. Public reads go
-- exclusively through the get_shared_list() RPC (see next migration), which
-- is SECURITY DEFINER and requires the caller to already hold the token.
-- A `USING (is_public = true)` policy here would let anyone enumerate every
-- public list on the platform with no token required — the same weakness
-- user_profiles already has via spots_is_public. Don't repeat it.

ALTER TABLE public.spot_lists
  ADD COLUMN is_public   boolean NOT NULL DEFAULT true,
  ADD COLUMN share_token uuid    NOT NULL DEFAULT gen_random_uuid() UNIQUE;

CREATE INDEX idx_spot_lists_share_token ON public.spot_lists(share_token);

CREATE TABLE public.status_list_settings (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_key    text        NOT NULL CHECK (list_key IN ('Favourites', 'Interested', 'Been To', 'Not Interested', 'Didn''t Like It')),
  is_public   boolean     NOT NULL DEFAULT true,
  share_token uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_key)
);

ALTER TABLE public.status_list_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "status_list_settings_select_own" ON public.status_list_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "status_list_settings_insert_own" ON public.status_list_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "status_list_settings_update_own" ON public.status_list_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_status_list_settings_share_token ON public.status_list_settings(share_token);
