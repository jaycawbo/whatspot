import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Heart, X, SkipForward, X as CloseIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const AUTO_DISMISS_MS = 8000;

const DIRECTIONS = [
  { key: 'left', Icon: X, label: 'Pass', className: 'text-destructive' },
  { key: 'right', Icon: Heart, label: 'Save', className: 'text-green-600' },
  { key: 'down', Icon: SkipForward, label: 'Skip', className: 'text-muted-foreground' },
];

// Secondary swipe-education prompt (issue #369) — a fallback for the onboarding
// interstitial, which is easy to skip. Rendered in-flow between the feed tabs
// and the deck (not fixed) — Home.jsx reserves this component's height in its
// --deck-height calc when mounting it, so the deck shrinks to fit instead of
// this floating over the card and colliding with its info panel or buttons.
// Never touches deck layout or gesture handling — those stay in the protected
// discovery files. Mounted from Home.jsx; eligibility (never swiped / lapsed
// 90+ days) comes from useSwipeEducation. Keep BANNER_HEIGHT_PX in
// pages/Home.jsx in sync with this component's actual rendered height.
export default function SwipeEducationBanner({ onDismiss }) {
  const isMobile = useIsMobile();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current?.(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mx-4 mb-2 rounded-xl border border-border bg-card shadow-md px-4 py-3"
      role="note"
      aria-label="How swiping works"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {isMobile ? 'Swipe to sort venues' : 'Swipe or click to sort venues'}
          </p>
          <div className="mt-2 flex items-center gap-4">
            {DIRECTIONS.map(({ key, Icon, label, className }) => (
              <motion.div
                key={key}
                className="flex items-center gap-1.5"
                animate={{ x: key === 'left' ? [0, -4, 0] : key === 'right' ? [0, 4, 0] : [0, 0, 0], y: key === 'down' ? [0, 4, 0] : [0, 0, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6 }}
              >
                <Icon className={`h-4 w-4 ${className}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </motion.div>
            ))}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
          aria-label="Dismiss"
        >
          <CloseIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </motion.div>
  );
}
