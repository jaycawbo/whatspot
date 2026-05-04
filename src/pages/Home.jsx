import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logEvent } from '@/lib/logEvent';
import LoadingMessages from '@/components/home/LoadingMessages';
import { useGlobalState } from '@/context/GlobalStateContext';
import Header from '@/components/home/Header';
import SearchRow from '@/components/home/SearchRow';
import SearchDialog from '@/components/home/SearchDialog';
import ResultsBottomSheet from '@/components/home/ResultsBottomSheet';
import DiscoveryDeck from '@/components/discovery/DiscoveryDeck';
import ResultsList from '@/components/home/ResultsList';
import MapView from '@/components/home/MapView';
import AuthModal from '@/components/auth/AuthModal';
import PostSaveLabelSheet from '@/components/spots/PostSaveLabelSheet';
import FeedModeTabs from '@/components/home/FeedModeTabs';
import FilterDialog from '@/components/home/FilterDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDiscoveryFeed } from '@/hooks/useDiscoveryFeed';
import { useGuestLimits } from '@/hooks/useGuestLimits';
import { useAuth } from '@/lib/AuthContext';
import { useVenueListMembership } from '@/hooks/useVenueListMembership';
import { useSearchConversation } from '@/hooks/useSearchConversation';

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
  const { isAuthenticated } = useAuth();

  const {
    venues: feedVenues,
    overflowVenues,
    isLoading: feedLoading,
    currentQuery,
    tabEmpty,
    searchFeed,
    restoreSearch,
    expandSearch,
    refetchDiscovery,
    getReserveVenues,
    getPrefetchedVenues,
    prefetchNextBatch,
  } = useDiscoveryFeed();

  const { showGate, closeGate, incrementSearch } = useGuestLimits();
  const listMembershipMap = useVenueListMembership();
  const conversation = useSearchConversation();

  const [reserveVenues, setReserveVenues] = useState([]);
  const [labelSheetVenue, setLabelSheetVenue] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [convResults, setConvResults] = useState([]);
  const [convResponse, setConvResponse] = useState('');
  const [convChips, setConvChips] = useState([]);
  const [convQuery, setConvQuery] = useState('');

  const hasInitializedReserve = useRef(false);

  // Restore conv state after back-navigation (runs once on mount)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ws_conv_state');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.query) {
        setConvResults(saved.results || []);
        setConvResponse(saved.response || '');
        setConvChips(saved.chips || []);
        setConvQuery(saved.query);
        dispatch({ type: 'SET_QUERY', payload: saved.query });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist conv state so back-navigation restores results
  useEffect(() => {
    if (!convQuery) return;
    try {
      sessionStorage.setItem('ws_conv_state', JSON.stringify({
        query: convQuery,
        results: convResults,
        response: convResponse,
        chips: convChips,
      }));
    } catch {}
  }, [convQuery, convResults, convResponse, convChips]);

  // Post-save label microinteraction
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e) => setLabelSheetVenue(e.detail?.venue || null);
    window.addEventListener('whatspot:show-label-sheet', handler);
    return () => window.removeEventListener('whatspot:show-label-sheet', handler);
  }, [isAuthenticated]);

  // Seed reserve buffer on first feed load
  useEffect(() => {
    if (feedVenues.length > 0 && !hasInitializedReserve.current) {
      hasInitializedReserve.current = true;
      const activeIds = new Set(feedVenues.map(normalizeId).filter(Boolean));
      const reserve = getReserveVenues(activeIds);
      const prefetched = getPrefetchedVenues(activeIds);
      const combined = [...reserve, ...prefetched];
      if (combined.length > 0) setReserveVenues(combined);
    }
  }, [feedVenues, getReserveVenues, getPrefetchedVenues]);

  const activeIds = useMemo(() => {
    const ids = new Set();
    [...feedVenues, ...reserveVenues].forEach(v => {
      const id = normalizeId(v);
      if (id) ids.add(id);
    });
    return ids;
  }, [feedVenues, reserveVenues]);

  const handleRequestMoreVenues = useCallback(async () => {
    const reserve = getReserveVenues(activeIds);
    const prefetched = getPrefetchedVenues(activeIds);
    const immediate = [...reserve, ...prefetched];
    if (immediate.length > 0) setReserveVenues(prev => [...prev, ...immediate]);

    if (!currentQuery) {
      const result = await prefetchNextBatch();
      const updatedActiveIds = new Set(activeIds);
      immediate.forEach(v => { const id = normalizeId(v); if (id) updatedActiveIds.add(id); });
      const reserve2 = getReserveVenues(updatedActiveIds);
      const prefetched2 = getPrefetchedVenues(updatedActiveIds);
      const deferred = [...reserve2, ...prefetched2];
      if (deferred.length > 0) setReserveVenues(prev => [...prev, ...deferred]);
      if (immediate.length === 0 && deferred.length === 0 && result !== 'busy') expandSearch();
    } else if (immediate.length === 0) {
      expandSearch();
    }
  }, [getReserveVenues, getPrefetchedVenues, prefetchNextBatch, expandSearch, currentQuery, activeIds]);

  const addSearchHistory = useCallback(
    (queryText) => {
      if (!queryText?.trim()) return;
      dispatch({
        type: 'ADD_SEARCH_HISTORY',
        payload: { query: queryText, location_name: state.locationName, timestamp: Date.now() },
      });
    },
    [dispatch, state.locationName]
  );

  const handleSearch = useCallback(
    async (queryText) => {
      const nextQuery = queryText.trim();
      if (!nextQuery) return;
      if (conversation.isLimitReached) return;
      if (incrementSearch()) return;
      dispatch({ type: 'SET_QUERY', payload: nextQuery });
      dispatch({ type: 'SET_CATEGORY', payload: null });
      dispatch({ type: 'SET_TILE_BASE_QUERY', payload: null });
      addSearchHistory(nextQuery);
      setReserveVenues([]);
      logEvent('search', { search_query: nextQuery, neighborhood_context: state.locationName });
      const coords = state.userLocation?.lat
        ? { lat: state.userLocation.lat, lon: state.userLocation.lon ?? state.userLocation.lng }
        : null;
      const result = await conversation.search(nextQuery, coords, state.filters);
      if (result) {
        setConvResults(result.venues || []);
        setConvResponse(result.conversational_response || '');
        setConvChips(result.refinement_suggestions || []);
        setConvQuery(nextQuery);
      }
    },
    [conversation, dispatch, addSearchHistory, incrementSearch, state.locationName, state.userLocation, state.filters]
  );

  const handleSelectCategory = useCallback(
    async (category) => {
      if (conversation.isLimitReached) return;
      if (incrementSearch()) return;
      dispatch({ type: 'SET_QUERY', payload: category.prompt });
      dispatch({ type: 'SET_TILE_BASE_QUERY', payload: category.prompt });
      dispatch({ type: 'SET_CATEGORY', payload: category.label });
      addSearchHistory(category.prompt);
      setReserveVenues([]);
      logEvent('search', { search_query: category.prompt, neighborhood_context: state.locationName });
      const coords = state.userLocation?.lat
        ? { lat: state.userLocation.lat, lon: state.userLocation.lon ?? state.userLocation.lng }
        : null;
      const result = await conversation.search(category.prompt, coords, state.filters);
      if (result) {
        setConvResults(result.venues || []);
        setConvResponse(result.conversational_response || '');
        setConvChips(result.refinement_suggestions || []);
        setConvQuery(category.prompt);
      }
    },
    [conversation, dispatch, addSearchHistory, incrementSearch, state.locationName, state.userLocation, state.filters]
  );

  const handleAppendChip = useCallback(
    (chipLabel, connector = ' ') => {
      const newQuery = `${state.query || state.tileBaseQuery || ''}${connector}${chipLabel}`.trim();
      dispatch({ type: 'SET_QUERY', payload: newQuery });
    },
    [state.query, state.tileBaseQuery, dispatch]
  );

  const handleChipTap = useCallback(
    async (chipText) => {
      if (conversation.isLimitReached) return;
      dispatch({ type: 'SET_QUERY', payload: chipText });
      const coords = state.userLocation?.lat
        ? { lat: state.userLocation.lat, lon: state.userLocation.lon ?? state.userLocation.lng }
        : null;
      const result = await conversation.search(chipText, coords, state.filters);
      if (result) {
        setConvResults(result.venues || []);
        setConvResponse(result.conversational_response || '');
        setConvChips(result.refinement_suggestions || []);
        setConvQuery(chipText);
      }
    },
    [conversation, dispatch, state.userLocation, state.filters]
  );

  const handleTabChange = useCallback(
    (tab) => {
      setReserveVenues([]);
      if (tab === 'for_you') refetchDiscovery();
    },
    [refetchDiscovery]
  );

  const handleClearSearch = useCallback(() => {
    dispatch({ type: 'SET_QUERY', payload: '' });
    setReserveVenues([]);
    setConvResults([]);
    setConvResponse('');
    setConvChips([]);
    setConvQuery('');
    conversation.resetSession();
    try {
      sessionStorage.removeItem('ws_conv_state');
    } catch {}
    refetchDiscovery();
  }, [dispatch, refetchDiscovery, conversation]);

  const handleLogoReset = useCallback(() => {
    setReserveVenues([]);
    hasInitializedReserve.current = false;
    try { sessionStorage.removeItem('ws_last_search'); } catch {}
    refetchDiscovery();
  }, [refetchDiscovery]);

  // Intercept device back button / gesture while search is active.
  // Pushes a sentinel history entry so the first popstate stays on this page
  // and clears search instead of navigating away.
  useEffect(() => {
    if (!state.query) return;
    window.history.pushState({ wsSearchActive: true }, '');
    const onPopstate = (event) => {
      // If we're landing on the sentinel entry (returning from a venue page),
      // stay in search state — don't clear. The sentinel already consumed the pop.
      if (event.state?.wsSearchActive) return;
      handleClearSearch();
    };
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, [state.query, handleClearSearch]);

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

  // Venues valid for map rendering — sourced from orchestrator in search mode
  const mappableVenues = useMemo(
    () => convResults.filter(v => v.lat != null && (v.lon ?? v.lng) != null),
    [convResults]
  );

  const isMobilePostSearch = isMobile && !!state.query;
  const isDesktopPostSearch = !isMobile && !!state.query;

  return (
    <div className="bg-background flex flex-col" style={{ height: '100dvh', overflow: 'hidden' }}>
      <Header onLogoClick={handleLogoReset} onCloseSearch={() => setSearchDialogOpen(false)} />

      {/* Permanent search row — fixed below nav */}
      <SearchRow
        hasQuery={!!state.query}
        query={state.query}
        onBackClick={handleClearSearch}
        onFilterClick={() => setFilterOpen(true)}
        onSearchOpen={() => setSearchDialogOpen(true)}
        activeFilterCount={activeFilterCount}
      />

      {/* Modals and sheets */}
      <AuthModal
        open={showGate}
        onOpenChange={(open) => { if (!open) closeGate(); }}
        description="Sign in for unlimited swipes and searches."
      />
      <FilterDialog
        filters={state.filters}
        open={filterOpen}
        onOpenChange={setFilterOpen}
        onFilterChange={(f) => {
          dispatch({ type: 'SET_FILTERS', payload: f });
          if (state.query && !conversation.isSearching) {
            const coords = state.userLocation?.lat
              ? { lat: state.userLocation.lat, lon: state.userLocation.lon ?? state.userLocation.lng }
              : null;
            conversation.searchWithFilters(state.query, coords, f).then((result) => {
              if (result) {
                setConvResults(result.venues || []);
                setConvResponse(result.conversational_response || '');
                setConvChips(result.refinement_suggestions || []);
              }
            });
          }
        }}
      />
      {labelSheetVenue && (
        <PostSaveLabelSheet
          venue={labelSheetVenue}
          onClose={() => setLabelSheetVenue(null)}
        />
      )}

      {/* Search dialog overlay */}
      <SearchDialog
        open={searchDialogOpen}
        onClose={() => setSearchDialogOpen(false)}
        query={state.query}
        onQueryChange={(q) => dispatch({ type: 'SET_QUERY', payload: q })}
        onSearch={handleSearch}
        onSelectCategory={handleSelectCategory}
        searchHistory={state.searchHistory}
        suggestedChips={state.suggestedChips}
        onAppendChip={handleAppendChip}
        onFilterClick={() => setFilterOpen(true)}
        activeFilterCount={activeFilterCount}
      />

      {/* ── Mobile post-search: fullscreen map + snap bottom sheet ── */}
      {isMobilePostSearch && (
        <>
          {/* Map fills the screen behind nav + search row.
              `isolate` contains Leaflet's internal z-indexes (400-1000)
              so they cannot bleed above the search dialog (z-[60]). */}
          <div className="fixed inset-0 z-10 isolate">
            <MapView results={mappableVenues} isLoading={conversation.isSearching} />
          </div>

          {/* Loading overlay: dims the map and shows cycling messages while results are fetching */}
          {conversation.isSearching && (
            <div
              className="fixed inset-0 z-20 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.4)' }}
            >
              <LoadingMessages light />
            </div>
          )}

          <ResultsBottomSheet
            results={mappableVenues}
            isLoading={conversation.isSearching}
            currentQuery={convQuery}
            conversationalResponse={convResponse}
            refinementChips={convChips}

            isLimitReached={conversation.isLimitReached}
            onChipTap={handleChipTap}
            open
          />
        </>
      )}

      {/* ── Desktop post-search: side-by-side list + map ── */}
      {isDesktopPostSearch && (
        <div
          className="flex overflow-hidden"
          style={{ marginTop: '110px', height: 'calc(100dvh - 110px)' }}
        >
          <div className="w-[40%] overflow-y-auto border-r border-border px-4 py-4 pb-4">
            {conversation.isSearching && <LoadingMessages />}
            <ResultsList
              results={mappableVenues}
              isLoading={conversation.isSearching}
              currentQuery={convQuery}
              skeletonCount={Math.max(2, Math.floor((window.innerHeight - 186) / 132))}
              conversationalResponse={convResponse}
              refinementChips={convChips}
  
              isLimitReached={conversation.isLimitReached}
              onChipTap={handleChipTap}
            />
          </div>
          {/* `isolate` contains Leaflet's z-indexes within this stacking context */}
          <div className="w-[60%] isolate h-full relative">
            <MapView results={mappableVenues} isLoading={conversation.isSearching} />
          </div>
        </div>
      )}

      {/* ── Feed / discovery mode (both breakpoints) ── */}
      {!state.query && (
        <div
          className="flex flex-col flex-1 overflow-hidden"
          style={{ paddingTop: '120px' }}
        >
          {/* Feed mode tabs + filter is handled inside SearchRow now for filters;
              tabs remain here since they only show in feed mode */}
          <div className="flex items-center justify-center gap-3 px-4 py-2">
            <FeedModeTabs onTabChange={handleTabChange} />
          </div>

          <div
            className={`flex-1 flex items-center justify-center px-4 overflow-hidden ${isMobile ? 'pb-20' : ''}`}
            style={{ '--deck-height': isMobile ? 'calc(100dvh - 280px)' : 'clamp(500px, calc(100dvh - 175px), 800px)' }}
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
                  isDiscoveryMode
                  listMembershipMap={listMembershipMap}
                  onDescriptorTap={(tag) => {
                    dispatch({ type: 'SET_QUERY', payload: tag });
                    searchFeed(tag);
                    setReserveVenues([]);
                  }}
                  onExpandSearch={expandSearch}
                  onNewSearch={() => setSearchDialogOpen(true)}
                  onRequestMoreVenues={handleRequestMoreVenues}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
