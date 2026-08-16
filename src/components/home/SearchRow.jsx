import React from 'react';
import { ChevronLeft, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * Permanent search bar row fixed just below the nav (top-14).
 * Visible on both mobile and desktop from initial load.
 *
 * - Back button: always in DOM; invisible + non-interactive until a query
 *   is submitted. Keeping it mounted prevents mobile browsers from caching
 *   a stale hit-rect when it appears conditionally.
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
  isSearching = false,
}) {
  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-background">
      <div className="flex items-center gap-2 px-3 pt-5 pb-2 max-w-5xl mx-auto" style={{ touchAction: 'manipulation' }}>
        {/* Back button — always mounted, hidden until query is active */}
        <button
          onClick={onBackClick}
          style={{ touchAction: 'manipulation' }}
          className={cn(
            'h-9 w-9 shrink-0 flex items-center justify-center rounded-full hover:bg-accent transition-colors',
            !hasQuery && 'invisible pointer-events-none'
          )}
          aria-label="Clear search"
          tabIndex={hasQuery ? 0 : -1}
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Search pill — opens SearchDialog. Wrapped in the ai-search-ring gradient for a
            subtle "AI-powered" signal; the ring supplies the border, the button's own
            bg-card fill covers the rest. Sized/positioned to match SearchDialog's input
            exactly so opening the dialog doesn't visibly resize. */}
        <div
          className={cn(
            'ai-search-ring flex-1 rounded-xl min-w-0',
            isSearching && 'ai-search-ring--active'
          )}
        >
          <button
            onClick={onSearchOpen}
            className="relative w-full flex items-center h-9 pl-10 pr-4 rounded-xl bg-card text-left text-base text-muted-foreground hover:bg-accent transition-colors min-w-0"
            aria-label="Open search"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 shrink-0 pointer-events-none" />
            <span className="flex-1 truncate">{query || 'Ask and you shall receive...'}</span>
            <Badge
              variant="secondary"
              className="ml-2 shrink-0 rounded-full border-transparent bg-green-100 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-green-700 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-400"
            >
              Beta
            </Badge>
          </button>
        </div>

        {/* Filter button */}
        <button
          onClick={onFilterClick}
          className="relative h-9 w-9 shrink-0 flex items-center justify-center rounded-full border border-border bg-card hover:bg-accent transition-colors"
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
  );
}
