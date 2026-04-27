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

export async function runConversationalSearch({
  rawQuery,
  userCoordinates,
  conversationHistory = [],
  userId = null,
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

  const radiusKm = (intent.radiusMetres ?? 5000) / 1000;

  // Step 2a: DB query with pre-parsed params (skips internal refine-query round-trip)
  let venues = [];
  try {
    const dbResponse = await queryVenuesFromDb({
      query: rawQuery,
      keywords: intent.keywords,
      venueTypes: intent.venueTypes,
      priceLevel: intent.priceLevel,
      areaOverride: intent.areaOverride,
      lat,
      lon,
      radiusKm,
    });
    venues = dbResponse.results ?? [];
  } catch {
    // Fall through to Places API
  }

  // Step 2b: Places API fallback when DB results are below threshold
  if (venues.length < DB_THRESHOLD) {
    try {
      const { data } = await supabase.functions.invoke('recommend', {
        body: {
          mode: 'query',
          query: rawQuery,
          lat,
          lon,
          radius_km: radiusKm,
          open_now: intent.requireOpenNow || undefined,
          price_levels: intent.priceLevel ? [toPriceLevelString(intent.priceLevel)] : undefined,
          exclude_ids: venues.map(v => v.place_id),
          intent: { vibe: intent.vibeKeywords },
          session_context: [],
        },
      });
      const fallbackVenues = data?.results ?? [];
      const seen = new Set(venues.map(v => v.place_id));
      venues = [...venues, ...fallbackVenues.filter(v => !seen.has(v.place_id))];
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
