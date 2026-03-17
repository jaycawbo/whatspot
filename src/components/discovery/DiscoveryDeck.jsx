import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import DiscoveryCard from './DiscoveryCard';
import ConstellationsSheet from './ConstellationsSheet';
import { useDiscoveryInteractions } from '@/hooks/useDiscoveryInteractions';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import AuthModal from '@/components/auth/AuthModal';

const SWIPE_THRESHOLD = 100;
const SWIPE_DOWN_THRESHOLD = 80;
const SWIPE_UP_THRESHOLD = 80;

export default function DiscoveryDeck({ venues = [], onDescriptorTap, onExpandSearch, onNewSearch }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitDirection, setExitDirection] = useState(null);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [ratingSheetOpen, setRatingSheetOpen] = useState(false);
  const [ratingPendingVenue, setRatingPendingVenue] = useState(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const {
    handleInterested,
    handleNotInterested,
    handleSkip,
    handleRated,
    logRatingSheetOpened,
    logRatingSheetCancelled,
    isAuthenticated,
    pendingAction,
    executePending,
    clearPending,
  } = useDiscoveryInteractions();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Reset deck when venues change
  useEffect(() => {
    setCurrentIndex(0);
    x.set(0);
    y.set(0);
  }, [venues]);

  // Overlay opacities based on drag distance
  const rightOverlayOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 0.8]);
  const leftOverlayOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [0.8, 0]);
  const downOverlayOpacity = useTransform(y, [0, SWIPE_DOWN_THRESHOLD], [0, 0.8]);
  const upOverlayOpacity = useTransform(y, [-SWIPE_UP_THRESHOLD, 0], [0.8, 0]);

  const currentVenue = venues[currentIndex];
  const nextVenue = venues[currentIndex + 1];
  const hasMore = currentIndex < venues.length;

  // Preload next card's images
  useEffect(() => {
    if (!nextVenue) return;
    const photos = nextVenue?.image_urls?.slice(0, 3) || [];
    photos.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [nextVenue]);

  // Advance to next card
  const advanceCard = useCallback(() => {
    setExitDirection(null);
    setCurrentIndex((i) => i + 1);
    x.set(0);
    y.set(0);
  }, [x, y]);

  // Open rating sheet
  const openRatingSheet = useCallback((venue) => {
    setRatingPendingVenue(venue);
    setRatingSheetOpen(true);
    logRatingSheetOpened(venue);
  }, [logRatingSheetOpened]);

  // Handle interaction + animate out
  const performAction = useCallback(async (direction, venue) => {
    if (direction === 'up') {
      openRatingSheet(venue);
      return;
    }

    let success = true;
    if (direction === 'right') {
      success = await handleInterested(venue);
    } else if (direction === 'left') {
      success = await handleNotInterested(venue);
    } else if (direction === 'down') {
      success = handleSkip(venue);
    }

    if (success === false) {
      setAuthModalOpen(true);
      return;
    }

    setExitDirection(direction);
    const exitX = direction === 'right' ? 500 : direction === 'left' ? -500 : 0;
    const exitY = direction === 'down' ? 500 : 0;
    await animate(x, exitX, { duration: 0.3 });
    if (direction === 'down') await animate(y, exitY, { duration: 0.3 });
    advanceCard();
  }, [handleInterested, handleNotInterested, handleSkip, openRatingSheet, x, y, advanceCard]);

  // Handle rating from sheet
  const handleRate = useCallback(async (rating) => {
    setRatingSheetOpen(false);
    if (!ratingPendingVenue) return;

    const success = await handleRated(ratingPendingVenue, rating);
    if (success === false) {
      setAuthModalOpen(true);
      setRatingPendingVenue(null);
      return;
    }

    // Animate card with upward fade-out
    setExitDirection('rated');
    setRatingPendingVenue(null);
    await new Promise((r) => setTimeout(r, 400));
    advanceCard();
  }, [ratingPendingVenue, handleRated, advanceCard]);

  // Handle rating cancel
  const handleRatingCancel = useCallback(() => {
    if (ratingPendingVenue) {
      logRatingSheetCancelled(ratingPendingVenue);
    }
    setRatingSheetOpen(false);
    setRatingPendingVenue(null);
  }, [ratingPendingVenue, logRatingSheetCancelled]);

  // Drag end handler
  const handleDragEnd = useCallback((event, info) => {
    if (!currentVenue) return;
    const { offset } = info;

    if (offset.x > SWIPE_THRESHOLD) {
      performAction('right', currentVenue);
    } else if (offset.x < -SWIPE_THRESHOLD) {
      performAction('left', currentVenue);
    } else if (offset.y > SWIPE_DOWN_THRESHOLD) {
      performAction('down', currentVenue);
    } else if (offset.y < -SWIPE_UP_THRESHOLD) {
      performAction('up', currentVenue);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
      animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
    }
  }, [currentVenue, performAction, x, y]);

  // Card body tap → venue details
  const handleCardBodyTap = useCallback((venue) => {
    const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
    navigate(`/venue/${placeId}`, { state: { venue } });
  }, [navigate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!currentVenue || !hasMore) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape' && ratingSheetOpen) {
        e.preventDefault();
        handleRatingCancel();
        return;
      }

      if (ratingSheetOpen) return; // Don't process other keys while sheet is open

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          performAction('right', currentVenue);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          performAction('left', currentVenue);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          performAction('down', currentVenue);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          performAction('up', currentVenue);
          break;
        case 'Enter':
          e.preventDefault();
          handleCardBodyTap(currentVenue);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentVenue, hasMore, performAction, handleCardBodyTap, ratingSheetOpen, handleRatingCancel]);

  // Auth modal callback
  const handleAuthClose = useCallback((open) => {
    setAuthModalOpen(open);
    if (!open && isAuthenticated && pendingAction) {
      executePending().then(() => {
        setExitDirection(pendingAction.label === 'Interested' ? 'right' : pendingAction.label === 'Not Interested' ? 'left' : 'rated');
        setTimeout(advanceCard, 300);
      });
    } else if (!open) {
      clearPending();
    }
  }, [isAuthenticated, pendingAction, executePending, advanceCard, clearPending]);

  // Empty state
  if (!hasMore || venues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <p className="text-lg font-semibold text-foreground">You've seen all the top spots nearby.</p>
        <div className="flex gap-3">
          {onExpandSearch && (
            <button
              onClick={onExpandSearch}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Expand search area
            </button>
          )}
          {onNewSearch && (
            <button
              onClick={onNewSearch}
              className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-accent transition-colors"
            >
              Try a new search
            </button>
          )}
        </div>
      </div>
    );
  }

  // Determine if card should be dimmed (rating sheet open)
  const isCardDimmed = ratingSheetOpen;

  return (
    <div ref={containerRef} className="relative w-full mx-auto max-w-[calc(100vw-2rem)] sm:max-w-[560px] lg:max-w-[660px]" style={{ height: 'var(--deck-height, 78vh)' }}>
      {/* Ghost cards */}
      {venues[currentIndex + 2] && (
        <DiscoveryCard venue={venues[currentIndex + 2]} index={currentIndex + 2} isGhost ghostLevel={2} />
      )}
      {venues[currentIndex + 1] && (
        <DiscoveryCard venue={venues[currentIndex + 1]} index={currentIndex + 1} isGhost ghostLevel={1} />
      )}

      {/* Active card */}
      <motion.div
        className="absolute inset-0 z-10 touch-none"
        style={{ x, y }}
        drag={!ratingSheetOpen}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.8}
        onDragEnd={handleDragEnd}
        animate={
          exitDirection === 'rated'
            ? { opacity: 0, y: -100, scale: 0.95 }
            : isCardDimmed
              ? { opacity: 0.5, scale: 1 }
              : { opacity: 1, scale: 1 }
        }
        transition={{ duration: 0.4 }}
      >
        {/* Swipe overlays */}
        {/* Right — green "Interested" */}
        <motion.div
          className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center pointer-events-none"
          style={{ opacity: rightOverlayOpacity, background: 'hsla(142, 71%, 45%, 0.2)' }}
        >
          <span className="text-2xl font-bold text-green-600">Interested</span>
        </motion.div>

        {/* Left — red "Not Interested" */}
        <motion.div
          className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center pointer-events-none"
          style={{ opacity: leftOverlayOpacity, background: 'hsla(0, 84%, 60%, 0.2)' }}
        >
          <span className="text-2xl font-bold text-destructive">Not Interested</span>
        </motion.div>

        {/* Down — grey "Skip" */}
        <motion.div
          className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center pointer-events-none"
          style={{ opacity: downOverlayOpacity, background: 'hsla(0, 0%, 50%, 0.2)' }}
        >
          <span className="text-2xl font-bold text-muted-foreground">Skip</span>
        </motion.div>

        {/* Up — blue "Been here" */}
        <motion.div
          className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{ opacity: upOverlayOpacity, background: 'hsla(210, 70%, 50%, 0.2)' }}
        >
          <Heart className="h-10 w-10 text-blue-500 fill-blue-500/30" />
          <span className="text-2xl font-bold text-blue-600">Been here</span>
        </motion.div>

        <DiscoveryCard
          venue={currentVenue}
          index={currentIndex}
          onDescriptorTap={onDescriptorTap}
          onCardBodyTap={handleCardBodyTap}
        />
      </motion.div>

      {/* Web-only action buttons */}
      {!isMobile && (
        <>
          {/* Left — Not Interested */}
          <button
            className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border shadow-md hover:bg-destructive/10 transition-colors"
            style={{ left: '-3rem' }}
            onClick={() => performAction('left', currentVenue)}
            onMouseEnter={() => setHoveredButton('left')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Not Interested"
          >
            <ChevronLeft className="h-6 w-6 text-destructive" />
          </button>

          {/* Right — Interested */}
          <button
            className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border shadow-md hover:bg-green-500/10 transition-colors"
            style={{ right: '-3rem' }}
            onClick={() => performAction('right', currentVenue)}
            onMouseEnter={() => setHoveredButton('right')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Interested"
          >
            <ChevronRight className="h-6 w-6 text-green-600" />
          </button>

          {/* Bottom — Skip */}
          <button
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-14 z-30 flex items-center justify-center gap-1.5 rounded-full bg-card border border-border shadow-md px-4 py-2 hover:bg-accent transition-colors"
            onClick={() => performAction('down', currentVenue)}
            onMouseEnter={() => setHoveredButton('down')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Skip"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Skip</span>
          </button>

          {/* Top — Been here */}
          <button
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-14 z-30 flex items-center justify-center gap-1.5 rounded-full bg-card border border-border shadow-md px-4 py-2 hover:bg-blue-500/10 transition-colors"
            onClick={() => performAction('up', currentVenue)}
            onMouseEnter={() => setHoveredButton('up')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Been here"
          >
            <Heart className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-blue-600">Been here</span>
          </button>

          {/* Hover tint overlay */}
          {hoveredButton && (
            <div
              className={cn(
                'absolute inset-0 z-[15] rounded-2xl pointer-events-none transition-opacity',
                hoveredButton === 'right' && 'bg-green-500/5',
                hoveredButton === 'left' && 'bg-destructive/5',
                hoveredButton === 'down' && 'bg-muted/10',
                hoveredButton === 'up' && 'bg-blue-500/5',
              )}
            />
          )}
        </>
      )}

      {/* Constellations rating sheet */}
      <ConstellationsSheet
        open={ratingSheetOpen}
        onOpenChange={setRatingSheetOpen}
        venueName={ratingPendingVenue?.name || ''}
        onRate={handleRate}
        onCancel={handleRatingCancel}
      />

      <AuthModal open={authModalOpen} onOpenChange={handleAuthClose} />
    </div>
  );
}
