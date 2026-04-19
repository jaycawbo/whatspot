import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin } from 'lucide-react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { useSpots } from '@/hooks/useSpots';
import HeartButton from '@/components/spots/HeartButton';
import { createPillMarker } from '@/components/map/createPillMarker';
import { logEvent } from '@/lib/logEvent';
import 'leaflet/dist/leaflet.css';

function formatPrice(level) {
  if (!level) return null;
  if (typeof level === 'string' && level.startsWith('$')) return level;
  const n = parseInt(level, 10);
  if (!n || n < 1 || n > 4) return null;
  return '$'.repeat(n);
}

function MapAutoFit({ results }) {
  const map = useMap();
  useEffect(() => {
    if (results.length === 0) return;
    const points = results.map(v => [v.lat, v.lon ?? v.lng]);
    try {
      if (points.length === 1) {
        map.setView(points[0], 15);
      } else {
        map.fitBounds(points, { padding: [50, 50], maxZoom: 15 });
      }
    } catch {}
  }, [results, map]);
  return null;
}

// Re-centers the map on user location when mounted (i.e. when loading starts).
function MapCenterOnUser({ center }) {
  const map = useMap();
  useEffect(() => {
    try { map.setView(center, 14); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const userLocationIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function MapContent({ results, spotsIds, favIds }) {
  const navigate = useNavigate();
  return (
    <>
      <MapAutoFit results={results} />
      {results.map((v, i) => {
        const lat = v.lat;
        const lng = v.lon ?? v.lng;
        if (lat == null || lng == null) return null;
        const icon = createPillMarker(v, { spotsIds, favIds });
        const placeId = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return (
          <Marker key={v.name + i} position={[lat, lng]} icon={icon} eventHandlers={{
            click: () => logEvent('click_map', { venue_id: v.place_id || v.google_place_id }),
          }}>
            <Popup>
              <div className="text-sm min-w-[160px]">
                <div className="flex items-start justify-between gap-2">
                  <strong
                    className="cursor-pointer hover:underline"
                    onClick={() => navigate(`/venue/${placeId}`, { state: { venue: v } })}
                  >{(v.name || '').split('|')[0].trim()}</strong>
                  <HeartButton venue={v} size="sm" />
                </div>
                {(v.rating || formatPrice(v.price_level) || v.distance_km != null) && (
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    {v.rating && (
                      <span className="flex items-center gap-0.5 font-medium text-foreground">
                        <Star className="h-3 w-3 text-gray-500" />
                        {v.rating}
                      </span>
                    )}
                    {formatPrice(v.price_level) && <span>{formatPrice(v.price_level)}</span>}
                    {v.distance_km != null && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {v.distance_km >= 100 ? Math.round(v.distance_km) : parseFloat(v.distance_km.toFixed(1))} km
                      </span>
                    )}
                  </div>
                )}
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

  return (
    <MapContainer center={center} zoom={13} className="h-full w-full rounded-xl" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {isLoading ? (
        <>
          <MapCenterOnUser center={center} />
          <Marker position={center} icon={userLocationIcon} />
        </>
      ) : (
        <MapContent results={results} spotsIds={spotsIds} favIds={favIds} />
      )}
    </MapContainer>
  );
}
