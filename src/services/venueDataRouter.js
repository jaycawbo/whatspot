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
import { buildSearchContext } from '@/lib/buildSearchContext';

// ─── Config ───────────────────────────────────────────────────────────────────

export const DATA_SOURCE = import.meta.env.VITE_VENUE_DATA_SOURCE || 'live_fallback';
export const isDbOnly = () => DATA_SOURCE === 'db_only';

// ─── Shape helpers ────────────────────────────────────────────────────────────
// rowToVenue is kept here (rather than deleted alongside the DB query it used to
// support) because src/services/placesSearch.js still imports it directly.

/**
 * Map a venues table row to the venue object shape the rest of the frontend expects.
 * Matches the shape returned by the recommend edge function.
 */
export function rowToVenue(row) {
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
    image_urls:            row.photo_urls || [],
    types:                 row.venue_types || row.types || [],
    neighbourhood:         row.neighbourhood || null,
    phone:                 row.phone || null,
    website:               row.website || null,
    ai_description:        row.ai_description || null,
    opening_hours:         row.opening_hours || null,
    is_temporarily_closed: row.is_temporarily_closed || false,
    data_source:           'db',
    descriptors:           [],
    distance_km:           row._distance_km ?? null,
  };
}

// ─── DB query ─────────────────────────────────────────────────────────────────

/**
 * Query venues from the DB via the search-venues-db edge function. Keyword
 * resolution (Gemini refine-query + its userContext/session caching) stays
 * here client-side since it's already routed through its own edge-function
 * boundary and has no server-side session equivalent; the actual venues-table
 * query, distance filtering, and weekly-refresh staleness check now live
 * server-side in search-venues-db.
 *
 * @param {object} params
 * @param {string} [params.query]            - freetext search string
 * @param {string[]} [params.excludeIds]    - google_place_ids to exclude
 * @param {number} [params.limit]           - max rows (default 22)
 * @param {number} [params.lat]             - center latitude for bounding box
 * @param {number} [params.lon]             - center longitude for bounding box
 * @param {number} [params.radiusKm]        - search radius in km (default 5)
 * @param {boolean} [params.bypassCorrection] - skip autocorrect for this call
 * @param {string} [params.userId] - user id for building search context
 */
export async function queryVenuesFromDb({ query, keywords, venueTypes, priceLevel, areaOverride, excludeIds = [], limit = 22, lat, lon, radiusKm = 5, locationName = '', bypassCorrection = false, userId = null } = {}) {
  let correctionInfo = null;
  let intentSummary = null;
  let searchTerms = null;

  if (query) {
    // When pre-parsed keywords are supplied (e.g. from searchOrchestrator), skip the
    // refine-query round-trip — intent has already been parsed upstream.
    searchTerms = keywords?.length > 0 ? keywords : null;
    let searchQuery = query;

    if (!searchTerms) {
      // Attempt Gemini query refinement for better semantic keyword extraction + autocorrect + intent.
      // Falls back to simple keyword splitting if the edge function fails.
      try {
        const userContext = await buildSearchContext(userId);
        const { data } = await supabase.functions.invoke('refine-query', {
          body: { query, locationName, bypassCorrection, userContext },
        });
        if (Array.isArray(data?.keywords) && data.keywords.length > 0) {
          searchTerms = data.keywords;
        }
        if (data?.corrected_query) {
          searchQuery = data.corrected_query;
          correctionInfo = {
            correctedQuery: data.corrected_query,
            rawQuery: query,
            correctionApplied: data.correction_applied === true && data.corrected_query !== query,
          };
        }
        if (data?.intent?.interpreted_summary) {
          intentSummary = data.intent.interpreted_summary;
        }
      } catch {
        // Fall through to keyword splitting
      }
    }

    if (!searchTerms) {
      // Fallback: split into meaningful keywords, strip stop words and short tokens
      const STOP_WORDS = new Set([
        'a', 'an', 'the', 'and', 'or', 'in', 'at', 'to', 'of', 'for',
        'with', 'by', 'near', 'nearby', 'around', 'some', 'my', 'me',
      ]);
      const splitKeywords = searchQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
      searchTerms = splitKeywords.length > 0 ? splitKeywords : [searchQuery];
    }
  }

  const { data, error } = await supabase.functions.invoke('search-venues-db', {
    body: {
      keywords: searchTerms,
      venue_types: venueTypes,
      price_level: priceLevel,
      area_override: areaOverride,
      exclude_ids: excludeIds,
      limit,
      lat,
      lon,
      radius_km: radiusKm,
      is_db_only: isDbOnly(),
    },
  });
  if (error) throw error;

  return { ...data, correction_info: correctionInfo, intent_summary: intentSummary };
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
      query:            params.query,
      excludeIds:       params.exclude_ids || [],
      // Text search queries the full DB — no bounding box
      lat:              params.query ? null : params.lat,
      lon:              params.query ? null : params.lon,
      radiusKm:         params.radius_km,
      locationName:     params.location_name || '',
      bypassCorrection: params.bypassCorrection || false,
      userId:           params.user_id || null,
    });
  }

  // live_fallback: fall through to the recommend edge function for all requests.
  // The edge function handles Supabase-first lookup with filters (STEP 2a for search,
  // STEP 2 for discovery) before falling back to Google. Intercepting queries here
  // would bypass filter application (cuisine, price, open_now).
  return null;
}
