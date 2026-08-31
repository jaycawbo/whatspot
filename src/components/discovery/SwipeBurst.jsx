import { memo, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

// Rendered via a portal into document.body so it's never clipped by the deck's
// overflow-hidden ancestors (see src/pages/Home.jsx) — the deck fills its full
// container height on mobile with no slack, which was clipping any in-place
// grow/float effect nested inside the card.
const BURST_DURATION = 0.4;
const PARTICLE_COUNT = 8;
const PARTICLE_DISTANCE = 70;
// How much further the icon grows during the burst, on top of wherever the drag left
// it (initialScale) — a fixed delta rather than a fixed end value, so a release right
// at the swipe threshold and a release from a much longer drag both get the same
// relative "explosion", instead of the short release exploding disproportionately more.
const BURST_SCALE_GROWTH = 1.8;

// memo() is load-bearing, not an optimization: DiscoveryDeck re-renders several times
// while a swipe resolves (exitDirection, currentIndex, auth modal...). Without memo,
// each of those re-renders recreates the `animate` target objects below by reference,
// which makes framer-motion treat them as a new target and restart the tween from
// wherever it currently is — so the burst never visibly progresses and its dismiss
// timer (tied to the onDone identity) keeps getting cancelled and rescheduled.
function SwipeBurst({ Icon, iconClassName, origin, initialScale, initialOpacity, onDone }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), BURST_DURATION * 1000);
    return () => clearTimeout(timer);
  }, [onDone]);

  const particles = useMemo(() => Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    return { dx: Math.cos(angle) * PARTICLE_DISTANCE, dy: Math.sin(angle) * PARTICLE_DISTANCE };
  }), []);

  if (!origin || !Icon) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] pointer-events-none">
      <div style={{ position: 'absolute', left: origin.x, top: origin.y }}>
        {particles.map((p, i) => (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-full bg-white"
            style={{ left: -4, top: -4 }}
            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            animate={{ opacity: 0, x: p.dx, y: p.dy, scale: 0.4 }}
            transition={{ duration: BURST_DURATION, ease: 'easeOut' }}
          />
        ))}
        <motion.div
          className="absolute"
          style={{ left: 0, top: 0, transform: 'translate(-50%, -50%)' }}
          // initialScale/initialOpacity are the icon's actual live values at the instant
          // of release (captured in DiscoveryDeck.jsx's performAction), not a hardcoded
          // guess — so this picks up exactly where the drag left off, one continuous
          // growth from the start of the drag through to release, not two separate beats.
          initial={{ opacity: initialOpacity, scale: initialScale }}
          animate={{ opacity: 0, scale: initialScale + BURST_SCALE_GROWTH }}
          transition={{ duration: BURST_DURATION, ease: 'easeOut' }}
        >
          <Icon className={iconClassName} style={{ filter: 'drop-shadow(0px 2px 6px rgba(0,0,0,0.35))' }} />
        </motion.div>
      </div>
    </div>,
    document.body,
  );
}

export default memo(SwipeBurst);
