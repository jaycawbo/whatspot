import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info } from 'lucide-react';

export default function RelaxationBanner({ relaxations }) {
  if (!relaxations?.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="rounded-lg bg-secondary border border-border px-3 py-2 flex items-start gap-2"
      >
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Search broadened: </span>
          {relaxations.join(', ')}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
