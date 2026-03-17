import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import HeartButton from '@/components/spots/HeartButton';

const CROSSFADE_INTERVAL = 4000;

// Hardcoded placeholder descriptors until LLM generation is wired
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
}) {
  const navigate = useNavigate();
  const photos = venue?.image_urls?.length > 0 ? venue.image_urls : ['/placeholder.svg'];
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [nextPhoto, setNextPhoto] = useState(null);
  const [isFading, setIsFading] = useState(false);
  const intervalRef = useRef(null);

  // Descriptors: use venue's if present, otherwise pick from placeholders
  const descriptors = venue?.descriptors?.length > 0
    ? venue.descriptors.slice(0, 3)
    : PLACEHOLDER_DESCRIPTORS[index % PLACEHOLDER_DESCRIPTORS.length];

  const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
  const neighbourhood = venue?.address?.split(',').slice(1, 2).join('').trim() || venue?.address || '';

  // Auto-advance photos with crossfade
  useEffect(() => {
    if (isGhost || photos.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setNextPhoto((prev) => {
        const next = ((prev ?? currentPhoto) + 1) % photos.length;
        return next;
      });
      setIsFading(true);
    }, CROSSFADE_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [photos.length, isGhost, currentPhoto]);

  // Complete the crossfade transition
  useEffect(() => {
    if (!isFading || nextPhoto === null) return;
    const timer = setTimeout(() => {
      setCurrentPhoto(nextPhoto);
      setNextPhoto(null);
      setIsFading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [isFading, nextPhoto]);

  // Manual photo navigation
  const goToPhoto = useCallback((direction) => {
    clearInterval(intervalRef.current);
    const next = direction === 'next'
      ? (currentPhoto + 1) % photos.length
      : (currentPhoto - 1 + photos.length) % photos.length;
    setCurrentPhoto(next);
    setNextPhoto(null);
    setIsFading(false);

    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', {
      event: 'photo_advanced',
      venue_id: placeId,
      photo_index: next,
      timestamp: Date.now(),
    });
  }, [currentPhoto, photos.length, placeId]);

  // Handle card body tap (venue info area)
  const handleBodyTap = useCallback(() => {
    if (isGhost) return;
    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', {
      event: 'venue_tapped',
      venue_id: placeId,
      timestamp: Date.now(),
    });
    if (onCardBodyTap) {
      onCardBodyTap(venue);
    } else {
      navigate(`/venue/${placeId}`, { state: { venue } });
    }
  }, [isGhost, placeId, venue, onCardBodyTap, navigate]);

  // Handle descriptor tap
  const handleDescriptorTap = useCallback((tag) => {
    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', {
      event: 'descriptor_tag_tapped',
      venue_id: placeId,
      tag_text: tag,
      timestamp: Date.now(),
    });
    onDescriptorTap?.(tag);
  }, [placeId, onDescriptorTap]);

  // Preload next photos
  useEffect(() => {
    if (isGhost) return;
    photos.slice(0, 3).forEach((src) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      document.head.appendChild(link);
      return () => document.head.removeChild(link);
    });
  }, [photos, isGhost]);

  if (isGhost) {
    const ghostScale = ghostLevel === 1 ? 'scale-[0.95]' : 'scale-[0.90]';
    const ghostOffset = ghostLevel === 1 ? 'translate-y-2' : 'translate-y-4';
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
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-card border border-border shadow-xl flex flex-col">
      {/* Photo zone */}
      <div className="relative flex-1 min-h-0 bg-muted overflow-hidden">
        {/* Current photo */}
        <img
          src={photos[currentPhoto]}
          alt={venue?.name || 'Venue photo'}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-600"
          style={{ opacity: isFading ? 0 : 1 }}
        />
        {/* Next photo (crossfade) */}
        {nextPhoto !== null && (
          <img
            src={photos[nextPhoto]}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-600"
            style={{ opacity: isFading ? 1 : 0 }}
          />
        )}

        {/* Heart button */}
        <div className="absolute top-3 right-3 z-10">
          <HeartButton venue={venue} size="md" />
        </div>

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
      </div>

      {/* Venue info area — tappable to open details */}
      <div
        className="px-4 py-3 cursor-pointer active:bg-accent/50 transition-colors"
        onClick={handleBodyTap}
      >
        <h2 className="text-lg font-bold text-foreground truncate">{venue?.name}</h2>
        <p className="text-sm text-muted-foreground truncate mt-0.5">{neighbourhood}</p>

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
