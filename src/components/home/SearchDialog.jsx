import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Search, SlidersHorizontal } from 'lucide-react';
import CategoryTiles from './CategoryTiles';
import RefinementChips from './RefinementChips';
import SuggestedChips from './SuggestedChips';

/**
 * Animated search overlay that appears when the user taps the search pill.
 * Slides down from just below the nav bar (top-14 / 56 px).
 *
 * Contents (input row):
 *  - Focused text input
 *  - Filter button (opens FilterDialog without leaving the search flow)
 *  - Cancel / X button
 *
 * Contents (scrollable):
 *  - Category chips
 *  - Dynamic refinement chips (reactive to typed text, 500 ms debounce)
 *  - Suggested chips (if any)
 *  - Recent searches
 */
export default function SearchDialog({
  open,
  onClose,
  query,
  onQueryChange,
  onSearch,
  onSelectCategory,
  searchHistory = [],
  suggestedChips = [],
  onAppendChip,
  onFilterClick,
  activeFilterCount = 0,
}) {
  const inputRef = useRef(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce typed input so RefinementChips only re-fetches after the user pauses
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(t);
  }, [query]);

  // Auto-focus the input each time the dialog opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Allow CorrectionBanner's undo to trigger a search without Home.jsx needing modification.
  // SearchDialog is always mounted (AnimatePresence keeps it in the tree), so this listener
  // is always active regardless of whether the dialog is visually open.
  useEffect(() => {
    const handler = (e) => {
      const q = e.detail?.query;
      if (q && onSearch) {
        onSearch(q.trim());
      }
    };
    document.addEventListener('whatspot:auto-search', handler);
    return () => document.removeEventListener('whatspot:auto-search', handler);
  }, [onSearch]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (query.trim()) {
        document.activeElement?.blur();
        onSearch(query.trim());
        onClose();
      }
    },
    [query, onSearch, onClose]
  );

  const handleCategoryTap = useCallback(
    (cat) => {
      onQueryChange(cat.prompt);
    },
    [onQueryChange]
  );

  const handleHistoryTap = useCallback(
    (q) => {
      document.activeElement?.blur();
      onQueryChange(q);
      onSearch(q);
      onClose();
    },
    [onQueryChange, onSearch, onClose]
  );

  const handleFilterTap = useCallback(() => {
    document.activeElement?.blur();
    onFilterClick?.();
  }, [onFilterClick]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Desktop backdrop — click outside to dismiss */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[59] bg-black/20"
            onClick={onClose}
          />

          {/* Dialog panel */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-x-0 z-[60] bg-background flex flex-col shadow-lg border-b border-border"
            style={{ top: '56px', maxHeight: 'calc(100dvh - 56px)' }}
          >
            {/* Input row */}
            <div className="flex items-center gap-2 px-3 py-2 max-w-5xl mx-auto w-full">
              <form onSubmit={handleSubmit} className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  className="w-full h-10 pl-10 pr-10 rounded-full border border-input bg-card text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background transition-shadow"
                  placeholder="Ask and you shall receive..."
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { onQueryChange(''); inputRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>

              {/* Filter button — closes dialog then opens FilterDialog */}
              <button
                onClick={handleFilterTap}
                className="relative h-9 w-9 flex items-center justify-center rounded-full border border-border bg-card hover:bg-accent transition-colors shrink-0"
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

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5 max-w-5xl mx-auto w-full">
              {/* Category chips */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2.5">Categories</p>
                <CategoryTiles onSelectCategory={handleCategoryTap} compact />
              </div>

              {/* Dynamic refinement chips — updates as user types */}
              {debouncedQuery && (
                <RefinementChips baseQuery={debouncedQuery} onAppendChip={onAppendChip} />
              )}

              {/* Suggested chips */}
              {suggestedChips?.length > 0 && (
                <SuggestedChips chips={suggestedChips} onAppendChip={onAppendChip} />
              )}

              {/* Recent searches */}
              {searchHistory.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Recent searches</p>
                  <div className="space-y-0.5">
                    {searchHistory.slice(0, 8).map((h, i) => (
                      <button
                        key={i}
                        onClick={() => handleHistoryTap(h.query)}
                        className="w-full text-left text-sm text-foreground px-2 py-2 rounded-lg hover:bg-accent transition-colors truncate"
                      >
                        {h.query}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
