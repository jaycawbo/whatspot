import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Search } from 'lucide-react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { useSpots } from '@/hooks/useSpots';
import { useIsMobile } from '@/hooks/use-mobile';
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

// Tracks meaningful map movement after a search settles and calls callbacks via refs.
// Refs prevent stale closures in the useMapEvents handler across re-renders.
function MapMoveTracker({ onMovedRef, onResetRef, isLoading }) {
  const anchorRef = useRef(null);
  const prevLoadingRef = useRef(isLoading);

  const map = useMapEvents({
    moveend() {
      const center = map.getCenter();
      if (anchorRef.current === null) {
        // First moveend after a search cycle (MapAutoFit settling) — just anchor.
        anchorRef.current = center;
        return;
      }
      const dist = map.distance(anchorRef.current, center);
      if (dist < 200) return;
      onMovedRef.current(center);
    },
  });

  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;

    if (isLoading) {
      // Search started: null anchor so next moveend (MapAutoFit) is silently consumed.
      anchorRef.current = null;
      onResetRef.current();
    } else if (wasLoading) {
      // Search just completed. If no moveend fired (empty results, no MapAutoFit),
      // set anchor directly so the first user pan correctly triggers the button.
      if (anchorRef.current === null) {
        try { anchorRef.current = map.getCenter(); } catch {}
      }
    }
  }, [isLoading, map, onResetRef]);

  useEffect(() => {
    anchorRef.current = map.getCenter();
  }, [map]);

  return null;
}

function SearchFromHereButton({ onClick, isMobile }) {
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-[500] ${
        isMobile ? 'top-[120px]' : 'top-4'
      }`}
    >
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-sm font-medium text-gray-800 shadow-lg border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all"
      >
        <Search className="h-4 w-4 shrink-0" />
        Search from here
      </button>
    </div>
  );
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

export default function MapView({ results, isLoading, onSearchFromHere }) {
  const { state } = useGlobalState();
  const { spots } = useSpots();
  const isMobile = useIsMobile();
  const center = [state.userLocation.lat, state.userLocation.lon];

  const [hasMoved, setHasMoved] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);

  // Stable refs so MapMoveTracker's event handler never captures stale callbacks.
  const onMovedRef = useRef(null);
  onMovedRef.current = useCallback((c) => {
    setHasMoved(true);
    setMapCenter(c);
  }, []);

  const onResetRef = useRef(null);
  onResetRef.current = useCallback(() => setHasMoved(false), []);

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
    <div className="relative h-full w-full">
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
        {onSearchFromHere && (
          <MapMoveTracker
            onMovedRef={onMovedRef}
            onResetRef={onResetRef}
            isLoading={isLoading}
          />
        )}
      </MapContainer>
      {hasMoved && !isLoading && onSearchFromHere && (
        <SearchFromHereButton
          isMobile={isMobile}
          onClick={() => {
            setHasMoved(false);
            onSearchFromHere(mapCenter.lat, mapCenter.lng);
          }}
        />
      )}
    </div>
  );
}
