import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Search, SlidersHorizontal } from 'lucide-react';
import CategoryTiles from './CategoryTiles';
import RefinementChips from './RefinementChips';
import SuggestedChips from './SuggestedChips';
import { useVenueAutocomplete } from '@/hooks/useVenueAutocomplete';

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
 *  - Autocomplete suggestions (direct venue name lookups, feature-flagged)
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
  userCoordinates = null,
  isSearching = false,
}) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const searchInitiatedRef = useRef(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localQuery, setLocalQuery] = useState(query);

  const { suggestions, onSearchFocus, selectSuggestion } = useVenueAutocomplete(
    query,
    userCoordinates
  );

  // Debounce localQuery so RefinementChips re-fetches after the user pauses
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(localQuery), 500);
    return () => clearTimeout(t);
  }, [localQuery]);

  // Auto-focus the input each time the dialog opens; reset submitting state and sync local draft
  useEffect(() => {
    if (open) {
      setLocalQuery(query); // eslint-disable-line react-hooks/exhaustive-deps
      setIsSubmitting(false);
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]); // intentional: only sync draft on open; reset submitting on external close too

  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
      searchInitiatedRef.current = false;
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

  // Close dialog once the search triggered by this submit completes
  useEffect(() => {
    if (searchInitiatedRef.current && isSubmitting && !isSearching) {
      searchInitiatedRef.current = false;
      setIsSubmitting(false);
      onClose();
    }
  }, [isSearching, isSubmitting, onClose]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (localQuery.trim()) {
        document.activeElement?.blur();
        setIsSubmitting(true);
        searchInitiatedRef.current = true;
        onQueryChange(localQuery.trim());
        onSearch(localQuery.trim());
      }
    },
    [localQuery, onQueryChange, onSearch]
  );

  const handleCategoryTap = useCallback(
    (cat) => {
      setLocalQuery(cat.prompt);
    },
    []
  );

  const handleHistoryTap = useCallback(
    (q) => {
      document.activeElement?.blur();
      setLocalQuery(q);
      onQueryChange(q);
      onSearch(q);
      onClose();
    },
    [onQueryChange, onSearch, onClose]
  );

  // Appends a refinement chip to the local draft without touching global state
  const handleAppendChipLocal = useCallback(
    (chipLabel, connector = ' ') => {
      setLocalQuery((prev) => `${prev}${connector}${chipLabel}`.trim());
    },
    []
  );

  const handleFilterTap = useCallback(() => {
    document.activeElement?.blur();
    onFilterClick?.();
  }, [onFilterClick]);

  const handleSelectSuggestion = useCallback(
    async (suggestion) => {
      const result = await selectSuggestion(suggestion);
      if (!result?.venue) return;
      onClose();
      navigate(`/venue/${result.venue.place_id}`, { state: { venue: result.venue } });
    },
    [selectSuggestion, onClose, navigate]
  );

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
                  value={localQuery}
                  onChange={(e) => setLocalQuery(e.target.value)}
                  onFocus={onSearchFocus}
                  className="w-full h-10 pl-10 pr-10 rounded-full border border-input bg-card text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background transition-shadow"
                  placeholder="Ask and you shall receive..."
                />
                {localQuery && (
                  <button
                    type="submit"
                    aria-label="Search"
                    onPointerDown={() => setIsSubmitting(true)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center ${isSubmitting ? 'bg-black' : 'bg-[#22c55e]'}`}
                  >
                    <ArrowRight className="h-3.5 w-3.5 text-white" />
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

            {/* Autocomplete suggestions — direct venue name hits */}
            {suggestions.length > 0 && (
              <div className="border-b border-border max-w-5xl mx-auto w-full">
                {suggestions.map((s) => {
                  const pred = s.placePrediction;
                  const main = pred?.structuredFormat?.mainText?.text ?? pred?.text?.text ?? '';
                  const secondary = pred?.structuredFormat?.secondaryText?.text ?? '';
                  return (
                    <button
                      key={pred?.placeId}
                      onMouseDown={(e) => e.preventDefault()} // prevent input blur before click fires
                      onClick={() => handleSelectSuggestion(s)}
                      className="w-full flex items-start gap-3 text-left px-4 py-3 hover:bg-accent transition-colors"
                    >
                      <Search className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">{main}</span>
                        {secondary && (
                          <span className="text-xs text-muted-foreground truncate">{secondary}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5 max-w-5xl mx-auto w-full">
              {/* Category chips */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2.5">Categories</p>
                <CategoryTiles onSelectCategory={handleCategoryTap} compact />
              </div>

              {/* Dynamic refinement chips — updates as user types */}
              {debouncedQuery && (
                <RefinementChips baseQuery={debouncedQuery} onAppendChip={handleAppendChipLocal} />
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
