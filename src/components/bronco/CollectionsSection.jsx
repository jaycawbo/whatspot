import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollections } from '@/hooks/useCollections';
import { useBronco } from '@/context/BroncoContext';

// ── Compact card ────────────────────────────────────────────────────────────

function CompactVenueCard({ venue }) {
  const navigate = useNavigate();
  const { openRequestModal } = useBronco();
  const [imgReady, setImgReady] = useState(false);

  const placeId = (venue.google_place_id || '').replace(/^places\//, '');
  const avgResponseMin = venue.avg_response_sec != null
    ? Math.max(1, Math.round(venue.avg_response_sec / 60))
    : null;
  const photoUrl = venue.photo_urls?.[0];

  const handleRequestWalkIn = (e) => {
    e.stopPropagation();
    openRequestModal(venue);
  };

  const handleCardClick = () => {
    if (placeId) navigate(`/venue/${placeId}`, { state: { venue } });
  };

  return (
    <div
      onClick={handleCardClick}
      className="flex-shrink-0 w-40 rounded-xl border border-border bg-card overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="relative">
        {photoUrl ? (
          <>
            <img
              src={photoUrl}
              alt={venue.name}
              className="h-28 w-full object-cover"
              loading="lazy"
              onLoad={() => setImgReady(true)}
              onError={() => setImgReady(true)}
            />
            {!imgReady && (
              <>
                <div className="absolute inset-0 animate-pulse bg-muted-foreground/25" />
                <div className="absolute inset-0 shimmer-sweep" />
              </>
            )}
          </>
        ) : (
          <div className="h-28 w-full bg-muted" />
        )}
        {venue.is_available && (
          <span className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full bg-[#22c55e] ring-2 ring-white" />
        )}
      </div>

      <div className="p-2.5 flex flex-col gap-1.5">
        <p className="text-xs font-semibold leading-tight line-clamp-2">
          {(venue.name || '').split('|')[0].trim()}
        </p>
        {avgResponseMin !== null && (
          <p className="text-[10px] text-muted-foreground">~{avgResponseMin} min response</p>
        )}
        {venue.is_available && (
          <button
            onClick={handleRequestWalkIn}
            className="mt-0.5 w-full rounded-full bg-[#22c55e] py-1 text-[10px] font-semibold text-white hover:bg-[#16a34a] transition-colors"
          >
            Request Walk-In
          </button>
        )}
      </div>
    </div>
  );
}

// ── Single collection row ───────────────────────────────────────────────────

function CollectionRow({ collection }) {
  return (
    <div className="mb-4">
      <div className="px-4 mb-2">
        <h3 className="text-sm font-semibold text-foreground">{collection.title}</h3>
        {collection.subtitle && (
          <p className="text-xs text-muted-foreground">{collection.subtitle}</p>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {collection.venues.map((venue) => (
          <CompactVenueCard key={venue.id} venue={venue} />
        ))}
      </div>
    </div>
  );
}

// ── Section (entry point) ───────────────────────────────────────────────────

export default function CollectionsSection() {
  const { collections, isLoading } = useCollections();

  if (isLoading || collections.length === 0) return null;

  return (
    <div className="w-full overflow-hidden">
      {collections.map((col) => (
        <CollectionRow key={col.id} collection={col} />
      ))}
    </div>
  );
}
