import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import StampBounce from '../StampBounce';
import { cn } from '@/lib/utils';

// Exit distance/easing mirror DiscoveryDeck's real drag-release exit
// (src/components/discovery/DiscoveryDeck.jsx) instead of inventing new values: 500px
// translate, plain 'easeOut', no rotation (production doesn't rotate on exit either).
const EXIT_DISTANCE = 500;
const EXIT_DURATION = 0.2;
const HOLD_MS = 1400;

const STATES = [
  {
    exit: { x: EXIT_DISTANCE, y: 0 },
    tag: 'Interested',
    sub: 'Swipe right when something looks good.',
    tagClass: 'bg-green-50 text-green-700 border border-green-500',
  },
  {
    exit: { x: 0, y: EXIT_DISTANCE },
    tag: 'Skip for now',
    sub: 'Swipe down to skip for now.',
    tagClass: 'bg-zinc-100 text-zinc-500 border border-zinc-300',
  },
  {
    exit: { x: 0, y: -EXIT_DISTANCE },
    tag: 'Been here · Loved it ★★★★★',
    sub: 'Swipe up if you have been.',
    tagClass: 'bg-amber-50 text-amber-700 border border-amber-500',
  },
];

export default function SwipeDemo({ active, reducedMotion, onSubcopyChange }) {
  const [stateIndex, setStateIndex] = useState(0);
  const [showStamp, setShowStamp] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (!active) {
      x.set(0);
      y.set(0);
      opacity.set(1);
      setShowStamp(false);
      return;
    }

    if (reducedMotion) {
      const state = STATES[0];
      x.set(state.exit.x);
      y.set(state.exit.y);
      opacity.set(0.85);
      setShowStamp(true);
      onSubcopyChange?.(state.sub);
      return;
    }

    let cancelled = false;
    const state = STATES[stateIndex % STATES.length];
    onSubcopyChange?.(state.sub);

    animate(x, state.exit.x, { duration: EXIT_DURATION, ease: 'easeOut' });
    animate(y, state.exit.y, { duration: EXIT_DURATION, ease: 'easeOut' });
    animate(opacity, 0, { duration: EXIT_DURATION, ease: 'easeOut' });
    setShowStamp(true);

    const resetTimer = setTimeout(() => {
      if (cancelled) return;
      x.set(0);
      y.set(0);
      opacity.set(1);
      setShowStamp(false);
      setStateIndex((i) => i + 1);
    }, HOLD_MS);
    timersRef.current.push(resetTimer);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion, stateIndex]);

  const state = STATES[stateIndex % STATES.length];

  return (
    <div className="relative flex items-center justify-center" style={{ width: 220, height: 250 }}>
      <div className="absolute inset-0 scale-[0.94] translate-y-2 rounded-2xl border border-border bg-muted opacity-60" />
      <motion.div
        className="absolute inset-0 overflow-hidden rounded-2xl border border-border bg-card shadow-md"
        style={{ x, y, opacity }}
      >
        <div className="h-3/5 bg-gradient-to-br from-amber-200 to-amber-500" />
        <div className="p-3">
          <div className="text-sm font-extrabold text-foreground">Bar Volta</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-bold text-amber-700">★ 4.7</span>
            <span>·</span>
            <span>$$</span>
            <span>·</span>
            <span>0.4 km</span>
          </div>
        </div>
      </motion.div>
      {showStamp && (
        <StampBounce
          key={reducedMotion ? 'static' : stateIndex}
          reducedMotion={reducedMotion}
          className={cn(
            'absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-extrabold',
            state.tagClass
          )}
        >
          {state.tag}
        </StampBounce>
      )}
    </div>
  );
}
