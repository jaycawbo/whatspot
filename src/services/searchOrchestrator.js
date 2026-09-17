import { supabase } from '@/integrations/supabase/client';
import { parseSearchIntent, SearchGateError } from '@/lib/parseSearchIntent';
import { queryVenuesFromDb } from '@/services/venueDataRouter';
import { scoreVenue } from '@/lib/scoreVenue';
import { buildResponsePrompt } from '@/lib/buildResponsePrompt';
import { matchObscureAttributes } from '@/lib/obscureAttributes';

const DB_THRESHOLD = 12;

function toPriceLevelString(level) {
  return (
    ['', 'PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'][level] ?? ''
  );
}

// Maps FilterDialog dollar-sign strings to DB numeric price levels
const PRICE_STR_TO_NUM = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };

// Converts a Google Places venue type to a human-readable label for query augmentation.
// e.g. 'middle_eastern_restaurant' → 'Middle Eastern'
function cuisineTypeToLabel(type) {
  return type
    .replace(/_restaurant$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function runConversationalSearch({
  rawQuery,
  userCoordinates,
  conversationHistory = [],
  userId = null,
  userFilters = {},
  locationName = '',
}) {
  const lat = userCoordinates?.lat ?? null;
  const lon = userCoordinates?.lon ?? userCoordinates?.lng ?? null;

  // Step 1: Parse intent — fall back to raw keyword split on failure
  let intent;
  try {
    intent = await parseSearchIntent({ rawQuery, userCoordinates, userId, locationName });
  } catch (err) {
    if (err instanceof SearchGateError) throw err;
    intent = {
      keywords: [rawQuery],
      venueTypes: [],
      priceLevel: null,
      radiusMetres: 5000,
      requireOpenNow: false,
      areaOverride: null,
      vibeKeywords: [],
      constraints: [],
      deprioritiseReviewCount: false,
      intentSummary: null,
      correctionInfo: null,
    };
  }

  // Merge user-set filters with LLM-parsed intent. User selections take precedence.
  const userPriceLevels = (userFilters.priceLevels ?? []).map(p => PRICE_STR_TO_NUM[p]).filter(Boolean);
  const effectiveRadius = userFilters.radius != null ? userFilters.radius : (intent.radiusMetres ?? 5000) / 1000;
  // openNow: merge LLM signal with user's explicit toggle. The default is now false in
  // GlobalStateContext so this only activates when the user deliberately selects "open now"
  // or the query clearly implies it (e.g. "open late").
  const effectiveOpenNow = intent.requireOpenNow || userFilters.openNow === true;
  // Keep intent venueTypes separate from user cuisines to avoid Supabase AND-all semantics
  const dbPriceLevel = userPriceLevels.length > 0 ? null : intent.priceLevel;

  // Step 2a: DB query with pre-parsed params (skips internal refine-query round-trip)
  let venues = [];
  try {
    const dbResponse = await queryVenuesFromDb({
      query: rawQuery,
      keywords: intent.keywords,
      venueTypes: intent.venueTypes ?? [],
      priceLevel: dbPriceLevel,
      areaOverride: intent.areaOverride,
      lat,
      lon,
      radiusKm: effectiveRadius,
    });
    venues = (dbResponse.results ?? []).filter(v => (v.rating ?? 0) >= 4.0);
  } catch {
    // Fall through to Places API
  }

  // Apply user cuisine filter client-side with OR semantics (any selected type matches).
  // Handled here rather than in the DB query to avoid the Supabase contains() AND constraint.
  if (userFilters.cuisines?.length > 0) {
    venues = venues.filter(v =>
      (v.types ?? []).some(t => userFilters.cuisines.includes(t))
    );
  }

  // Apply user price filter post-query (DB stores price_level as a number).
  // Unknown price_level is kept rather than excluded — a missing data point
  // shouldn't read the same as "doesn't match the filter".
  if (userPriceLevels.length > 0) {
    venues = venues.filter(v => v.price_level == null || userPriceLevels.includes(Number(v.price_level)));
  }

  // Step 2b: Places API fallback when DB results are below threshold.
  // When a cuisine filter is active, augment the Places query so Google returns
  // the right venue category instead of ignoring the filter entirely.
  if (venues.length < DB_THRESHOLD) {
    try {
      const cuisinePrefix = userFilters.cuisines?.length > 0
        ? userFilters.cuisines.map(cuisineTypeToLabel).join(' ') + ' '
        : '';
      // Use Gemini's typo-corrected query (e.g. "sishi" -> "sushi") — falling back to its
      // extracted keywords, then the raw query — so corrections made in refine-query reach
      // the Places fallback too, and recommend's handleSearch can skip its own redundant
      // refinement call entirely (issue #288).
      const refinedKeywords = intent.correctedQuery
        || (intent.keywords?.length > 0 ? intent.keywords.join(' ') : rawQuery);
      const placesQuery = cuisinePrefix ? `${cuisinePrefix}restaurant` : refinedKeywords;
      const placesPrice = userPriceLevels.length > 0
        ? userPriceLevels.map(toPriceLevelString).filter(Boolean)
        : (intent.priceLevel ? [toPriceLevelString(intent.priceLevel)] : undefined);
      const { data } = await supabase.functions.invoke('recommend', {
        body: {
          mode: 'query',
          query: placesQuery,
          refined_search_term: placesQuery,
          lat,
          lon,
          radius_km: effectiveRadius,
          open_now: effectiveOpenNow || undefined,
          price_levels: placesPrice,
          exclude_ids: venues.map(v => v.place_id),
          cuisine_types: intent.cuisineTypes?.length > 0 ? intent.cuisineTypes : undefined,
          location_name: locationName || undefined,
          // Neighbourhood/landmark already detected by refine-query (e.g. "Parkdale") — lets
          // recommend's STEP 1b geocode it directly without a redundant Gemini detection call.
          location_override: intent.areaOverride || undefined,
          intent: { vibe: intent.vibeKeywords },
          billable_search: true,
        },
      });
      if (data?.blocked) throw new SearchGateError(data.reason, data.nextAllowedAt);
      const fallbackVenues = (data?.results ?? []).filter(v => (v.rating ?? 0) >= 3.8);
      // Cuisine is already embedded in the placesQuery sent to recommend, so we don't
      // re-filter by type here — the edge function's venue types don't reliably include
      // the specific cuisine type string. Only apply the explicit user price filter.
      // Google Places frequently omits price_level entirely — treat unknown as a pass
      // rather than excluding it, same as the DB-results filter above.
      const filteredFallback = userPriceLevels.length > 0
        ? fallbackVenues.filter(v => v.price_level == null || userPriceLevels.includes(Number(v.price_level)))
        : fallbackVenues;
      const seen = new Set(venues.map(v => v.place_id));
      venues = [...venues, ...filteredFallback.filter(v => !seen.has(v.place_id))];
    } catch (err) {
      if (err instanceof SearchGateError) throw err;
      /* leave venues from DB only */
    }
  }

  // Step 2c: verify obscure attributes (byob, dog-friendly, wifi, outlets, quiet,
  // "hidden gem") that neither Supabase nor Places reliably tags. Only runs when the
  // query's parsed constraints/vibe actually mention one — most searches never trigger
  // this — and always as a single batched call covering every candidate venue, never
  // one call per venue. See issue #331.
  const obscureAttributes = matchObscureAttributes(intent.constraints, intent.vibeKeywords);
  if (obscureAttributes.length > 0 && venues.length > 0) {
    try {
      const { data } = await supabase.functions.invoke('verify-venue-attributes', {
        body: {
          venues: venues.map(v => ({ place_id: v.place_id, name: v.name, types: v.types, ai_description: v.ai_description })),
          attributes: obscureAttributes,
        },
      });
      const verdictByPlaceId = new Map((data?.verdicts ?? []).map(v => [v.place_id, v]));
      venues = venues
        .map(v => {
          const verdict = verdictByPlaceId.get(v.place_id);
          // No verdict returned for this venue (e.g. call failed) — treat as unsure
          // rather than drop it; we can't confirm absence either.
          if (!verdict) return v;
          const rejected = obscureAttributes.some(
            a => !(verdict.matches ?? []).includes(a) && !(verdict.unsure ?? []).includes(a)
          );
          if (rejected) return null;
          return v;
        })
        .filter(Boolean);
    } catch {
      // Verification is best-effort — leave venues unfiltered on failure.
    }
  }

  // Step 3: Score and sort
  const scored = venues
    .map(v => ({ ...v, _score: scoreVenue(v, { deprioritiseReviewCount: intent.deprioritiseReviewCount }) }))
    .sort((a, b) => b._score - a._score);

  // Step 4: Conversational copy — never blocks the search
  let copy = { conversational_response: '', venue_copy: [], refinement_suggestions: [] };
  try {
    copy = await buildResponsePrompt({
      venues: scored,
      originalQuery: rawQuery,
      vibeKeywords: intent.vibeKeywords,
      conversationHistory,
    });
  } catch { /* silent fallback */ }

  // Step 5: Merge why_recommended onto each venue by place_id
  const copyMap = new Map((copy.venue_copy ?? []).map(c => [c.place_id, c.why_recommended]));
  const enrichedVenues = scored.map(v => ({
    ...v,
    why_recommended: copyMap.get(v.place_id) ?? '',
  }));

  return {
    venues: enrichedVenues,
    conversational_response: copy.conversational_response ?? '',
    refinement_suggestions: copy.refinement_suggestions ?? [],
    intentSummary: intent.intentSummary,
    correctionInfo: intent.correctionInfo,
    parsed_intent: {
      keywords: intent.keywords,
      corrected_query: intent.correctedQuery,
      detected_location: intent.areaOverride,
      cuisine_types: intent.cuisineTypes,
    },
  };
}
