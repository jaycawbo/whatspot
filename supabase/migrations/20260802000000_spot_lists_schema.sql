-- spot_lists / spot_list_items
-- User-created named spot lists, referenced by src/hooks/useBroncoSpotLists.js
-- and src/components/bronco/SpotListsSection.jsx, which already shipped against
-- this schema but had no backing migration — inserts/selects were silently
-- failing (PGRST205: table not found in schema cache).

CREATE TABLE public.spot_lists (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spot_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spot_lists_select_own" ON public.spot_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "spot_lists_insert_own" ON public.spot_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "spot_lists_update_own" ON public.spot_lists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "spot_lists_delete_own" ON public.spot_lists FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_spot_lists_user_id ON public.spot_lists(user_id);


-- spot_list_items: venues saved into a spot_list.
-- user_id is denormalized (defaulted from auth.uid()) so existing client
-- inserts — which only pass list_id/venue_id — keep working unmodified,
-- while still allowing simple ownership-based RLS for SELECT/DELETE.
CREATE TABLE public.spot_list_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid        NOT NULL REFERENCES public.spot_lists(id) ON DELETE CASCADE,
  venue_id   uuid        NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spot_list_items_unique UNIQUE (list_id, venue_id)
);

ALTER TABLE public.spot_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spot_list_items_select_own" ON public.spot_list_items FOR SELECT USING (auth.uid() = user_id);

-- INSERT also verifies the target list is owned by the same user, so a
-- client can't drop items into someone else's list_id.
CREATE POLICY "spot_list_items_insert_own" ON public.spot_list_items FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.spot_lists
      WHERE spot_lists.id = spot_list_items.list_id
        AND spot_lists.user_id = auth.uid()
    )
  );

CREATE POLICY "spot_list_items_delete_own" ON public.spot_list_items FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_spot_list_items_list_id  ON public.spot_list_items(list_id);
CREATE INDEX idx_spot_list_items_venue_id ON public.spot_list_items(venue_id);
CREATE INDEX idx_spot_list_items_user_id  ON public.spot_list_items(user_id);
