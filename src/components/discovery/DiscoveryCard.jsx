import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import BeenHereButton from '@/components/ui/BeenHereButton';

function formatPrice(level) {
  if (!level) return null;
  if (typeof level === 'string' && level.startsWith('$')) return level;
  const n = parseInt(level, 10);
  if (!n || n < 1 || n > 4) return null;
  return '$'.repeat(n);
}

const CROSSFADE_INTERVAL = 8000;

const PLACEHOLDER_DESCRIPTORS = [
  ['cozy neighbourhood gem', 'creative seasonal menu', 'great for date night'],
  ['lively atmosphere', 'craft cocktails', 'late night bites'],
  ['hidden local favourite', 'wood-fired everything', 'natural wine focus'],
  ['sun-drenched patio', 'farm to table', 'weekend brunch spot'],
  ['candlelit setting', 'handmade pasta daily', 'intimate vibe'],
  ['buzzy open kitchen', 'bold flavour profiles', 'group-friendly'],
  ['minimalist design', 'specialty coffee', 'perfect pastries'],
  ['eclectic decor', 'global street food', 'budget-friendly gem'],
];

export default function DiscoveryCard({
  venue,
  index = 0,
  onDescriptorTap,
  onCardBodyTap,
  isGhost = false,
  ghostLevel = 0,
  listLabel = null,
  onBeenHereClick = null,
  beenHereRating = null,
  onFadingChange = null,
}) {
  const navigate = useNavigate();
  const photos = venue?.image_urls?.length > 0
    ? venue.image_urls
    : venue?._photoUrls?.length > 0
      ? venue._photoUrls
      : ['/placeholder.svg'];
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [nextPhoto, setNextPhoto] = useState(null);
  const [isFading, setIsFading] = useState(false);
  const cardRef = useRef(null);
  const [isInViewport, setIsInViewport] = useState(false);
  const intervalRef = useRef(null);
  const isPausedRef = useRef(false);
  const remainingTimeRef = useRef(CROSSFADE_INTERVAL);
  const lastTickRef = useRef(Date.now());
  const holdStartPosRef = useRef(null);
  const isHoldingRef = useRef(false);
  const HOLD_MOVE_THRESHOLD = 7;

  const descriptors = venue?.descriptors?.length > 0
    ? venue.descriptors.slice(0, 3)
    : PLACEHOLDER_DESCRIPTORS[index % PLACEHOLDER_DESCRIPTORS.length];

  const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
  const neighbourhood = venue?.address?.split(',').slice(1, 2).join('').trim() || venue?.address || '';

  // Auto-advance photos with crossfade — uses remaining time for pause/resume
  const startTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    lastTickRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      const elapsed = Date.now() - lastTickRef.current;
      remainingTimeRef.current -= elapsed;
      lastTickRef.current = Date.now();
      if (remainingTimeRef.current <= 0) {
        remainingTimeRef.current = CROSSFADE_INTERVAL;
        setNextPhoto((prev) => {
          const next = ((prev ?? currentPhoto) + 1) % photos.length;
          return next;
        });
        setIsFading(true);
      }
    }, 100);
  }, [photos.length, currentPhoto]);

  useEffect(() => {
    if (isGhost || photos.length <= 1 || !isInViewport) return;
    remainingTimeRef.current = CROSSFADE_INTERVAL;
    startTimer();
    return () => clearInterval(intervalRef.current);
  }, [photos.length, isGhost, startTimer, isInViewport]);

  // Clamp currentPhoto if photos array shrinks so the index never goes out of bounds
  useEffect(() => {
    if (photos.length > 0 && currentPhoto >= photos.length) {
      setCurrentPhoto(0);
      setNextPhoto(null);
      setIsFading(false);
    }
  }, [photos.length, currentPhoto]);

  // Complete the crossfade transition — no opacity animation on new current photo
  useEffect(() => {
    if (!isFading || nextPhoto === null) return;
    const timer = setTimeout(() => {
      setCurrentPhoto(nextPhoto);
      setNextPhoto(null);
      setIsFading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [isFading, nextPhoto]);

  // Tell the parent when a crossfade starts/ends so it can defer photo-override state updates
  useEffect(() => {
    onFadingChange?.(isFading);
  }, [isFading, onFadingChange]);

  // Hold-to-pause handlers (Fix 5)
  const handlePressStart = useCallback((clientX, clientY) => {
    holdStartPosRef.current = { x: clientX, y: clientY };
    isHoldingRef.current = true;
    isPausedRef.current = true;
  }, []);

  const handlePressMove = useCallback((clientX, clientY) => {
    if (!isHoldingRef.current || !holdStartPosRef.current) return;
    const dx = clientX - holdStartPosRef.current.x;
    const dy = clientY - holdStartPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > HOLD_MOVE_THRESHOLD) {
      // Movement detected — this is a drag, not a hold
      isPausedRef.current = false;
      isHoldingRef.current = false;
      holdStartPosRef.current = null;
    }
  }, []);

  const handlePressEnd = useCallback(() => {
    if (isHoldingRef.current) {
      isPausedRef.current = false;
      lastTickRef.current = Date.now();
    }
    isHoldingRef.current = false;
    holdStartPosRef.current = null;
  }, []);

  // Mouse events
  const onMouseDown = useCallback((e) => handlePressStart(e.clientX, e.clientY), [handlePressStart]);
  const onMouseMove = useCallback((e) => handlePressMove(e.clientX, e.clientY), [handlePressMove]);
  const onMouseUp = useCallback(() => handlePressEnd(), [handlePressEnd]);

  // Touch events
  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    handlePressStart(t.clientX, t.clientY);
  }, [handlePressStart]);
  const onTouchMove = useCallback((e) => {
    const t = e.touches[0];
    handlePressMove(t.clientX, t.clientY);
  }, [handlePressMove]);
  const onTouchEnd = useCallback(() => handlePressEnd(), [handlePressEnd]);

  // Manual photo navigation
  const goToPhoto = useCallback((direction) => {
    clearInterval(intervalRef.current);
    isPausedRef.current = false;
    const next = direction === 'next'
      ? (currentPhoto + 1) % photos.length
      : (currentPhoto - 1 + photos.length) % photos.length;
    setCurrentPhoto(next);
    setNextPhoto(null);
    setIsFading(false);
    remainingTimeRef.current = CROSSFADE_INTERVAL;
    startTimer();
  }, [currentPhoto, photos.length, placeId, startTimer]);

  // Handle card body tap
  const handleBodyTap = useCallback(() => {
    if (isGhost) return;
    if (onCardBodyTap) {
      onCardBodyTap(venue);
    } else {
      navigate(`/venue/${placeId}`, { state: { venue } });
    }
  }, [isGhost, placeId, venue, onCardBodyTap, navigate]);

  // Handle descriptor tap
  const handleDescriptorTap = useCallback((tag) => {
    onDescriptorTap?.(tag);
  }, [placeId, onDescriptorTap]);

  // Load photos only when card enters the visible viewport — fire once, then disconnect
  useEffect(() => {
    if (isGhost) return;
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isGhost]);

  if (isGhost) {
    const ghostScale = ghostLevel === 1 ? 'scale-[0.95]' : 'scale-[0.90]';
    const ghostOffset = ghostLevel === 1 ? 'translate-y-[10px]' : 'translate-y-[20px]';
    return (
      <div
        className={cn(
          'absolute inset-0 rounded-2xl overflow-hidden bg-muted border border-border shadow-lg pointer-events-none transition-transform',
          ghostScale,
          ghostOffset,
        )}
        style={{ zIndex: -ghostLevel }}
      >
        <div className="h-full w-full bg-muted">
          {photos[0] && photos[0] !== '/placeholder.svg' && (
            <img
              src={photos[0]}
              alt=""
              className="h-full w-full object-cover opacity-40"
              loading="lazy"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef} className="relative w-full h-full rounded-2xl overflow-hidden bg-card border border-border shadow-xl flex flex-col">
      {/* Photo zone */}
      <div
        className="relative bg-muted overflow-hidden"
        style={{ height: 'clamp(200px, calc(var(--deck-height, 78dvh) * 0.65), 520px)' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {isInViewport ? (
          <>
            {/* Current photo — no transition, always full opacity when not fading out */}
            <img
              src={photos[currentPhoto]}
              alt={venue?.name || 'Venue photo'}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: isFading ? 0 : 1,
                transition: isFading ? 'opacity 600ms ease' : 'none',
              }}
            />
            {/* Next photo (crossfade in) */}
            {nextPhoto !== null && (
              <img
                src={photos[nextPhoto]}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  opacity: isFading ? 1 : 0,
                  transition: isFading ? 'opacity 600ms ease' : 'none',
                }}
              />
            )}

            {/* Spots list membership badge */}
            {listLabel && (
              <div className={cn('absolute top-3 z-10 pointer-events-none', onBeenHereClick ? 'left-3' : 'right-3')}>
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-black/55 text-white backdrop-blur-sm">
                  {listLabel}
                </span>
              </div>
            )}

            {/* Been here button */}
            {!isGhost && onBeenHereClick && (
              <div className="absolute top-3 right-3 z-20">
                <BeenHereButton rating={beenHereRating} onClick={onBeenHereClick} />
              </div>
            )}

            {/* Dot indicators */}
            {photos.length > 1 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {photos.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === (nextPhoto ?? currentPhoto)
                        ? 'w-4 bg-background'
                        : 'w-1.5 bg-background/50'
                    )}
                  />
                ))}
              </div>
            )}

            {/* Invisible tap regions for photo navigation */}
            <div className="absolute inset-0 flex z-[5]">
              <button
                className="flex-1 cursor-default"
                onClick={() => goToPhoto('prev')}
                aria-label="Previous photo"
              />
              <button
                className="flex-1 cursor-default"
                onClick={() => goToPhoto('next')}
                aria-label="Next photo"
              />
            </div>
          </>
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
      </div>

      {/* Venue info area — tappable to open details */}
      <div
        className="px-4 py-3 flex-1 cursor-pointer active:bg-accent/50 transition-colors"
        onClick={handleBodyTap}
      >
        <h2 className="text-lg font-bold text-foreground truncate">{(venue?.name || '').split('|')[0].trim()}</h2>

        {/* Metadata row: rating, price, distance */}
        {(venue?.rating || formatPrice(venue?.price_level) || venue?.distance_km != null) && (
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
            {venue?.rating && (
              <span className="flex items-center gap-0.5 font-medium text-foreground">
                <Star className="h-3.5 w-3.5 text-gray-500" />
                {venue.rating}
              </span>
            )}
            {formatPrice(venue?.price_level) && (
              <span>{formatPrice(venue.price_level)}</span>
            )}
            {venue?.distance_km != null && (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {venue.distance_km >= 100
                  ? Math.round(venue.distance_km)
                  : parseFloat(venue.distance_km.toFixed(1))} km
              </span>
            )}
          </div>
        )}

        {/* Descriptor pills */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {descriptors.map((tag) => (
            <button
              key={tag}
              onClick={(e) => {
                e.stopPropagation();
                handleDescriptorTap(tag);
              }}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-accent transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
