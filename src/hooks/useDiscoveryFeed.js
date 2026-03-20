import { useState, useCallback, useRef, useEffect } from 'react';
import { recommend } from '@/services/api';
import { useGlobalState } from '@/context/GlobalStateContext';
import { supabase } from '@/integrations/supabase/client';

const TORONTO_ANCHORS = [
  { lat: 43.6532, lon: -79.3832 }, // center
  { lat: 43.6622, lon: -79.3832 }, // north
  { lat: 43.6442, lon: -79.3832 }, // south
  { lat: 43.6532, lon: -79.3703 }, // east
  { lat: 43.6532, lon: -79.3961 }, // west
  { lat: 43.6586, lon: -79.3739 }, // northeast
  { lat: 43.6478, lon: -79.3739 }, // southeast
  { lat: 43.6478, lon: -79.3925 }, // southwest
  { lat: 43.6586, lon: -79.3925 }, // northwest
];

const RADIUS_RINGS = [2, 4, 6, 8, 10, 12];
const MAX_CRITERIA_PASS = 7;

/**
 * Hook that manages the discovery feed state:
 * - Fetches nearby venues on mount (discovery mode)
 * - Handles search-driven feed refresh
 * - Manages radius expansion for "expand search area"
 * - Tracks reserve venues and seen/skipped IDs
 */
export function useDiscoveryFeed() {
  const { state } = useGlobalState();
  const [venues, setVenues] = useState([]);
  const [overflowVenues, setOverflowVenues] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const radiusRef = useRef(state.filters?.radius || 5);
  const abortRef = useRef(null);
  const hasFetchedRef = useRef(false);
  const reserveVenuesRef = useRef([]);
  const radiusRingIndexRef = useRef(0);
  const criteriaPassRef = useRef(1);
  const anchorPointRef = useRef(null);
  const isPrefetchingRef = useRef(false);
  const prefetchedVenuesRef = useRef([]);

  const initAnchorPoint = useCallback(async () => {
    if (anchorPointRef.current) return;

    // Priority 1: live user location
    if (state.userLocation?.lat && state.userLocation?.lon) {
      anchorPointRef.current = {
        lat: state.userLocation.lat,
        lon: state.userLocation.lon,
      };
      return;
    }

    // Priority 2: authenticated user — load from Supabase and increment
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('discovery_anchor_index, discovery_last_radius_km, discovery_last_criteria_pass')
        .eq('id', user.id)
        .single();

      const anchorIndex = profile?.discovery_anchor_index ?? 0;
      const nextIndex = (anchorIndex + 1) % TORONTO_ANCHORS.length;

      anchorPointRef.current = TORONTO_ANCHORS[anchorIndex];
      radiusRingIndexRef.current = 0;
      criteriaPassRef.current = profile?.discovery_last_criteria_pass ?? 1;

      // Update profile for next session
      await supabase.from('user_profiles').update({
        discovery_anchor_index: nextIndex,
        discovery_last_radius_km: RADIUS_RINGS[0],
        discovery_last_criteria_pass: 1,
      }).eq('id', user.id);
      return;
    }

    // Priority 3: guest — random anchor from sessionStorage or new random pick
    try {
      const stored = sessionStorage.getItem('whatspot_anchor_index');
      if (stored !== null) {
        anchorPointRef.current = TORONTO_ANCHORS[parseInt(stored)];
      } else {
        const randomIndex = Math.floor(Math.random() * TORONTO_ANCHORS.length);
        sessionStorage.setItem('whatspot_anchor_index', String(randomIndex));
        anchorPointRef.current = TORONTO_ANCHORS[randomIndex];
      }
    } catch {
      anchorPointRef.current = TORONTO_ANCHORS[0];
    }
  }, [state.userLocation]);

  const fetchFeed = useCallback(async ({ query = '', radius, mode } = {}) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const effectiveRadius = radius ?? radiusRef.current;
    const effectiveMode = mode || (query ? 'query' : 'discovery');

    setIsLoading(true);
    setError(null);
    setCurrentQuery(query);
    setOverflowVenues([]);

    // Read session context
    let session_context = [];
    try {
      const raw = sessionStorage.getItem('whatspot_session_history');
      if (raw) session_context = JSON.parse(raw);
    } catch {}

    // For discovery mode, only exclude skipped venues (not all seen venues)
    // This keeps the exclude list small so the backend has a full candidate pool
    const excludeIds = effectiveMode === 'discovery' ? (() => {
      try {
        const raw = sessionStorage.getItem('whatspot_skipped_venues');
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    })() : [];

    try {
      const res = await recommend({
        mode: effectiveMode,
        query: query || undefined,
        lat: state.userLocation.lat,
        lon: state.userLocation.lon,
        location_name: state.locationName,
        radius_km: effectiveRadius,
        open_now: state.filters?.openNow || undefined,
        price_levels: state.filters?.priceLevels?.length ? state.filters.priceLevels : undefined,
        exclude_ids: excludeIds.length ? excludeIds : undefined,
      });

      const results = res?.results || [];
      const overflow = res?.nearby_overflow || [];
      const reserve = res?.reserve_venues || [];

      // Filter out skipped venues
      let skippedIds = [];
      try {
        const raw = sessionStorage.getItem('whatspot_skipped_venues');
        if (raw) skippedIds = JSON.parse(raw);
      } catch {}

      const filtered = results.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !skippedIds.includes(id);
      });

      reserveVenuesRef.current = reserve.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !skippedIds.includes(id);
      });

      setVenues(filtered);
      setOverflowVenues(overflow);
      radiusRef.current = effectiveRadius;

      // Track seen venue IDs for discovery mode (cap at 100 to prevent exhaustion)
      if (effectiveMode === 'discovery') {
        try {
          const raw = sessionStorage.getItem('whatspot_seen_venues');
          const existing = raw ? JSON.parse(raw) : [];
          const newIds = filtered.map(v =>
            (v.place_id || v.google_place_id || '').replace(/^places\//, '')
          ).filter(Boolean);
          const merged = [...new Set([...existing, ...newIds])].slice(-100);
          sessionStorage.setItem('whatspot_seen_venues', JSON.stringify(merged));
        } catch {}
      }
    } catch (err) {
      console.error('Discovery feed fetch failed:', err);
      setError(err?.message || 'Failed to load venues');
      setVenues([]);
    } finally {
      setIsLoading(false);
    }
  }, [state.userLocation, state.locationName, state.filters]);

  // Initial load — discovery mode + immediate prefetch
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    // Clear skipped venues from previous sessions so the feed starts fresh
    try { sessionStorage.removeItem('whatspot_skipped_venues'); } catch {}
    // Fetch immediately with default anchor, then update anchor in background
    // After initial fetch completes, fire prefetch so second batch is already loading
    fetchFeed().then(() => {
      initAnchorPoint().then(() => {
        prefetchNextBatch();
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search-driven refresh
  const searchFeed = useCallback((query) => {
    radiusRef.current = state.filters?.radius || 5;
    fetchFeed({ query });
  }, [fetchFeed, state.filters]);

  // Expand search area — double the radius
  const expandSearch = useCallback(() => {
    const newRadius = Math.min(radiusRef.current * 2, 25);
    fetchFeed({ query: currentQuery, radius: newRadius });
  }, [fetchFeed, currentQuery]);

  const prefetchNextBatch = useCallback(async () => {
    if (isPrefetchingRef.current) return;
    isPrefetchingRef.current = true;

    // Advance to next radius ring
    radiusRingIndexRef.current = radiusRingIndexRef.current + 1;

    // If we've exhausted all rings, advance criteria pass and reset rings
    if (radiusRingIndexRef.current >= RADIUS_RINGS.length) {
      criteriaPassRef.current = criteriaPassRef.current + 1;
      radiusRingIndexRef.current = 0;

      // If all criteria passes exhausted, stay at pass 7 (floor)
      if (criteriaPassRef.current > MAX_CRITERIA_PASS) {
        criteriaPassRef.current = MAX_CRITERIA_PASS;
      }

      // Clear seen venues for the new pass so venues can resurface
      try {
        sessionStorage.removeItem('whatspot_seen_venues');
      } catch {}
    }

    const currentRadius = RADIUS_RINGS[radiusRingIndexRef.current];
    const currentPass = criteriaPassRef.current;
    const anchor = anchorPointRef.current ?? { lat: state.userLocation?.lat ?? 43.6532, lon: state.userLocation?.lon ?? -79.3832 };

    const seenIds = (() => {
      try {
        const raw = sessionStorage.getItem('whatspot_seen_venues');
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    })();

    let skippedIds = [];
    try {
      const raw = sessionStorage.getItem('whatspot_skipped_venues');
      if (raw) skippedIds = JSON.parse(raw);
    } catch {}

    try {
      const res = await recommend({
        mode: 'discovery',
        lat: anchor.lat,
        lon: anchor.lon,
        location_name: state.locationName,
        radius_km: currentRadius,
        open_now: state.filters?.openNow || undefined,
        exclude_ids: seenIds.length ? seenIds : undefined,
        criteria_pass: currentPass,
      });

      const results = res?.results || [];
      const reserve = res?.reserve_venues || [];

      const filtered = results.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !skippedIds.includes(id) && !seenIds.includes(id);
      });

      if (filtered.length > 0) {
        prefetchedVenuesRef.current = [...prefetchedVenuesRef.current, ...filtered];
        reserveVenuesRef.current = [
          ...reserveVenuesRef.current,
          ...reserve.filter(v => {
            const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
            return !skippedIds.includes(id) && !seenIds.includes(id);
          })
        ];

        try {
          const raw = sessionStorage.getItem('whatspot_seen_venues');
          const existing = raw ? JSON.parse(raw) : [];
          const newIds = filtered.map(v =>
            (v.place_id || v.google_place_id || '').replace(/^places\//, '')
          ).filter(Boolean);
          sessionStorage.setItem(
            'whatspot_seen_venues',
            JSON.stringify([...new Set([...existing, ...newIds])].slice(-100))
          );
        } catch {}
      }

      return { fetched: filtered.length, reserve: reserve.length };
    } catch (err) {
      console.error('Prefetch failed silently:', err);
      return { fetched: 0, reserve: 0 };
    } finally {
      isPrefetchingRef.current = false;
    }
  }, [state.userLocation, state.locationName, state.filters]);

  const getReserveVenues = useCallback(() => {
    const reserve = reserveVenuesRef.current;
    reserveVenuesRef.current = [];
    return reserve;
  }, []);

  const getPrefetchedVenues = useCallback(() => {
    const prefetched = prefetchedVenuesRef.current;
    prefetchedVenuesRef.current = [];
    return prefetched;
  }, []);

  return {
    venues,
    overflowVenues,
    isLoading,
    error,
    currentQuery,
    searchFeed,
    expandSearch,
    refetchDiscovery: () => fetchFeed(),
    getReserveVenues,
    getPrefetchedVenues,
    prefetchNextBatch,
  };
}
