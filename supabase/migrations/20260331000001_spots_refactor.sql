-- ─────────────────────────────────────────────────────────────
-- Spots Refactor: user labels, venue-label junction, notes
-- ─────────────────────────────────────────────────────────────

-- user_labels: user-created occasion labels (e.g. "Date night", "Solo lunch")
CREATE TABLE public.user_labels (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label_name   text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_labels_user_label_key UNIQUE (user_id, label_name)
);

ALTER TABLE public.user_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_labels_select_own" ON public.user_labels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_labels_insert_own" ON public.user_labels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_labels_update_own" ON public.user_labels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_labels_delete_own" ON public.user_labels FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_labels_user_id  ON public.user_labels(user_id);
CREATE INDEX idx_user_labels_last_used ON public.user_labels(last_used_at DESC);


-- venue_user_labels: links user labels to specific venues
CREATE TABLE public.venue_user_labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   text        NOT NULL,
  label_id   uuid        NOT NULL REFERENCES public.user_labels(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_user_labels_unique UNIQUE (venue_id, label_id, user_id)
);

ALTER TABLE public.venue_user_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_user_labels_select_own" ON public.venue_user_labels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "venue_user_labels_insert_own" ON public.venue_user_labels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "venue_user_labels_delete_own" ON public.venue_user_labels FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_vul_venue_id  ON public.venue_user_labels(venue_id);
CREATE INDEX idx_vul_user_id   ON public.venue_user_labels(user_id);
CREATE INDEX idx_vul_label_id  ON public.venue_user_labels(label_id);


-- notes column on user_venue_interactions (personal per-venue notes)
ALTER TABLE public.user_venue_interactions
  ADD COLUMN IF NOT EXISTS notes text;
