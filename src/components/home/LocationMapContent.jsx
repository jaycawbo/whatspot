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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <MapEvents onLocationSelected={onLocationSelected} />
      {selectedPos && (
        <Marker position={selectedPos} />
      )}
    </MapContainer>
  );
}
