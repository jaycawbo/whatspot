import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import VenueCard from './VenueCard';

export default function ResultsList({ results, isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
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
      <AnimatePresence initial={false}>
        {results.map((venue, i) => (
          <motion.div
            key={venue.name + i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
          >
            <VenueCard venue={venue} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
