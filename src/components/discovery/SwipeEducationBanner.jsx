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
      className="fixed bottom-24 right-3 md:bottom-8 md:right-6 z-40 max-w-[150px] md:max-w-[260px] rounded-xl border border-green-200 bg-green-50/90 shadow-lg px-2.5 py-2 md:px-3.5 md:py-3 dark:border-green-800 dark:bg-green-950/40"
      role="note"
      aria-label="How swiping works"
    >
      <div className="flex items-start gap-1.5 md:gap-2">
        <p className="flex-1 text-xs md:text-sm leading-snug">
          <strong>Swipe right</strong> on interested spots or <strong>left</strong> if uninterested. Skip by <strong>swiping down</strong>. <strong>Swipe up</strong> to rate places you've been to.
        </p>
        <button
          onClick={onDismiss}
          className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </motion.div>
  );
}
