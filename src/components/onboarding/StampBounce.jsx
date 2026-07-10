import { motion } from 'framer-motion';

// The signature onboarding entrance: scale 0.4 -> 1.1 -> 1, rotate -18deg -> -6deg -> -8deg,
// fade in, ~450ms. Reused for every stamp/chip/checkmark across all 3 screens so the whole
// flow reads as one motion language. Mount (or remount via a changing `key`) to trigger it.
export const STAMP_TRANSITION = { duration: 0.45, ease: [0.34, 1.56, 0.64, 1], times: [0, 0.6, 1] };

export default function StampBounce({ children, className, style, reducedMotion = false }) {
  if (reducedMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, scale: 0.4, rotate: -18 }}
      animate={{ opacity: 1, scale: [0.4, 1.1, 1], rotate: [-18, -6, -8] }}
      transition={STAMP_TRANSITION}
    >
      {children}
    </motion.div>
  );
}
