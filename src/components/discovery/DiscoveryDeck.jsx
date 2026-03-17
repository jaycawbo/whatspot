import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Heart, X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import DiscoveryCard from './DiscoveryCard';
import { useDiscoveryInteractions } from '@/hooks/useDiscoveryInteractions';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import AuthModal from '@/components/auth/AuthModal';

const SWIPE_THRESHOLD = 100;
const SWIPE_DOWN_THRESHOLD = 80;

export default function DiscoveryDeck({ venues = [], onDescriptorTap, onExpandSearch, onNewSearch, onFavouriteAdvance }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset deck when venues change (new search / refresh)
  useEffect(() => {
    setCurrentIndex(0);
    x.set(0);
    y.set(0);
  }, [venues]);
  const [exitDirection, setExitDirection] = useState(null); // 'left' | 'right' | 'down'
  const [hoveredButton, setHoveredButton] = useState(null); // 'left' | 'right'
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [viewedFromDetails, setViewedFromDetails] = useState(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const {
    handleWantToGo,
    handlePass,
    handleViewed,
    handleFavourite,
    isAuthenticated,
    pendingAction,
    executePending,
    clearPending,
  } = useDiscoveryInteractions();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Overlay opacities based on drag distance
  const rightOverlayOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 0.8]);
  const leftOverlayOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [0.8, 0]);

  const currentVenue = venues[currentIndex];
  const nextVenue = venues[currentIndex + 1];
  const hasMore = currentIndex < venues.length;

  // Preload next card's first 2-3 images
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

  // Handle interaction + animate out
  const performAction = useCallback(async (direction, venue) => {
    let success = true;
    if (direction === 'right') {
      success = await handleWantToGo(venue);
    } else if (direction === 'left') {
      success = await handlePass(venue);
    } else if (direction === 'down') {
      success = await handleViewed(venue);
    }

    if (success === false) {
      // Not authenticated — show auth modal, don't advance
      setAuthModalOpen(true);
      return;
    }

    setExitDirection(direction);
    const exitX = direction === 'right' ? 500 : direction === 'left' ? -500 : 0;
    const exitY = direction === 'down' ? 500 : 0;
    await animate(x, exitX, { duration: 0.3 });
    if (direction === 'down') await animate(y, exitY, { duration: 0.3 });
    advanceCard();
  }, [handleWantToGo, handlePass, handleViewed, x, y, advanceCard]);

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
    } else {
      // Snap back
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
      animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
    }
  }, [currentVenue, performAction, x, y]);

  // Card body tap → open venue details
  const handleCardBodyTap = useCallback((venue) => {
    const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
    setViewedFromDetails(venue);
    navigate(`/venue/${placeId}`, { state: { venue } });
  }, [navigate]);

  // On return from venue details, auto-save as Viewed if no other action taken
  useEffect(() => {
    if (viewedFromDetails && currentVenue === viewedFromDetails) {
      // User came back — save as Viewed and advance
      handleViewed(viewedFromDetails);
      setViewedFromDetails(null);
    }
  }, []); // Only on mount/navigation back — this is simplified; full popstate handling deferred

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!currentVenue || !hasMore) return;
      // Don't capture if focused on input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
        case 'Enter':
          e.preventDefault();
          handleCardBodyTap(currentVenue);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentVenue, hasMore, performAction, handleCardBodyTap]);

  // Auth modal: after successful auth, execute pending action
  const handleAuthClose = useCallback((open) => {
    setAuthModalOpen(open);
    if (!open && isAuthenticated && pendingAction) {
      executePending().then(() => {
        setExitDirection(pendingAction.label === 'Want to Go' ? 'right' : pendingAction.label === "I'll Pass" ? 'left' : 'down');
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

  // Handle favourite from HeartButton — animate card out after delay
  const handleFavouriteAdvance = useCallback(async () => {
    if (!currentVenue) return;
    // Wait ~1s then fade-out + scale-down
    await new Promise((r) => setTimeout(r, 1000));
    setExitDirection('favourite');
    await animate(x, 0, { duration: 0 }); // ensure x is 0
    advanceCard();
  }, [currentVenue, x, advanceCard]);

  return (
    <div ref={containerRef} className="relative w-full mx-auto max-w-[calc(100vw-2rem)] sm:max-w-[560px] lg:max-w-[660px]" style={{ height: 'var(--deck-height, 78vh)' }}>
      {/* Ghost cards — scale relative to active card */}
      {venues[currentIndex + 2] && (
        <DiscoveryCard
          venue={venues[currentIndex + 2]}
          index={currentIndex + 2}
          isGhost
          ghostLevel={2}
        />
      )}
      {venues[currentIndex + 1] && (
        <DiscoveryCard
          venue={venues[currentIndex + 1]}
          index={currentIndex + 1}
          isGhost
          ghostLevel={1}
        />
      )}

      {/* Active card */}
      <motion.div
        className="absolute inset-0 z-10 touch-none"
        style={{ x, y }}
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.8}
        onDragEnd={handleDragEnd}
        animate={exitDirection === 'favourite' ? { opacity: 0, scale: 0.9 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Swipe overlays */}
        <motion.div
          className="absolute inset-0 z-20 rounded-2xl flex items-center justify-center pointer-events-none"
          style={{
            opacity: rightOverlayOpacity,
            background: 'hsla(142, 71%, 45%, 0.2)',
          }}
        >
          <Heart className="h-20 w-20 text-green-500 fill-green-500/30" />
        </motion.div>
        <motion.div
          className="absolute inset-0 z-20 rounded-2xl flex items-center justify-center pointer-events-none"
          style={{
            opacity: leftOverlayOpacity,
            background: 'hsla(0, 84%, 60%, 0.2)',
          }}
        >
          <X className="h-20 w-20 text-destructive" />
        </motion.div>

        <DiscoveryCard
          venue={currentVenue}
          index={currentIndex}
          onDescriptorTap={onDescriptorTap}
          onCardBodyTap={handleCardBodyTap}
          onFavouriteAdvance={handleFavouriteAdvance}
        />
      </motion.div>

      {/* Web-only action buttons — positioned just outside card edges */}
      {!isMobile && (
        <>
          <button
            className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border shadow-md hover:bg-destructive/10 transition-colors"
            style={{ left: '-3rem' }}
            onClick={() => performAction('left', currentVenue)}
            onMouseEnter={() => setHoveredButton('left')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="I'll Pass"
          >
            <ChevronLeft className="h-6 w-6 text-destructive" />
          </button>

          <button
            className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border shadow-md hover:bg-green-500/10 transition-colors"
            style={{ right: '-4rem' }}
            onClick={() => performAction('right', currentVenue)}
            onMouseEnter={() => setHoveredButton('right')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Want to Go"
          >
            <ChevronRight className="h-6 w-6 text-green-600" />
          </button>

          <button
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-14 z-30 flex items-center justify-center gap-1.5 rounded-full bg-card border border-border shadow-md px-4 py-2 hover:bg-accent transition-colors"
            onClick={() => performAction('down', currentVenue)}
            aria-label="Skip (Viewed)"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Skip</span>
          </button>

          {hoveredButton && (
            <div
              className={cn(
                'absolute inset-0 z-[15] rounded-2xl pointer-events-none transition-opacity',
                hoveredButton === 'right' && 'bg-green-500/5',
                hoveredButton === 'left' && 'bg-destructive/5',
              )}
            />
          )}
        </>
      )}

      <AuthModal open={authModalOpen} onOpenChange={handleAuthClose} />
    </div>
  );
}
