import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches active editorial collections and their available venues.
 * Returns collections enriched with resolved venue objects (is_available only).
 */
export function useCollections() {
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const { data: cols, error } = await supabase
          .from('collections')
          .select('id, title, subtitle, sort_order, venue_ids')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (error || !cols || cancelled) return;

        // Collect all unique venue IDs across all collections
        const allIds = [...new Set(cols.flatMap((c) => c.venue_ids ?? []))];
        if (!allIds.length) {
          setCollections(cols.map((c) => ({ ...c, venues: [] })));
          return;
        }

        const { data: venues } = await supabase
          .from('venues')
          .select('id, name, photo_url, google_place_id, is_available, avg_response_sec, lat, lng')
          .in('id', allIds)
          .eq('is_available', true);

        if (cancelled) return;

        const venueMap = Object.fromEntries((venues ?? []).map((v) => [v.id, v]));

        const enriched = cols
          .map((c) => ({
            ...c,
            venues: (c.venue_ids ?? [])
              .map((id) => venueMap[id])
              .filter(Boolean),
          }))
          .filter((c) => c.venues.length > 0);

        setCollections(enriched);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { collections, isLoading };
}
