import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { INSTAGRAM_EMBEDS_ENABLED } from '@/lib/featureFlags';
import { normalizeHandle, parsePermalink } from '@/lib/social/instagram';

export const MAX_INSTAGRAM_EMBEDS = 3;

const EMPTY = { handle: null, posts: [] };

// Re-validates everything from the DB: invalid handles/permalinks are dropped
// silently, and posts use the parser's canonical permalink, never the raw string.
export function sanitizeVenueInstagram(row) {
  if (!row) return EMPTY;

  const handle = normalizeHandle(row.instagram_handle);
  const seen = new Set();
  const posts = (Array.isArray(row.venue_instagram_posts) ? row.venue_instagram_posts : [])
    .filter((p) => p && p.is_active !== false)
    .map((p) => ({ parsed: parsePermalink(p.permalink), sortOrder: Number(p.sort_order) || 0 }))
    .filter(({ parsed }) => parsed && !seen.has(parsed.shortcode) && seen.add(parsed.shortcode))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, MAX_INSTAGRAM_EMBEDS)
    .map(({ parsed }) => parsed);

  return { handle, posts };
}

/**
 * Instagram handle + up to 3 post permalinks for a venue, by google_place_id.
 * One Supabase read; no Instagram requests. Returns loading=false with empty
 * data when the feature flag is off or anything fails.
 */
export function useVenueInstagram(placeId) {
  const [state, setState] = useState({ ...EMPTY, loading: INSTAGRAM_EMBEDS_ENABLED && !!placeId });

  useEffect(() => {
    if (!INSTAGRAM_EMBEDS_ENABLED || !placeId) {
      setState({ ...EMPTY, loading: false });
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, loading: true });

    const fetchInstagram = async () => {
      try {
        const { data, error } = await supabase
          .from('venues')
          .select('instagram_handle, venue_instagram_posts(permalink, shortcode, sort_order, is_active)')
          .eq('google_place_id', placeId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setState({ ...sanitizeVenueInstagram(data), loading: false });
      } catch (err) {
        console.error('Failed to fetch venue Instagram:', err);
        if (!cancelled) setState({ ...EMPTY, loading: false });
      }
    };

    fetchInstagram();
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  return state;
}
