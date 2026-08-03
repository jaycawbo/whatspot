import { useNavigate } from 'react-router-dom';
import { humanizeCategory } from '@/lib/filterOptions';

export default function SharedSpotCard({ spot }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/venue/${spot.google_place_id}`)}
      className="flex gap-3 rounded-xl border border-border bg-card p-3 cursor-pointer hover:bg-accent/50 transition-colors"
    >
      <img
        src={spot.photo_urls?.[0] || '/placeholder.svg'}
        alt=""
        className="h-20 w-20 rounded-lg object-cover shrink-0 bg-muted"
      />
      <div className="flex-1 min-w-0 py-0.5">
        <p className="font-medium text-foreground truncate">{spot.name}</p>
        {spot.address && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{spot.address}</p>
        )}
        {spot.category && (
          <p className="text-xs text-muted-foreground mt-1">{humanizeCategory(spot.category)}</p>
        )}
      </div>
    </div>
  );
}
