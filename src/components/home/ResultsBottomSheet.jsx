import React, { useState, useEffect } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import ResultsList from './ResultsList';

/**
 * Mobile-only post-search bottom sheet.
 *
 * Uses Vaul directly (no dark overlay) so the map remains fully interactive
 * behind the sheet.
 *
 * Snap positions:
 *  - Retracted (default): drag handle + small peek (~12% of viewport)
 *  - Expanded: covers most of screen, leaving nav + search row + map sliver
 */

const SNAP_RETRACTED = 0.12;
const SNAP_EXPANDED = 0.75;

export default function ResultsBottomSheet({ results, isLoading, currentQuery, open }) {
  const [snap, setSnap] = useState(SNAP_RETRACTED);

  // Return to retracted position on each new query
  useEffect(() => {
    setSnap(SNAP_RETRACTED);
  }, [currentQuery]);

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) setSnap(SNAP_RETRACTED); }}
      modal={false}
      snapPoints={[SNAP_RETRACTED, SNAP_EXPANDED]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-x border-border bg-background focus:outline-none"
          style={{ zIndex: 30 }}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted shrink-0 cursor-grab active:cursor-grabbing" />

          {/* Results list — clipped when retracted, scrollable when expanded.
              data-vaul-no-drag tells Vaul not to treat scroll gestures as drags,
              which prevents the sheet from over-expanding when the user scrolls. */}
          <div data-vaul-no-drag className="flex-1 overflow-y-auto px-4 pt-2 pb-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
            <ResultsList
              results={results}
              isLoading={isLoading}
              currentQuery={currentQuery}
            />
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
