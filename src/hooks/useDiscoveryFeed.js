import { useState, useCallback, useRef, useEffect } from 'react';
import { recommend } from '@/services/api';
import { useGlobalState } from '@/context/GlobalStateContext';
import { supabase } from '@/integrations/supabase/client';

const TORONTO_ANCHORS = [
  { lat: 43.6532, lon: -79.3832 }, // center
  { lat: 43.6622, lon: -79.3832 }, // north
  { lat: 43.6442, lon: -79.3832 }, // south
  { lat: 43.6532, lon: -79.3703 }, // east
  { lat: 43.6532, lon: -79.3961 }, // west
  { lat: 43.6586, lon: -79.3739 }, // northeast
  { lat: 43.6478, lon: -79.3739 }, // southeast
  { lat: 43.6478, lon: -79.3925 }, // southwest
  { lat: 43.6586, lon: -79.3925 }, // northwest
];

// Relative offsets (~1km spacing) applied to user's actual location for broad-area rotation.
// Keeps variety without hardcoding Toronto as the center of the world.
const ANCHOR_OFFSETS = [
  { dlat: 0,       dlon: 0 },
  { dlat: 0.009,   dlon: 0 },
  { dlat: -0.009,  dlon: 0 },
  { dlat: 0,       dlon: 0.0129 },
  { dlat: 0,       dlon: -0.0129 },
  { dlat: 0.0054,  dlon: 0.0093 },
  { dlat: -0.0054, dlon: 0.0093 },
  { dlat: -0.0054, dlon: -0.0093 },
  { dlat: 0.0054,  dlon: -0.0093 },
];

const RADIUS_RINGS = [2, 4, 6, 8, 10, 12];
const MAX_CRITERIA_PASS = 7;

/**
 * Hook that manages the discovery feed state:
 * - Fetches nearby venues on mount (discovery mode)
 * - Handles search-driven feed refresh
 * - Manages radius expansion for "expand search area"
 * - Tracks reserve venues and seen/skipped IDs
 */
const FEED_CACHE_KEY = 'whatspot_feed_cache';

function saveFeedCache(data) {
  try {
    sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
    const venueIdStr = (data.venues || [])
      .map(v => (v.place_id || v.google_place_id || '').replace(/^places\//, ''))
      .join(',');
    sessionStorage.setItem('whatspot_deck_venue_ids', venueIdStr);
  } catch {}
}

function loadFeedCache() {
  try {
    const raw = sessionStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cache valid for 30 minutes
    if (Date.now() - parsed.ts > 30 * 60 * 1000) {
      sessionStorage.removeItem(FEED_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

// Module-level session state — survives component unmount/remount (SPA back-navigation).
// Using module scope (not sessionStorage) guarantees reliability regardless of storage quota.
let _sessionAnchor = null;    // anchor point, avoids DB round-trip on back-nav remount
let _sessionFetchedAt = 0;    // timestamp of last successful fetchFeed; 0 = never fetched
let _sessionVenues = null;    // in-memory venue fallback when sessionStorage cache fails
let _suppressPrefetchUntilInteraction = false; // blocks prefetch on back-nav until first swipe
let _isBackNav = false; // true from mount until first swipe when restoring a session
// Client-initiated skips (down-swipe) — ensures API exclude_ids covers them even if
// allServedIdsRef is re-seeded from cache (e.g., after back-nav).
const _clientSkippedIds = new Set();

const SESSION_TTL_MS = 30 * 60 * 1000;

function isSessionFresh() {
  return _sessionFetchedAt > 0 && Date.now() - _sessionFetchedAt < SESSION_TTL_MS;
}

// Called by DiscoveryDeck on first swipe — clears all back-nav suppression flags.
export function signalUserInteraction() {
  _suppressPrefetchUntilInteraction = false;
  _isBackNav = false;
}

// Called by DiscoveryDeck on down-swipe — ensures the ID is excluded from future API
// calls even after back-nav when allServedIdsRef is re-seeded from cache.
export function addClientSkippedId(id) {
  if (id) _clientSkippedIds.add(id);
}

// ─── Tab feed helpers ──────────────────────────────────────────────────────────

/**
 * Cuisine type → price_level integer map for filter queries.
 * Maps FilterDialog price chips ('$' etc.) to the integer stored in the DB.
 */
const PRICE_CHIP_TO_INT = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };

const WALKIN_BAR_TYPES = new Set(['bar', 'pub', 'cocktail_bar', 'wine_bar', 'brewery', 'tavern']);

function getTorontoHourAndDay() {
  const now = new Date();
  const dayStr = now.toLocaleDateString('en-US', { timeZone: 'America/Toronto', weekday: 'short' });
  const hourStr = now.toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: '2-digit', hour12: false });
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(hourStr.split(':')[0], 10);
  if (hour === 24) hour = 0;
  return { hour, day: weekdayMap[dayStr] ?? 1 };
}

function computeInlineWalkinScore(venue) {
  const { hour, day } = getTorontoHourAndDay();
  const isWeekday = day >= 1 && day <= 4;
  const isWeekend = day === 5 || day === 6;
  let timeScore;
  if (isWeekday) {
    if (hour >= 11 && hour <= 14) timeScore = 27;
    else if (hour >= 17 && hour <= 19) timeScore = 25;
    else if (hour >= 21) timeScore = 15;
    else timeScore = 18;
  } else if (isWeekend) {
    if (hour >= 11 && hour <= 14) timeScore = 22;
    else if (hour >= 18 && hour <= 21) timeScore = 5;
    else if (hour >= 22) timeScore = 12;
    else timeScore = 10;
  } else {
    if (hour >= 10 && hour <= 14) timeScore = 20;
    else if (hour >= 17 && hour <= 20) timeScore = 14;
    else timeScore = 12;
  }
  const pl = venue.price_level;
  const priceScore = pl === 1 ? 8 : pl === 2 ? 10 : pl === 3 ? 7 : pl === 4 ? 4 : 6;
  const rc = venue.review_count ?? 0;
  const seatScore = rc < 100 ? 5 : rc < 300 ? 12 : rc < 700 ? 18 : 20;
  const types = venue.types ?? [];
  const typeModifier = types.some((t) => WALKIN_BAR_TYPES.has(t)) ? 10
    : (types.includes('fine_dining') || types.includes('fine_dining_restaurant')) ? -15
    : 0;
  const primaryType = types[0] ?? '';
  const isRestaurant = primaryType.endsWith('_restaurant') || primaryType === 'restaurant';
  const isBar = types.some((t) => WALKIN_BAR_TYPES.has(t));
  const restaurantPeakPenalty = (isRestaurant && !isBar && (day === 0 || day === 5 || day === 6) && hour >= 17 && hour <= 21) ? -10 : 0;
  return Math.min(100, Math.max(0, 20 + timeScore + priceScore + seatScore + typeModifier + restaurantPeakPenalty));
}


/**
 * Compute a bounding box for a radius query without PostGIS.
 * Returns { latMin, latMax, lngMin, lngMax }.
 */
function boundingBox(lat, lng, radiusKm) {
  const dLat = radiusKm / 111.0;
  const dLng = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
  return { latMin: lat - dLat, latMax: lat + dLat, lngMin: lng - dLng, lngMax: lng + dLng };
}

/**
 * Fetch venues from the DB for a given tab.
 * Returns { venues: VenueRow[], isEmpty: boolean }
 *   isEmpty = true for Trending when < 10 results qualify.
 */
async function fetchTabVenues(tab, { anchor, filters, skippedIds }) {
  const { lat, lon } = anchor;
  const radiusKm = filters?.radius || 5;
  const bb = boundingBox(lat, lon ?? lat, radiusKm);

  let query = supabase
    .from('venues')
    .select('google_place_id, name, address, lat, lng, rating, review_count, price_level, venue_types, photo_urls, photos_complete, descriptors, regular_opening_hours, is_temporarily_closed, trending_score, created_at')
    .gte('lat', bb.latMin)
    .lte('lat', bb.latMax)
    .gte('lng', bb.lngMin)
    .lte('lng', bb.lngMax)
    .eq('is_chain', false);

  // Price filter
  if (filters?.priceLevels?.length) {
    const ints = filters.priceLevels.map((p) => PRICE_CHIP_TO_INT[p]).filter(Boolean);
    if (ints.length) query = query.in('price_level', ints);
  }

  // Cuisine filter — match venues whose types array contains any selected cuisine type
  // Supabase JSONB contains syntax: types @> '["italian_restaurant"]'
  if (filters?.cuisines?.length) {
    const cuisineFilter = filters.cuisines
      .map((c) => `types.cs.${JSON.stringify([c])}`)
      .join(',');
    query = query.or(cuisineFilter);
  }

  // Tab-specific filters + ordering
  if (tab === 'popular') {
    query = query
      .not('review_count', 'is', null)
      .gte('rating', 4.0)
      .order('review_count', { ascending: false })
      .limit(20);
  } else if (tab === 'new') {
    // Tiered year window — expands annually until 30 venues found
    let results = [];
    let yearWindow = 0;
    for (let years = 1; years <= 10; years++) {
      yearWindow = years;
      const cutoff = new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000).toISOString();
      let newQuery = supabase
        .from('venues')
        .select('google_place_id, name, address, lat, lng, rating, review_count, price_level, venue_types, photo_urls, photos_complete, descriptors, regular_opening_hours, is_temporarily_closed, trending_score, created_at')
        .gte('lat', bb.latMin)
        .lte('lat', bb.latMax)
        .gte('lng', bb.lngMin)
        .lte('lng', bb.lngMax)
        .eq('is_chain', false)
        .gte('rating', 4.0)
        .not('review_count_at_ingestion', 'is', null)
        .lt('review_count_at_ingestion', 75)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(30);
      if (filters?.priceLevels?.length) {
        const ints = filters.priceLevels.map((p) => PRICE_CHIP_TO_INT[p]).filter(Boolean);
        if (ints.length) newQuery = newQuery.in('price_level', ints);
      }
      if (filters?.cuisines?.length) {
        const cuisineFilter = filters.cuisines.map((c) => `types.cs.${JSON.stringify([c])}`).join(',');
        newQuery = newQuery.or(cuisineFilter);
      }
      const { data: newData, error: newError } = await newQuery;
      if (newError) {
        console.error('[TabFeed] New query error:', newError);
        break;
      }
      results = newData || [];
      if (results.length >= 30) break;
    }
    console.log('[TabFeed] New: found', results.length, 'venues within', yearWindow, 'year(s)');
    const newSkipSet = new Set(skippedIds || []);
    const newFiltered = results.filter((v) => {
      const id = (v.google_place_id || '').replace(/^places\//, '');
      return !newSkipSet.has(id);
    });
    return {
      venues: newFiltered.map((v) => ({
        google_place_id: v.google_place_id,
        place_id: v.google_place_id,
        name: v.name,
        address: v.address,
        lat: v.lat,
        lon: v.lng,
        rating: v.rating,
        review_count: v.review_count,
        price_level: v.price_level,
        types: v.venue_types || [],
        image_urls: v.photo_urls || [],
        descriptors: v.descriptors || [],
        photos_complete: v.photos_complete ?? false,
      })),
      isEmpty: newFiltered.length === 0,
    };
  } else if (tab === 'trending') {
    query = query
      .not('trending_score', 'is', null)
      .not('review_count_30d_ago', 'is', null)
      .gte('review_count', 50)
      .gte('rating', 4.0)
      .order('trending_score', { ascending: false })
      .limit(30);
  } else if (tab === 'walkin') {
    let walkinQuery = supabase
      .from('venues')
      .select('google_place_id, name, address, lat, lng, rating, review_count, price_level, venue_types, photo_urls, photos_complete, descriptors')
      .eq('is_chain', false)
      .gte('rating', 4.0)
      .gte('review_count', 50)
      .gte('lat', bb.latMin)
      .lte('lat', bb.latMax)
      .gte('lng', bb.lngMin)
      .lte('lng', bb.lngMax)
      .order('review_count', { ascending: false })
      .limit(60);
    if (filters?.priceLevels?.length) {
      const ints = filters.priceLevels.map((p) => PRICE_CHIP_TO_INT[p]).filter(Boolean);
      if (ints.length) walkinQuery = walkinQuery.in('price_level', ints);
    }
    const { data: walkinData, error: walkinError } = await walkinQuery;
    if (walkinError) {
      console.error('[TabFeed] Walkin query error:', walkinError);
      return { venues: [], isEmpty: true };
    }
    const walkinSkipSet = new Set(skippedIds || []);
    const scored = (walkinData || [])
      .filter((v) => !walkinSkipSet.has((v.google_place_id || '').replace(/^places\//, '')))
      .map((v) => {
        const normalised = {
          google_place_id: v.google_place_id,
          place_id: v.google_place_id,
          name: v.name,
          address: v.address,
          lat: v.lat,
          lon: v.lng,
          rating: v.rating,
          review_count: v.review_count,
          price_level: v.price_level,
          types: v.venue_types || [],
          image_urls: v.photo_urls || [],
          descriptors: v.descriptors || [],
          photos_complete: v.photos_complete ?? false,
        };
        return { ...normalised, _walkinScore: computeInlineWalkinScore(normalised) };
      })
      .sort((a, b) => b._walkinScore - a._walkinScore)
      .slice(0, 20);
    console.log('[TabFeed] Walkin: scored', scored.length, 'venues, top score:', scored[0]?._walkinScore);
    return { venues: scored, isEmpty: scored.length === 0 };
  }

  const { data, error } = await query;
  if (error) {
    console.error('[TabFeed] DB query error:', error);
    return { venues: [], isEmpty: true };
  }

  // Exclude skipped/interacted IDs
  const skipSet = new Set(skippedIds || []);
  let filtered = (data || []).filter((v) => {
    const id = (v.google_place_id || '').replace(/^places\//, '');
    return !skipSet.has(id);
  });

  // For Trending: apply std-dev threshold client-side, or fall back to proxy ordering
  if (tab === 'trending') {
    const hasRealScores = filtered.some((v) => v.trending_score != null);

    if (hasRealScores) {
      const scores = filtered.map((v) => v.trending_score).filter((s) => s != null);
      if (scores.length >= 3) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const stdDev = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
        const threshold = mean + stdDev;
        filtered = filtered.filter((v) => v.trending_score > threshold);
      }
      if (filtered.length < 10) {
        return { venues: filtered, isEmpty: true };
      }
    } else {
      // No real trending scores yet — proxy fallback: top-rated with review_count >= 50
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('venues')
        .select('google_place_id, name, address, lat, lng, rating, review_count, price_level, venue_types, photo_urls, photos_complete, descriptors, regular_opening_hours, is_temporarily_closed, trending_score, created_at')
        .gte('lat', bb.latMin)
        .lte('lat', bb.latMax)
        .gte('lng', bb.lngMin)
        .lte('lng', bb.lngMax)
        .gte('review_count', 50)
        .gte('rating', 4.0)
        .order('rating', { ascending: false })
        .order('review_count', { ascending: false })
        .limit(30);

      if (!fallbackError && fallbackData?.length) {
        const skipSet2 = new Set(skippedIds || []);
        filtered = fallbackData.filter((v) => {
          const id = (v.google_place_id || '').replace(/^places\//, '');
          return !skipSet2.has(id);
        });
      }
    }
  }

  // Normalise shape to match what DiscoveryCard expects
  const normalised = filtered.map((v) => ({
    google_place_id: v.google_place_id,
    place_id: v.google_place_id,
    name: v.name,
    address: v.address,
    lat: v.lat,
    lon: v.lng,
    rating: v.rating,
    review_count: v.review_count,
    price_level: v.price_level,
    types: v.venue_types || [],
    image_urls: v.photo_urls || [],
    descriptors: v.descriptors || [],
    photos_complete: v.photos_complete ?? false,
  }));

  return { venues: normalised, isEmpty: false };
}

function persistGuestSeenIds(servedIdsSet) {
  try {
    const ids = Array.from(servedIdsSet).slice(-200);
    localStorage.setItem('whatspot_guest_seen_ids', JSON.stringify(ids));
  } catch {}
}

export function useDiscoveryFeed() {
  const { state } = useGlobalState();
  const cached = useRef(loadFeedCache()).current;
  const [venues, setVenues] = useState(cached?.venues || []);
  const [overflowVenues, setOverflowVenues] = useState(cached?.overflowVenues || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentQuery, setCurrentQuery] = useState(cached?.currentQuery || '');
  const [tabEmpty, setTabEmpty] = useState(false);
  const radiusRef = useRef(state.filters?.radius || 5);
  const abortRef = useRef(null);
  const hasFetchedRef = useRef(!!cached);
  const currentQueryRef = useRef(cached?.currentQuery || '');
  const isFirstFilterRenderRef = useRef(true);
  const reserveVenuesRef = useRef(cached?.reserveVenues || []);
  const radiusRingIndexRef = useRef(0);
  const criteriaPassRef = useRef(1);
  const anchorPointRef = useRef(null);
  const isPrefetchingRef = useRef(false);
  const prefetchedVenuesRef = useRef([]);
  // Full scored pool including staged venues for criteria relaxation
  const fullScoredPoolRef = useRef([]);
  // Session-level tracking of ALL venue IDs ever sent to the client
  const allServedIdsRef = useRef(new Set());
  // Reserve venue IDs buffered but not yet served — promoted to allServedIdsRef on consumption
  const reserveIdsRef = useRef(new Set());
  // Set when a prefetch call is dropped by the isPrefetchingRef guard
  const pendingPrefetchRef = useRef(false);
  // True when current session is a guest (no authenticated user)
  const isGuestRef = useRef(false);
  // Previous location snapshot for material-change detection
  const prevLocationRef = useRef(null);
  // True only when fetchFeed was called in this hook instance (not a back-nav restore).
  // Used to gate allServedIdsRef checks in staged pool deduplication — on back-nav,
  // allServedIdsRef is seeded from cache and must not be used to block staged venues.
  const fetchedFreshRef = useRef(false);

  // Runs once per mount (not on re-renders) — sets suppression flags before any effect fires.
  // _sessionFetchedAt > 0 means this browser tab has already fetched; this is a back-nav.
  const backNavDetectedRef = useRef(false);
  if (!backNavDetectedRef.current) {
    backNavDetectedRef.current = true;
    if (_sessionFetchedAt > 0) {
      _isBackNav = true;
      _suppressPrefetchUntilInteraction = true;
      if (_sessionAnchor && !anchorPointRef.current) anchorPointRef.current = _sessionAnchor;
    }
  }

  const initAnchorPoint = useCallback(async () => {
    if (anchorPointRef.current) return;
    // Reuse session anchor for the lifetime of the tab — no DB round-trip, no rotation
    if (_sessionAnchor) {
      anchorPointRef.current = _sessionAnchor;
      return;
    }

    const loc = state.userLocation;

    // Priority 1: GPS or pin drop — use exact coords, no rotation
    if (loc?.isGPS === true || loc?.isPinDrop === true) {
      anchorPointRef.current = { lat: loc.lat, lon: loc.lon };
      console.log('[Anchor] Using exact coords (GPS/pin):', anchorPointRef.current);
      return;
    }

    // Priority 2: Specific location (neighbourhood, street, etc.) — use exact coords, no rotation
    const BROAD_TYPES = ['city', 'county', 'state', 'country', null, undefined];
    if (loc?.locationType && !BROAD_TYPES.includes(loc.locationType)) {
      anchorPointRef.current = { lat: loc.lat, lon: loc.lon };
      console.log('[Anchor] Using exact coords (specific location type:', loc.locationType, ')');
      return;
    }

    // Priority 3: Broad area (city-level or no locationType) — apply rotation
    // Authenticated user: sequential anchor index from DB
    let user = null;
    try {
      const authResponse = await supabase.auth.getUser();
      user = authResponse?.data?.user ?? null;
    } catch {
      // auth unavailable — treat as guest so anchor is always set below
    }
    if (user) {
      // Clear guest cross-session seen IDs when user authenticates
      try { localStorage.removeItem('whatspot_guest_seen_ids'); } catch {}
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('discovery_anchor_index, discovery_last_radius_km, discovery_last_criteria_pass')
        .eq('id', user.id)
        .maybeSingle();

      const anchorIndex = profile?.discovery_anchor_index ?? 0;
      const nextIndex = (anchorIndex + 1) % ANCHOR_OFFSETS.length;

      if (!anchorPointRef.current) {
        const baseLat = loc?.lat ?? TORONTO_ANCHORS[0].lat;
        const baseLon = loc?.lon ?? TORONTO_ANCHORS[0].lon;
        const off = ANCHOR_OFFSETS[anchorIndex] ?? ANCHOR_OFFSETS[0];
        anchorPointRef.current = { lat: baseLat + off.dlat, lon: baseLon + off.dlon };
      }
      radiusRingIndexRef.current = 0;
      criteriaPassRef.current = profile?.discovery_last_criteria_pass ?? 1;

      const { error: anchorWriteError } = await supabase.from('user_profiles').update({
        discovery_anchor_index: nextIndex,
        discovery_last_radius_km: RADIUS_RINGS[0],
        discovery_last_criteria_pass: 1,
      }).eq('id', user.id);

      if (anchorWriteError) {
        console.error('[Anchor] Failed to persist anchor index to user_profiles:', anchorWriteError);
      }

      console.log('[Anchor] Rotation for authenticated user, anchor index:', anchorIndex);
      return;
    }

    // Guest: random anchor from sessionStorage
    isGuestRef.current = true;
    const guestBaseLat = loc?.lat ?? TORONTO_ANCHORS[0].lat;
    const guestBaseLon = loc?.lon ?? TORONTO_ANCHORS[0].lon;
    try {
      const stored = sessionStorage.getItem('whatspot_anchor_index');
      if (stored !== null) {
        const off = ANCHOR_OFFSETS[parseInt(stored)] ?? ANCHOR_OFFSETS[0];
        anchorPointRef.current = { lat: guestBaseLat + off.dlat, lon: guestBaseLon + off.dlon };
      } else {
        const randomIndex = Math.floor(Math.random() * ANCHOR_OFFSETS.length);
        sessionStorage.setItem('whatspot_anchor_index', String(randomIndex));
        const off = ANCHOR_OFFSETS[randomIndex];
        anchorPointRef.current = { lat: guestBaseLat + off.dlat, lon: guestBaseLon + off.dlon };
      }
    } catch {
      anchorPointRef.current = { lat: guestBaseLat, lon: guestBaseLon };
    }
    // Seed allServedIdsRef with previously seen venue IDs for cross-session freshness
    try {
      const raw = localStorage.getItem('whatspot_guest_seen_ids');
      if (raw) {
        const ids = JSON.parse(raw);
        ids.forEach(id => allServedIdsRef.current.add(id));
        console.log('[Anchor] Seeded', ids.length, 'guest seen IDs from prior sessions');
      }
    } catch {}
    console.log('[Anchor] Rotation for guest, anchor:', anchorPointRef.current);
  }, [state.userLocation]);

  // Keep currentQueryRef in sync so the filter-change effect can read it without stale closure
  useEffect(() => { currentQueryRef.current = currentQuery; }, [currentQuery]);

  // Re-run search when filters change while a query is active.
  // Guard against the initial render so we don't double-fetch on mount.
  useEffect(() => {
    if (isFirstFilterRenderRef.current) {
      isFirstFilterRenderRef.current = false;
      return;
    }
    if (currentQueryRef.current) {
      radiusRef.current = state.filters?.radius || 5;
      fetchFeed({ query: currentQueryRef.current });
    }
  }, [state.filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Location-change refresh — resets feed when user moves materially (>5 km) or sets an explicit pin/GPS
  useEffect(() => {
    const newLoc = state.userLocation;
    if (!newLoc?.lat || !newLoc?.lon) return;

    const prev = prevLocationRef.current;
    prevLocationRef.current = newLoc;

    if (!prev) return; // initial mount — [] effect handles first load

    const anchor = anchorPointRef.current;
    if (!anchor) return; // anchor not set yet; initial load still in progress

    const isExplicit = newLoc.isPinDrop || newLoc.isGPS;
    const dLat = (newLoc.lat - anchor.lat) * 111;
    const dLon = (newLoc.lon - anchor.lon) * 111 * Math.cos(newLoc.lat * Math.PI / 180);
    const distKm = Math.sqrt(dLat * dLat + dLon * dLon);

    if (!isExplicit && distKm < 5) return;

    anchorPointRef.current = null;
    _sessionAnchor = null;
    _sessionFetchedAt = 0;
    _sessionVenues = null;
    _suppressPrefetchUntilInteraction = false;
    _clientSkippedIds.clear();
    allServedIdsRef.current.clear();
    reserveIdsRef.current.clear();
    reserveVenuesRef.current = [];
    prefetchedVenuesRef.current = [];
    fullScoredPoolRef.current = [];
    radiusRingIndexRef.current = 0;
    criteriaPassRef.current = 1;
    setVenues([]);
    try { sessionStorage.removeItem(FEED_CACHE_KEY); } catch {}
    try { sessionStorage.removeItem('whatspot_seen_venues'); } catch {}

    initAnchorPoint()
      .catch(err => console.error('[Discovery] initAnchorPoint (location change) failed:', err))
      .then(() => {
        fetchFeed().then((result) => {
          const delay = result?.wasGoogleFallback ? 3000 : 0;
          setTimeout(() => prefetchNextBatch(), delay);
        });
      });
  }, [state.userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab feed — fires when feedTab or filters change (for DB-driven tabs: new/trending)
  // For You and Popular use the existing recommend pipeline.
  useEffect(() => {
    const tab = state.feedTab;
    if (!tab || tab === 'for_you') {
      setTabEmpty(false);
      return;
    }
    // Block ALL tab fetches while back-nav restore is active — cleared on first swipe.
    if (_isBackNav) return;
    const anchor = anchorPointRef.current ?? state.userLocation;
    if (!anchor) return; // wait until anchor is initialised

    setIsLoading(true);
    setTabEmpty(false);

    let skippedIds = [];
    try {
      const raw = sessionStorage.getItem('whatspot_skipped_venues');
      if (raw) skippedIds = JSON.parse(raw);
    } catch {}

    fetchTabVenues(tab, {
      anchor,
      filters: state.filters,
      skippedIds,
    }).then(({ venues: tabVenues, isEmpty }) => {
      console.log(`[TabFeed] ${tab} returned ${tabVenues.length} venues. First 3:`, tabVenues.slice(0, 3).map(v => v.name));
      setVenues(tabVenues);
      setOverflowVenues([]);
      setCurrentQuery('');
      setTabEmpty(isEmpty);
    }).catch((err) => {
      console.error('[TabFeed] Error:', err);
      setVenues([]);
      setTabEmpty(true);
    }).finally(() => {
      setIsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.feedTab, state.filters]);

  const fetchFeed = useCallback(async ({ query = '', radius, mode } = {}) => {
    if (import.meta.env.VITE_TESTING_MODE === 'true') {
      console.log('[TestMode] fetchFeed blocked — set VITE_TESTING_MODE=false to enable');
      return;
    }
    _suppressPrefetchUntilInteraction = false;
    fetchedFreshRef.current = true;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const effectiveRadius = radius ?? radiusRef.current;
    const effectiveMode = mode || (query ? 'query' : 'discovery');

    setIsLoading(true);
    setError(null);
    setCurrentQuery(query);
    setOverflowVenues([]);

    // Read session context
    let session_context = [];
    try {
      const raw = sessionStorage.getItem('whatspot_session_history');
      if (raw) session_context = JSON.parse(raw);
    } catch {}

    const excludeIds = Array.from(new Set([...allServedIdsRef.current, ..._clientSkippedIds]));

    try {
      const recommendParams = {
        mode: effectiveMode,
        query: query || undefined,
        lat: anchorPointRef.current?.lat ?? state.userLocation?.lat,
        lon: anchorPointRef.current?.lon ?? state.userLocation?.lon,
        location_name: state.locationName,
        radius_km: effectiveRadius,
        open_now: state.filters?.openNow || undefined,
        price_levels: state.filters?.priceLevels?.length ? state.filters.priceLevels : undefined,
        cuisine_types: state.filters?.cuisines?.length ? state.filters.cuisines : undefined,
        exclude_ids: excludeIds.length ? excludeIds : undefined,
      };
      let res;
      try {
        res = await recommend(recommendParams);
      } catch (retryErr) {
        console.warn('recommend() failed, retrying in 2s:', retryErr?.message);
        await new Promise(resolve => setTimeout(resolve, 2000));
        res = await recommend(recommendParams);
      }
      const results = res?.results || [];
      const overflow = res?.nearby_overflow || [];
      const reserve = res?.reserve_venues || [];
      const staged = res?.staged_venues || [];
      const wasGoogleFallback = res?.was_google_fallback === true;

      // Filter out skipped venues
      let skippedIds = [];
      try {
        const raw = sessionStorage.getItem('whatspot_skipped_venues');
        if (raw) skippedIds = JSON.parse(raw);
      } catch {}

      const filtered = results.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !skippedIds.includes(id) && !_clientSkippedIds.has(id);
      });

      reserveVenuesRef.current = reserve.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !skippedIds.includes(id);
      });

      // Track displayed venue IDs for exclusion in future fetches
      filtered.forEach(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        if (id) allServedIdsRef.current.add(id);
      });
      // Track reserve IDs separately — promoted to allServedIdsRef only when consumed
      reserveVenuesRef.current.forEach(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        if (id) reserveIdsRef.current.add(id);
      });
      if (isGuestRef.current) persistGuestSeenIds(allServedIdsRef.current);

      // Accumulate staged venues into the full scored pool
      if (staged.length > 0) {
        const existingIds = new Set(fullScoredPoolRef.current.map(v =>
          (v.place_id || v.google_place_id || '').replace(/^places\//, '')
        ));
        const newStaged = staged.filter(v => {
          const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
          return !existingIds.has(id) && (!fetchedFreshRef.current || !allServedIdsRef.current.has(id));
        });
        fullScoredPoolRef.current = [...fullScoredPoolRef.current, ...newStaged];
        console.log('[Feed] Staged pool now has', fullScoredPoolRef.current.length, 'venues');
      }

      setVenues(filtered);
      setOverflowVenues(overflow);
      radiusRef.current = effectiveRadius;

      // Cache feed state for back-navigation
      saveFeedCache({
        venues: filtered,
        overflowVenues: overflow,
        currentQuery: query,
        reserveVenues: reserveVenuesRef.current,
      });
      // Module-level cache — reliable even if sessionStorage quota is exceeded
      _sessionFetchedAt = Date.now();
      _sessionVenues = filtered;
      if (anchorPointRef.current) _sessionAnchor = anchorPointRef.current;

      // Track seen venue IDs for discovery mode (cap at 100 to prevent exhaustion)
      if (effectiveMode === 'discovery') {
        try {
          const raw = sessionStorage.getItem('whatspot_seen_venues');
          const existing = raw ? JSON.parse(raw) : [];
          const newIds = filtered.map(v =>
            (v.place_id || v.google_place_id || '').replace(/^places\//, '')
          ).filter(Boolean);
          const merged = [...new Set([...existing, ...newIds])].slice(-100);
          sessionStorage.setItem('whatspot_seen_venues', JSON.stringify(merged));
        } catch {}
      }

      return { wasGoogleFallback };
    } catch (err) {
      let errDetail = err?.message || 'unknown';
      if (err?.context) {
        try { const body = await err.context.json(); errDetail = JSON.stringify(body); } catch {}
      }
      console.error('Discovery feed fetch failed:', err?.status || 'no status', errDetail);
      setError(err?.message || 'Failed to load venues');
      setVenues([]);
    } finally {
      setIsLoading(false);
    }
  }, [state.userLocation, state.locationName, state.filters]);

  // Initial load — discovery mode + immediate prefetch
  useEffect(() => {
    if (hasFetchedRef.current || _sessionFetchedAt > 0) {
      // Restore session anchor (belt-and-suspenders — also set synchronously above)
      if (_sessionAnchor && !anchorPointRef.current) anchorPointRef.current = _sessionAnchor;
      // If sessionStorage cache failed but in-memory venues are available, restore them
      const seedVenues = cached?.venues?.length ? cached.venues : (_sessionVenues || []);
      if (!cached?.venues?.length && _sessionVenues?.length) {
        setVenues(_sessionVenues);
        saveFeedCache({ venues: _sessionVenues, overflowVenues: [], currentQuery: currentQueryRef.current || '' });
      }
      // Seed allServedIdsRef so exclude_ids is non-empty on the first post-remount prefetch
      seedVenues.forEach(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        if (id) allServedIdsRef.current.add(id);
      });
      // Write whatspot_deck_venue_ids so DiscoveryDeck can restore position on back-nav
      const venueIdStr = seedVenues
        .map(v => (v.place_id || v.google_place_id || '').replace(/^places\//, ''))
        .join(',');
      try { sessionStorage.setItem('whatspot_deck_venue_ids', venueIdStr); } catch {}
      return;
    }
    hasFetchedRef.current = true;
    // Clear skipped venues from previous sessions so the feed starts fresh
    try { sessionStorage.removeItem('whatspot_skipped_venues'); } catch {}
    // Init anchor FIRST so fetchFeed uses the correct coordinates
    initAnchorPoint()
      .catch(err => console.error('[Discovery] initAnchorPoint failed:', err))
      .then(() => {
        fetchFeed().then((result) => {
          // Delay prefetch when Google fallback fired — gives the fire-and-forget
          // DB upsert time to complete so the prefetch hits Supabase, not Google.
          const delay = result?.wasGoogleFallback ? 3000 : 0;
          setTimeout(() => prefetchNextBatch(), delay);
        });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search-driven refresh
  const searchFeed = useCallback((query) => {
    radiusRef.current = state.filters?.radius || 5;
    try {
      sessionStorage.setItem('whatspot_deck_index', '0');
      sessionStorage.removeItem('whatspot_deck_venue_ids');
    } catch {}
    fetchFeed({ query });
  }, [fetchFeed, state.filters]);

  // Restore from cache if available; fall back to a fresh fetch.
  // Used by Home when returning from a venue page so back nav shows instant results.
  const restoreSearch = useCallback((query) => {
    const cache = loadFeedCache();
    if (cache && cache.currentQuery === query && Array.isArray(cache.venues) && cache.venues.length > 0) {
      setVenues(cache.venues);
      setCurrentQuery(cache.currentQuery);
      setOverflowVenues(cache.overflowVenues || []);
      reserveVenuesRef.current = cache.reserveVenues || [];
      hasFetchedRef.current = true;
    } else {
      fetchFeed({ query });
    }
  }, [fetchFeed]);

  // Expand search area — double the radius
  const expandSearch = useCallback(() => {
    const newRadius = Math.min(radiusRef.current * 2, 25);
    fetchFeed({ query: currentQuery, radius: newRadius });
  }, [fetchFeed, currentQuery]);

  const prefetchNextBatch = useCallback(async (retryCount = 0) => {
    if (import.meta.env.VITE_TESTING_MODE === 'true') {
      console.log('[TestMode] prefetchNextBatch blocked — set VITE_TESTING_MODE=false to enable');
      return;
    }
    // Suppress all prefetch paths until the user makes their first swipe after back-nav.
    if (_suppressPrefetchUntilInteraction || _isBackNav) return;
    if (isPrefetchingRef.current && retryCount === 0) {
      pendingPrefetchRef.current = true;
      return 'busy';
    }
    isPrefetchingRef.current = true;
    pendingPrefetchRef.current = false;

    // Advance to next radius ring
    radiusRingIndexRef.current = radiusRingIndexRef.current + 1;

    // If we've exhausted all rings, advance criteria pass and reset rings
    if (radiusRingIndexRef.current >= RADIUS_RINGS.length) {
      criteriaPassRef.current = criteriaPassRef.current + 1;
      radiusRingIndexRef.current = 0;

      if (criteriaPassRef.current > MAX_CRITERIA_PASS) {
        criteriaPassRef.current = MAX_CRITERIA_PASS;
      }

      // On criteria relaxation, check staged pool for newly eligible venues
      const servedSet = allServedIdsRef.current;
      const stagedEligible = fullScoredPoolRef.current.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !servedSet.has(id);
      });

      if (stagedEligible.length >= 10) {
        // Enough staged venues — release them without an API call
        stagedEligible.forEach(v => {
          const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
          if (id) allServedIdsRef.current.add(id);
        });
        prefetchedVenuesRef.current = [...prefetchedVenuesRef.current, ...stagedEligible];
        fullScoredPoolRef.current = fullScoredPoolRef.current.filter(v => {
          const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
          return !servedSet.has(id);
        });
        console.log('[Prefetch] Released', stagedEligible.length, 'staged venues on criteria relaxation');
        isPrefetchingRef.current = false;
        if (pendingPrefetchRef.current) {
          pendingPrefetchRef.current = false;
          setTimeout(() => prefetchNextBatch(0), 50);
        }
        return { fetched: stagedEligible.length, reserve: 0 };
      }

      try {
        sessionStorage.removeItem('whatspot_seen_venues');
      } catch {}
    }

    const currentRadius = RADIUS_RINGS[radiusRingIndexRef.current];
    const currentPass = criteriaPassRef.current;
    const anchor = anchorPointRef.current ?? { lat: state.userLocation?.lat ?? 43.6532, lon: state.userLocation?.lon ?? -79.3832 };

    // Exclude ALL venue IDs ever served to the client (not just skipped)
    const excludeIds = Array.from(new Set([...allServedIdsRef.current, ..._clientSkippedIds]));

    // Calculate ring-specific tile radius for annular targeting
    const prevRadius = radiusRingIndexRef.current > 0 ? RADIUS_RINGS[radiusRingIndexRef.current - 1] : 0;
    const tileRadiusKm = prevRadius > 0 ? (currentRadius + prevRadius) / 2 : undefined;

    try {
      const res = await recommend({
        mode: 'discovery',
        lat: anchor.lat,
        lon: anchor.lon,
        location_name: state.locationName,
        radius_km: currentRadius,
        open_now: state.filters?.openNow || undefined,
        exclude_ids: excludeIds.length ? excludeIds : undefined,
        criteria_pass: currentPass,
        ...(tileRadiusKm ? { tile_radius_km: tileRadiusKm } : {}),
      });

      const results = res?.results || [];
      const reserve = res?.reserve_venues || [];
      const staged = res?.staged_venues || [];

      // Accumulate staged venues into the full scored pool
      if (staged.length > 0) {
        const existingIds = new Set(fullScoredPoolRef.current.map(v =>
          (v.place_id || v.google_place_id || '').replace(/^places\//, '')
        ));
        const newStaged = staged.filter(v => {
          const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
          return !existingIds.has(id) && (!fetchedFreshRef.current || !allServedIdsRef.current.has(id));
        });
        fullScoredPoolRef.current = [...fullScoredPoolRef.current, ...newStaged];
        console.log('[Prefetch] Staged pool now has', fullScoredPoolRef.current.length, 'venues');
      }

      // Filter against allServedIds and reserveIdsRef to catch any the API missed
      const servedSet = allServedIdsRef.current;
      const reserveSet = reserveIdsRef.current;
      const filtered = results.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !servedSet.has(id) && !reserveSet.has(id);
      });

      const filteredReserve = reserve.filter(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        return !servedSet.has(id) && !reserveSet.has(id);
      });

      // Track displayed venue IDs for exclusion — reserve IDs tracked separately
      filtered.forEach(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        if (id) allServedIdsRef.current.add(id);
      });
      filteredReserve.forEach(v => {
        const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
        if (id) reserveIdsRef.current.add(id);
      });
      if (isGuestRef.current) persistGuestSeenIds(allServedIdsRef.current);

      if (filtered.length > 0) {
        prefetchedVenuesRef.current = [...prefetchedVenuesRef.current, ...filtered];
        reserveVenuesRef.current = [...reserveVenuesRef.current, ...filteredReserve];
      }

      // Auto-retry with next ring if this ring returned nothing (max 3 retries)
      if (filtered.length === 0 && retryCount < 3) {
        isPrefetchingRef.current = false;
        return prefetchNextBatch(retryCount + 1);
      }

      return { fetched: filtered.length, reserve: reserve.length };
    } catch (err) {
      console.error('Prefetch failed silently:', err);
      return { fetched: 0, reserve: 0 };
    } finally {
      isPrefetchingRef.current = false;
      if (pendingPrefetchRef.current) {
        pendingPrefetchRef.current = false;
        setTimeout(() => prefetchNextBatch(0), 50);
      }
    }
  }, [state.userLocation, state.locationName, state.filters]);

  const getReserveVenues = useCallback((activeIds) => {
    let skippedIds = [];
    try {
      const raw = sessionStorage.getItem('whatspot_skipped_venues');
      if (raw) skippedIds = JSON.parse(raw);
    } catch {}
    const skipSet = new Set(skippedIds);
    const reserve = reserveVenuesRef.current.filter(v => {
      const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
      return !skipSet.has(id) && !(activeIds instanceof Set && activeIds.has(id));
    });
    reserveVenuesRef.current = [];
    // Promote served reserve IDs to allServedIdsRef and clear pending reserve tracking
    reserve.forEach(v => {
      const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
      if (id) allServedIdsRef.current.add(id);
    });
    reserveIdsRef.current.clear();
    if (isGuestRef.current) persistGuestSeenIds(allServedIdsRef.current);
    return reserve;
  }, []);

  const getPrefetchedVenues = useCallback((activeIds) => {
    let skippedIds = [];
    try {
      const raw = sessionStorage.getItem('whatspot_skipped_venues');
      if (raw) skippedIds = JSON.parse(raw);
    } catch {}
    const skipSet = new Set(skippedIds);
    const prefetched = prefetchedVenuesRef.current.filter(v => {
      const id = (v.place_id || v.google_place_id || '').replace(/^places\//, '');
      return !skipSet.has(id) && !(activeIds instanceof Set && activeIds.has(id));
    });
    prefetchedVenuesRef.current = [];
    return prefetched;
  }, []);

  return {
    venues,
    overflowVenues,
    isLoading,
    error,
    currentQuery,
    tabEmpty,
    searchFeed,
    restoreSearch,
    expandSearch,
    refetchDiscovery: () => fetchFeed(),
    getReserveVenues,
    getPrefetchedVenues,
    prefetchNextBatch,
  };
}
