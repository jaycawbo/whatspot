import { supabase } from '@/integrations/supabase/client';
import { parseSearchIntent } from '@/lib/parseSearchIntent';
import { queryVenuesFromDb } from '@/services/venueDataRouter';
import { scoreVenue } from '@/lib/scoreVenue';
import { buildResponsePrompt } from '@/lib/buildResponsePrompt';

const DB_THRESHOLD = 3;

function toPriceLevelString(level) {
  return (
    ['', 'PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'][level] ?? ''
  );
}

// Maps FilterDialog dollar-sign strings to DB numeric price levels
const PRICE_STR_TO_NUM = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };


export async function runConversationalSearch({
  rawQuery,
  userCoordinates,
  conversationHistory = [],
  userId = null,
  userFilters = {},
}) {
  const lat = userCoordinates?.lat ?? null;
  const lon = userCoordinates?.lon ?? userCoordinates?.lng ?? null;

  // Step 1: Parse intent — fall back to raw keyword split on failure
  let intent;
  try {
    intent = await parseSearchIntent({ rawQuery, userCoordinates, userId });
  } catch {
    intent = {
      keywords: [rawQuery],
      venueTypes: [],
      priceLevel: null,
      radiusMetres: 5000,
      requireOpenNow: false,
      areaOverride: null,
      vibeKeywords: [],
      deprioritiseReviewCount: false,
      intentSummary: null,
      correctionInfo: null,
    };
  }

  // Merge user-set filters with LLM-parsed intent. User selections take precedence.
  const userPriceLevels = (userFilters.priceLevels ?? []).map(p => PRICE_STR_TO_NUM[p]).filter(Boolean);
  const effectiveRadius = userFilters.radius != null ? userFilters.radius : (intent.radiusMetres ?? 5000) / 1000;
  // openNow: only use the LLM's explicit signal — the filter default (true) caused 500s
  // in the recommend function when passed unconditionally. User-set openNow is wired
  // but only applied when the intent parser also confirms it.
  const effectiveOpenNow = intent.requireOpenNow;
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

  // Apply user price filter post-query (DB stores price_level as a number)
  if (userPriceLevels.length > 0) {
    venues = venues.filter(v => v.price_level != null && userPriceLevels.includes(Number(v.price_level)));
  }

  // Step 2b: Places API fallback when DB results are below threshold.
  // Pass cuisine_types directly — the recommend function handles it natively,
  // which is more reliable than query string augmentation.
  if (venues.length < DB_THRESHOLD) {
    try {
      const placesPrice = userPriceLevels.length > 0
        ? userPriceLevels.map(toPriceLevelString).filter(Boolean)
        : (intent.priceLevel ? [toPriceLevelString(intent.priceLevel)] : undefined);
      const { data } = await supabase.functions.invoke('recommend', {
        body: {
          mode: 'query',
          query: rawQuery,
          lat,
          lon,
          radius_km: effectiveRadius,
          location_name: '',
          open_now: effectiveOpenNow || undefined,
          price_levels: placesPrice,
          cuisine_types: userFilters.cuisines?.length > 0 ? userFilters.cuisines : undefined,
          exclude_ids: venues.map(v => v.place_id),
          intent: { vibe: intent.vibeKeywords },
          session_context: [],
        },
      });
      const fallbackVenues = (data?.results ?? []).filter(v => (v.rating ?? 0) >= 4.0);
      // Apply cuisine + price filters to fallback results as a safety net
      const filteredFallback = fallbackVenues.filter(v => {
        if (userFilters.cuisines?.length > 0 && !(v.types ?? []).some(t => userFilters.cuisines.includes(t))) return false;
        if (userPriceLevels.length > 0 && !(v.price_level != null && userPriceLevels.includes(Number(v.price_level)))) return false;
        return true;
      });
      const seen = new Set(venues.map(v => v.place_id));
      venues = [...venues, ...filteredFallback.filter(v => !seen.has(v.place_id))];
    } catch { /* leave venues from DB only */ }
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
  };
}
