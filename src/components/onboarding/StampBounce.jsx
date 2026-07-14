import { motion } from 'framer-motion';

// The signature onboarding entrance: scale 0.4 -> 1.1 -> 1, rotate -18deg -> -6deg -> -8deg,
// fade in, ~450ms. Reused for every stamp/chip/checkmark across all 3 screens so the whole
// flow reads as one motion language. Mount (or remount via a changing `key`) to trigger it.
export const STAMP_TRANSITION = { duration: 0.45, ease: [0.34, 1.56, 0.64, 1], times: [0, 0.6, 1] };

// tilt=false keeps the same scale/opacity bounce but drops the diagonal rotation, for
// horizontal descriptor chips (intent chips, folder pills) rather than "stamp" marks
// (swipe tags, Best match) where the tilt is the point.
// variant="appear" drops the bounce entirely (plain opacity fade) — for elements like the
// saved-heart badge where a "fly in" read as competing with its own layout animation.
export default function StampBounce({ children, className, style, reducedMotion = false, tilt = true, variant = 'bounce' }) {
  if (reducedMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  if (variant === 'appear') {
    return (
      <motion.div
        className={className}
        style={style}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    );
  }

  // Omit `rotate` entirely rather than animating it through a degenerate [0,0,0]
  // keyframe array — the latter caused a visible stutter on non-tilted chips.
  const initial = { opacity: 0, scale: 0.4 };
  const animateProps = { opacity: 1, scale: [0.4, 1.1, 1] };
  if (tilt) {
    initial.rotate = -18;
    animateProps.rotate = [-18, -6, -8];
  }

  return (
    <motion.div className={className} style={style} initial={initial} animate={animateProps} transition={STAMP_TRANSITION}>
      {children}
    </motion.div>
  );
}
