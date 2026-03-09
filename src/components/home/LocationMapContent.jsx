import React from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function MapEvents({ onLocationSelected }) {
  useMapEvents({
    click(e) {
      onLocationSelected(e.latlng);
    },
  });
  return null;
}

export default function LocationMapContent({ center, selectedPos, onLocationSelected }) {
  return (
    <MapContainer 
      center={center} 
      zoom={13} 
      className="w-full h-full"
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapEvents onLocationSelected={onLocationSelected} />
      {selectedPos && (
        <Marker position={selectedPos} />
      )}
    </MapContainer>
  );
}
