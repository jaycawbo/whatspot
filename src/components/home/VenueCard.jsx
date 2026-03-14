import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import HeartButton from '@/components/spots/HeartButton';
import { logEvent } from '@/lib/logEvent';

export default function VenueCard({ venue, index, currentQuery }) {
  const cardRef = useRef(null);

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
  const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');

  const handleClick = () => {
    if (!placeId) return;
    navigate(`/venue/${placeId}`, { state: { venue } });
  };
  const imgUrl = venue.image_urls?.[0] || '/placeholder.svg';

  return (
    <div onClick={handleClick} className="relative flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="relative shrink-0">
        <img
          src={imgUrl}
          alt={venue.name}
          className="h-24 w-24 rounded-lg object-cover bg-muted"
          loading="lazy"
        />
        <div className="absolute top-1 right-1">
          <HeartButton venue={venue} size="sm" />
        </div>
      </div>
      <div className="flex flex-col min-w-0 flex-1 justify-between py-0.5">
        <div>
          <h3 className="font-semibold text-sm text-foreground truncate">{venue.name}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {venue.address}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          {venue.rating && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {venue.rating}
            </span>
          )}
          {venue.price_level && (
            <span className="text-xs text-muted-foreground">{venue.price_level}</span>
          )}
          {venue.cuisine_type && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
              {venue.cuisine_type}
            </span>
          )}
          {venue.distance_km != null && (
            <span className="text-[10px] text-muted-foreground">
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
      </div>
    </div>
  );
}
