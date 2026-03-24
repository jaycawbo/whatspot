import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logEvent } from '@/lib/logEvent';
import LoadingMessages from '@/components/home/LoadingMessages';
import { useGlobalState } from '@/context/GlobalStateContext';
import Header from '@/components/home/Header';
import SearchBar from '@/components/home/SearchBar';
import CategoryTiles from '@/components/home/CategoryTiles';
import MobileSearchDrawer from '@/components/home/MobileSearchDrawer';
import DiscoveryDeck from '@/components/discovery/DiscoveryDeck';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDiscoveryFeed } from '@/hooks/useDiscoveryFeed';

const normalizeId = (v) => (v.place_id || v.google_place_id || '').replace(/^places\//, '');

function deduplicateVenues(venues) {
  const seen = new Set();
  return venues.filter(v => {
    const id = normalizeId(v);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export default function Home() {
  const { state, dispatch } = useGlobalState();
  const isMobile = useIsMobile();
  const searchBarRef = useRef(null);

  const { venues: feedVenues, overflowVenues, isLoading: feedLoading, currentQuery, searchFeed, expandSearch, getReserveVenues, getPrefetchedVenues, prefetchNextBatch } = useDiscoveryFeed();
  const [reserveVenues, setReserveVenues] = useState([]);
  const hasInitializedReserve = useRef(false);

  useEffect(() => {
    if (feedVenues.length > 0 && !hasInitializedReserve.current) {
      hasInitializedReserve.current = true;
      const activeIds = new Set(feedVenues.map(normalizeId).filter(Boolean));
      const reserve = getReserveVenues(activeIds);
      const prefetched = getPrefetchedVenues(activeIds);
      const combined = [...reserve, ...prefetched];
      if (combined.length > 0) {
        setReserveVenues(combined);
      }
      // Eagerly start next prefetch so buffer stays deep
      prefetchNextBatch();
    }
  }, [feedVenues, getReserveVenues, getPrefetchedVenues, prefetchNextBatch]);

  // Build activeIds from current deck for dedup
  const activeIds = useMemo(() => {
    const ids = new Set();
    [...feedVenues, ...reserveVenues].forEach(v => {
      const id = normalizeId(v);
      if (id) ids.add(id);
    });
    return ids;
  }, [feedVenues, reserveVenues]);

  const handleRequestMoreVenues = useCallback(async () => {
    // Phase 1: drain any already-buffered venues immediately
    const reserve = getReserveVenues(activeIds);
    const prefetched = getPrefetchedVenues(activeIds);
    const immediate = [...reserve, ...prefetched];
    if (immediate.length > 0) {
      setReserveVenues(prev => [...prev, ...immediate]);
    }

    // Phase 2: fetch next batch and drain again once it resolves
    if (!currentQuery) {
      const result = await prefetchNextBatch();
      const updatedActiveIds = new Set(activeIds);
      immediate.forEach(v => { const id = normalizeId(v); if (id) updatedActiveIds.add(id); });
      const reserve2 = getReserveVenues(updatedActiveIds);
      const prefetched2 = getPrefetchedVenues(updatedActiveIds);
      const deferred = [...reserve2, ...prefetched2];
      if (deferred.length > 0) {
        setReserveVenues(prev => [...prev, ...deferred]);
      }
      // If both phases yielded nothing, expand search as fallback
      if (immediate.length === 0 && deferred.length === 0) {
        expandSearch();
      }
    } else if (immediate.length === 0) {
      expandSearch();
    }
  }, [getReserveVenues, getPrefetchedVenues, prefetchNextBatch, expandSearch, currentQuery, activeIds]);

  const addSearchHistory = useCallback(
    (queryText) => {
      if (!queryText?.trim()) return;
      dispatch({
        type: 'ADD_SEARCH_HISTORY',
        payload: {
          query: queryText,
          location_name: state.locationName,
          timestamp: Date.now(),
        },
      });
    },
    [dispatch, state.locationName]
  );

  const handleSearch = useCallback(
    (queryText) => {
      const nextQuery = queryText.trim();
      if (!nextQuery) return;

      dispatch({ type: 'SET_QUERY', payload: nextQuery });
      dispatch({ type: 'SET_CATEGORY', payload: null });
      dispatch({ type: 'SET_TILE_BASE_QUERY', payload: null });
      addSearchHistory(nextQuery);
      searchFeed(nextQuery);
      setReserveVenues([]);
      logEvent('search', {
        search_query: nextQuery,
        neighborhood_context: state.locationName,
      });
    },
    [dispatch, addSearchHistory, searchFeed]
  );

  const handleSelectCategory = useCallback(
    (category) => {
      dispatch({ type: 'SET_QUERY', payload: category.prompt });
      dispatch({ type: 'SET_TILE_BASE_QUERY', payload: category.prompt });
      dispatch({ type: 'SET_CATEGORY', payload: category.label });
      addSearchHistory(category.prompt);
      searchFeed(category.prompt);
      setReserveVenues([]);
      logEvent('search', {
        search_query: category.prompt,
        neighborhood_context: state.locationName,
      });
    },
    [dispatch, addSearchHistory, searchFeed]
  );

  const handleAppendChip = useCallback(
    (chipLabel, connector = ' ') => {
      const newQuery = `${state.query || state.tileBaseQuery || ''}${connector}${chipLabel}`.trim();
      dispatch({ type: 'SET_QUERY', payload: newQuery });
    },
    [state.query, state.tileBaseQuery, dispatch]
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <div className="flex flex-col flex-1 pt-14">
        {!isMobile && (
          <div className="px-4 md:px-8 lg:px-12 py-4 space-y-3 max-w-2xl mx-auto w-full">
            <SearchBar
              ref={searchBarRef}
              query={state.query}
              onQueryChange={(query) => dispatch({ type: 'SET_QUERY', payload: query })}
              onSearch={handleSearch}
              isQuerying={feedLoading}
              onStopQuery={() => {}}
              centered={false}
            />
            <CategoryTiles onSelectCategory={handleSelectCategory} />
          </div>
        )}

        <div
          className={`flex-1 flex items-center justify-center px-4 ${isMobile ? 'pb-20' : ''}`}
          style={{ '--deck-height': isMobile ? '85vh' : 'clamp(500px, 78vh, 800px)' }}
        >
          <div className="w-full mx-auto">
            {feedLoading ? (
              <div className="flex items-center justify-center h-full">
                <LoadingMessages />
              </div>
            ) : (
              <DiscoveryDeck
                venues={deduplicateVenues([...feedVenues, ...reserveVenues])}
                overflowVenues={overflowVenues}
                currentQuery={currentQuery}
                isDiscoveryMode={!currentQuery}
                onDescriptorTap={(tag) => {
                  dispatch({ type: 'SET_QUERY', payload: tag });
                  searchFeed(tag);
                  setReserveVenues([]);
                }}
                onExpandSearch={expandSearch}
                onNewSearch={() => searchBarRef.current?.focus?.()}
                onRequestMoreVenues={handleRequestMoreVenues}
              />
            )}
          </div>
        </div>

        {isMobile && (
          <MobileSearchDrawer
            query={state.query}
            onQueryChange={(query) => dispatch({ type: 'SET_QUERY', payload: query })}
            onSearch={handleSearch}
            isQuerying={feedLoading}
            onStopQuery={() => {}}
            onSelectCategory={handleSelectCategory}
            searchHistory={state.searchHistory}
            suggestedChips={state.suggestedChips}
            onAppendChip={handleAppendChip}
            tileBaseQuery={state.tileBaseQuery}
          />
        )}
      </div>
    </div>
  );
}
