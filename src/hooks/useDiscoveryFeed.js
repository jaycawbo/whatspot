import { useState, useCallback, useRef, useEffect } from 'react';
import { recommend } from '@/services/api';
import { useGlobalState } from '@/context/GlobalStateContext';

/**
 * Hook that manages the discovery feed state:
 * - Fetches nearby venues on mount (discovery mode)
 * - Handles search-driven feed refresh
 * - Manages radius expansion for "expand search area"
 */
export function useDiscoveryFeed() {
  const { state } = useGlobalState();
  const [venues, setVenues] = useState([]);
  const [overflowVenues, setOverflowVenues] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const radiusRef = useRef(state.filters?.radius || 2);
  const abortRef = useRef(null);
  const hasFetchedRef = useRef(false);

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
      });

      const results = res?.results || [];
      const overflow = res?.nearby_overflow || [];
      setVenues(results);
      setOverflowVenues(overflow);
      radiusRef.current = effectiveRadius;
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
    radiusRef.current = state.filters?.radius || 2;
    fetchFeed({ query });
  }, [fetchFeed, state.filters]);

  // Expand search area — double the radius
  const expandSearch = useCallback(() => {
    const newRadius = Math.min(radiusRef.current * 2, 25);
    fetchFeed({ query: currentQuery, radius: newRadius });
  }, [fetchFeed, currentQuery]);

  return {
    venues,
    overflowVenues,
    isLoading,
    error,
    searchFeed,
    expandSearch,
    refetchDiscovery: () => fetchFeed(),
  };
}
