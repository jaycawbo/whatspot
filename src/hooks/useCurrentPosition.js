import { useEffect, useState } from 'react';

// One-shot browser geolocation. Returns { lat, lon } or null (denied, unavailable, pending).
// No paid API calls; silent on failure.
export default function useCurrentPosition() {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelled) setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
    return () => { cancelled = true; };
  }, []);

  return position;
}
