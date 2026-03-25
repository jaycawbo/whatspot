import React, { useCallback, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

const SWIPE_H_THRESHOLD = 80;
const SWIPE_UP_THRESHOLD = 80;

/**
 * Outlined thumbs-down icon — matches lucide stroke weight (strokeWidth 2).
 */
function ThumbsDownIcon({ className, filled }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

/**
 * Outlined thumbs-up icon — matches lucide stroke weight (strokeWidth 2).
 */
function ThumbsUpIcon({ className, filled }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10V22" />
      <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

/**
 * Double thumbs-up icon (Netflix-style) — two thumbs side by side, matching stroke weight.
 */
function DoubleThumbsUpIcon({ className, filled }) {
  return (
    <svg className={className} viewBox="0 0 32 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Left thumb */}
      <g>
        <path d="M5 10V20" />
        <path d="M12 6.5L11 10h4.5a1.5 1.5 0 0 1 1.44 1.92l-1.75 6A1.5 1.5 0 0 1 13.75 19H3a1.5 1.5 0 0 1-1.5-1.5V11.5A1.5 1.5 0 0 1 3 10h2.07a1.5 1.5 0 0 0 1.34-.83L9 3a2.35 2.35 0 0 1 3 3.5Z" />
      </g>
      {/* Right thumb */}
      <g>
        <path d="M19 10V20" />
        <path d="M26 6.5L25 10h4.5a1.5 1.5 0 0 1 1.44 1.92l-1.75 6A1.5 1.5 0 0 1 27.75 19H17a1.5 1.5 0 0 1-1.5-1.5V11.5A1.5 1.5 0 0 1 17 10h2.07a1.5 1.5 0 0 0 1.34-.83L23 3a2.35 2.35 0 0 1 3 3.5Z" />
      </g>
    </svg>
  );
}

/**
 * Swipeable rating card content with directional overlays.
 */
function SwipeableRatingCard({ venueName, onRate, onCancel, onOpenChange }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const [activeGesture, setActiveGesture] = useState(null); // 'left' | 'right' | 'up' | null

  const rightOpacity = useTransform(x, [0, SWIPE_H_THRESHOLD], [0, 0.85]);
  const leftOpacity = useTransform(x, [-SWIPE_H_THRESHOLD, 0], [0.85, 0]);
  const upOpacity = useTransform(y, [-SWIPE_UP_THRESHOLD, 0], [0.85, 0]);

  // Track dominant gesture direction during drag
  const handleDrag = useCallback((_, info) => {
    const ax = Math.abs(info.offset.x);
    const ay = Math.abs(info.offset.y);
    if (ax < 20 && ay < 20) { setActiveGesture(null); return; }
    if (info.offset.y < -30 && ay > ax) setActiveGesture('up');
    else if (info.offset.x > 30 && ax > ay) setActiveGesture('right');
    else if (info.offset.x < -30 && ax > ay) setActiveGesture('left');
    else setActiveGesture(null);
  }, []);

  const handleDragEnd = useCallback(async (_, info) => {
    const { offset } = info;
    let acted = false;

    if (offset.x > SWIPE_H_THRESHOLD) {
      await animate(x, 400, { duration: 0.25 });
      onRate('liked');
      acted = true;
    } else if (offset.x < -SWIPE_H_THRESHOLD) {
      await animate(x, -400, { duration: 0.25 });
      onRate('disliked');
      acted = true;
    } else if (offset.y < -SWIPE_UP_THRESHOLD) {
      await animate(y, -400, { duration: 0.25 });
      onRate('loved');
      acted = true;
    }

    if (!acted) {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
      animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
    }

    setIsDragging(false);
    setActiveGesture(null);
  }, [x, y, onRate]);

  return (
    <motion.div
      className="relative touch-none select-none"
      style={{ x, y }}
      drag
      dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
      dragElastic={0.6}
      onDragStart={() => setIsDragging(true)}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    >
      {/* Swipe right overlay — Liked It (green) */}
      <motion.div
        className="absolute inset-0 z-10 rounded-xl flex flex-col items-center justify-center gap-1 pointer-events-none bg-green-500/20"
        style={{ opacity: rightOpacity }}
      >
        <ThumbsUpIcon className="h-10 w-10 text-green-600" filled />
        <span className="text-sm font-semibold text-green-700">Liked It</span>
      </motion.div>

      {/* Swipe left overlay — Didn't Like It (red) */}
      <motion.div
        className="absolute inset-0 z-10 rounded-xl flex flex-col items-center justify-center gap-1 pointer-events-none bg-destructive/20"
        style={{ opacity: leftOpacity }}
      >
        <ThumbsDownIcon className="h-10 w-10 text-destructive" filled />
        <span className="text-sm font-semibold text-destructive">Didn't Like It</span>
      </motion.div>

      {/* Swipe up overlay — Favourites (green) */}
      <motion.div
        className="absolute inset-0 z-10 rounded-xl flex flex-col items-center justify-center gap-1 pointer-events-none bg-green-500/20"
        style={{ opacity: upOpacity }}
      >
        <DoubleThumbsUpIcon className="h-10 w-10 text-green-600" filled />
        <span className="text-sm font-semibold text-green-700">Favourites</span>
      </motion.div>

      {/* Card content */}
      <div className="relative z-0">
        <div className="text-center pb-1 pt-2 px-4">
          <h3 className="text-base font-semibold text-foreground truncate">{venueName}</h3>
          <p className="text-lg font-medium text-foreground mt-1">How was it?</p>
        </div>

        <div className="flex items-center justify-center gap-4 px-6 py-4">
          <button
            onClick={() => onRate('disliked')}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-destructive/10 active:bg-destructive/15 transition-colors min-w-[90px]"
          >
            <ThumbsDownIcon className="h-7 w-7 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Didn't Like It</span>
          </button>

          <button
            onClick={() => onRate('liked')}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-green-500/10 active:bg-green-500/15 transition-colors min-w-[90px]"
          >
            <ThumbsUpIcon className="h-7 w-7 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Liked It</span>
          </button>

          <button
            onClick={() => onRate('loved')}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-green-500/10 active:bg-green-500/15 transition-colors min-w-[90px]"
          >
            <DoubleThumbsUpIcon className="h-7 w-7 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Favourites</span>
          </button>
        </div>

        <div className="pb-4 pt-0">
          <button
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto block py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Constellations rating sheet — slides up when user swipes up on a venue card.
 * Now supports swipe gestures within the dialog itself.
 */
export default function ConstellationsSheet({ open, onOpenChange, venueName, onRate, onCancel }) {
  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      onCancel?.();
    }
    onOpenChange(isOpen);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[50vh]">
        <SwipeableRatingCard
          venueName={venueName}
          onRate={onRate}
          onCancel={onCancel}
          onOpenChange={onOpenChange}
        />
      </DrawerContent>
    </Drawer>
  );
}
