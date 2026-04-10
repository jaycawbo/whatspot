import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { logEvent } from '@/lib/logEvent';
import LoadingMessages from '@/components/home/LoadingMessages';
import { useGlobalState } from '@/context/GlobalStateContext';
import Header from '@/components/home/Header';
import SearchBar from '@/components/home/SearchBar';
import CategoryTiles from '@/components/home/CategoryTiles';
import MobileSearchDrawer from '@/components/home/MobileSearchDrawer';
import DiscoveryDeck from '@/components/discovery/DiscoveryDeck';
import AuthModal from '@/components/auth/AuthModal';
import PostSaveLabelSheet from '@/components/spots/PostSaveLabelSheet';
import FeedModeTabs from '@/components/home/FeedModeTabs';
import FilterDialog from '@/components/home/FilterDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDiscoveryFeed } from '@/hooks/useDiscoveryFeed';
import { useGuestLimits } from '@/hooks/useGuestLimits';
import { useAuth } from '@/lib/AuthContext';
import { useVenueListMembership } from '@/hooks/useVenueListMembership';

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
  const { isAuthenticated } = useAuth();

  const { venues: feedVenues, overflowVenues, isLoading: feedLoading, currentQuery, tabEmpty, searchFeed, expandSearch, refetchDiscovery, getReserveVenues, getPrefetchedVenues, prefetchNextBatch } = useDiscoveryFeed();
  const { showGate, closeGate, incrementSearch } = useGuestLimits();
  const listMembershipMap = useVenueListMembership();
  const [reserveVenues, setReserveVenues] = useState([]);
  const [labelSheetVenue, setLabelSheetVenue] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // Listen for post-save label microinteraction events from swipe handlers
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e) => setLabelSheetVenue(e.detail?.venue || null);
    window.addEventListener('whatspot:show-label-sheet', handler);
    return () => window.removeEventListener('whatspot:show-label-sheet', handler);
  }, [isAuthenticated]);
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
      // If both phases yielded nothing and no prefetch was already in flight, expand search as fallback
      if (immediate.length === 0 && deferred.length === 0 && result !== 'busy') {
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
      if (incrementSearch()) return; // guest limit hit — gate shown

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
    [dispatch, addSearchHistory, searchFeed, incrementSearch]
  );

  const handleSelectCategory = useCallback(
    (category) => {
      if (incrementSearch()) return; // guest limit hit — gate shown

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
    [dispatch, addSearchHistory, searchFeed, incrementSearch]
  );

  const handleAppendChip = useCallback(
    (chipLabel, connector = ' ') => {
      const newQuery = `${state.query || state.tileBaseQuery || ''}${connector}${chipLabel}`.trim();
      dispatch({ type: 'SET_QUERY', payload: newQuery });
    },
    [state.query, state.tileBaseQuery, dispatch]
  );

  const handleTabChange = useCallback(
    (tab) => {
      setReserveVenues([]);
      // For You and Popular use the recommend pipeline — trigger a fresh fetch
      if (tab === 'for_you' || tab === 'popular') {
        refetchDiscovery();
      }
      // New and Trending are handled by the effect inside useDiscoveryFeed
    },
    [refetchDiscovery]
  );

  // Count non-default active filters for badge
  const activeFilterCount = useMemo(() => {
    const f = state.filters;
    let count = 0;
    if (!f.openNow) count++;
    if (f.priceLevels?.length) count += f.priceLevels.length;
    if (f.cuisines?.length) count += f.cuisines.length;
    if (f.radius && f.radius !== 5) count++;
    return count;
  }, [state.filters]);

  return (
    <div className="bg-background flex flex-col" style={{ height: '100dvh', overflow: 'hidden' }}>
      <Header />
      <AuthModal
        open={showGate}
        onOpenChange={(open) => { if (!open) closeGate(); }}
        description="Sign in for unlimited swipes and searches."
      />
      <FilterDialog
        filters={state.filters}
        open={filterOpen}
        onOpenChange={setFilterOpen}
        onFilterChange={(f) => dispatch({ type: 'SET_FILTERS', payload: f })}
      />
      {labelSheetVenue && (
        <PostSaveLabelSheet
          venue={labelSheetVenue}
          onClose={() => setLabelSheetVenue(null)}
        />
      )}

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
            {currentQuery && !feedLoading && (
              <p className="text-xs text-muted-foreground text-center max-w-md mx-auto pt-1 pointer-events-none">
                Showing you the best results based on your search. With Whatspot's proprietary algorithm, you only ever see what's most relevant and truly the cream of the crop.
              </p>
            )}
          </div>
        )}

        {/* Feed mode tabs + filter button */}
        {!currentQuery && (
          <div className="flex items-center justify-center gap-3 px-4 pb-2">
            <FeedModeTabs onTabChange={handleTabChange} />
            <button
              onClick={() => setFilterOpen(true)}
              className="relative inline-flex items-center justify-center h-[34px] w-[34px] rounded-full border border-border bg-card hover:bg-accent transition-colors shrink-0"
              aria-label="Filters"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#22c55e] text-[10px] font-bold text-white flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        )}

        <div
          className={`flex-1 flex items-center justify-center px-4 ${isMobile ? 'pb-20' : ''}`}
          style={{ '--deck-height': isMobile ? '85dvh' : 'clamp(500px, 78dvh, 800px)' }}
        >
          <div className="w-full mx-auto">
            {feedLoading ? (
              <div className="flex items-center justify-center h-full">
                <LoadingMessages />
              </div>
            ) : tabEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
                <p className="text-muted-foreground text-sm">Not enough data yet — check back soon.</p>
              </div>
            ) : (
              <DiscoveryDeck
                venues={deduplicateVenues([...feedVenues, ...reserveVenues])}
                overflowVenues={overflowVenues}
                currentQuery={currentQuery}
                isDiscoveryMode={!currentQuery}
                listMembershipMap={listMembershipMap}
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
