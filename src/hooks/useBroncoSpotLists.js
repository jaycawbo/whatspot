import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

/**
 * Manages user-created named spot lists (spot_lists + spot_list_items).
 * Separate from the existing user_venue_interactions rating system.
 * Venues in lists receive live availability updates via Realtime.
 */
export function useBroncoSpotLists() {
  const { user } = useAuth();
  const [lists, setLists] = useState([]);   // [{ id, name, items: [{ id, venue_id, venue }] }]
  const [savedIds, setSavedIds] = useState(new Set()); // venue UUIDs saved to any list
  const [isLoading, setIsLoading] = useState(true);
  const venueChannelRef = useRef(null);

  const loadLists = useCallback(async () => {
    if (!user?.id) { setIsLoading(false); return; }

    const { data: rawLists } = await supabase
      .from('spot_lists')
      .select('id, name, created_at, is_public, share_token')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (!rawLists?.length) {
      setLists([]);
      setSavedIds(new Set());
      setIsLoading(false);
      return;
    }

    const listIds = rawLists.map((l) => l.id);
    const { data: items } = await supabase
      .from('spot_list_items')
      .select('id, list_id, venue_id')
      .in('list_id', listIds)
      .order('created_at', { ascending: false });

    const venueIds = [...new Set((items ?? []).map((i) => i.venue_id))];
    let venues = [];
    if (venueIds.length) {
      const { data } = await supabase
        .from('venues')
        .select('id, name, address, category, price_level, photo_urls, google_place_id, is_available, avg_response_sec, lat, lng')
        .in('id', venueIds);
      venues = data ?? [];
    }

    const venueMap = Object.fromEntries(venues.map((v) => [v.id, v]));
    const itemsByList = {};
    (items ?? []).forEach((item) => {
      if (!itemsByList[item.list_id]) itemsByList[item.list_id] = [];
      itemsByList[item.list_id].push({ ...item, venue: venueMap[item.venue_id] ?? null });
    });

    const enriched = rawLists.map((l) => ({ ...l, items: itemsByList[l.id] ?? [] }));
    setLists(enriched);
    setSavedIds(new Set((items ?? []).map((i) => i.venue_id)));
    setIsLoading(false);

    // Subscribe to Realtime venue availability changes for saved venues
    if (venueChannelRef.current) supabase.removeChannel(venueChannelRef.current);
    if (venueIds.length) {
      const ch = supabase
        .channel('spot-venue-availability')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'venues' },
          (payload) => {
            const updated = payload.new;
            if (!venueIds.includes(updated.id)) return;
            setLists((prev) =>
              prev.map((l) => ({
                ...l,
                items: l.items.map((item) =>
                  item.venue_id === updated.id
                    ? { ...item, venue: { ...item.venue, ...updated } }
                    : item
                ),
              }))
            );
          }
        )
        .subscribe();
      venueChannelRef.current = ch;
    }
  }, [user?.id]);

  useEffect(() => {
    loadLists();
    return () => {
      if (venueChannelRef.current) supabase.removeChannel(venueChannelRef.current);
    };
  }, [loadLists]);

  // All three mutators below return { data, error } (never throw) so existing
  // fire-and-forget callers (VenueCard.jsx, SpotListsSection.jsx) keep working
  // unmodified, while callers that need to know whether the write actually
  // landed (ImportListDialog.jsx) can check `error`.

  const createList = useCallback(async (name) => {
    if (!user?.id) return { data: null, error: new Error('Not signed in') };
    if (!name.trim()) return { data: null, error: new Error('List name is required') };
    const { data, error } = await supabase
      .from('spot_lists')
      .insert({ user_id: user.id, name: name.trim() })
      .select('id, name, created_at, is_public, share_token')
      .single();
    if (data) {
      setLists((prev) => [...prev, { ...data, items: [] }]);
    }
    return { data, error };
  }, [user?.id]);

  const toggleListVisibility = useCallback(async (listId, isPublic) => {
    if (!user?.id) return { error: new Error('Not signed in') };

    // Optimistic update
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, is_public: isPublic } : l)));

    const { error } = await supabase
      .from('spot_lists')
      .update({ is_public: isPublic })
      .eq('id', listId)
      .eq('user_id', user.id);

    if (error) await loadLists();
    return { error };
  }, [user?.id, loadLists]);

  const saveVenue = useCallback(async (venue, listId) => {
    if (!user?.id) return { error: new Error('Not signed in') };
    if (!venue?.id) return { error: new Error('Venue is missing an id') };

    // Optimistic update
    setSavedIds((prev) => new Set([...prev, venue.id]));
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? { ...l, items: [{ id: crypto.randomUUID(), list_id: listId, venue_id: venue.id, venue }, ...l.items] }
          : l
      )
    );

    const { error } = await supabase
      .from('spot_list_items')
      .insert({ list_id: listId, venue_id: venue.id });

    if (error) {
      // Rollback
      setSavedIds((prev) => { const s = new Set(prev); s.delete(venue.id); return s; });
      await loadLists();
    }
    return { error };
  }, [user?.id, loadLists]);

  const removeVenue = useCallback(async (venue, listId) => {
    if (!user?.id) return { error: new Error('Not signed in') };
    if (!venue?.id) return { error: new Error('Venue is missing an id') };

    // Optimistic update
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? { ...l, items: l.items.filter((item) => item.venue_id !== venue.id) }
          : l
      )
    );
    const stillSaved = lists.some(
      (l) => l.id !== listId && l.items.some((item) => item.venue_id === venue.id)
    );
    if (!stillSaved) setSavedIds((prev) => { const s = new Set(prev); s.delete(venue.id); return s; });

    const { error } = await supabase
      .from('spot_list_items')
      .delete()
      .eq('list_id', listId)
      .eq('venue_id', venue.id);

    if (error) await loadLists();
    return { error };
  }, [user?.id, lists, loadLists]);

  return { lists, savedIds, isLoading, createList, saveVenue, removeVenue, toggleListVisibility };
}
