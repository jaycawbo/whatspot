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

const FOOD_DRINK_TYPES = new Set([
  'restaurant', 'bar', 'cafe', 'pub', 'food_court', 'cafeteria',
  'bar_and_grill', 'cocktail_bar', 'wine_bar', 'lounge_bar',
  'sports_bar', 'beer_garden', 'gastropub', 'hookah_bar',
  'irish_pub', 'night_club', 'brewpub', 'bistro',
  'coffee_shop', 'coffee_roastery', 'coffee_stand',
  'cat_cafe', 'dog_cafe', 'tea_house',
  'juice_shop', 'acai_shop', 'snack_bar',
  'bakery', 'bagel_shop', 'cake_shop', 'pastry_shop',
  'dessert_shop', 'donut_shop', 'ice_cream_shop',
  'chocolate_shop', 'chocolate_factory', 'candy_store', 'confectionery',
  'brewery', 'winery',
  'meal_delivery', 'meal_takeaway',
  'afghani_restaurant', 'african_restaurant', 'american_restaurant',
  'argentinian_restaurant', 'asian_fusion_restaurant', 'asian_restaurant',
  'australian_restaurant', 'austrian_restaurant', 'bangladeshi_restaurant',
  'barbecue_restaurant', 'basque_restaurant', 'bavarian_restaurant',
  'belgian_restaurant', 'brazilian_restaurant', 'breakfast_restaurant',
  'brunch_restaurant', 'buffet_restaurant', 'burmese_restaurant',
  'burrito_restaurant', 'cajun_restaurant', 'californian_restaurant',
  'cambodian_restaurant', 'cantonese_restaurant', 'caribbean_restaurant',
  'chicken_restaurant', 'chicken_wings_restaurant', 'chilean_restaurant',
  'chinese_noodle_restaurant', 'chinese_restaurant', 'colombian_restaurant',
  'croatian_restaurant', 'cuban_restaurant', 'czech_restaurant',
  'danish_restaurant', 'deli_restaurant', 'delidessert_restaurant',
  'dim_sum_restaurant', 'diner', 'dumpling_restaurant', 'dutch_restaurant',
  'eastern_european_restaurant', 'ethiopian_restaurant', 'european_restaurant',
  'falafel_restaurant', 'family_restaurant', 'fast_food_restaurant',
  'filipino_restaurant', 'fine_dining_restaurant', 'fish_and_chips_restaurant',
  'fondue_restaurant', 'french_restaurant', 'fusion_restaurant',
  'german_restaurant', 'greek_restaurant', 'gyro_restaurant',
  'halal_restaurant', 'hamburger_restaurant', 'hawaiian_restaurant',
  'hot_dog_restaurant', 'hot_dog_stand', 'hot_pot_restaurant',
  'hungarian_restaurant', 'indian_restaurant', 'indonesian_restaurant',
  'irish_restaurant', 'israeli_restaurant', 'italian_restaurant',
  'japanese_curry_restaurant', 'japanese_izakaya_restaurant', 'japanese_restaurant',
  'kebab_shop', 'korean_barbecue_restaurant', 'korean_restaurant',
  'latin_american_restaurant', 'lebanese_restaurant', 'malaysian_restaurant',
  'mediterranean_restaurant', 'mexican_restaurant', 'middle_eastern_restaurant',
  'mongolian_barbecue_restaurant', 'moroccan_restaurant', 'noodle_shop',
  'north_indian_restaurant', 'oyster_bar_restaurant', 'pakistani_restaurant',
  'persian_restaurant', 'peruvian_restaurant', 'pizza_delivery',
  'pizza_restaurant', 'polish_restaurant', 'portuguese_restaurant',
  'ramen_restaurant', 'romanian_restaurant', 'russian_restaurant',
  'salad_shop', 'sandwich_shop', 'scandinavian_restaurant', 'seafood_restaurant',
  'shawarma_restaurant', 'soul_food_restaurant', 'soup_restaurant',
  'south_american_restaurant', 'south_indian_restaurant',
  'southwestern_us_restaurant', 'spanish_restaurant', 'sri_lankan_restaurant',
  'steak_house', 'sushi_restaurant', 'swiss_restaurant', 'taco_restaurant',
  'taiwanese_restaurant', 'tapas_restaurant', 'tex_mex_restaurant',
  'thai_restaurant', 'tibetan_restaurant', 'tonkatsu_restaurant',
  'turkish_restaurant', 'ukrainian_restaurant', 'vegan_restaurant',
  'vegetarian_restaurant', 'vietnamese_restaurant', 'western_restaurant',
  'yakiniku_restaurant', 'yakitori_restaurant',
]);

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
    results:         venues.slice(0, 12),
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
 * @param {number} [params.limit]           - max rows (default 22)
 * @param {number} [params.lat]             - center latitude for bounding box
 * @param {number} [params.lon]             - center longitude for bounding box
 * @param {number} [params.radiusKm]        - search radius in km (default 5)
 * @param {boolean} [params.bypassCorrection] - skip autocorrect for this call
 * @param {string} [params.userId] - user id for building search context
 */
export async function queryVenuesFromDb({ query, keywords, venueTypes, priceLevel, areaOverride, excludeIds = [], limit = 22, lat, lon, radiusKm = 5, locationName = '', bypassCorrection = false, userId = null } = {}) {
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

    // Name-only: address matching causes false positives when cuisine keywords
    // (e.g. "italian") match neighbourhood names (e.g. "Little Italy, Toronto").
    // Location-scoped searches use areaOverride, not this keyword path.
    const conditions = searchTerms
      .flatMap((kw) => [`name.ilike.%${kw}%`])
      .join(',');
    qb = qb.or(conditions);
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

  qb = qb.limit(limit);

  const { data, error } = await qb;
  if (error) throw error;

  const rows = data || [];

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

  const foodRows = rows.filter((row) =>
    (row.venue_types || []).some((t) => FOOD_DRINK_TYPES.has(t))
  );
  return buildResponse(foodRows, correctionInfo, intentSummary);
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
