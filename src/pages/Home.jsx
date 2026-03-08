import React, { useCallback, useRef, useMemo, useState } from 'react';
import whatspotLogo from '@/assets/whatspot_logo.svg';
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
import SortToggle from '@/components/home/SortToggle';
import FilterDialog from '@/components/home/FilterDialog';
import RelaxationBanner from '@/components/home/RelaxationBanner';
import NoResultsPrompt from '@/components/home/NoResultsPrompt';
import GatedModal from '@/components/home/GatedModal';
import MobileBottomSheet from '@/components/home/MobileBottomSheet';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Home() {
  const { state, dispatch } = useGlobalState();
  const isMobile = useIsMobile();
  const abortRef = useRef(null);

  // --- Search ---
  const runSearch = useCallback(
    async (queryText) => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      dispatch({ type: 'SET_LOADING', payload: true });

      // Add to history
      dispatch({
        type: 'ADD_SEARCH_HISTORY',
        payload: { query: queryText, location_name: state.locationName, timestamp: Date.now() },
      });

      try {
        const res = await recommend({
          mode: state.category ? 'browse_category' : 'query',
          category: state.category,
          query: queryText,
          lat: state.userLocation.lat,
          lon: state.userLocation.lon,
          location_name: state.locationName,
          radius_km: state.filters.radius,
          relaxation_level: state.relaxationLevel,
          open_now: state.filters.openNow || undefined,
          price_levels: state.filters.priceLevels.length ? state.filters.priceLevels : undefined,
          cuisines: state.filters.cuisines.length ? state.filters.cuisines : undefined,
        });
        dispatch({ type: 'SET_RESULTS', payload: res });
      } catch {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    [state.userLocation, state.locationName, state.anonymousId, state.relaxationLevel, state.filters, state.sort, dispatch]
  );

  const handleSearch = useCallback(
    (q) => {
      dispatch({ type: 'SET_QUERY', payload: q });
      runSearch(q);
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
        runSearch(state.query);
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
        <div className="pt-14">
          <div className="flex flex-col items-center justify-center px-4 md:px-8 pt-12 md:pt-20 space-y-6">
            <img src={whatspotLogo} alt="Whatspot" className="h-10 md:h-12" />

            <SearchBar
              query={state.query}
              onQueryChange={(q) => dispatch({ type: 'SET_QUERY', payload: q })}
              onSearch={handleSearch}
              isQuerying={state.isQuerying}
              onStopQuery={handleStopQuery}
              centered
            />

            <div className="w-full max-w-xl">
              <CategoryTiles onSelectCategory={handleSelectCategory} />
            </div>

            <div className="w-full max-w-xl">
              <FilterSummary filters={state.filters} onOpenFilters={() => setFilterDialogOpen(true)} />
            </div>

            {state.tileBaseQuery && (
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

            {/* Suggested chips */}
            {!isMobile && (
              <SuggestedChips chips={state.suggestedChips} onAppendChip={handleAppendChip} />
            )}

            {/* Controls row */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <FilterDialog
                  filters={state.filters}
                  onFilterChange={handleFilterChange}
                />
                <ViewToggle
                  view={state.view}
                  setView={(v) => dispatch({ type: 'SET_VIEW', payload: v })}
                />
              </div>
              <SortToggle
                sort={state.sort}
                setSort={(s) => dispatch({ type: 'SET_SORT', payload: s })}
              />
            </div>

            {/* Relaxation banner */}
            <RelaxationBanner relaxations={state.appliedRelaxations} />

            {/* Results */}
            {state.view === 'list' ? (
              <div>
                {!state.isLoading && displayResults.length === 0 ? (
                  <NoResultsPrompt
                    onRelax={handleRelax}
                    isRelaxing={state.isLoading}
                    noVenuesAtAll={state.noVenuesAtAll}
                  />
                ) : (
                  <ResultsList results={displayResults} isLoading={state.isLoading} />
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
