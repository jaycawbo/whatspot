import React, { useCallback, useRef } from 'react';
import LoadingMessages from '@/components/home/LoadingMessages';
import { useGlobalState } from '@/context/GlobalStateContext';
import Header from '@/components/home/Header';
import SearchBar from '@/components/home/SearchBar';
import CategoryTiles from '@/components/home/CategoryTiles';
import MobileSearchDrawer from '@/components/home/MobileSearchDrawer';
import DiscoveryDeck from '@/components/discovery/DiscoveryDeck';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDiscoveryFeed } from '@/hooks/useDiscoveryFeed';

export default function Home() {
  const { state, dispatch } = useGlobalState();
  const isMobile = useIsMobile();
  const searchBarRef = useRef(null);

  const { venues: feedVenues, isLoading: feedLoading, searchFeed, expandSearch } = useDiscoveryFeed();

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
                venues={feedVenues}
                onDescriptorTap={(tag) => {
                  dispatch({ type: 'SET_QUERY', payload: tag });
                  searchFeed(tag);
                }}
                onExpandSearch={expandSearch}
                onNewSearch={() => searchBarRef.current?.focus?.()}
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
