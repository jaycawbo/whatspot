import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useGlobalState } from '@/context/GlobalStateContext';
import { useSpots } from '@/hooks/useSpots';
import HeartButton from '@/components/spots/HeartButton';
import { createPillMarker } from '@/components/map/createPillMarker';
import { logEvent } from '@/lib/logEvent';
import 'leaflet/dist/leaflet.css';

function MapContent({ results, spotsIds, favIds }) {
  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {results.map((v, i) => {
        const lat = v.lat;
        const lng = v.lon ?? v.lng;
        if (lat == null || lng == null) return null;
        const icon = createPillMarker(v, { spotsIds, favIds });
        return (
          <Marker key={v.name + i} position={[lat, lng]} icon={icon} eventHandlers={{
            click: () => logEvent('click_map', { venue_id: v.place_id || v.google_place_id }),
          }}>
            <Popup>
              <div className="text-sm min-w-[160px]">
                <div className="flex items-start justify-between gap-2">
                  <strong>{v.name}</strong>
                  <HeartButton venue={v} size="sm" />
                </div>
                <span className="text-muted-foreground">{v.address}</span>
                {v.rating && <div className="mt-1">⭐ {v.rating}</div>}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default function MapView({ results, isLoading }) {
  const { state } = useGlobalState();
  const { spots } = useSpots();
  const center = [state.userLocation.lat, state.userLocation.lon];

  const { spotsIds, favIds } = useMemo(() => {
    const spotsSet = new Set();
    const favSet = new Set();
    for (const s of spots) {
      const id = s.google_place_id;
      spotsSet.add(id);
      if (s.labels?.includes('Favourites')) favSet.add(id);
    }
    return { spotsIds: spotsSet, favIds: favSet };
  }, [spots]);

  if (isLoading) {
    return <div className="h-full w-full rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <MapContainer center={center} zoom={13} className="h-full w-full rounded-xl" scrollWheelZoom>
      <MapContent results={results} spotsIds={spotsIds} favIds={favIds} />
    </MapContainer>
  );
}
