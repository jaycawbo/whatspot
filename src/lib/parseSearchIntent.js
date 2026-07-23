import { supabase } from '@/integrations/supabase/client';
import { buildSearchContext } from '@/lib/buildSearchContext';

const PRICE_SIGNAL_MAP = { budget: 1, mid: 2, upscale: 3 };

const OPEN_NOW_CONSTRAINTS = new Set(['open now', 'open late', 'late night', 'open 24 hours']);

function keywordsToCuisineTypes(keywords) {
  const types = new Set();
  for (const kw of keywords) {
    const w = kw.toLowerCase();
    if (w === 'italian') { types.add('italian_restaurant'); types.add('pizza_restaurant'); types.add('pizza_delivery'); }
    else if (w === 'japanese') { types.add('japanese_restaurant'); types.add('sushi_restaurant'); types.add('ramen_restaurant'); types.add('japanese_izakaya_restaurant'); types.add('yakitori_restaurant'); types.add('yakiniku_restaurant'); }
    else if (w === 'mexican') { types.add('mexican_restaurant'); types.add('taco_restaurant'); types.add('burrito_restaurant'); types.add('tex_mex_restaurant'); }
    else if (w === 'chinese') { types.add('chinese_restaurant'); types.add('cantonese_restaurant'); types.add('chinese_noodle_restaurant'); types.add('dim_sum_restaurant'); types.add('dumpling_restaurant'); types.add('hot_pot_restaurant'); }
    else if (w === 'american') { types.add('american_restaurant'); types.add('hamburger_restaurant'); types.add('hot_dog_restaurant'); types.add('chicken_wings_restaurant'); }
    else if (w === 'thai') { types.add('thai_restaurant'); }
    else if (w === 'indian') { types.add('indian_restaurant'); types.add('north_indian_restaurant'); types.add('south_indian_restaurant'); }
    else if (w === 'korean') { types.add('korean_restaurant'); types.add('korean_barbecue_restaurant'); }
    else if (w === 'french') { types.add('french_restaurant'); types.add('bistro'); }
    else if (w === 'vietnamese') { types.add('vietnamese_restaurant'); }
    else if (w === 'spanish') { types.add('spanish_restaurant'); types.add('tapas_restaurant'); types.add('basque_restaurant'); }
    else if (w === 'brunch') { types.add('brunch_restaurant'); types.add('breakfast_restaurant'); types.add('cafe'); }
    else if (w === 'breakfast') { types.add('breakfast_restaurant'); types.add('brunch_restaurant'); types.add('diner'); }
    else if (w === 'seafood') { types.add('seafood_restaurant'); types.add('oyster_bar_restaurant'); types.add('fish_and_chips_restaurant'); }
    else if (w === 'coffee') { types.add('coffee_shop'); types.add('cafe'); types.add('coffee_roastery'); types.add('coffee_stand'); }
    else if (w === 'cafe') { types.add('cafe'); types.add('coffee_shop'); types.add('bakery'); }
    else if (w === 'pizza') { types.add('pizza_restaurant'); types.add('pizza_delivery'); }
    else if (w === 'ramen') { types.add('ramen_restaurant'); }
    else if (w === 'sushi') { types.add('sushi_restaurant'); }
    else if (w === 'vegan') { types.add('vegan_restaurant'); }
    else if (w === 'steak') { types.add('steak_house'); types.add('steakhouse'); }
    else if (w === 'burger') { types.add('hamburger_restaurant'); }
    else if (w === 'greek') { types.add('greek_restaurant'); }
    else if (w === 'mediterranean') { types.add('mediterranean_restaurant'); types.add('greek_restaurant'); }
    else if (w === 'turkish') { types.add('turkish_restaurant'); types.add('middle_eastern_restaurant'); }
    else if (w === 'lebanese') { types.add('lebanese_restaurant'); types.add('middle_eastern_restaurant'); }
    else if (w === 'persian') { types.add('persian_restaurant'); types.add('middle_eastern_restaurant'); }
    else if (w === 'ethiopian') { types.add('ethiopian_restaurant'); types.add('african_restaurant'); }
    else if (w === 'latin') { types.add('latin_american_restaurant'); types.add('mexican_restaurant'); }
    else if (w === 'peruvian') { types.add('peruvian_restaurant'); types.add('latin_american_restaurant'); }
    else if (w === 'portuguese') { types.add('portuguese_restaurant'); }
    else if (w === 'pho' || w === 'noodle' || w === 'noodles') { types.add('vietnamese_restaurant'); types.add('noodle_shop'); types.add('ramen_restaurant'); }
    else if (w === 'taco' || w === 'tacos') { types.add('taco_restaurant'); types.add('mexican_restaurant'); }
    else if (w === 'dumpling' || w === 'dumplings') { types.add('dumpling_restaurant'); types.add('chinese_restaurant'); }
    else if (w === 'dim') { types.add('dim_sum_restaurant'); types.add('chinese_restaurant'); }
    else if (w === 'tapas') { types.add('tapas_restaurant'); types.add('spanish_restaurant'); }
    else if (w === 'bar' || w === 'bars') { types.add('bar'); types.add('pub'); types.add('cocktail_bar'); }
    else if (w === 'pub' || w === 'pubs') { types.add('pub'); types.add('bar'); }
    else if (w === 'cocktail') { types.add('cocktail_bar'); types.add('bar'); }
    else if (w === 'wine') { types.add('wine_bar'); }
    else if (w === 'brewery' || w === 'breweries') { types.add('brewery'); types.add('brewpub'); types.add('bar'); types.add('pub'); }
    else if (w === 'winery') { types.add('winery'); types.add('wine_bar'); }
    else if (w === 'bakery' || w === 'bakeries') { types.add('bakery'); types.add('cafe'); }
    else if (w === 'dessert') { types.add('dessert_shop'); types.add('ice_cream_shop'); types.add('bakery'); }
    else if (w === 'bbq' || w === 'barbecue') { types.add('barbecue_restaurant'); }
    else if (w === 'sandwich' || w === 'sandwiches') { types.add('sandwich_shop'); types.add('deli_restaurant'); }
    else if (w === 'shawarma' || w === 'kebab' || w === 'falafel') { types.add('middle_eastern_restaurant'); types.add('turkish_restaurant'); }
    else if (w === 'diner') { types.add('diner'); types.add('breakfast_restaurant'); }
  }
  return [...types];
}

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
  const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'in', 'at', 'to', 'of', 'for', 'with', 'by', 'near', 'nearby', 'around', 'some', 'my', 'me', 'toronto', 'vancouver', 'montreal', 'calgary', 'ottawa', 'best', 'great', 'good', 'top']);
  const words = rawQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return words.length > 0 ? words : [rawQuery];
}

export async function parseSearchIntent({ rawQuery, userCoordinates, userId = null }) {
  const fallbackKeywords = rawKeywordFallback(rawQuery);
  const fallback = {
    keywords: fallbackKeywords,
    cuisineTypes: keywordsToCuisineTypes(fallbackKeywords),
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
      cuisineTypes: keywordsToCuisineTypes(keywords),
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
