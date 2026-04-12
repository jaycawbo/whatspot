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
 *  - Retracted (default): drag handle only visible (~8% of viewport)
 *  - Expanded: covers most of screen, leaving nav + search row + small map
 *    sliver above (~18% from top)
 */

const SNAP_RETRACTED = 0.08;
const SNAP_EXPANDED = 0.82;

export default function ResultsBottomSheet({ results, isLoading, currentQuery, open }) {
  const [snap, setSnap] = useState(SNAP_RETRACTED);

  // Return to retracted position on each new query
  useEffect(() => {
    setSnap(SNAP_RETRACTED);
  }, [currentQuery]);

  return (
    <DrawerPrimitive.Root
      open={open}
      modal={false}
      snapPoints={[SNAP_RETRACTED, SNAP_EXPANDED]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      dismissible={false}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-x border-border bg-background focus:outline-none"
          style={{ zIndex: 30 }}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted shrink-0 cursor-grab active:cursor-grabbing" />

          {/* Results list — clipped when retracted, scrollable when expanded */}
          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8">
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
