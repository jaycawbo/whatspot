import React, { useState, useCallback } from 'react';
import { Search, ChevronUp, X, ArrowUp } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import CategoryTiles from './CategoryTiles';
import SuggestedChips from './SuggestedChips';
import RefinementChips from './RefinementChips';

/**
 * Mobile-only: Compact search bar pinned to the bottom of the screen.
 * Tapping or pulling up expands a drawer with search input, past searches,
 * category chips, and refinement content.
 */
export default function MobileSearchDrawer({
  query,
  onQueryChange,
  onSearch,
  isQuerying,
  onStopQuery,
  onSelectCategory,
  searchHistory = [],
  suggestedChips = [],
  onAppendChip,
  tileBaseQuery,
}) {
  const [open, setOpen] = useState(false);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (query.trim()) {
        onSearch(query.trim());
        setOpen(false);
      }
    },
    [query, onSearch]
  );

  const handleHistoryTap = useCallback(
    (q) => {
      onQueryChange(q);
      onSearch(q);
      setOpen(false);
    },
    [onQueryChange, onSearch]
  );

  const handleCategoryTap = useCallback(
    (cat) => {
      onSelectCategory(cat);
      setOpen(false);
    },
    [onSelectCategory]
  );

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      {/* Compact bar pinned to bottom */}
      <DrawerTrigger asChild>
        <button className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <div className="mx-3 mb-3 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 shadow-lg">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground truncate flex-1 text-left">
              {query || 'Ask and you shall receive...'}
            </span>
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </button>
      </DrawerTrigger>

      {/* Expanded drawer */}
      <DrawerContent className="max-h-[85vh]">
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Search input */}
          <form onSubmit={handleSubmit} className="w-full">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                autoFocus
                className="w-full h-11 pl-10 pr-10 rounded-full border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background transition-shadow"
                placeholder="Ask and you shall receive..."
              />
              {isQuerying ? (
                <button
                  type="button"
                  onClick={onStopQuery}
                  className="absolute right-2 h-7 w-7 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : query.trim() ? (
                <button
                  type="submit"
                  className="absolute right-2 h-7 w-7 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </form>

          {/* Category chips */}
          <CategoryTiles onSelectCategory={handleCategoryTap} compact />

          {/* Suggested chips */}
          {suggestedChips?.length > 0 && (
            <SuggestedChips chips={suggestedChips} onAppendChip={onAppendChip} />
          )}

          {/* Refinement chips */}
          {tileBaseQuery && (
            <RefinementChips baseQuery={tileBaseQuery} onAppendChip={onAppendChip} />
          )}

          {/* Recent searches */}
          {searchHistory.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Recent searches</h4>
              <div className="space-y-1">
                {searchHistory.slice(0, 8).map((h, i) => (
                  <button
                    key={i}
                    onClick={() => handleHistoryTap(h.query)}
                    className="w-full text-left text-sm text-foreground px-2 py-1.5 rounded hover:bg-accent transition-colors truncate"
                  >
                    {h.query}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
