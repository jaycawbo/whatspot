-- ─────────────────────────────────────────────────────────────
-- Instagram embeds on venue detail (issue #397)
-- Applied to production Sept 29, 2026 (SQL editor).
--
-- venues.instagram_handle: the venue's Instagram username, stored
-- without the @. Display-only pointer used to link out to the profile.
--
-- venue_instagram_posts: permalinks to specific posts, rendered on the
-- client with Instagram's official blockquote + embed.js pattern.
-- We store ONLY the permalink and shortcode. No captions, thumbnails,
-- media URLs, counts or any other Instagram-derived content (Meta's
-- oEmbed terms prohibit persisting or deriving data from embed content).
--
-- Writes are service role only (seed via scripts/generate-instagram-seed.js
-- output in the SQL editor). Public read is limited to active rows.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS instagram_handle text;

ALTER TABLE public.venues
  ADD CONSTRAINT venues_instagram_handle_format
  CHECK (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

CREATE TABLE public.venue_instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  permalink text NOT NULL,
  shortcode text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_instagram_posts_venue_shortcode_key UNIQUE (venue_id, shortcode),
  -- Defense in depth: same rules as parsePermalink in src/lib/social/instagram.js
  CONSTRAINT venue_instagram_posts_permalink_format
    CHECK (permalink ~ '^https://www\.instagram\.com/(p|reel|tv)/[A-Za-z0-9_-]{1,64}/$'),
  CONSTRAINT venue_instagram_posts_shortcode_format
    CHECK (shortcode ~ '^[A-Za-z0-9_-]{1,64}$')
);

CREATE INDEX venue_instagram_posts_venue_sort_idx
  ON public.venue_instagram_posts (venue_id, sort_order);

ALTER TABLE public.venue_instagram_posts ENABLE ROW LEVEL SECURITY;

-- Anyone (guests included) can read active posts
CREATE POLICY "venue_instagram_posts_public_read" ON public.venue_instagram_posts
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- No insert/update/delete policies for anon or authenticated: writes are
-- service role only.
CREATE POLICY "venue_instagram_posts_service_all" ON public.venue_instagram_posts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
