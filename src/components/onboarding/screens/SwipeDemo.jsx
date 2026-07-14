import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import StampBounce from '../StampBounce';
import { cn } from '@/lib/utils';

// Exit distance mirrors DiscoveryDeck's real drag-release exit (500px translate,
// no rotation — production doesn't rotate on exit either), but the timing here is
// tuned for a passive autoplay demo, not a real drag: slowed ~70% twice over per
// feedback ("still way too fast" both times).
const EXIT_DISTANCE = 500;
const EXIT_MS = 1200;
// How long the tag holds after the card has fully exited (opacity reaches 0) before
// resetting — explicitly requested as ~250ms after the card disappears, not before.
const HOLD_MS = 250;
const REST_MS = 1700;
const CYCLE_MS = REST_MS + EXIT_MS + HOLD_MS;
const CARD_WIDTH = 286; // 220 * 1.3
const CARD_HEIGHT = 325; // 250 * 1.3

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Same double-thumbs-up glyph as the real "Loved it" rating (src/components/discovery/RatingDialog.jsx's
// TwoThumbsUpIcon) — duplicated locally since that one isn't exported, to avoid coupling the
// onboarding demo to an unrelated component file.
function TwoThumbsUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 30 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10V22" />
      <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      <g transform="translate(8, 0)">
        <path d="M7 10V22" />
        <path fill="white" d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
    </svg>
  );
}

// Same fictional venue set SearchDemo uses (Bar Volta / The Tin Cup / Cafe Lumen), so the
// demo reads as one consistent dataset across screens rather than a repeated placeholder.
const STATES = [
  {
    exit: { x: EXIT_DISTANCE, y: 0 },
    tag: 'Interested',
    sub: 'Swipe right when something looks good.',
    tagClass: 'bg-green-50 text-green-700 border border-green-500',
    venue: { name: 'Bar Volta', gradient: 'from-amber-200 to-amber-500', rating: '4.7', price: '$$', distance: '0.4 km' },
  },
  {
    exit: { x: 0, y: EXIT_DISTANCE },
    tag: 'Skip for now',
    sub: 'Swipe down to skip for now.',
    tagClass: 'bg-zinc-100 text-zinc-500 border border-zinc-300',
    venue: { name: 'The Tin Cup', gradient: 'from-indigo-300 to-indigo-500', rating: '4.5', price: '$$', distance: '0.6 km' },
  },
  {
    exit: { x: 0, y: -EXIT_DISTANCE },
    tag: 'Been here · Loved it',
    icon: TwoThumbsUpIcon,
    sub: 'Swipe up if you have been.',
    tagClass: 'bg-amber-50 text-amber-700 border border-amber-500',
    venue: { name: 'Cafe Lumen', gradient: 'from-rose-300 to-rose-500', rating: '4.6', price: '$$$', distance: '0.9 km' },
  },
];

export default function SwipeDemo({ active, reducedMotion, onSubcopyChange }) {
  const [stateIndex, setStateIndex] = useState(0);
  const [showStamp, setShowStamp] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);
  const rafRef = useRef(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    if (!active) {
      x.set(0);
      y.set(0);
      opacity.set(1);
      setShowStamp(false);
      setStateIndex(0);
      return;
    }

    if (reducedMotion) {
      const state = STATES[0];
      x.set(state.exit.x);
      y.set(state.exit.y);
      opacity.set(0.85);
      setShowStamp(true);
      setStateIndex(0);
      onSubcopyChange?.(state.sub);
      return;
    }

    // Single rAF loop driven by elapsed wall-clock time, replacing a chain of
    // setTimeout calls + imperative animate() calls. This is the whole point: a
    // setTimeout chain can drift, stack, or (observed while debugging) stall
    // outright under tab throttling, and when it resumes can fire a backlog of
    // stale callbacks in a burst — which is exactly what a "two competing
    // entrance animations" symptom looks like. A single loop that always computes
    // "what phase should this be right now" from real elapsed time can't produce
    // that: there's only ever one source of truth, recomputed fresh every frame.
    const start = performance.now();
    let lastIndex = -1;
    let lastStampVisible = false;

    function tick(now) {
      const elapsed = now - start;
      const idx = Math.floor(elapsed / CYCLE_MS) % STATES.length;
      const phaseT = elapsed % CYCLE_MS;
      const state = STATES[idx];

      if (idx !== lastIndex) {
        lastIndex = idx;
        setStateIndex(idx);
        onSubcopyChange?.(state.sub);
      }

      let stampVisible;
      if (phaseT < REST_MS) {
        stampVisible = false;
        x.set(0);
        y.set(0);
        opacity.set(1);
      } else if (phaseT < REST_MS + EXIT_MS) {
        stampVisible = true;
        const progress = easeOutCubic((phaseT - REST_MS) / EXIT_MS);
        x.set(state.exit.x * progress);
        y.set(state.exit.y * progress);
        opacity.set(1 - progress);
      } else {
        stampVisible = true;
        x.set(state.exit.x);
        y.set(state.exit.y);
        opacity.set(0);
      }

      if (stampVisible !== lastStampVisible) {
        lastStampVisible = stampVisible;
        setShowStamp(stampVisible);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion]);

  const state = STATES[stateIndex % STATES.length];
  const Icon = state.icon;

  return (
    <div className="relative flex items-center justify-center" style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
      <motion.div
        className="absolute inset-0 rounded-2xl border border-border bg-card shadow-md"
        style={{ x, y, opacity }}
      >
        <div className="h-full w-full overflow-hidden rounded-2xl">
          <div className={cn('h-[68%] bg-gradient-to-br', state.venue.gradient)} />
          <div className="flex h-[32%] flex-col justify-center gap-1.5 px-4">
            <div className="text-base font-extrabold text-foreground">{state.venue.name}</div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-bold text-amber-700">★ {state.venue.rating}</span>
              <span>·</span>
              <span>{state.venue.price}</span>
              <span>·</span>
              <span>{state.venue.distance}</span>
            </div>
          </div>
        </div>
      </motion.div>
      {showStamp && (
        // Pinned to the stage, not the card: it needs to stay put and readable while
        // the card moves out from under it, not travel with the card's x/y.
        // Positioning lives on this plain wrapper, not on StampBounce's own motion.div:
        // framer-motion writes its own inline `transform` for the scale/rotate animation,
        // which would silently clobber a Tailwind translate-centering class on the same node.
        <div className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2">
          <StampBounce
            key={reducedMotion ? 'static' : stateIndex}
            reducedMotion={reducedMotion}
            variant="appear"
            className={cn('whitespace-nowrap rounded-full px-3.5 py-1.5 text-[18px] font-extrabold', state.tagClass)}
          >
            <span className="inline-flex items-center gap-1.5">
              {state.tag}
              {Icon && <Icon className="h-4 w-5" />}
            </span>
          </StampBounce>
        </div>
      )}
    </div>
  );
}
