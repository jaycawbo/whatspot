import React, { useState, useEffect, useRef, useCallback } from 'react';
import ResultsList from './ResultsList';

/**
 * Mobile-only post-search bottom sheet with drag-to-snap.
 *
 * Three snap positions (fraction of accessible viewport height):
 *   COLLAPSED  10%  — nearly hidden, drag handle only
 *   PARTIAL    35%  — default on every new search
 *   EXPANDED   80%  — fully open
 *
 * Accessible height = 100dvh - nav (56px) - search row (56px)
 *
 * Drag the handle up/down to move. Release snaps to nearest position.
 * A fast flick (>400 px/s) jumps one step in the swipe direction.
 */

const NAV_H = 56;
const SEARCH_ROW_H = 56;
const OVERHEAD = NAV_H + SEARCH_ROW_H;

const SNAPS = [0.10, 0.35, 0.90]; // collapsed, partial, expanded
const DEFAULT_SNAP = 1;            // index → 35% partial
const VELOCITY_THRESHOLD = 0.4;    // px/ms threshold for a flick

function getAvailablePx() {
  return window.innerHeight - OVERHEAD;
}

function snapToPx(idx) {
  return Math.round(getAvailablePx() * SNAPS[idx]);
}

function nearestSnapIdx(heightPx) {
  const avail = getAvailablePx();
  return SNAPS.reduce(
    (best, f, i) =>
      Math.abs(f * avail - heightPx) < Math.abs(SNAPS[best] * avail - heightPx) ? i : best,
    0
  );
}

export default function ResultsBottomSheet({
  results,
  isLoading,
  currentQuery,
  open,
  conversationalResponse,
  refinementChips,
  isLimitReached,
  onChipTap,
}) {
  const [snapIdx, setSnapIdx] = useState(DEFAULT_SNAP);
  const [liveHeight, setLiveHeight] = useState(null); // px while dragging; null at rest
  const [isDragging, setIsDragging] = useState(false);

  // Refs keep document-level listeners in sync with current state (no stale closures)
  const snapIdxRef = useRef(snapIdx);
  const liveHeightRef = useRef(liveHeight);
  const dragData = useRef(null); // { startY, startH, t0 }

  useEffect(() => { snapIdxRef.current = snapIdx; }, [snapIdx]);
  useEffect(() => { liveHeightRef.current = liveHeight; }, [liveHeight]);

  // Return to partial (35%) on every new search
  useEffect(() => {
    setSnapIdx(DEFAULT_SNAP);
    setLiveHeight(null);
    setIsDragging(false);
    dragData.current = null;
  }, [currentQuery]);

  // Attach global move/end listeners only while a drag is active
  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e) => {
      if (!dragData.current) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dy = dragData.current.startY - clientY; // positive = dragged up = more height
      const avail = getAvailablePx();
      const minH = avail * SNAPS[0];
      const maxH = avail * SNAPS[SNAPS.length - 1];
      const newH = Math.max(minH, Math.min(maxH, dragData.current.startH + dy));
      setLiveHeight(newH);
    };

    const onEnd = (e) => {
      if (!dragData.current) return;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const dy = dragData.current.startY - clientY;
      const dt = Math.max(1, Date.now() - dragData.current.t0);
      const velocity = dy / dt; // positive = swiped up

      const currentH = liveHeightRef.current ?? snapToPx(snapIdxRef.current);
      let nextIdx;

      if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
        // Flick: jump one step in swipe direction
        nextIdx = velocity > 0
          ? Math.min(SNAPS.length - 1, snapIdxRef.current + 1) // up → expand
          : Math.max(0, snapIdxRef.current - 1);               // down → collapse
      } else {
        nextIdx = nearestSnapIdx(currentH);
      }

      dragData.current = null;
      setIsDragging(false);
      setLiveHeight(null);
      setSnapIdx(nextIdx);
    };

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    return () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    };
  }, [isDragging]);

  const onHandleDown = useCallback((e) => {
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragData.current = {
      startY: clientY,
      startH: liveHeightRef.current ?? snapToPx(snapIdxRef.current),
      t0: Date.now(),
    };
    setIsDragging(true);
  }, []);

  if (!open) return null;

  const displayHeight = liveHeight ?? snapToPx(snapIdx);

  return (
    <div
      className="fixed inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-x border-border bg-background"
      style={{
        zIndex: 30,
        height: `${displayHeight}px`,
        transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        overflow: 'hidden',
      }}
    >
      {/* Drag handle — only interactive element for sheet control */}
      <div
        className="flex-shrink-0 flex justify-center items-center py-3 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none', minHeight: '44px', userSelect: 'none' }}
        onTouchStart={onHandleDown}
        onMouseDown={onHandleDown}
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
          conversationalResponse={conversationalResponse}
          refinementChips={refinementChips}
          isLimitReached={isLimitReached}
          onChipTap={onChipTap}
        />
      </div>
    </div>
  );
}
