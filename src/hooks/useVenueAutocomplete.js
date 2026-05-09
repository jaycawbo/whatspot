import { useState, useEffect, useRef, useCallback } from 'react';
import { classifySearchInput } from '@/lib/classifySearchInput';
import { autocompleteVenues, resolveVenueSelection } from '@/services/placesSearch';

const SEARCH_ENABLED = import.meta.env.VITE_GOOGLE_PLACES_SEARCH_ENABLED === 'true';
const DEBOUNCE_MS = 250;
const SESSION_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Manages venue autocomplete for the direct search path.
 *
 * Session token lifecycle:
 *   - Created on input focus (onSearchFocus) or lazily on first keystroke
 *   - Discarded without an API call after 3 min of inactivity (abandoned session)
 *   - Closed via a Place Details call inside resolveVenueSelection on selection
 *
 * @param {string}      query           raw (un-debounced) query from the search input
 * @param {object|null} userCoordinates { lat, lon|lng } for location bias
 * @returns {{ suggestions, onSearchFocus, selectSuggestion }}
 */
export function useVenueAutocomplete(query, userCoordinates) {
  const [suggestions, setSuggestions] = useState([]);

  const sessionTokenRef = useRef(null);
  const sessionStartRef = useRef(null);

  // Extract primitives so the effect deps don't react to object identity changes.
  const lat = userCoordinates?.lat ?? null;
  const lng = userCoordinates?.lon ?? userCoordinates?.lng ?? null;

  const getOrCreateSessionToken = useCallback(() => {
    if (sessionTokenRef.current && sessionStartRef.current) {
      if (Date.now() - sessionStartRef.current > SESSION_TTL_MS) {
        // Abandoned — discard silently (no closing Place Details call per spec).
        sessionTokenRef.current = null;
        sessionStartRef.current = null;
      }
    }
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = crypto.randomUUID();
      sessionStartRef.current = Date.now();
    }
    return sessionTokenRef.current;
  }, []);

  const onSearchFocus = useCallback(() => {
    if (!SEARCH_ENABLED) return;
    sessionTokenRef.current = crypto.randomUUID();
    sessionStartRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!SEARCH_ENABLED || !query || query.length < 2 || classifySearchInput(query) !== 'direct') {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const token = getOrCreateSessionToken();
      try {
        const results = await autocompleteVenues(query, token, lat, lng);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, lat, lng, getOrCreateSessionToken]);

  const selectSuggestion = useCallback(async (suggestion) => {
    const placeId = suggestion?.placePrediction?.placeId;
    if (!placeId) return null;

    // Capture token before invalidating — resolveVenueSelection needs it for session close.
    const token = sessionTokenRef.current;
    sessionTokenRef.current = null;
    sessionStartRef.current = null;
    setSuggestions([]);

    return resolveVenueSelection(placeId, token);
  }, []);

  return { suggestions, onSearchFocus, selectSuggestion };
}
