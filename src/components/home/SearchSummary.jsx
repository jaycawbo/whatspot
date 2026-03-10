import React from 'react';
import { motion } from 'framer-motion';

export default function SearchSummary({ summary }) {
  if (!summary) return null;

  // Support new structured format { intro, bullets } or legacy string
  const isStructured = typeof summary === 'object' && summary.intro;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-4"
    >
      {isStructured ? (
        <>
          <p className="text-sm text-foreground/80 leading-relaxed mb-2">{summary.intro}</p>
          <ul className="space-y-1.5">
            {summary.bullets?.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span><span className="font-medium text-foreground">{b.name}</span> — {b.note}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-foreground/80 leading-relaxed">{summary}</p>
      )}
    </motion.div>
  );
}
