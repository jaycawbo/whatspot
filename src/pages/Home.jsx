import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logEvent } from '@/lib/logEvent';
import LoadingMessages from '@/components/home/LoadingMessages';
import { useGlobalState } from '@/context/GlobalStateContext';
import Header from '@/components/home/Header';
import SearchRow from '@/components/home/SearchRow';
import SearchDialog from '@/components/home/SearchDialog';
import ResultsBottomSheet from '@/components/home/ResultsBottomSheet';
import DiscoveryDeck from '@/components/discovery/DiscoveryDeck';
import SwipeEducationBanner from '@/components/discovery/SwipeEducationBanner';
import ResultsList from '@/components/home/ResultsList';
import MapView from '@/components/home/MapView';
import AuthModal from '@/components/auth/AuthModal';
import AdminHealthBanner from '@/components/admin/AdminHealthBanner';
import SearchCooldownDialog from '@/components/search/SearchCooldownDialog';
import PostSaveLabelSheet from '@/components/spots/PostSaveLabelSheet';
import FeedModeTabs from '@/components/home/FeedModeTabs';
import FilterDialog from '@/components/home/FilterDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDiscoveryFeed } from '@/hooks/useDiscoveryFeed';
import { useSwipeEducation } from '@/hooks/useSwipeEducation';
import { useGuestLimits } from '@/hooks/useGuestLimits';
import { useAuth } from '@/lib/AuthContext';
import { useVenueListMembership } from '@/hooks/useVenueListMembership';
import { useSearchConversation } from '@/hooks/useSearchConversation';
import { reverseGeocode } from '@/lib/reverseGeocode';

const normalizeId = (v) => (v.place_id || v.google_place_id || '').replace(/^places\//, '');

// Space the swipe-education banner (issue #369) reserves from the deck's own
// height budget when shown, so it never clips the deck. Kept slightly above
// the banner's real rendered height (~76px) as a safety margin — see
// SwipeEducationBanner.jsx.
const BANNER_RESERVED_PX = 88;

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
    tabDataMap,
    searchFeed,
    restoreSearch,
    expandSearch,
    refetchDiscovery,
    switchToForYou,
    getReserveVenues,
    getPrefetchedVenues,
    prefetchNextBatch,
    fetchMoreTabVenues,
  } = useDiscoveryFeed();

  const { showGate, closeGate } = useGuestLimits();
  const { show: showSwipeHint, dismiss: dismissSwipeHint } = useSwipeEducation();
  const showSwipeBanner = showSwipeHint && !feedLoading && !tabEmpty;
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

  // Restore conv results after back-navigation from a venue page.
  // state.query survives in GlobalStateContext but convResults is local state — re-hydrate from sessionStorage on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state.query) return;
    try {
      const saved = sessionStorage.getItem('ws_search_results');
      if (!saved) return;
      const { query, venues, response, chips } = JSON.parse(saved);
      if (query === state.query) {
        setConvResults(venues || []);
        setConvResponse(response || '');
        setConvChips(chips || []);
        setConvQuery(query);
      }
    } catch {}
  }, []); // mount only — intentional, reads context value that persists across navigation

  // Post-save label microinteraction
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e) => setLabelSheetVenue(e.detail?.venue || null);
    window.addEventListener('whatspot:show-label-sheet', handler);
    return () => window.removeEventListener('whatspot:show-label-sheet', handler);
  }, [isAuthenticated]);

  // Seed reserve buffer on first feed load. Only For You actually draws from the
  // discovery/recommend() pipeline's reserve+prefetch pools — the mount effect in
  // useDiscoveryFeed always runs that pipeline once regardless of active tab, so without
  // this guard, landing directly on a feed-tabs-backed tab (Popular/New/Trending/Walk-In)
  // silently pads its deck with unrelated discovery-mode venues the first time feedVenues
  // goes non-empty, masking whether that tab's own load-more path is actually being
  // exercised. See issue #352.
  useEffect(() => {
    if (feedVenues.length > 0 && !hasInitializedReserve.current) {
      hasInitializedReserve.current = true;
      if (state.feedTab !== 'for_you') return;
      const activeIds = new Set(feedVenues.map(normalizeId).filter(Boolean));
      const reserve = getReserveVenues(activeIds);
      const prefetched = getPrefetchedVenues(activeIds);
      const combined = [...reserve, ...prefetched];
      if (combined.length > 0) setReserveVenues(combined);
    }
  }, [feedVenues, getReserveVenues, getPrefetchedVenues, state.feedTab]);

  // Persist conv results to sessionStorage so they survive back-navigation
  useEffect(() => {
    if (convResults.length === 0) return;
    try {
      sessionStorage.setItem('ws_search_results', JSON.stringify({
        query: convQuery,
        venues: convResults,
        response: convResponse,
        chips: convChips,
      }));
    } catch {}
  }, [convResults, convQuery, convResponse, convChips]);

  const activeIds = useMemo(() => {
    const ids = new Set();
    [...feedVenues, ...reserveVenues].forEach(v => {
      const id = normalizeId(v);
      if (id) ids.add(id);
    });
    return ids;
  }, [feedVenues, reserveVenues]);

  // Popular is fed by feed-tabs, not the discovery/For You recommend() pipeline — this is
  // its own load-more path, shared by the proactive deck trigger and the terminal empty
  // state's "Explore further" CTA, instead of either falling through to reserve/prefetch
  // pools that pipeline never populates for this tab, or (for the CTA) calling expandSearch()
  // and hitting recommend() directly. See issue #352.
  const requestMorePopularVenues = useCallback(async () => {
    const result = await fetchMoreTabVenues('popular');
    const fresh = (result?.venues || []).filter(v => {
      const id = normalizeId(v);
      return id && !activeIds.has(id);
    });
    if (fresh.length > 0) setReserveVenues(prev => [...prev, ...fresh]);
    return result;
  }, [fetchMoreTabVenues, activeIds]);

  const handleRequestMoreVenues = useCallback(async () => {
    if (state.feedTab === 'popular') {
      await requestMorePopularVenues();
      return;
    }

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
  }, [state.feedTab, requestMorePopularVenues, getReserveVenues, getPrefetchedVenues, prefetchNextBatch, expandSearch, currentQuery, activeIds]);

  const handleExpandSearch = useCallback(() => {
    if (state.feedTab === 'popular') {
      requestMorePopularVenues();
      return;
    }
    expandSearch();
  }, [state.feedTab, requestMorePopularVenues, expandSearch]);

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

  const logSearchEvent = useCallback(
    (queryText, result) => {
      logEvent('search', {
        search_query: queryText,
        neighborhood_context: state.locationName,
        results_returned: result?.venues?.length ?? 0,
        metadata: { parsed_intent: result?.parsed_intent ?? null },
      });
    },
    [state.locationName]
  );

  const handleSearch = useCallback(
    async (queryText) => {
      const nextQuery = queryText.trim();
      if (!nextQuery) return;
      if (conversation.rateLimited) return;
      dispatch({ type: 'SET_QUERY', payload: nextQuery });
      dispatch({ type: 'SET_CATEGORY', payload: null });
      dispatch({ type: 'SET_TILE_BASE_QUERY', payload: null });
      addSearchHistory(nextQuery);
      setReserveVenues([]);
      const coords = state.userLocation?.lat
        ? { lat: state.userLocation.lat, lon: state.userLocation.lon ?? state.userLocation.lng }
        : null;
      const result = await conversation.search(nextQuery, coords, state.filters, state.locationName);
      logSearchEvent(nextQuery, result);
      if (result) {
        setConvResults(result.venues || []);
        setConvResponse(result.conversational_response || '');
        setConvChips(result.refinement_suggestions || []);
        setConvQuery(nextQuery);
      }
    },
    [conversation, dispatch, addSearchHistory, state.locationName, state.userLocation, state.filters, logSearchEvent]
  );

  const handleSelectCategory = useCallback(
    async (category) => {
      if (conversation.rateLimited) return;
      dispatch({ type: 'SET_QUERY', payload: category.prompt });
      dispatch({ type: 'SET_TILE_BASE_QUERY', payload: category.prompt });
      dispatch({ type: 'SET_CATEGORY', payload: category.label });
      addSearchHistory(category.prompt);
      setReserveVenues([]);
      const coords = state.userLocation?.lat
        ? { lat: state.userLocation.lat, lon: state.userLocation.lon ?? state.userLocation.lng }
        : null;
      const result = await conversation.search(category.prompt, coords, state.filters, state.locationName);
      logSearchEvent(category.prompt, result);
      if (result) {
        setConvResults(result.venues || []);
        setConvResponse(result.conversational_response || '');
        setConvChips(result.refinement_suggestions || []);
        setConvQuery(category.prompt);
      }
    },
    [conversation, dispatch, addSearchHistory, state.locationName, state.userLocation, state.filters, logSearchEvent]
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
      if (conversation.rateLimited) return;
      dispatch({ type: 'SET_QUERY', payload: chipText });
      const coords = state.userLocation?.lat
        ? { lat: state.userLocation.lat, lon: state.userLocation.lon ?? state.userLocation.lng }
        : null;
      const result = await conversation.search(chipText, coords, state.filters, state.locationName);
      if (result) {
        setConvResults(result.venues || []);
        setConvResponse(result.conversational_response || '');
        setConvChips(result.refinement_suggestions || []);
        setConvQuery(chipText);
      }
    },
    [conversation, dispatch, state.userLocation, state.filters, state.locationName]
  );

  const handleSearchFromHere = useCallback(
    async (lat, lon) => {
      if (!state.query || conversation.isSearching || conversation.rateLimited) return;
      const newCoords = { lat, lon };
      dispatch({
        type: 'SET_LOCATION',
        payload: { name: state.locationName, coords: { lat, lon, isGPS: false, isPinDrop: false, locationType: null } },
      });
      const searchPromise = conversation.search(state.query, newCoords, state.filters, state.locationName);
      reverseGeocode(lat, lon)
        .then((name) =>
          dispatch({
            type: 'SET_LOCATION',
            payload: { name, coords: { lat, lon, isGPS: false, isPinDrop: false, locationType: null } },
          })
        )
        .catch(() => {});
      const result = await searchPromise;
      if (result) {
        setConvResults(result.venues || []);
        setConvResponse(result.conversational_response || '');
        setConvChips(result.refinement_suggestions || []);
      }
    },
    [conversation, dispatch, state.query, state.locationName, state.filters]
  );

  const handleTabChange = useCallback(
    (tab) => {
      setReserveVenues([]);
      if (tab === 'for_you') switchToForYou();
    },
    [switchToForYou]
  );

  const handleClearSearch = useCallback(() => {
    dispatch({ type: 'CLEAR_SEARCH' });
    setReserveVenues([]);
    setConvResults([]);
    setConvResponse('');
    setConvChips([]);
    setConvQuery('');
    conversation.resetSession();
    try {
      sessionStorage.removeItem('ws_conv_state');
      sessionStorage.removeItem('ws_search_results');
    } catch {}
    refetchDiscovery();
  }, [dispatch, refetchDiscovery, conversation]);

  const handleLogoReset = useCallback(() => {
    dispatch({ type: 'CLEAR_SEARCH' });
    setReserveVenues([]);
    hasInitializedReserve.current = false;
    try {
      sessionStorage.removeItem('ws_last_search');
      sessionStorage.removeItem('ws_search_results');
    } catch {}
    refetchDiscovery();
  }, [dispatch, refetchDiscovery]);

  // Intercept device back button / gesture while search is active.
  // Pushes a sentinel history entry so the first popstate stays on this page
  // and clears search instead of navigating away.
  // Skip entirely when not on '/' — Home stays mounted under /venue/:placeId,
  // and running here would push a sentinel on top of the venue URL, corrupting the stack.
  // Skip the push when a sentinel is already in place (e.g. after back-nav from a venue page).
  useEffect(() => {
    if (!state.query) return;
    if (window.location.pathname !== '/') return;
    if (!window.history.state?.wsSearchActive) {
      window.history.pushState({ wsSearchActive: true }, '');
    }
    const onPopstate = (event) => {
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
    if (f.openNow) count++;
    if (f.walkInOnly) count++;
    if (f.priceLevels?.length) count += f.priceLevels.length;
    if (f.cuisines?.length) count += f.cuisines.length;
    if (f.radius && f.radius !== 5) count++;
    return count;
  }, [state.filters]);

  // Venues valid for map rendering — sourced from orchestrator in search mode
  // When walkInOnly is active, restrict to venues explicitly flagged as available
  const mappableVenues = useMemo(() => {
    const base = convResults.filter(v => v.lat != null && (v.lon ?? v.lng) != null);
    if (!state.filters.walkInOnly) return base;
    return base.filter(v => v.is_available === true);
  }, [convResults, state.filters.walkInOnly]);

  const isMobilePostSearch = isMobile && !!state.query;
  const isDesktopPostSearch = !isMobile && !!state.query;

  return (
    <div className="bg-background flex flex-col" style={{ height: '100dvh', overflow: 'hidden' }}>
      <AdminHealthBanner />
      <Header onLogoClick={handleLogoReset} onCloseSearch={() => setSearchDialogOpen(false)} />

      {/* Permanent search row — fixed below nav */}
      <SearchRow
        hasQuery={!!state.query}
        query={state.query}
        onBackClick={handleClearSearch}
        onFilterClick={() => setFilterOpen(true)}
        onSearchOpen={() => setSearchDialogOpen(true)}
        activeFilterCount={activeFilterCount}
        isSearching={conversation.isSearching}
      />

      {/* Modals and sheets */}
      <AuthModal
        open={showGate}
        onOpenChange={(open) => { if (!open) closeGate(); }}
        description="Sign in for unlimited swipes."
      />
      <AuthModal
        open={conversation.authGateOpen}
        onOpenChange={(open) => { if (!open) conversation.closeAuthGate(); }}
        title="Oops...You Must Sign In First"
        description="Sign in to begin searching for spots."
      />
      <SearchCooldownDialog
        open={conversation.cooldownOpen}
        onOpenChange={(open) => { if (!open) conversation.closeCooldown(); }}
        nextAllowedAt={conversation.nextAllowedAt}
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
            conversation.searchWithFilters(state.query, coords, f, state.locationName).then((result) => {
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
        userCoordinates={state.userLocation}
        isSearching={conversation.isSearching}
      />

      {/* ── Mobile post-search: fullscreen map + snap bottom sheet ── */}
      {isMobilePostSearch && (
        <>
          {/* Map fills the screen behind nav + search row.
              `isolate` contains Leaflet's internal z-indexes (400-1000)
              so they cannot bleed above the search dialog (z-[60]). */}
          <div className="fixed inset-0 z-10 isolate">
            <MapView results={mappableVenues} isLoading={conversation.isSearching} onSearchFromHere={handleSearchFromHere} />
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
          style={{ marginTop: '122px', height: 'calc(100dvh - 122px)' }}
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
            <MapView results={mappableVenues} isLoading={conversation.isSearching} onSearchFromHere={handleSearchFromHere} />
          </div>
        </div>
      )}

      {/* ── Feed / discovery mode (both breakpoints) ── */}
      {!state.query && (
        <div
          className="flex flex-col flex-1 overflow-hidden"
          style={{ paddingTop: '132px' }}
        >
          {/* Feed mode tabs + filter is handled inside SearchRow now for filters;
              tabs remain here since they only show in feed mode */}
          <div className="flex items-center justify-center gap-3 px-4 py-2">
            <FeedModeTabs onTabChange={handleTabChange} tabDataMap={tabDataMap} />
          </div>

          {/* Secondary swipe-education prompt (issue #369) — fallback for the onboarding
              interstitial, which is one-time and easy to skip. Only for users who've never
              swiped or haven't in 90+ days. Rendered in-flow (not fixed) so it can't overlap
              the deck's info panel or buttons; BANNER_RESERVED_PX below compensates the
              deck's own height budget so nothing gets clipped. */}
          {showSwipeBanner && <SwipeEducationBanner onDismiss={dismissSwipeHint} />}

          <div
            className={`flex-1 flex items-center justify-center px-4 overflow-hidden ${isMobile ? 'pb-20' : ''}`}
            style={{
              '--deck-height': isMobile
                ? `calc(100dvh - ${280 + (showSwipeBanner ? BANNER_RESERVED_PX : 0)}px)`
                : `clamp(500px, calc(100dvh - ${175 + (showSwipeBanner ? BANNER_RESERVED_PX : 0)}px), 800px)`,
            }}
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
                  onExpandSearch={handleExpandSearch}
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
