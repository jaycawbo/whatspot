import React, { useCallback, useRef, useMemo, useState } from 'react';
import { toast } from 'sonner';
import LoadingMessages from '@/components/home/LoadingMessages';
import WhatspotLogo from '@/components/brand/WhatspotLogo';
import { useGlobalState } from '@/context/GlobalStateContext';
import { recommend } from '@/services/api';
import Header from '@/components/home/Header';
import SearchBar from '@/components/home/SearchBar';
import CategoryTiles from '@/components/home/CategoryTiles';
import FilterSummary from '@/components/home/FilterSummary';
import RefinementChips from '@/components/home/RefinementChips';
import SuggestedChips from '@/components/home/SuggestedChips';
import ResultsList from '@/components/home/ResultsList';
import MapView from '@/components/home/MapView';
import ViewToggle from '@/components/home/ViewToggle';
import FilterDialog from '@/components/home/FilterDialog';
import RelaxationBanner from '@/components/home/RelaxationBanner';
import NoResultsPrompt from '@/components/home/NoResultsPrompt';
import SearchSummary from '@/components/home/SearchSummary';
import GatedModal from '@/components/home/GatedModal';
import MobileBottomSheet from '@/components/home/MobileBottomSheet';
import DiscoveryDeck from '@/components/discovery/DiscoveryDeck';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { logEvent } from '@/lib/logEvent';
import { useDiscoveryFeed } from '@/hooks/useDiscoveryFeed';

export default function Home() {
  const { state, dispatch } = useGlobalState();
  const isMobile = useIsMobile();
  const abortRef = useRef(null);
  const searchBarRef = useRef(null);

  // Discovery feed
  const { venues: feedVenues, isLoading: feedLoading, searchFeed, expandSearch } = useDiscoveryFeed();

  // Keep a ref to filters so runSearch always reads the latest values
  const filtersRef = useRef(state.filters);
  filtersRef.current = state.filters;

  // --- Search ---
  const runSearch = useCallback(
    async (queryText, overrideFilters = null) => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_SEARCH_ERROR', payload: null });

      // Add to history
      dispatch({
        type: 'ADD_SEARCH_HISTORY',
        payload: { query: queryText, location_name: state.locationName, timestamp: Date.now() },
      });

      const activeFilters = overrideFilters || filtersRef.current;

      // Read session history for context
      let session_context = [];
      try {
        const raw = sessionStorage.getItem('whatspot_session_history');
        if (raw) session_context = JSON.parse(raw);
      } catch {}

      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 90000)
        );

        const res = await Promise.race([
          recommend({
            mode: state.category ? 'browse_category' : 'query',
            category: state.category,
            query: queryText,
            lat: state.userLocation.lat,
            lon: state.userLocation.lon,
            location_name: state.locationName,
            radius_km: activeFilters.radius,
            relaxation_level: state.relaxationLevel,
            open_now: activeFilters.openNow || undefined,
            price_levels: activeFilters.priceLevels.length ? activeFilters.priceLevels : undefined,
            session_context,
          }),
          timeout,
        ]);
        dispatch({ type: 'SET_RESULTS', payload: res });

        // Log search event passively
        if (res?.results?.length) {
          logEvent('search', {
            search_query: queryText,
            results_returned: res.results.length,
            neighborhood_context: state.locationName,
          });
        }

        // Store search context in sessionStorage
        if (res?.results?.length) {
          const entry = {
            query: queryText,
            timestamp: Date.now(),
            search_summary: res.search_summary || null,
            results: res.results.map(r => ({
              name: r.name,
              cuisine_type: r.cuisine_type,
              descriptors: r.descriptors,
              reasoning_explanation: r.reasoning_explanation,
              address: r.address,
              lat: r.lat,
              lon: r.lon,
              rating: r.rating,
              review_count: r.review_count,
              price_level: r.price_level,
              place_id: r.place_id,
              image_urls: r.image_urls,
              distance_km: r.distance_km,
              category: r.category,
              score: r.score,
            })),
          };
          try {
            const history = session_context.length ? [...session_context] : [];
            history.push(entry);
            sessionStorage.setItem('whatspot_session_history', JSON.stringify(history.slice(-20)));
          } catch {}
        }
      } catch (err) {
        const isTimeout = err?.message === 'TIMEOUT';
        const errorMsg = isTimeout
          ? 'Search timed out. Try a simpler query or smaller radius.'
          : 'Search failed. Please try again.';
        dispatch({ type: 'SET_SEARCH_ERROR', payload: errorMsg });
        dispatch({ type: 'SET_LOADING', payload: false });
        toast.error(errorMsg);
      }
    },
    [state.userLocation, state.locationName, state.anonymousId, state.relaxationLevel, state.sort, dispatch]
  );

  const handleSearch = useCallback(
    (q) => {
      dispatch({ type: 'SET_QUERY', payload: q });
      runSearch(q, filtersRef.current);
    },
    [dispatch, runSearch]
  );

  const handleStopQuery = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    dispatch({ type: 'SET_LOADING', payload: false });
  }, [dispatch]);

  // --- Category selection ---
  const handleSelectCategory = useCallback(
    (cat) => {
      dispatch({ type: 'SET_QUERY', payload: cat.prompt });
      dispatch({ type: 'SET_TILE_BASE_QUERY', payload: cat.prompt });
      dispatch({ type: 'SET_CATEGORY', payload: cat.label });
    },
    [dispatch]
  );

  // --- Chip append ---
  const handleAppendChip = useCallback(
    (chipLabel, connector = ' ') => {
      const newQuery = (state.query + connector + chipLabel).trim();
      dispatch({ type: 'SET_QUERY', payload: newQuery });
    },
    [state.query, dispatch]
  );

  // --- Filters ---
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);

  const handleFilterChange = useCallback(
    (f) => {
      dispatch({ type: 'SET_FILTERS', payload: f });
      // Re-run search if we're in post-search mode
      if (state.mode === 'post-search' && state.query) {
        runSearch(state.query, f);
      }
    },
    [dispatch, state.mode, state.query, runSearch]
  );

  // --- Display results (sort only, filtering is server-side) ---
  const displayResults = useMemo(() => {
    let r = [...state.results];
    if (state.sort === 'distance') r.sort((a, b) => a.distance_km - b.distance_km);
    return r;
  }, [state.results, state.sort]);

  // --- Relaxation ---
  const handleRelax = useCallback(() => {
    const next = state.relaxationLevel + 1;
    if (next > 3) {
      dispatch({ type: 'SET_NO_VENUES', payload: true });
      return;
    }
    dispatch({ type: 'SET_RELAXATION_LEVEL', payload: next });
    runSearch(state.query);
  }, [state.relaxationLevel, state.query, dispatch, runSearch]);

  const isPreSearch = state.mode === 'pre-search';

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Pre-search state */}
      {isPreSearch && (
        <div className="flex flex-col items-center justify-center min-h-screen pt-14 pb-20 px-4 md:px-8">
          <div className="flex flex-col items-center justify-center w-full space-y-6">
            <a href="/" onClick={(e) => { e.preventDefault(); dispatch({ type: 'CLEAR_SEARCH' }); }} className="flex items-center cursor-pointer">
              <WhatspotLogo size="hero" />
            </a>

            {/* Search bar above card on desktop only */}
            {!isMobile && (
              <SearchBar
                query={state.query}
                onQueryChange={(q) => dispatch({ type: 'SET_QUERY', payload: q })}
                onSearch={handleSearch}
                isQuerying={state.isQuerying}
                onStopQuery={handleStopQuery}
                centered
              />
            )}

            {/* Discovery Feed — uses mock data until feed seeding is wired */}
            <div className="w-full max-w-sm mx-auto" style={{ height: '70vh', maxHeight: 600 }}>
              <DiscoveryDeck
                venues={mockVenues}
                onDescriptorTap={(tag) => handleSearch(tag)}
              />
            </div>

            {/* Search bar below card on mobile */}
            {isMobile && (
              <SearchBar
                query={state.query}
                onQueryChange={(q) => dispatch({ type: 'SET_QUERY', payload: q })}
                onSearch={handleSearch}
                isQuerying={state.isQuerying}
                onStopQuery={handleStopQuery}
                centered
              />
            )}

            <div className="w-full max-w-xl">
              <CategoryTiles onSelectCategory={handleSelectCategory} />
            </div>

            <div className="w-full max-w-xl">
              <FilterSummary filters={state.filters} onOpenFilters={() => setFilterDialogOpen(true)} />
            </div>

            {state.isLoading && (
              <div className="w-full max-w-xl">
                <LoadingMessages />
              </div>
            )}

            {state.tileBaseQuery && !state.isLoading && (
              <div className="w-full max-w-xl">
                <RefinementChips baseQuery={state.tileBaseQuery} onAppendChip={handleAppendChip} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post-search state */}
      {!isPreSearch && (
        <div className="pt-14">
          <div className="px-4 md:px-8 lg:px-12 py-4 space-y-4 max-w-7xl mx-auto">
            {/* Search bar (left-aligned) */}
            {!isMobile && (
              <SearchBar
                query={state.query}
                onQueryChange={(q) => dispatch({ type: 'SET_QUERY', payload: q })}
                onSearch={handleSearch}
                isQuerying={state.isQuerying}
                onStopQuery={handleStopQuery}
                centered={false}
              />
            )}

            {/* Loading messages */}
            {state.isLoading && <LoadingMessages />}

            {/* Suggested chips */}
            {!isMobile && !state.isLoading && (
              <SuggestedChips chips={state.suggestedChips} onAppendChip={handleAppendChip} />
            )}

            {/* Controls row */}
            <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
              <FilterSummary filters={state.filters} onOpenFilters={() => setFilterDialogOpen(true)} />
              <ViewToggle
                view={state.view}
                setView={(v) => dispatch({ type: 'SET_VIEW', payload: v })}
              />
            </div>

            {/* Relaxation banner */}
            <RelaxationBanner relaxations={state.appliedRelaxations} />

            {/* Search summary */}
            {!state.isLoading && state.results?.length > 0 && <SearchSummary summary={state.searchSummary} />}

            {/* Results */}
            {state.view === 'list' ? (
              <div>
                {!state.isLoading && displayResults.length === 0 ? (
                  <NoResultsPrompt
                    onRelax={handleRelax}
                    isRelaxing={state.isLoading}
                    noVenuesAtAll={state.noVenuesAtAll}
                    searchError={state.searchError}
                  />
                ) : (
                  <ResultsList results={displayResults} isLoading={state.isLoading} currentQuery={state.query} />
                )}
              </div>
            ) : (
              <div className="h-[60vh] md:h-[70vh]">
                <MapView results={displayResults} isLoading={state.isLoading} />
              </div>
            )}

            {/* Pagination */}
            {state.pagination?.has_more && !state.isLoading && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" className="gap-2">
                  <Loader2 className="h-4 w-4 animate-spin hidden" />
                  More options
                </Button>
              </div>
            )}
          </div>

          {/* Mobile bottom sheet */}
          {isMobile && (
            <MobileBottomSheet
              query={state.query}
              onQueryChange={(q) => dispatch({ type: 'SET_QUERY', payload: q })}
              onSearch={handleSearch}
              isQuerying={state.isQuerying}
              onStopQuery={handleStopQuery}
              suggestedChips={state.suggestedChips}
              onAppendChip={handleAppendChip}
              onSelectCategory={handleSelectCategory}
              searchHistory={state.searchHistory}
            />
          )}
        </div>
      )}

      {/* Gated modal */}
      <GatedModal isOpen={state.gated} onClose={() => {}} />

      {/* Standalone filter dialog (triggered from pre-search icon) */}
      <FilterDialog
        filters={state.filters}
        onFilterChange={handleFilterChange}
        externalOpen={filterDialogOpen}
        onExternalOpenChange={setFilterDialogOpen}
        hideTrigger
      />
    </div>
  );
}
