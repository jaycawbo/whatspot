import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function SpotCard({ spot, onRemove }) {
  const navigate = useNavigate();
  const placeId = spot.google_place_id || '';

  const handleClick = () => {
    if (!placeId) return;
    navigate(`/venue/${placeId}`, { state: { venue: spot } });
  };
  const imgUrl = spot.photo_url || '/placeholder.svg';

  return (
    <div onClick={handleClick} className="flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
      <img
        src={imgUrl}
        alt={spot.name}
        className="h-20 w-20 rounded-lg object-cover shrink-0 bg-muted"
        loading="lazy"
      />
      <div className="flex flex-col min-w-0 flex-1 justify-between py-0.5">
        <div>
          <h3 className="font-semibold text-sm text-foreground truncate">{spot.name}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {spot.address}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          {spot.rating && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {spot.rating}
            </span>
          )}
          {spot.labels?.map((label) => (
            <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0">
              {label}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex items-start">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(spot.google_place_id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
