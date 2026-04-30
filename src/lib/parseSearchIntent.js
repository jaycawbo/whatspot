import { supabase } from '@/integrations/supabase/client';
import { buildSearchContext } from '@/lib/buildSearchContext';

const PRICE_SIGNAL_MAP = { budget: 1, mid: 2, upscale: 3 };

const OPEN_NOW_CONSTRAINTS = new Set(['open now', 'open late', 'late night', 'open 24 hours']);

function intentToVenueTypes(intent) {
  // Derive coarse venue type hints from vibe + occasion — not exhaustive,
  // used only to narrow the DB query when the intent is clear.
  const hints = [];
  const signals = [...(intent.vibe ?? []), intent.occasion ?? ''].map(s => s.toLowerCase());
  if (signals.some(s => s.includes('coffee') || s.includes('cafe') || s.includes('breakfast') || s.includes('brunch')))
    hints.push('cafe');
  if (signals.some(s => s.includes('bar') || s.includes('drink') || s.includes('cocktail') || s.includes('pub')))
    hints.push('bar');
  if (signals.some(s => s.includes('dinner') || s.includes('restaurant') || s.includes('date night') || s.includes('lunch')))
    hints.push('restaurant');
  return hints;
}

function rawKeywordFallback(rawQuery) {
  const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'in', 'at', 'to', 'of', 'for', 'with', 'by', 'near', 'nearby', 'around', 'some', 'my', 'me']);
  const words = rawQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return words.length > 0 ? words : [rawQuery];
}

export async function parseSearchIntent({ rawQuery, userCoordinates, userId = null }) {
  const fallback = {
    keywords: rawKeywordFallback(rawQuery),
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

  try {
    const userContext = await buildSearchContext(userId);
    const { data, error } = await supabase.functions.invoke('refine-query', {
      body: { query: rawQuery, locationName: '', userContext },
    });

    if (error || !data) return fallback;

    const intent = data.intent ?? {};
    const keywords = Array.isArray(data.keywords) && data.keywords.length > 0
      ? data.keywords
      : rawKeywordFallback(rawQuery);

    const correctionApplied = data.correction_applied === true && data.corrected_query && data.corrected_query !== rawQuery;

    return {
      keywords,
      venueTypes: intentToVenueTypes(intent),
      priceLevel: PRICE_SIGNAL_MAP[intent.price_signal] ?? null,
      radiusMetres: 5000,
      requireOpenNow: (intent.constraints ?? []).some(c => OPEN_NOW_CONSTRAINTS.has(c.toLowerCase())),
      areaOverride: null,
      vibeKeywords: intent.vibe ?? [],
      // Vibe-heavy with no occasion = ambiance matters more than review volume
      deprioritiseReviewCount: (intent.vibe?.length > 0) && !intent.occasion,
      intentSummary: intent.interpreted_summary || null,
      correctionInfo: correctionApplied
        ? { correctedQuery: data.corrected_query, rawQuery, correctionApplied: true }
        : null,
    };
  } catch {
    return fallback;
  }
}
