import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useGlobalState } from '@/context/GlobalStateContext';
import HeartButton from '@/components/spots/HeartButton';
import { logEvent } from '@/lib/logEvent';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function MapContent({ results }) {
  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {results.map((v, i) => {
        const lat = v.lat;
        const lng = v.lon ?? v.lng;
        if (lat == null || lng == null) return null;
        return (
          <Marker key={v.name + i} position={[lat, lng]}>
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
  const center = [state.userLocation.lat, state.userLocation.lon];

  if (isLoading) {
    return <div className="h-full w-full rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <MapContainer center={center} zoom={13} className="h-full w-full rounded-xl" scrollWheelZoom>
      <MapContent results={results} />
    </MapContainer>
  );
}
