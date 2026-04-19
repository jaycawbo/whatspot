import { useState, useCallback } from 'react';
import { useGlobalState } from '@/context/GlobalStateContext';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'WhatSpot/1.0';

function buildNominatimLabel(address) {
  if (!address) return 'Current Location';
  const city = address.city || address.town || address.county;
  const state = address.state;
  const country = address.country;
  return [city, state, country].filter(Boolean).join(', ') || 'Current Location';
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(`${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  return buildNominatimLabel(data.address);
}

const GEO_ERROR_MESSAGES = {
  1: 'Location access denied. Please allow location in your browser settings.',
  2: 'Your position could not be determined.',
  3: 'Location request timed out.',
};

export function useLocation() {
  const { state, dispatch } = useGlobalState();
  const [isDetecting, setIsDetecting] = useState(false);
  const [locationError, setLocationError] = useState(null);

  const currentLocation = {
    label: state.locationName,
    lat: state.userLocation.lat,
    lon: state.userLocation.lon,
  };

  const detectCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setIsDetecting(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let label = 'Current Location';
        try {
          label = await reverseGeocode(latitude, longitude);
        } catch {
          // keep generic label, still save coords
        } finally {
          dispatch({
            type: 'SET_LOCATION',
            payload: {
              name: label,
              coords: { lat: latitude, lon: longitude, isGPS: true, isPinDrop: false, locationType: null },
            },
          });
          setIsDetecting(false);
        }
      },
      (err) => {
        setLocationError(GEO_ERROR_MESSAGES[err.code] || 'Could not detect location.');
        setIsDetecting(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, [dispatch]);

  const setManualLocation = useCallback(
    ({ label, lat, lon }) => {
      dispatch({
        type: 'SET_LOCATION',
        payload: {
          name: label,
          coords: { lat, lon, isGPS: false, isPinDrop: false, locationType: null },
        },
      });
    },
    [dispatch]
  );

  return { currentLocation, detectCurrentLocation, setManualLocation, isDetecting, locationError };
}
