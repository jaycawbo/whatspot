import React, { useState, useEffect } from 'react';
import ResultsList from './ResultsList';

/**
 * Mobile-only post-search bottom sheet.
 *
 * Simple CSS-height approach (no Vaul snap logic) so the sheet always
 * renders correctly regardless of open/close transition state.
 *
 * States:
 *  - Collapsed: 80px peek — drag handle + top edge of first result
 *  - Expanded:  fills viewport below nav (56px) + search row (56px)
 */

const PEEK_HEIGHT = 80;
const NAV_H = 56;
const SEARCH_ROW_H = 56;

export default function ResultsBottomSheet({ results, isLoading, currentQuery, open }) {
  const [expanded, setExpanded] = useState(false);

  // Collapse whenever a new search is made
  useEffect(() => {
    setExpanded(false);
  }, [currentQuery]);

  if (!open) return null;

  const expandedHeight = `calc(100dvh - ${NAV_H + SEARCH_ROW_H}px)`;

  return (
    <div
      className="fixed inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-x border-border bg-background"
      style={{
        zIndex: 30,
        height: expanded ? expandedHeight : `${PEEK_HEIGHT}px`,
        transition: 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        overflow: 'hidden',
      }}
    >
      {/* Drag handle — tap to toggle expanded/collapsed */}
      <div
        className="flex-shrink-0 flex justify-center items-center py-3 cursor-pointer active:opacity-70"
        style={{ touchAction: 'manipulation', minHeight: '44px' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="h-1.5 w-12 rounded-full bg-muted" />
      </div>

      {/* Scrollable results list */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-1"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <ResultsList
          results={results}
          isLoading={isLoading}
          currentQuery={currentQuery}
        />
      </div>
    </div>
  );
}
