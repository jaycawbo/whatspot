import React from 'react';
import { motion } from 'framer-motion';

export default function SearchSummary({ summary }) {
  if (!summary) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-4"
    >
      <p className="text-sm text-foreground/80 leading-relaxed">{summary}</p>
    </motion.div>
  );
}
