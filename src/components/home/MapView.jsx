import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useGlobalState } from '@/context/GlobalStateContext';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function MapView({ results, isLoading }) {
  const { state } = useGlobalState();
  const center = [state.userLocation.lat, state.userLocation.lon];

  if (isLoading) {
    return <div className="h-full w-full rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <MapContainer center={center} zoom={13} className="h-full w-full rounded-xl" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {results.map((v, i) => (
        <Marker key={v.name + i} position={[v.lat, v.lon]}>
          <Popup>
            <div className="text-sm">
              <strong>{v.name}</strong>
              <br />
              {v.address}
              {v.rating && <><br />⭐ {v.rating}</>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
