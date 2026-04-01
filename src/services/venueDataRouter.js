/**
 * venueDataRouter.js
 *
 * Routes venue data requests according to VITE_VENUE_DATA_SOURCE:
 *   "db_only"      — all data served from venues table, no Places API calls
 *   "live_fallback"— Tier 1/2 from DB, Tier 3 from DB with background refresh if stale
 *
 * Tier system:
 *   Tier 1 (annual refresh):  name, address, coords, neighbourhood, category, price_level, phone, website
 *   Tier 2 (monthly refresh): rating, review_count, photo_url, ai_description
 *   Tier 3 (weekly refresh):  opening_hours, is_temporarily_closed  ← non-blocking background refresh
 *   Tier 4 (client-computed): "open now" — derived from Tier 3 + user local time, no API call
 *
 * UI contract: if a DB field is null, the caller omits that UI element. No loading states
 * or stale indicators are shown due to missing API data.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Config ───────────────────────────────────────────────────────────────────

export const DATA_SOURCE = import.meta.env.VITE_VENUE_DATA_SOURCE || 'live_fallback';
export const isDbOnly = () => DATA_SOURCE === 'db_only';

const HOURS_STALE_MS  = 7  * 24 * 60 * 60 * 1000; // 7 days

// ─── Shape helpers ────────────────────────────────────────────────────────────

/**
 * Map a venues table row to the venue object shape the rest of the frontend expects.
 * Matches the shape returned by the recommend edge function.
 */
function rowToVenue(row) {
  return {
    place_id:             row.google_place_id,
    google_place_id:      row.google_place_id,
    name:                 row.name,
    address:              row.address || '',
    lat:                  row.lat,
    lon:                  row.lng,          // DB uses lng; recommend uses lon
    rating:               row.rating,
    review_count:         row.review_count,
    price_level:          row.price_level,
    photo_url:            row.photo_url || null,
    types:                row.category ? [row.category] : [],
    neighbourhood:        row.neighbourhood || null,
    phone:                row.phone || null,
    website:              row.website || null,
    ai_description:       row.ai_description || null,
    opening_hours:        row.opening_hours || null,
    is_temporarily_closed: row.is_temporarily_closed || false,
    data_source:          'db',
    descriptors:          [],
  };
}

/**
 * Format a recommend-shape response envelope from a list of venue rows.
 */
function buildResponse(rows) {
  const venues = rows.map(rowToVenue);
  return {
    results:          venues.slice(0, 12),
    reserve_venues:   venues.slice(12, 22),
    nearby_overflow:  [],
    suggested_chips:  [],
    search_summary:   null,
    pagination:       { has_more: false },
  };
}

// ─── Staleness / background refresh ──────────────────────────────────────────

/**
 * Fire-and-forget: ask the google-places-details edge function to refresh
 * hours for a venue. Does not block the current request.
 * Only runs in live_fallback mode.
 */
function queueHoursRefresh(googlePlaceId) {
  if (isDbOnly()) return;
  supabase.functions
    .invoke('google-places-details', { body: { place_id: googlePlaceId, fields: ['hours'] } })
    .catch(() => {}); // best-effort, never throws
}

function isHoursStale(row) {
  if (!row.hours_last_updated) return true;
  return Date.now() - new Date(row.hours_last_updated).getTime() > HOURS_STALE_MS;
}

// ─── DB query ─────────────────────────────────────────────────────────────────

/**
 * Query venues from the DB.
 * Used in db_only mode, or as the Tier 1/2/3 source in live_fallback mode.
 *
 * @param {object} params
 * @param {string} [params.query]      - freetext search string
 * @param {string[]} [params.excludeIds] - google_place_ids to exclude
 * @param {number} [params.limit]      - max rows (default 22)
 */
export async function queryVenuesFromDb({ query, excludeIds = [], limit = 22 } = {}) {
  let qb = supabase.from('venues').select('*');

  if (query) {
    qb = qb.or(`name.ilike.%${query}%,address.ilike.%${query}%,category.ilike.%${query}%`);
  }

  if (excludeIds.length > 0) {
    qb = qb.not('google_place_id', 'in', `(${excludeIds.join(',')})`);
  }

  qb = qb.limit(limit);

  const { data, error } = await qb;
  if (error) throw error;

  const rows = data || [];

  // Tier 3: queue background hours refresh for any stale rows (live_fallback only)
  if (!isDbOnly()) {
    rows.forEach((row) => {
      if (isHoursStale(row)) queueHoursRefresh(row.google_place_id);
    });
  }

  return buildResponse(rows);
}

// ─── Main router entry point ──────────────────────────────────────────────────

/**
 * Route a venue data request.
 * Call this instead of calling the recommend edge function directly.
 *
 * In db_only mode:   always returns DB data.
 * In live_fallback:  returns null, signalling that the caller should invoke
 *                    the recommend edge function as normal. Tier 3 staleness
 *                    checks run after the live response is stored.
 *
 * @returns {object|null} recommend-shaped response envelope, or null if the
 *                        caller should fall through to the live API.
 */
export async function routeVenueRequest(params) {
  if (isDbOnly()) {
    return queryVenuesFromDb({
      query:      params.query,
      excludeIds: params.exclude_ids || [],
    });
  }

  // live_fallback: let the caller use the edge function; router is a no-op here
  return null;
}
