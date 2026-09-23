import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

const SHOW_DELAY_MS = 3000;

// Secondary swipe-education prompt (issue #369) — a fallback for the onboarding
// interstitial, which is easy to skip. A small floating callout (not a
// full-width banner) with a brief copy message, so it reads as a light nudge
// rather than a second onboarding screen. Delayed 3s after mount so it doesn't
// compete with the user orienting on the page first. No auto-dismiss — stays
// until closed. Fixed-positioned so it never touches deck layout or gesture
// handling, both of which stay in the protected discovery files. Mounted from
// Home.jsx; eligibility (never swiped / lapsed 90+ days) comes from
// useSwipeEducation.
export default function SwipeEducationBanner({ onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 8 }}
      className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-40 max-w-[220px] rounded-xl border border-border bg-card shadow-lg px-3.5 py-3"
      role="note"
      aria-label="How swiping works"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm leading-snug">
          Swipe right to save, left to pass, or down to skip.
        </p>
        <button
          onClick={onDismiss}
          className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </motion.div>
  );
}
