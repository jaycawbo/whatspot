import React, { useState, useCallback, useEffect, useRef } from 'react';
import { signalUserInteraction, addClientSkippedId } from '@/hooks/useDiscoveryFeed';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Heart, SkipForward, MapPinCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import DiscoveryCard from './DiscoveryCard';
import SwipeBurst from './SwipeBurst';
import RatingDialog from './RatingDialog';
import { useDiscoveryInteractions } from '@/hooks/useDiscoveryInteractions';
import { logEvent, venueSnapshot } from '@/lib/logEvent';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import AuthModal from '@/components/auth/AuthModal';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { mergeVenuesOnBackgroundExpansion } from './discoveryDeckVenueMerge';

const SWIPE_THRESHOLD = 100;
const SWIPE_DOWN_THRESHOLD = 80;
const SWIPE_UP_THRESHOLD = 80;
const RATING_CANCEL_TAP_BLOCK_MS = 500;

// The icon's growth completing exactly at SWIPE_THRESHOLD (the min distance to trigger
// a swipe) meant it saturated the moment the swipe became valid, well before most real
// drags actually end — reads as "stops growing mid-swipe". Growth now plays out over a
// distance further past that trigger point so it keeps growing through more of the
// gesture. ICON_MAX_SCALE is 2x the original 1.3 max. SwipeBurst reads its starting
// scale/opacity live from performAction (see ICON_SCALE_BY_DIRECTION below) rather than
// hardcoding a value, so a swipe released before reaching full growth hands off from
// wherever it actually was, not from this constant — this only matters as the
// button-click fallback's starting scale (no drag ever occurred, so there's no live
// value to read).
const ICON_GROWTH_DISTANCE_MULTIPLIER = 3;
const ICON_MAX_SCALE = 2.6;

const BURST_ICON = {
  right: { Icon: Heart, className: 'h-10 w-10 text-white fill-white/40' },
  left: { Icon: X, className: 'h-10 w-10 text-white' },
  down: { Icon: SkipForward, className: 'h-10 w-10 text-white fill-white/40' },
};

const LOCATION_KEYWORDS = [
  'little portugal', 'kensington', 'ossington', 'queen west', 'king street',
  'college street', 'dundas', 'bloor', 'parkdale', 'leslieville', 'junction',
  'annex', 'yorkville', 'liberty village', 'distillery', 'st clair',
  'danforth', 'roncesvalles', 'bathurst', 'spadina', 'chinatown',
];

function isLocationQuery(query) {
  if (!query) return false;
  const q = query.toLowerCase();
  if (LOCATION_KEYWORDS.some((kw) => q.includes(kw))) return true;
  if (/\b(in|near|around|by)\s+\w/i.test(q)) return true;
  return false;
}

export default function DiscoveryDeck({ venues: initialVenues = [], overflowVenues = [], currentQuery = '', onDescriptorTap, onExpandSearch, onNewSearch, onRequestMoreVenues, isDiscoveryMode = false, listMembershipMap = null }) {
  // Restore swipe index from sessionStorage for back-navigation
  const savedIndex = useRef(() => {
    try {
      const val = sessionStorage.getItem('whatspot_deck_index');
      return val ? parseInt(val, 10) : 0;
    } catch { return 0; }
  });
  const [venues, setVenues] = useState(initialVenues);
  const [overflowAppended, setOverflowAppended] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(savedIndex.current());
  // True when currentIndex was restored from sessionStorage (back-nav). Suppresses the
  // proactive loading trigger until the user makes their first swipe, preventing expandSearch()
  // from replacing the venue array immediately after back-navigation.
  const suppressProactiveLoadRef = useRef(savedIndex.current() > 0);
  const [exitDirection, setExitDirection] = useState(null);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [ratingSheetOpen, setRatingSheetOpen] = useState(false);
  const [ratingPendingVenue, setRatingPendingVenue] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [burst, setBurst] = useState(null); // { direction, origin: { x, y } }
  const handleBurstDone = useCallback(() => setBurst(null), []);
  const isMobile = useIsMobile();
  const currentVenue = venues[currentIndex] ?? null;
  const hasMore = currentIndex < venues.length;
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const activeCardRef = useRef(null);
  const moreRequestedRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const blockCardTapUntilRef = useRef(0);
  const ratingWasSubmittedRef = useRef(false);
  const ratingSheetOpenRef = useRef(false);
  const [venuePhotoOverrides, setVenuePhotoOverrides] = useState({});
  const [photoFetchSettledIds, setPhotoFetchSettledIds] = useState(() => new Set());
  const fetchedPlaceIdsRef = useRef(new Set());
  const isFadingRef = useRef(false);
  const pendingOverridesRef = useRef({});
  const currentVenueIdRef = useRef('');

  const {
    handleInterested,
    handleNotInterested,
    handleSkip,
    handleRated,
    writePassiveSkip,
    logRatingSheetOpened,
    logRatingSheetCancelled,
    isAuthenticated,
    pendingAction,
    executePending,
    clearPending,
  } = useDiscoveryInteractions();

  // Write passive_skip when a new card becomes active
  const lastPassiveSkipRef = useRef(null);
  useEffect(() => {
    if (!currentVenue) return;
    const placeId = (currentVenue.place_id || currentVenue.google_place_id || '').replace(/^places\//, '');
    if (placeId && placeId !== lastPassiveSkipRef.current) {
      lastPassiveSkipRef.current = placeId;
      writePassiveSkip(currentVenue);
    }
    if (currentVenue && !currentVenue.photos_complete) {
      const rawId = (currentVenue.place_id || currentVenue.google_place_id || '').replace(/^places\//, '');
      if (rawId && !fetchedPlaceIdsRef.current.has(rawId)) {
        fetchedPlaceIdsRef.current.add(rawId);
        supabase.functions.invoke('get-place-photos', { body: { place_id: rawId, max_photos: 4 } })
          .then(({ data, error }) => {
            if (data?.photo_urls?.length > 0) {
              const img = new Image();
              img.onload = img.onerror = () => {
                if (rawId === currentVenueIdRef.current && isFadingRef.current) {
                  pendingOverridesRef.current[rawId] = data.photo_urls;
                } else {
                  setVenuePhotoOverrides((prev) => ({ ...prev, [rawId]: data.photo_urls }));
                }
                setPhotoFetchSettledIds((prev) => new Set(prev).add(rawId));
              };
              img.src = data.photo_urls[0];
            } else {
              if (error || data?.success === false) {
                console.warn(`[DiscoveryDeck] photo fetch for ${rawId} did not complete (cap or error) — showing placeholder this session, will retry next session`, error?.message || data?.error);
              }
              setPhotoFetchSettledIds((prev) => new Set(prev).add(rawId));
            }
          })
          .catch((err) => {
            console.warn(`[DiscoveryDeck] photo fetch for ${rawId} failed — showing placeholder this session, will retry next session`, err?.message);
            setPhotoFetchSettledIds((prev) => new Set(prev).add(rawId));
          });
      }
    }
  }, [currentVenue, writePassiveSkip]);

  // Keep ref in sync so async photo-override callbacks always see the current active venue ID
  useEffect(() => {
    currentVenueIdRef.current = (currentVenue?.place_id || currentVenue?.google_place_id || '').replace(/^places\//, '');
  }, [currentVenue]);

  // Called by DiscoveryCard when its crossfade starts (true) or ends (false).
  // Flushes any overrides that were deferred during a crossfade once the fade completes.
  const handleFadingChange = useCallback((fading) => {
    isFadingRef.current = fading;
    if (!fading && Object.keys(pendingOverridesRef.current).length > 0) {
      const pending = pendingOverridesRef.current;
      pendingOverridesRef.current = {};
      setVenuePhotoOverrides((prev) => ({ ...prev, ...pending }));
    }
  }, []);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);
  const rightOverlayOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 0.8]);
  const leftOverlayOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [0.8, 0]);
  const downOverlayOpacity = useTransform(y, [0, SWIPE_DOWN_THRESHOLD], [0, 0.8]);
  const upOverlayOpacity = useTransform(y, [-SWIPE_UP_THRESHOLD, 0], [0.8, 0]);

  // Icon grows continuously with live drag progress (not just at release) — same
  // useTransform pattern as the opacity values above. The "burst" that plays on
  // release lives in SwipeBurst, rendered via a portal so it can't be clipped.
  const rightIconScale = useTransform(x, [0, SWIPE_THRESHOLD * ICON_GROWTH_DISTANCE_MULTIPLIER], [1, ICON_MAX_SCALE]);
  const leftIconScale = useTransform(x, [-SWIPE_THRESHOLD * ICON_GROWTH_DISTANCE_MULTIPLIER, 0], [ICON_MAX_SCALE, 1]);
  const downIconScale = useTransform(y, [0, SWIPE_DOWN_THRESHOLD * ICON_GROWTH_DISTANCE_MULTIPLIER], [1, ICON_MAX_SCALE]);
  const upIconScale = useTransform(y, [-SWIPE_UP_THRESHOLD * ICON_GROWTH_DISTANCE_MULTIPLIER, 0], [ICON_MAX_SCALE, 1]);

  // The icon needs its own opacity, independent of the background tint's (which
  // ramps 0→0.8 over the FULL drag and, since the icon is nested inside that tinted
  // div, was multiplying against it — leaving the icon nearly invisible until the
  // last third of the drag even though its scale was already growing the whole time.
  // Ramping the icon to full opacity over just the first 40% of the drag makes the
  // growth visible from the start instead of appearing to pop in right before release.
  const rightIconOpacity = useTransform(x, [0, SWIPE_THRESHOLD * 0.4], [0, 1]);
  const leftIconOpacity = useTransform(x, [-SWIPE_THRESHOLD * 0.4, 0], [1, 0]);
  const downIconOpacity = useTransform(y, [0, SWIPE_DOWN_THRESHOLD * 0.4], [0, 1]);
  const upIconOpacity = useTransform(y, [-SWIPE_UP_THRESHOLD * 0.4, 0], [1, 0]);

  // Lets performAction read the icon's actual live scale/opacity at the instant of
  // release (see .get() calls below), instead of assuming it always reached its max —
  // a release right at the swipe threshold is usually well short of full growth. No
  // 'up' entry: that direction opens the rating sheet instead of bursting.
  const ICON_SCALE_BY_DIRECTION = { right: rightIconScale, left: leftIconScale, down: downIconScale };
  const ICON_OPACITY_BY_DIRECTION = { right: rightIconOpacity, left: leftIconOpacity, down: downIconOpacity };

  // Reset deck when initial venues change (new search) or append (reserve venues)
  // Seed from sessionStorage so back-navigation with cached venues doesn't trigger a reset
  const savedVenueIds = useRef(() => {
    try { return sessionStorage.getItem('whatspot_deck_venue_ids') || ''; } catch { return ''; }
  });
  const initialVenueIdsRef = useRef(savedVenueIds.current());
  // Remembers the swipe index for each distinct venue-list signature seen this session,
  // so switching feed tabs and coming back resumes on the same card instead of resetting.
  const positionByListRef = useRef(new Map());

  useEffect(() => {
    if (initialVenues.length === 0) return;

    const newIds = initialVenues
      .map(v => (v.place_id || v.google_place_id || '').replace(/^places\//, ''))
      .join(',');

    if (newIds === initialVenueIdsRef.current) return;

    const prevIds = initialVenueIdsRef.current;
    if (prevIds !== '') positionByListRef.current.set(prevIds, currentIndex);
    initialVenueIdsRef.current = newIds;
    // Do NOT write whatspot_deck_venue_ids here — only saveFeedCache (useDiscoveryFeed)
    // writes it, and only with the feed-only IDs. Writing combined (feed+reserve) IDs here
    // causes the next back-nav to fail the early-return check and incorrectly reset.

    // Returning to a venue list already seen this session (e.g. switching back to a
    // previously-viewed feed tab) — resume exactly where the user left off.
    if (positionByListRef.current.has(newIds)) {
      const restoredIndex = positionByListRef.current.get(newIds);
      setVenues(initialVenues);
      setOverflowAppended(false);
      setCurrentIndex(Math.min(restoredIndex, Math.max(0, initialVenues.length - 1)));
      moreRequestedRef.current = false;
      x.stop();
      y.stop();
      opacity.stop();
      x.set(0);
      y.set(0);
      opacity.set(1);
      return;
    }

    // If this is an append (new list contains current card), maintain position
    if (prevIds !== '' && currentVenue) {
      const currentId = (currentVenue.place_id || currentVenue.google_place_id || '').replace(/^places\//, '');
      const newIndex = initialVenues.findIndex(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return id === currentId;
      });
      if (newIndex >= 0) {
        // Append — keep position on the same card
        setVenues(initialVenues);
        setCurrentIndex(newIndex);
        moreRequestedRef.current = false;
        return;
      }
      // Prior state exists but current card not in new batch (background expansion —
      // e.g. ripple/radius expansion replaced the underlying feed). Keep the current
      // card (and everything before it) exactly as-is rather than clamping the old
      // index into the unrelated new array — that used to silently swap currentVenue
      // out from under the user, firing a phantom "shown" event. See #279.
      setVenues((prev) => mergeVenuesOnBackgroundExpansion(prev, currentIndex, initialVenues));
      setOverflowAppended(false);
      moreRequestedRef.current = false;
      return;
    }

    // Full reset — genuinely new search (no prior session state)
    setVenues(initialVenues);
    setOverflowAppended(false);
    setCurrentIndex(0);
    try { sessionStorage.setItem('whatspot_deck_index', '0'); } catch {}
    moreRequestedRef.current = false;
    x.stop();
    y.stop();
    opacity.stop();
    x.set(0);
    y.set(0);
    opacity.set(1);
  }, [initialVenues, x, y, opacity, currentVenue, currentIndex]);

  // Proactive loading — fire when 8 cards remain OR 25% consumed.
  // Suppressed on back-nav restore until the user swipes (avoids triggering expandSearch
  // immediately, which would replace the restored venue array asynchronously).
  useEffect(() => {
    if (!onRequestMoreVenues || moreRequestedRef.current || venues.length === 0) return;
    if (suppressProactiveLoadRef.current) return;
    const remaining = venues.length - currentIndex;
    const earlyTrigger = currentIndex > 0 && currentIndex >= Math.floor(venues.length / 4);
    if (remaining <= 8 || earlyTrigger) {
      moreRequestedRef.current = true;
      onRequestMoreVenues();
    }
  }, [currentIndex, venues.length, onRequestMoreVenues]);

  // Auto-append overflow
  useEffect(() => {
    if (overflowAppended || overflowVenues.length === 0) return;
    if (currentIndex >= venues.length - 1 && venues.length > 0) {
      const message = isLocationQuery(currentQuery)
        ? 'Showing spots just outside your area'
        : 'Here are a few more you might like';
      toast(message, { duration: 3000 });
      setVenues((prev) => [...prev, ...overflowVenues]);
      setOverflowAppended(true);
    }
  }, [currentIndex, venues.length, overflowVenues, overflowAppended, currentQuery]);

  // Preload next card's images (including any override photos already fetched)
  const nextVenue = venues[currentIndex + 1] ?? null;
  useEffect(() => {
    if (!nextVenue) return;
    const nextRawId = (nextVenue.place_id || nextVenue.google_place_id || '').replace(/^places\//, '');
    const overrideUrls = nextRawId ? venuePhotoOverrides[nextRawId] : undefined;
    const photos = (overrideUrls || nextVenue?.image_urls || nextVenue?._photoUrls)?.slice(0, 3) || [];
    photos.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [nextVenue, venuePhotoOverrides]);

  // Prefetch 1 photo for the next card while the user is still on the current one
  useEffect(() => {
    if (!nextVenue || nextVenue.photos_complete) return;
    const rawId = (nextVenue.place_id || nextVenue.google_place_id || '').replace(/^places\//, '');
    if (!rawId || fetchedPlaceIdsRef.current.has(rawId)) return;
    fetchedPlaceIdsRef.current.add(rawId);
    supabase.functions.invoke('get-place-photos', { body: { place_id: rawId, max_photos: 4 } })
      .then(({ data, error }) => {
        if (data?.photo_urls?.length > 0) {
          const img = new Image();
          img.onload = img.onerror = () => {
            if (rawId === currentVenueIdRef.current && isFadingRef.current) {
              pendingOverridesRef.current[rawId] = data.photo_urls;
            } else {
              setVenuePhotoOverrides((prev) => ({ ...prev, [rawId]: data.photo_urls }));
            }
            setPhotoFetchSettledIds((prev) => new Set(prev).add(rawId));
          };
          img.src = data.photo_urls[0];
        } else {
          if (error || data?.success === false) {
            console.warn(`[DiscoveryDeck] photo fetch for ${rawId} did not complete (cap or error) — showing placeholder this session, will retry next session`, error?.message || data?.error);
          }
          setPhotoFetchSettledIds((prev) => new Set(prev).add(rawId));
        }
      })
      .catch((err) => {
        console.warn(`[DiscoveryDeck] photo fetch for ${rawId} failed — showing placeholder this session, will retry next session`, err?.message);
        setPhotoFetchSettledIds((prev) => new Set(prev).add(rawId));
      });
  }, [nextVenue]);

  // Advance to next card — clamped to venues.length
  const advanceCard = useCallback(() => {
    suppressProactiveLoadRef.current = false; // first swipe clears back-nav suppression
    signalUserInteraction(); // clears module-level prefetch suppression in useDiscoveryFeed
    x.stop();
    y.stop();
    opacity.stop();
    x.set(0);
    y.set(0);
    opacity.set(1);
    setExitDirection(null);
    setIsDragging(false);
    setCurrentIndex((i) => {
      const next = Math.min(i + 1, venues.length);
      try { sessionStorage.setItem('whatspot_deck_index', String(next)); } catch {}
      return next;
    });
    isAnimatingRef.current = false;
  }, [x, y, opacity, venues.length]);

  // Open rating sheet
  const openRatingSheet = useCallback((venue) => {
    ratingSheetOpenRef.current = true;
    setRatingPendingVenue(venue);
    setRatingSheetOpen(true);
    logRatingSheetOpened(venue);
  }, [logRatingSheetOpened]);

  // Handle interaction + animate out
  // exitDuration: drag gestures pass a velocity-derived value; button presses use the default 0.2s
  const performAction = useCallback(async (direction, venue, exitDuration = 0.2) => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    x.stop();
    y.stop();
    opacity.stop();

    if (direction === 'up') {
      openRatingSheet(venue);
      isAnimatingRef.current = false;
      return;
    }

    const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');

    // Start exit animation immediately so the card moves while DB work runs concurrently.
    // This eliminates the pause caused by awaiting handleInterested/handleNotInterested
    // before beginning the visual transition.
    setExitDirection(direction);
    const exitX = direction === 'right' ? 500 : direction === 'left' ? -500 : 0;
    const exitY = direction === 'down' ? 500 : 0;
    const exitAnim = Promise.all([
      animate(x, exitX, { duration: exitDuration, ease: 'easeOut' }),
      animate(y, exitY, { duration: exitDuration, ease: 'easeOut' }),
      animate(opacity, 0, { duration: exitDuration, ease: 'easeOut' }),
    ]);

    // Celebratory burst, portal-rendered so it can't be clipped by the deck's
    // overflow-hidden ancestors (mobile in particular — see SwipeBurst.jsx) and runs on
    // its own independent timeline, decoupled from the card's own exit speed above.
    // Origin comes from the card's own live (dragged) position, not the static deck
    // container — otherwise the burst appears back at the deck's resting center instead
    // of where the card actually was on release, breaking continuity with the icon that
    // was growing under the user's finger/cursor throughout the drag.
    const cardRect = activeCardRef.current?.getBoundingClientRect() ?? containerRef.current?.getBoundingClientRect();
    if (cardRect) {
      // Read the icon's actual live scale/opacity at this instant rather than assuming
      // it reached ICON_MAX_SCALE — a release right at the swipe threshold is usually
      // well short of full growth (see ICON_GROWTH_DISTANCE_MULTIPLIER above), so the
      // burst needs to pick up from wherever the icon really was, not a fixed constant.
      // Button clicks never drag at all, so x/y sit at 0 and the live opacity reads 0 —
      // that's how we detect "no real drag happened" and fall back to today's pop-in.
      const liveOpacity = ICON_OPACITY_BY_DIRECTION[direction]?.get() ?? 0;
      const liveScale = ICON_SCALE_BY_DIRECTION[direction]?.get() ?? 1;
      const initialOpacity = liveOpacity > 0 ? liveOpacity : 1;
      const initialScale = liveOpacity > 0 ? liveScale : ICON_MAX_SCALE;
      setBurst({
        direction,
        origin: { x: cardRect.left + cardRect.width / 2, y: cardRect.top + cardRect.height / 2 },
        initialScale,
        initialOpacity,
      });
    }

    let success = true;
    if (direction === 'right') {
      success = await handleInterested(venue);
      addClientSkippedId(placeId);
    } else if (direction === 'left') {
      success = await handleNotInterested(venue);
      addClientSkippedId(placeId);
    } else if (direction === 'down') {
      success = handleSkip(venue);
      addClientSkippedId(placeId);
    }

    await exitAnim;
    advanceCard();
    if (success === false) setAuthModalOpen(true);
  }, [handleInterested, handleNotInterested, handleSkip, openRatingSheet, x, y, opacity, advanceCard]);

  const handleRate = useCallback(async (rating, notes) => {
    ratingWasSubmittedRef.current = true;
    ratingSheetOpenRef.current = false;
    setRatingSheetOpen(false);
    if (!ratingPendingVenue) return;
    const ratingPlaceId = (ratingPendingVenue.place_id || ratingPendingVenue.google_place_id || '').replace(/^places\//, '');

    const success = await handleRated(ratingPendingVenue, rating, notes);
    addClientSkippedId(ratingPlaceId);
    if (success === false) {
      setAuthModalOpen(true);
      setRatingPendingVenue(null);
      ratingWasSubmittedRef.current = false;
      return;
    }

    setExitDirection('rated');
    setRatingPendingVenue(null);
    await new Promise((r) => setTimeout(r, 400));
    advanceCard();
    ratingWasSubmittedRef.current = false;
  }, [ratingPendingVenue, handleRated, advanceCard]);

  const handleRatingCancel = useCallback(() => {
    ratingSheetOpenRef.current = false;
    if (ratingWasSubmittedRef.current) {
      setRatingSheetOpen(false);
      setRatingPendingVenue(null);
      return;
    }
    if (ratingPendingVenue) {
      logRatingSheetCancelled(ratingPendingVenue);
    }
    setRatingSheetOpen(false);
    setRatingPendingVenue(null);
    // Drawer dismiss touch propagates through to card body — block briefly
    blockCardTapUntilRef.current = Date.now() + RATING_CANCEL_TAP_BLOCK_MS;
  }, [ratingPendingVenue, logRatingSheetCancelled]);

  // Drag handlers — track isDragging to disable transition during drag (Fix 2)
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback((event, info) => {
    if (!currentVenue || isAnimatingRef.current) { setIsDragging(false); return; }
    const { offset, velocity } = info;

    // Duration is remaining-distance / release-velocity, so the exit continues at
    // roughly the speed the card was already moving instead of a flat velocity-only
    // formula, which collapsed to the floor (and looked like a snap) on fast flicks.
    const exitDuration = (current, target, releaseVelocity) => {
      const remaining = Math.abs(target - current);
      const speed = Math.max(Math.abs(releaseVelocity), 400);
      return Math.min(0.25, Math.max(0.12, remaining / speed));
    };

    if (offset.x > SWIPE_THRESHOLD) {
      // Stop immediately so Framer Motion's drag-release behaviour can't snap toward rest
      x.stop(); y.stop(); opacity.stop();
      const dur = exitDuration(x.get(), 500, velocity.x);
      performAction('right', currentVenue, dur);
    } else if (offset.x < -SWIPE_THRESHOLD) {
      x.stop(); y.stop(); opacity.stop();
      const dur = exitDuration(x.get(), -500, velocity.x);
      performAction('left', currentVenue, dur);
    } else if (offset.y > SWIPE_DOWN_THRESHOLD) {
      x.stop(); y.stop(); opacity.stop();
      const dur = exitDuration(y.get(), 500, velocity.y);
      performAction('down', currentVenue, dur);
    } else if (offset.y < -SWIPE_UP_THRESHOLD) {
      performAction('up', currentVenue);
    } else {
      setIsDragging(false);
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
      animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
    }
  }, [currentVenue, performAction, x, y, opacity]);

  const handleCardBodyTap = useCallback((venue) => {
    if (ratingSheetOpenRef.current) return;
    if (Date.now() < blockCardTapUntilRef.current) return;
    const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
    try { sessionStorage.setItem('whatspot_deck_index', String(currentIndex)); } catch {}
    logEvent('click', {
      venue_id: placeId,
      metadata: { source: 'discovery_feed' },
      ...venueSnapshot(venue),
    });
    navigate(`/venue/${placeId}`, { state: { venue } });
  }, [navigate, currentIndex]);

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

      if (ratingSheetOpen) return;

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
      // Card already advanced before auth modal opened — just save the interaction
      executePending();
    } else if (!open) {
      clearPending();
    }
  }, [isAuthenticated, pendingAction, executePending, clearPending]);

  // Silently advance the card if the user saved the venue from the detail page
  useEffect(() => {
    const handler = (e) => {
      const { placeId } = e.detail || {};
      if (!placeId || !currentVenue) return;
      const currentId = (currentVenue.place_id || currentVenue.google_place_id || '').replace(/^places\//, '');
      if (placeId !== currentId) return;
      try {
        const raw = sessionStorage.getItem('whatspot_skipped_venues');
        const existing = raw ? JSON.parse(raw) : [];
        if (!existing.includes(placeId)) {
          sessionStorage.setItem('whatspot_skipped_venues', JSON.stringify([...existing, placeId]));
        }
      } catch {}
      addClientSkippedId(placeId);
      advanceCard();
    };
    window.addEventListener('whatspot:spot-saved', handler);
    return () => window.removeEventListener('whatspot:spot-saved', handler);
  }, [currentVenue, advanceCard]);

  // Whether to show post-search instructional copy
  const showSearchCopy = !!currentQuery;

  // Merge session-fetched photo URLs into a venue object without mutating it.
  // Only apply override when the venue has no real photos — never downgrade a
  // multi-photo image_urls to a single-photo override (max_photos:1 fetch).
  const enrichVenue = (venue) => {
    if (!venue) return venue;
    const rawId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
    const photosFetchDone = venue.photos_complete === true || (rawId ? photoFetchSettledIds.has(rawId) : true);
    const override = rawId ? venuePhotoOverrides[rawId] : undefined;
    if (!override) return { ...venue, photosFetchDone };
    const existing = venue.image_urls || [];
    const hasRealPhotos = existing.length > 0 && existing[0] !== '/placeholder.svg';
    if (hasRealPhotos) return { ...venue, photosFetchDone };
    return { ...venue, image_urls: override, photosFetchDone };
  };

  // Empty state
  if (!hasMore || venues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <p className="text-lg font-semibold text-foreground">
          {isDiscoveryMode 
            ? "You've explored all the top spots nearby." 
            : "You've seen all the top results for this search."}
        </p>
        <div className="flex gap-3">
          {!isDiscoveryMode && onExpandSearch && (
            <button
              onClick={onExpandSearch}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Show more results
            </button>
          )}
          {isDiscoveryMode && onExpandSearch && (
            <button
              onClick={onExpandSearch}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Explore further
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

  const isCardDimmed = ratingSheetOpen;

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full mx-auto max-w-[calc(100vw-2rem)] sm:max-w-[560px] lg:max-w-[660px]"
      style={{
        height: 'var(--deck-height, 78vh)',
        // DiscoveryCard's own photo zone caps at 520px (see its clamp() height), but
        // --deck-height (Home.jsx) can grow past that on tall desktop viewports since
        // it isn't aware of that cap. Without a ceiling here, the card's h-full root
        // outgrows its actual content and the leftover space collects below the info
        // section (which fills it via flex-1), pushing the Skip button down with a
        // large gap. 520 (max photo height) + ~145 (name/rating/tags content) + ~50
        // (Skip button row + margin) — capped only on desktop; mobile's deck-height
        // formula doesn't exhibit this and isn't touched.
        maxHeight: isMobile ? undefined : '715px',
      }}
    >
      {/* Card area */}
      <div className="relative flex-1 min-h-0">
        {/* Ghost cards */}
        {venues[currentIndex + 2] && (
          <DiscoveryCard venue={venues[currentIndex + 2]} index={currentIndex + 2} isGhost ghostLevel={2} />
        )}
        {venues[currentIndex + 1] && (
          <DiscoveryCard venue={enrichVenue(venues[currentIndex + 1])} index={currentIndex + 1} isGhost ghostLevel={1} />
        )}

        {/* Active card */}
        {currentVenue ? (
          <motion.div
            key={currentVenue.place_id || currentVenue.google_place_id || currentIndex}
            ref={activeCardRef}
            className="absolute inset-0 z-10 touch-none"
            style={{ x, y, opacity }}
            drag={!ratingSheetOpen && !exitDirection}
            dragMomentum={false}
            dragElastic={0.05}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            animate={
              isDragging
                ? undefined
                : exitDirection === 'rated'
                  ? { opacity: 0, y: -100, scale: 0.95 }
                  : isCardDimmed
                    ? { opacity: 0.5, scale: 1 }
                    : { scale: 1 }
            }
            transition={isDragging ? { duration: 0 } : { duration: 0.2 }}
          >
            {/* Swipe overlays */}
            <motion.div
              className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none"
              style={{ opacity: rightOverlayOpacity, background: 'hsla(142, 71%, 45%, 0.2)' }}
            >
              <motion.div style={{ scale: rightIconScale, opacity: rightIconOpacity }}>
                <Heart className="h-10 w-10 text-white fill-white/30" />
              </motion.div>
              <span className="text-2xl font-bold text-white" style={{ textShadow: '0px 1px 3px rgba(0,0,0,0.6)' }}>Interested</span>
            </motion.div>

            <motion.div
              className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none"
              style={{ opacity: leftOverlayOpacity, background: 'hsla(0, 84%, 60%, 0.2)' }}
            >
              <motion.div style={{ scale: leftIconScale, opacity: leftIconOpacity }}>
                <X className="h-10 w-10 text-white" />
              </motion.div>
              <span className="text-2xl font-bold text-white" style={{ textShadow: '0px 1px 3px rgba(0,0,0,0.6)' }}>Not interested</span>
            </motion.div>

            <motion.div
              className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none"
              style={{ opacity: downOverlayOpacity, background: 'hsla(0, 0%, 50%, 0.2)' }}
            >
              <motion.div style={{ scale: downIconScale, opacity: downIconOpacity }}>
                <SkipForward className="h-10 w-10 text-white fill-white/30" />
              </motion.div>
              <span className="text-2xl font-bold text-white" style={{ textShadow: '0px 1px 3px rgba(0,0,0,0.6)' }}>Skip for now</span>
            </motion.div>

            <motion.div
              className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none"
              style={{ opacity: upOverlayOpacity, background: 'hsla(210, 70%, 50%, 0.2)' }}
            >
              <motion.div style={{ scale: upIconScale, opacity: upIconOpacity }}>
                <MapPinCheck className="h-10 w-10 text-white fill-white/30" />
              </motion.div>
              <span className="text-2xl font-bold text-white" style={{ textShadow: '0px 1px 3px rgba(0,0,0,0.6)' }}>Been here</span>
            </motion.div>

            <DiscoveryCard
              venue={enrichVenue(currentVenue)}
              index={currentIndex}
              onDescriptorTap={onDescriptorTap}
              onCardBodyTap={handleCardBodyTap}
              listLabel={listMembershipMap ? listMembershipMap.get((currentVenue?.place_id || currentVenue?.google_place_id || '').replace(/^places\//, '')) ?? null : null}
              onBeenHereClick={() => performAction('up', currentVenue)}
              onFadingChange={handleFadingChange}
            />
          </motion.div>
        ) : hasMore ? (
          /* Rare transient loading gap — pulsing skeleton instead of white */
          <div className="absolute inset-0 z-10 rounded-2xl overflow-hidden">
            <Skeleton className="w-full h-full rounded-2xl" />
          </div>
        ) : null}

        {/* Web-only Left/Right buttons (absolute on card area) */}
        {!isMobile && (
          <>
            <button
              className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border shadow-md hover:bg-destructive/10 transition-colors"
              style={{ left: '-4rem' }}
              onClick={() => performAction('left', currentVenue)}
              onMouseEnter={() => setHoveredButton('left')}
              onMouseLeave={() => setHoveredButton(null)}
              aria-label="Not Interested"
            >
              <ChevronLeft className="h-6 w-6 text-destructive" />
            </button>

            <button
              className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border shadow-md hover:bg-green-500/10 transition-colors"
              style={{ right: '-4rem' }}
              onClick={() => performAction('right', currentVenue)}
              onMouseEnter={() => setHoveredButton('right')}
              onMouseLeave={() => setHoveredButton(null)}
              aria-label="Interested"
            >
              <ChevronRight className="h-6 w-6 text-green-600" />
            </button>

            {/* Hover tint overlay */}
            {hoveredButton && (
              <div
                className={cn(
                  'absolute inset-0 z-[15] rounded-2xl pointer-events-none transition-opacity',
                  hoveredButton === 'right' && 'bg-green-500/5',
                  hoveredButton === 'left' && 'bg-destructive/5',
                  hoveredButton === 'down' && 'bg-muted/10',
                )}
              />
            )}
          </>
        )}
      </div>

      {/* Post-search instructional copy — mobile only (desktop/tablet copy lives in Home.jsx) */}
      {showSearchCopy && isMobile && (
        <p className="mt-3 shrink-0 text-xs text-muted-foreground text-center max-w-[90%] mx-auto pointer-events-none">
          Showing you the best results based on your search. With Whatspot's proprietary algorithm, you only ever see what's most relevant and truly the cream of the crop.
        </p>
      )}

      {/* Bottom — Skip (desktop only, in flow) */}
      {!isMobile && (
        <div className={cn("flex justify-center shrink-0", showSearchCopy ? "mt-2" : "mt-3")}>
          <button
            className="flex items-center justify-center gap-1.5 rounded-full bg-card border border-border shadow-md px-4 py-2 hover:bg-accent transition-colors"
            onClick={() => performAction('down', currentVenue)}
            onMouseEnter={() => setHoveredButton('down')}
            onMouseLeave={() => setHoveredButton(null)}
            aria-label="Skip for now"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Skip for now</span>
          </button>
        </div>
      )}

      {/* Constellations rating sheet */}
      <RatingDialog
        open={ratingSheetOpen}
        onOpenChange={(open) => {
          if (!open) handleRatingCancel();
        }}
        venue={ratingPendingVenue}
        onRate={handleRate}
      />

      {/* Auth modal */}
      <AuthModal open={authModalOpen} onOpenChange={handleAuthClose} />

      {/* Celebratory burst on swipe completion — portal-rendered, see SwipeBurst.jsx */}
      {burst && (
        <SwipeBurst
          direction={burst.direction}
          Icon={BURST_ICON[burst.direction]?.Icon}
          iconClassName={BURST_ICON[burst.direction]?.className}
          origin={burst.origin}
          initialScale={burst.initialScale}
          initialOpacity={burst.initialOpacity}
          onDone={handleBurstDone}
        />
      )}
    </div>
  );
}
