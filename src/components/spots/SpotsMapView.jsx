import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { Trash2, Star } from 'lucide-react';
import { useSpots } from '@/hooks/useSpots';
import { createPillMarker } from '@/components/map/createPillMarker';
import 'leaflet/dist/leaflet.css';

export default function SpotsMapView({ spots: spotsList, center, onRemove }) {
  const { spots: allSpots } = useSpots();

  const { spotsIds, favIds } = useMemo(() => {
    const spotsSet = new Set();
    const favSet = new Set();
    for (const s of allSpots) {
      const id = s.google_place_id;
      spotsSet.add(id);
      if (s.labels?.includes('Favourites')) favSet.add(id);
    }
    return { spotsIds: spotsSet, favIds: favSet };
  }, [allSpots]);

  if (!spotsList.length) {
    return (
      <div className="h-full w-full rounded-xl bg-muted flex items-center justify-center">
        <p className="text-muted-foreground text-sm">No spots to display on map</p>
      </div>
    );
  }

  const mapCenter = center || [spotsList[0]?.lat || 43.65, spotsList[0]?.lng || -79.38];

  return (
    <MapContainer center={mapCenter} zoom={13} className="h-full w-full rounded-xl z-0" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {spotsList.map((spot) =>
        spot.lat && spot.lng ? (
          <Marker
            key={spot.google_place_id}
            position={[spot.lat, spot.lng]}
            icon={createPillMarker(spot, { spotsIds, favIds })}
          >
            <Popup>
              <div className="text-sm space-y-1 min-w-[150px]">
                <strong>{spot.name}</strong>
                <br />
                <span className="text-muted-foreground">{spot.address}</span>
                {spot.rating && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{spot.rating}</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-destructive hover:text-destructive w-full justify-start px-0"
                  onClick={() => onRemove?.(spot.google_place_id)}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Remove
                </Button>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}
