import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logEvent } from '@/lib/logEvent';
import BeenHereButton from '@/components/ui/BeenHereButton';
import RatingDialog from '@/components/discovery/RatingDialog';
import { useSpots } from '@/hooks/useSpots';
import { useBronco } from '@/context/BroncoContext';
import { useBroncoSpotLists } from '@/hooks/useBroncoSpotLists';
import { supabase } from '@/integrations/supabase/client';

const RATING_TAP_BLOCK_MS = 500;

// Module-level tracker so all VenueCard instances share a per-search photo-fetch cap
const _photoFetchTracker = { key: null, count: 0 };

function formatPrice(level) {
  if (!level) return null;
  if (typeof level === 'string' && level.startsWith('$')) return level;
  const n = parseInt(level, 10);
  if (!n || n < 1 || n > 4) return null;
  return '$'.repeat(n);
}

export default function VenueCard({ venue, index, currentQuery }) {
  const cardRef = useRef(null);
  const { getBeenHereRating, saveBeenHere, isAuthenticated } = useSpots();
  const { openRequestModal } = useBronco();
  const { lists, savedIds, saveVenue, removeVenue } = useBroncoSpotLists();
  const isSaved = venue.id ? savedIds.has(venue.id) : false;
  const [ratingSheetOpen, setRatingSheetOpen] = useState(false);
  const ratingDialogOpenRef = useRef(false);

  const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
  const beenHereRating = getBeenHereRating(placeId);
  const [livePhotoUrl, setLivePhotoUrl] = useState(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          logEvent('view', {
            venue_id: venue.place_id || venue.google_place_id,
            search_query: currentQuery,
            position_in_results: index,
          });
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [venue.place_id, venue.google_place_id, currentQuery, index]);

  const navigate = useNavigate();

  const handleClick = () => {
    if (ratingDialogOpenRef.current) return;
    if (!placeId) return;
    navigate(`/venue/${placeId}`, { state: { venue } });
  };

  const handleBeenHereClick = () => {
    ratingDialogOpenRef.current = true;
    setRatingSheetOpen(true);
  };

  const handleRatingOpenChange = (open) => {
    if (!open) setTimeout(() => { ratingDialogOpenRef.current = false; }, RATING_TAP_BLOCK_MS);
    setRatingSheetOpen(open);
  };

  const handleRate = async (rating) => {
    try {
      await saveBeenHere({ venue, rating });
    } catch (e) {
      console.error('Failed to save been here:', e);
    }
  };

  const rawPhotoUrl = venue.image_urls?.[0] || venue._photoUrls?.[0] || venue.photo_urls?.[0] || null;
  const imgUrl = livePhotoUrl || rawPhotoUrl || '/placeholder.svg';

  // When no photo is available, call get-place-photos (cache-first — covers back-nav and
  // first-time fetch for search results). Capped at 10 calls per search to control API cost.
  useEffect(() => {
    if (rawPhotoUrl || livePhotoUrl || !placeId) return;
    const key = currentQuery || '';
    if (key !== _photoFetchTracker.key) {
      _photoFetchTracker.key = key;
      _photoFetchTracker.count = 0;
    }
    if (_photoFetchTracker.count >= 10) return;
    _photoFetchTracker.count++;
    supabase.functions
      .invoke('get-place-photos', { body: { place_id: placeId, max_photos: 4 } })
      .then(({ data }) => {
        if (data?.photo_urls?.[0]) setLivePhotoUrl(data.photo_urls[0]);
      })
      .catch(() => {});
  }, [placeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAvailable = venue.is_available === true;
  const avgResponseMin = venue.avg_response_sec != null
    ? Math.max(1, Math.round(venue.avg_response_sec / 60))
    : null;

  const handleRequestWalkIn = (e) => {
    e.stopPropagation();
    openRequestModal(venue);
  };

  const handleToggleSave = (e) => {
    e.stopPropagation();
    if (!venue.id) return;
    if (isSaved) {
      const containing = lists.find((l) => l.items.some((i) => i.venue_id === venue.id));
      if (containing) removeVenue(venue, containing.id);
    } else {
      const defaultList = lists[0];
      if (defaultList) {
        saveVenue(venue, defaultList.id);
      }
    }
  };

  return (
    <div ref={cardRef} onClick={handleClick} className="relative flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="relative shrink-0">
        <img
          src={imgUrl}
          alt={venue.name}
          className="h-24 w-24 rounded-lg object-cover bg-muted"
          loading="lazy"
        />
        <div className="absolute top-1 right-1 flex flex-col gap-1">
          <BeenHereButton
            rating={beenHereRating}
            onClick={handleBeenHereClick}
          />
          {venue.id && lists.length > 0 && (
            <button
              onClick={handleToggleSave}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 shadow-sm backdrop-blur-sm"
              aria-label={isSaved ? 'Remove from spot list' : 'Save to spot list'}
            >
              {isSaved
                ? <BookmarkCheck className="h-3.5 w-3.5 text-[#22c55e]" />
                : <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
              }
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col min-w-0 flex-1 justify-between py-0.5">
        <div>
          <h3 className="font-semibold text-sm text-foreground truncate">{(venue.name || '').split('|')[0].trim()}</h3>
          {venue.why_recommended && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{venue.why_recommended}</p>
          )}
          {isAvailable && (
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#22c55e] shrink-0" />
                <span className="text-xs font-medium text-[#16a34a]">Accepting walk-in requests now</span>
              </div>
              {avgResponseMin !== null && (
                <p className="text-[11px] text-muted-foreground pl-3.5">
                  Usually responds in ~{avgResponseMin} min
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          {venue.rating && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
              <Star className="h-3 w-3 text-gray-500" />
              {venue.rating}
            </span>
          )}
          {formatPrice(venue.price_level) && (
            <span className="text-xs text-muted-foreground">{formatPrice(venue.price_level)}</span>
          )}
          {venue.cuisine_type && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
              {venue.cuisine_type}
            </span>
          )}
          {venue.distance_km != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {venue.distance_km >= 100
                ? Math.round(venue.distance_km)
                : parseFloat(venue.distance_km.toFixed(1))} km
            </span>
          )}
          {venue.descriptors?.length > 0 && venue.descriptors.slice(0, 2).map((d) => (
            <span key={d} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
              {d}
            </span>
          ))}
        </div>
        {isAvailable && (
          <button
            onClick={handleRequestWalkIn}
            className="mt-2 self-start rounded-full bg-[#22c55e] px-3 py-1 text-xs font-semibold text-white hover:bg-[#16a34a] transition-colors"
          >
            Request Walk-In
          </button>
        )}
      </div>
      <RatingDialog
        open={ratingSheetOpen}
        onOpenChange={handleRatingOpenChange}
        venue={venue}
        onRate={handleRate}
      />
    </div>
  );
}
