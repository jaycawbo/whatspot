import React from 'react';
import { Star, MapPin, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function VenueCard({ venue }) {
  const imgUrl = venue.image_urls?.[0] || '/placeholder.svg';

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow">
      <img
        src={imgUrl}
        alt={venue.name}
        className="h-24 w-24 rounded-lg object-cover shrink-0 bg-muted"
        loading="lazy"
      />
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
            <span className="text-[10px] text-muted-foreground">{venue.distance_km} km</span>
          )}
          <span
            className={cn(
              'flex items-center gap-0.5 text-[10px] font-medium',
              venue.is_open_now ? 'text-green-600' : 'text-destructive'
            )}
          >
            <Clock className="h-2.5 w-2.5" />
            {venue.is_open_now ? 'Open' : 'Closed'}
          </span>
        </div>
      </div>
    </div>
  );
}
