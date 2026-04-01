/**
 * venueDataRouter.js
 *
 * Routes venue data requests according to VITE_VENUE_DATA_SOURCE:
 *   "db_only"      — all data served from venues table, no Places API calls
 *   "live_fallback"— serve from DB; queue background refresh when stale
 *
 * Refresh cadence and API cost tier:
 *
 *   Annual  (Essentials/Pro):      name, address, coords, neighbourhood, category, price_level
 *   Weekly  (Enterprise, 1 call):  rating, review_count, hours, phone, website
 *                                  → refresh-venue-weekly edge function
 *   Quarterly (Enterprise+Atmos):  photo_url
 *                                  → refresh-venue-photos edge function (never on-demand)
 *   Never via API:                 ai_description — generated internally only
 *
 * Photos are never triggered on-demand from this router. The Atmosphere cost
 * tier cannot be justified per-request; photos run on the quarterly cron only.
 *
 * UI contract: if a DB field is null, the caller omits that UI element. No
 * loading states or stale indicators are shown due to missing API data.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Config ───────────────────────────────────────────────────────────────────

export const DATA_SOURCE = import.meta.env.VITE_VENUE_DATA_SOURCE || 'live_fallback';
export const isDbOnly = () => DATA_SOURCE === 'db_only';

const WEEKLY_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Shape helpers ────────────────────────────────────────────────────────────

/**
 * Map a venues table row to the venue object shape the rest of the frontend expects.
 * Matches the shape returned by the recommend edge function.
 */
function rowToVenue(row) {
  return {
    place_id:              row.google_place_id,
    google_place_id:       row.google_place_id,
    name:                  row.name,
    address:               row.address || '',
    lat:                   row.lat,
    lon:                   row.lng,         // DB uses lng; recommend uses lon
    rating:                row.rating,
    review_count:          row.review_count,
    price_level:           row.price_level,
    photo_url:             row.photo_url || null,
    types:                 row.category ? [row.category] : [],
    neighbourhood:         row.neighbourhood || null,
    phone:                 row.phone || null,
    website:               row.website || null,
    ai_description:        row.ai_description || null,
    opening_hours:         row.opening_hours || null,
    is_temporarily_closed: row.is_temporarily_closed || false,
    data_source:           'db',
    descriptors:           [],
  };
}

function buildResponse(rows) {
  const venues = rows.map(rowToVenue);
  return {
    results:         venues.slice(0, 12),
    reserve_venues:  venues.slice(12, 22),
    nearby_overflow: [],
    suggested_chips: [],
    search_summary:  null,
    pagination:      { has_more: false },
  };
}

// ─── Staleness / background refresh ──────────────────────────────────────────

/**
 * Fire-and-forget: queue a weekly Enterprise refresh for a single venue.
 * Refreshes rating, review_count, hours, phone, website in one call.
 * Only runs in live_fallback mode — db_only never makes API calls.
 * Photos are deliberately excluded; they run on the quarterly cron only.
 */
function queueWeeklyRefresh(googlePlaceId) {
  if (isDbOnly()) return;
  supabase.functions
    .invoke('refresh-venue-weekly', { body: { place_ids: [googlePlaceId] } })
    .catch(() => {}); // best-effort, never throws
}

function isWeeklyStale(row) {
  // Use rating_last_updated as the canonical staleness marker for the weekly bundle.
  // Both rating_last_updated and hours_last_updated are stamped together by refresh-venue-weekly.
  if (!row.rating_last_updated) return true;
  return Date.now() - new Date(row.rating_last_updated).getTime() > WEEKLY_STALE_MS;
}

// ─── DB query ─────────────────────────────────────────────────────────────────

/**
 * Query venues from the DB.
 *
 * @param {object} params
 * @param {string} [params.query]        - freetext search string
 * @param {string[]} [params.excludeIds] - google_place_ids to exclude
 * @param {number} [params.limit]        - max rows (default 22)
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

  // Queue background weekly refresh for any stale venues (live_fallback only).
  // Photos are never queued on-demand.
  if (!isDbOnly()) {
    rows.forEach((row) => {
      if (isWeeklyStale(row)) queueWeeklyRefresh(row.google_place_id);
    });
  }

  return buildResponse(rows);
}

// ─── Main router entry point ──────────────────────────────────────────────────

/**
 * Route a venue data request.
 *
 * In db_only mode:   always returns DB data, no API calls.
 * In live_fallback:  returns null — caller falls through to the recommend
 *                    edge function. Staleness checks only apply in db_only.
 *
 * @returns {object|null} recommend-shaped response, or null to fall through to live API.
 */
export async function routeVenueRequest(params) {
  if (isDbOnly()) {
    return queryVenuesFromDb({
      query:      params.query,
      excludeIds: params.exclude_ids || [],
    });
  }

  return null;
}
