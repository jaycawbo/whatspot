import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';

const SWIPE_H_THRESHOLD = 80;
const FAVOURITES_TIMEOUT = 4000;

function ThumbsDownIcon({ className, filled }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function ThumbsUpIcon({ className, filled }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10V22" />
      <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function HeartIcon({ className, filled }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/** Step 2: Favourites follow-up with countdown */
function FavouritesFollowUp({ onLoved, onDismiss }) {
  const [progress, setProgress] = useState(100);
  const [tapped, setTapped] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / FAVOURITES_TIMEOUT) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        onDismiss();
      }
    }, 50);
    return () => clearInterval(intervalRef.current);
  }, [onDismiss]);

  const handleTap = () => {
    if (tapped) return;
    setTapped(true);
    clearInterval(intervalRef.current);
    onLoved();
  };

  return (
    <motion.div
      key="favourites"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center gap-4 py-6 px-4"
    >
      <h3 className="text-base font-semibold text-foreground">Add to Favourites?</h3>
      <button
        onClick={handleTap}
        className="rounded-full p-5 transition-colors hover:bg-accent active:scale-95"
      >
        <HeartIcon
          className={`h-12 w-12 transition-colors ${tapped ? 'text-green-500' : 'text-muted-foreground'}`}
          filled={tapped}
        />
      </button>
      <div className="w-48">
        <Progress value={progress} className="h-1" />
      </div>
    </motion.div>
  );
}

/** Step 1: Swipeable binary rating card */
function SwipeableRatingCard({ venueName, onLiked, onDisliked }) {
  const x = useMotionValue(0);

  const rightOpacity = useTransform(x, [0, SWIPE_H_THRESHOLD], [0, 0.85]);
  const leftOpacity = useTransform(x, [-SWIPE_H_THRESHOLD, 0], [0.85, 0]);

  const handleDragEnd = useCallback(async (_, info) => {
    const { offset } = info;
    if (offset.x > SWIPE_H_THRESHOLD) {
      await animate(x, 400, { duration: 0.25 });
      onLiked();
    } else if (offset.x < -SWIPE_H_THRESHOLD) {
      await animate(x, -400, { duration: 0.25 });
      onDisliked();
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
    }
  }, [x, onLiked, onDisliked]);

  return (
    <motion.div
      className="relative touch-none select-none"
      style={{ x }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={handleDragEnd}
    >
      {/* Swipe right overlay — green */}
      <motion.div
        className="absolute inset-0 z-10 rounded-xl flex flex-col items-center justify-center gap-1 pointer-events-none bg-green-500/20"
        style={{ opacity: rightOpacity }}
      >
        <ThumbsUpIcon className="h-10 w-10 text-green-600" filled />
        <span className="text-sm font-semibold text-green-700">Liked It</span>
      </motion.div>

      {/* Swipe left overlay — red */}
      <motion.div
        className="absolute inset-0 z-10 rounded-xl flex flex-col items-center justify-center gap-1 pointer-events-none bg-destructive/20"
        style={{ opacity: leftOpacity }}
      >
        <ThumbsDownIcon className="h-10 w-10 text-destructive" filled />
        <span className="text-sm font-semibold text-destructive">Didn't Like It</span>
      </motion.div>

      {/* Card content */}
      <div className="relative z-0 py-4 px-4">
        <h3 className="text-base font-semibold text-foreground truncate text-center">{venueName}</h3>
        <p className="text-sm text-muted-foreground text-center mt-1 mb-4">Swipe or tap to rate</p>

        <div className="flex items-stretch">
          {/* Left zone — Didn't Like It */}
          <button
            onClick={onDisliked}
            className="flex-1 flex flex-col items-center justify-center gap-2 py-5 rounded-l-xl hover:bg-destructive/10 active:bg-destructive/15 transition-colors"
          >
            <span className="text-xs text-muted-foreground mb-1">​</span>
            <ThumbsDownIcon className="h-7 w-7 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Didn't Like It</span>
          </button>

          {/* Divider */}
          <div className="w-px bg-border my-4" />

          {/* Right zone — Liked It */}
          <button
            onClick={onLiked}
            className="flex-1 flex flex-col items-center justify-center gap-2 py-5 rounded-r-xl hover:bg-green-500/10 active:bg-green-500/15 transition-colors"
          >
            <span className="text-xs text-muted-foreground mb-1">​</span>
            <ThumbsUpIcon className="h-7 w-7 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Liked It</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function ConstellationsSheet({ open, onOpenChange, venue, venueName, onRate, onCancel }) {
  const displayName = venueName || venue?.name || venue?.displayName?.text || 'This place';
  const [dialogStep, setDialogStep] = useState('rate');

  // Reset step when dialog opens/closes
  useEffect(() => {
    if (open) setDialogStep('rate');
  }, [open]);

  const handleOpenChange = (isOpen) => {
    if (!isOpen) onCancel?.();
    onOpenChange(isOpen);
  };

  const handleLiked = useCallback(() => {
    onRate('liked');
    setDialogStep('favourites');
  }, [onRate]);

  const handleDisliked = useCallback(() => {
    onRate('disliked');
    onOpenChange(false);
  }, [onRate, onOpenChange]);

  const handleLoved = useCallback(() => {
    onRate('loved');
    onOpenChange(false);
  }, [onRate, onOpenChange]);

  const handleFavDismiss = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[50vh]">
        <AnimatePresence mode="wait">
          {dialogStep === 'rate' ? (
            <motion.div key="rate" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <SwipeableRatingCard
                venueName={displayName}
                onLiked={handleLiked}
                onDisliked={handleDisliked}
              />
            </motion.div>
          ) : (
            <FavouritesFollowUp
              key="favourites"
              onLoved={handleLoved}
              onDismiss={handleFavDismiss}
            />
          )}
        </AnimatePresence>
      </DrawerContent>
    </Drawer>
  );
}
