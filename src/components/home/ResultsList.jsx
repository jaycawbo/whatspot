import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import VenueCard from './VenueCard';
import CorrectionBanner from '@/components/search/CorrectionBanner';
import SearchSummary from './SearchSummary';
import { useCorrectionInfo } from '@/hooks/useCorrectionInfo';
import { cn } from '@/lib/utils';

export default function ResultsList({
  results,
  isLoading,
  currentQuery,
  skeletonCount = 4,
  intentSummary,
  conversationalResponse,
  refinementChips,
  isLimitReached,
  onChipTap,
  walkInOnly = false,
  onWalkInToggle,
}) {
  const { correctionInfo, dismiss } = useCorrectionInfo(currentQuery, results);
  const [convExpanded, setConvExpanded] = useState(false);

  const handleUndo = () => {
    try { sessionStorage.setItem('ws_bypass_correction', 'true'); } catch {}
    document.dispatchEvent(
      new CustomEvent('whatspot:auto-search', { detail: { query: correctionInfo.rawQuery } })
    );
    dismiss();
  };
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-border bg-card p-3 animate-pulse">
            <div className="h-24 w-24 rounded-lg bg-muted shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
              <div className="h-3 w-1/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <CorrectionBanner
        correctedQuery={correctionInfo?.correctedQuery}
        rawQuery={correctionInfo?.rawQuery}
        onUndo={handleUndo}
        onDismiss={dismiss}
      />
      {intentSummary && <SearchSummary summary={intentSummary} />}
      {conversationalResponse && (
        <p
          className={`text-sm text-foreground cursor-pointer select-none ${convExpanded ? '' : 'line-clamp-2'}`}
          onClick={() => setConvExpanded(e => !e)}
        >
          {conversationalResponse}
        </p>
      )}
      {isLimitReached && (
        <p className="text-xs text-muted-foreground text-center">Start a new search to keep exploring</p>
      )}
      {(onWalkInToggle || refinementChips?.length > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          {onWalkInToggle && (
            <button
              onClick={onWalkInToggle}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                walkInOnly
                  ? 'bg-[#22c55e] text-white border-[#22c55e]'
                  : 'border-border bg-card text-foreground hover:bg-accent'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', walkInOnly ? 'bg-white' : 'bg-[#22c55e]')} />
              Walk-In Now
            </button>
          )}
          {refinementChips?.map((chip) => (
            <button
              key={chip}
              onClick={() => onChipTap?.(chip)}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
      <AnimatePresence initial={false}>
        {results.map((venue, i) => (
          <motion.div
            key={venue.name + i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
          >
            <VenueCard venue={venue} index={i} currentQuery={currentQuery} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
