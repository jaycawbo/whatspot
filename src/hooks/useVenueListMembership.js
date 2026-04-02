/**
 * useVenueListMembership
 *
 * Returns a Map<google_place_id, listLabel> for all venues the authenticated
 * user has interacted with. Used to show a "Favourites", "Interested", etc.
 * badge on discovery cards when a venue already exists in Spots.
 *
 * Passive interactions (passive_skip, skip_for_now) are excluded — they are
 * not surfaced as Spots list membership.
 *
 * The map is fetched once on mount and updated whenever isAuthenticated changes.
 * Keys are stored without the "places/" prefix to match how venue IDs are
 * normalised elsewhere in the app.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

function interactionToLabel({ interaction_type, rating }) {
  if (interaction_type === 'interested')     return 'Interested';
  if (interaction_type === 'not_interested') return 'Not Interested';
  if (interaction_type === 'been_here')      return 'Been To';
  if (interaction_type === 'rated') {
    if (rating === 'liked' || rating === 'loved') return 'Favourites';
    if (rating === 'disliked')                    return "Didn't Like It";
    return 'Been To';
  }
  return null;
}

export function useVenueListMembership() {
  const { isAuthenticated } = useAuth();
  const [membershipMap, setMembershipMap] = useState(new Map());

  useEffect(() => {
    if (!isAuthenticated) {
      setMembershipMap(new Map());
      return;
    }

    let cancelled = false;

    async function fetchMembership() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from('user_venue_interactions')
        .select('venue_id, interaction_type, rating')
        .eq('user_id', user.id);

      if (!data || cancelled) return;

      const map = new Map();
      data.forEach((row) => {
        const label = interactionToLabel(row);
        if (!label) return;
        // Normalise: strip "places/" prefix so lookups work regardless of source
        const id = (row.venue_id || '').replace(/^places\//, '');
        if (id) map.set(id, label);
      });

      setMembershipMap(map);
    }

    fetchMembership();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  return membershipMap;
}
