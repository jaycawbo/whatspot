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
 *  - Expanded: fills viewport below nav (56px) + search row (56px) + 10px sliver
 */

const SNAP_RETRACTED = 0.12;
const NAV_H = 56;
const SEARCH_ROW_H = 56;

function calcSnapExpanded() {
  const vh = window.innerHeight;
  return (vh - NAV_H - SEARCH_ROW_H - 10) / vh;
}

export default function ResultsBottomSheet({ results, isLoading, currentQuery, open }) {
  const [snap, setSnap] = useState(SNAP_RETRACTED);
  const [snapExpanded, setSnapExpanded] = useState(calcSnapExpanded);

  // Keep expanded snap accurate on orientation change
  useEffect(() => {
    const onResize = () => setSnapExpanded(calcSnapExpanded());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Return to retracted position on each new query
  useEffect(() => {
    setSnap(SNAP_RETRACTED);
  }, [currentQuery]);

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) setSnap(SNAP_RETRACTED); }}
      modal={false}
      snapPoints={[SNAP_RETRACTED, snapExpanded]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-2xl border-t border-x border-border bg-background focus:outline-none"
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
