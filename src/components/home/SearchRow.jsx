import React from 'react';
import { ChevronLeft, Search, SlidersHorizontal } from 'lucide-react';

/**
 * Permanent search bar row fixed just below the nav (top-14).
 * Visible on both mobile and desktop from initial load.
 *
 * - Back button: hidden until a query has been submitted; clears search on tap
 * - Search pill: opens SearchDialog on tap
 * - Filter button: opens FilterDialog
 */
export default function SearchRow({
  hasQuery,
  query,
  onBackClick,
  onFilterClick,
  onSearchOpen,
  activeFilterCount = 0,
}) {
  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-background border-b border-border">
      <div className="flex items-center gap-2 px-3 py-2 max-w-5xl mx-auto">
        {/* Back button slot — always occupies space so the pill stays centred */}
        <div className="w-9 shrink-0 flex items-center justify-center">
          {hasQuery && (
            <button
              onClick={onBackClick}
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
              aria-label="Clear search"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Search pill — opens SearchDialog */}
        <button
          onClick={onSearchOpen}
          className="flex-1 flex items-center gap-2 h-9 rounded-full border border-input bg-card px-3 text-left text-sm text-muted-foreground hover:bg-accent transition-colors min-w-0"
          aria-label="Open search"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{query || 'Ask and you shall receive...'}</span>
        </button>

        {/* Filter button */}
        <div className="w-9 shrink-0 flex items-center justify-center">
          <button
            onClick={onFilterClick}
            className="relative h-9 w-9 flex items-center justify-center rounded-full border border-border bg-card hover:bg-accent transition-colors"
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
      </div>
    </div>
  );
}
