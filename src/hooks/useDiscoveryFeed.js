import { useState, useCallback, useRef, useEffect } from 'react';
import { recommend } from '@/services/api';
import { useGlobalState } from '@/context/GlobalStateContext';

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
  const isPrefetchingRef = useRef(false);

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

    // Read seen IDs for discovery mode exclude_ids
    const seenIds = effectiveMode === 'discovery' ? (() => {
      try {
        const raw = sessionStorage.getItem('whatspot_seen_venues');
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
        session_context,
        exclude_ids: seenIds.length ? seenIds : undefined,
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

      // Track seen venue IDs for discovery mode
      if (effectiveMode === 'discovery') {
        try {
          const raw = sessionStorage.getItem('whatspot_seen_venues');
          const existing = raw ? JSON.parse(raw) : [];
          const newIds = filtered.map(v =>
            (v.place_id || v.google_place_id || '').replace(/^places\//, '')
          ).filter(Boolean);
          const merged = [...new Set([...existing, ...newIds])];
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

  // Initial load — discovery mode
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchFeed();
  }, [fetchFeed]);

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
        lat: state.userLocation.lat,
        lon: state.userLocation.lon,
        location_name: state.locationName,
        radius_km: radiusRef.current,
        open_now: state.filters?.openNow || undefined,
        exclude_ids: seenIds.length ? seenIds : undefined,
      });

      const results = res?.results || [];
      const reserve = res?.reserve_venues || [];

      const filtered = results.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !skippedIds.includes(id) && !seenIds.includes(id);
      });

      if (filtered.length > 0) {
        setVenues(prev => [...prev, ...filtered]);
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
            JSON.stringify([...new Set([...existing, ...newIds])])
          );
        } catch {}
      }
    } catch (err) {
      console.error('Prefetch failed silently:', err);
    } finally {
      isPrefetchingRef.current = false;
    }
  }, [state.userLocation, state.locationName, state.filters]);

  const getReserveVenues = useCallback(() => {
    const reserve = reserveVenuesRef.current;
    reserveVenuesRef.current = [];
    return reserve;
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
    prefetchNextBatch,
  };
}
