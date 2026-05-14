import { useState, useCallback } from 'react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { reverseGeocode } from '@/lib/reverseGeocode';

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
