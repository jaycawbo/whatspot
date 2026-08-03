import { useNavigate } from 'react-router-dom';
import { Lock, Unlock, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

// 2x2 photo grid built from up to 4 preview photos (one per venue). When
// fewer than 4 are available, the last photo repeats to fill remaining
// cells; a muted cell fills in when there are none at all.
function TilePhotoGrid({ photoUrls }) {
  const cells = [0, 1, 2, 3].map((i) => photoUrls[i] || photoUrls[photoUrls.length - 1] || null);
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
      {cells.map((url, i) =>
        url ? (
          <img key={i} src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div key={i} className="h-full w-full bg-muted" />
        )
      )}
    </div>
  );
}

export default function ListTile({ tile, onEdit }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/Spots/${tile.slug}`)}
      className="relative aspect-square w-full overflow-hidden rounded-2xl text-left"
    >
      <TilePhotoGrid photoUrls={tile.previewPhotoUrls} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />

      <div className="absolute left-2.5 top-2.5">
        {tile.isPublic ? (
          <Unlock className="h-4 w-4 text-white drop-shadow" />
        ) : (
          <Lock className="h-4 w-4 text-white drop-shadow" />
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onEdit(tile); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onEdit(tile); } }}
        className={cn(
          'absolute right-2.5 top-2.5 rounded-full bg-black/30 p-1.5',
          'hover:bg-black/50 transition-colors'
        )}
        aria-label={`Edit ${tile.name}`}
      >
        <Pencil className="h-3.5 w-3.5 text-white" />
      </div>

      <div className="absolute bottom-2.5 left-2.5 right-2.5">
        <p className="text-sm font-semibold text-white truncate drop-shadow">{tile.name}</p>
        <p className="text-xs text-white/80">{tile.spotCount} spots</p>
      </div>
    </button>
  );
}
