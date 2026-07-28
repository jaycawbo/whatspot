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
import { rawKeywordFallback } from '@/lib/parseSearchIntent';

// ─── Utilities ────────────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const DATA_SOURCE = import.meta.env.VITE_VENUE_DATA_SOURCE || 'live_fallback';
export const isDbOnly = () => DATA_SOURCE === 'db_only';

const WEEKLY_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Shape helpers ────────────────────────────────────────────────────────────

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

function buildResponse(rows, correctionInfo = null, intentSummary = null) {
  const venues = rows.map(rowToVenue);
  return {
    // Return everything the (widened) DB fetch found — the caller's scoreVenue()
    // step re-ranks by a review-count-aware score, not DB-level rating order, so
    // truncating to 12 here (before scoring runs) would silently throw away
    // better-reviewed candidates that just didn't have the highest raw rating.
    results:         venues,
    reserve_venues:  venues.slice(12, 22),
    nearby_overflow: [],
    suggested_chips: [],
    search_summary:  null,
    pagination:      { has_more: false },
    correction_info: correctionInfo,
    intent_summary:  intentSummary,
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
 * @param {string} [params.query]            - freetext search string
 * @param {string[]} [params.excludeIds]    - google_place_ids to exclude
 * @param {number} [params.limit]           - max rows (default 100 — deliberately wide so
 *   scoreVenue()'s review-count-aware ranking has a real pool to work with; DB-level
 *   `order by rating desc` alone would otherwise crowd out well-reviewed venues with a
 *   merely-very-good rating in favour of high-rating/low-review noise)
 * @param {number} [params.lat]             - center latitude for bounding box
 * @param {number} [params.lon]             - center longitude for bounding box
 * @param {number} [params.radiusKm]        - search radius in km (default 5)
 * @param {boolean} [params.bypassCorrection] - skip autocorrect for this call
 * @param {string} [params.userId] - user id for building search context
 */
export async function queryVenuesFromDb({ query, keywords, venueTypes, cuisineTypes, priceLevel, areaOverride, excludeIds = [], limit = 100, lat, lon, radiusKm = 5, locationName = '', bypassCorrection = false, userId = null } = {}) {
  let qb = supabase.from('venues').select('*');
  let correctionInfo = null;
  let intentSummary = null;

  if (query) {
    // When pre-parsed keywords are supplied (e.g. from searchOrchestrator), skip the
    // refine-query round-trip — intent has already been parsed upstream.
    let searchTerms = keywords?.length > 0 ? keywords : null;
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
      // Fallback: split into meaningful keywords, strip stop words and short tokens.
      // Shares parseSearchIntent's stopword list so the two can't drift out of sync.
      searchTerms = rawKeywordFallback(searchQuery);
    }

    if (cuisineTypes?.length > 0) {
      // Real cuisine signal available — match the structured venue_types column
      // (any overlap) instead of guessing off venue name text.
      qb = qb.overlaps('venue_types', cuisineTypes);
    } else {
      // No recognized cuisine for this query (e.g. a specific venue name, or a
      // cuisine word we don't have a mapping for) — name is the only signal we have.
      // Name-only: address matching causes false positives when cuisine keywords
      // (e.g. "italian") match neighbourhood names (e.g. "Little Italy, Toronto").
      // Location-scoped searches use areaOverride, not this keyword path.
      const conditions = searchTerms
        .flatMap((kw) => [`name.ilike.%${kw}%`])
        .join(',');
      qb = qb.or(conditions);
    }
  }

  // Apply bounding box when coords are available
  if (lat != null && lon != null) {
    const latBuf = (radiusKm * 1.5) / 111;
    const lngBuf = (radiusKm * 1.5) / (111 * Math.cos(lat * Math.PI / 180));
    qb = qb
      .gte('lat', lat - latBuf)
      .lte('lat', lat + latBuf)
      .gte('lng', lon - lngBuf)
      .lte('lng', lon + lngBuf);
  }

  if (venueTypes?.length > 0) {
    qb = qb.contains('venue_types', venueTypes);
  }
  if (priceLevel != null) {
    qb = qb.eq('price_level', priceLevel);
  }
  if (areaOverride) {
    qb = qb.ilike('neighbourhood', `%${areaOverride}%`);
  }

  if (excludeIds.length > 0) {
    qb = qb.not('google_place_id', 'in', `(${excludeIds.join(',')})`);
  }

  qb = qb.order('rating', { ascending: false, nullsFirst: false }).limit(limit);

  const { data, error } = await qb;
  if (error) throw error;

  let rows = data || [];

  // Prominence gate: .overlaps() matches anywhere in venue_types, so a coffee/cafe tag
  // buried deep in the array alongside an unrelated, specific primary category (e.g. a
  // Korean fried chicken restaurant secondarily tagged "cafe") would otherwise pass.
  // Clean matches empirically cluster in the first 3 entries — require that here since
  // this DB-level filter can't see position on its own.
  //
  // Position alone isn't enough — confirmed via real data (e.g. "Geladona", a Brazilian
  // restaurant/dessert shop with "cafe" as its 2nd tag) that a venue can clear the top-3
  // gate while its actual primary business is something else entirely. If the primary
  // type (index 0) is a specific, different dining category — not the generic
  // "restaurant", not one of the searched cuisine types itself — the match is likely
  // incidental, UNLESS the venue also carries a more specific tag from the searched set
  // (e.g. coffee_shop, not just the loose "cafe") signalling it really is that business.
  if (cuisineTypes?.length > 0) {
    rows = rows.filter((row) => {
      const venueTypes = row.venue_types || [];
      const matchIdx = venueTypes.findIndex((t) => cuisineTypes.includes(t));
      if (matchIdx === -1 || matchIdx > 2) return false;
      const primary = venueTypes[0];
      const primaryIsDifferentSpecificDining = primary !== 'restaurant' && primary?.endsWith('_restaurant') && !cuisineTypes.includes(primary);
      if (primaryIsDifferentSpecificDining) {
        return venueTypes.some((t) => t !== 'cafe' && cuisineTypes.includes(t));
      }
      return true;
    });
  }

  // Attach crow-flies distance to each row if user coords are available.
  if (lat != null && lon != null) {
    rows.forEach((row) => {
      if (row.lat != null && row.lng != null) {
        row._distance_km = haversineKm(lat, lon, row.lat, row.lng);
      }
    });
  }

  // Queue background weekly refresh for any stale venues (live_fallback only).
  // Photos are never queued on-demand.
  if (!isDbOnly()) {
    rows.forEach((row) => {
      if (isWeeklyStale(row)) queueWeeklyRefresh(row.google_place_id);
    });
  }

  return buildResponse(rows, correctionInfo, intentSummary);
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
