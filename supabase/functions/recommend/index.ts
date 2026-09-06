import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSuppressedVenueIds } from '../_shared/skipHistory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getSupabaseVenuesForArea(lat: number, lon: number, radiusKm: number, excludeIds: string[]): Promise<any[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  // Bounding box pre-filter (1.5× buffer), exact haversine applied in JS
  const latBuf = (radiusKm * 1.5) / 111;
  const lngBuf = (radiusKm * 1.5) / (111 * Math.cos(lat * Math.PI / 180));

  const { data, error } = await sb
    .from('venues')
    .select('google_place_id, name, lat, lng, rating, review_count, price_level, venue_types, business_status, photo_urls, photos_complete, photos_fetched_count, updated_at, address, regular_opening_hours, current_hours_cached_at')
    .gte('lat', lat - latBuf)
    .lte('lat', lat + latBuf)
    .gte('lng', lon - lngBuf)
    .lte('lng', lon + lngBuf)
    .or('business_status.eq.OPERATIONAL,business_status.is.null')
    .eq('is_chain', false)
    .not('google_place_id', 'is', null)
    .order('rating', { ascending: false })
    .limit(5000);

  if (error || !data) return [];

  const excludeSet = new Set(excludeIds.map((id: string) => id.replace(/^places\//, '')));

  return data.filter((v: any) => {
    if (!v.lat || !v.lng) return false;
    if (excludeSet.has(v.google_place_id)) return false;
    return calculateDistance(lat, lon, v.lat, v.lng) <= radiusKm;
  });
}


// ─── Fixed scoring constants — never modified by relaxation level ───
const SCORING = {
  RATING_FLOOR: 4.0,
  RATING_CEILING: 5.0,
  REVIEW_FLOOR: 25,
  REVIEW_CAP: 2000,
  RATING_WEIGHT: 0.60,
  REVIEW_WEIGHT: 0.40,
};

// ─── Food/drink venue type allowlist (discovery mode only) ───
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

function hasFoodDrinkType(types: string[] | undefined): boolean {
  return types?.some(t => FOOD_DRINK_TYPES.has(t)) ?? false;
}


// ─── Discovery mode threshold ladder ───
const DISCOVERY_CRITERIA = [
  { minRating: 4.0, minReviewCount: 25, scoreThreshold: 1.0 },
  { minRating: 3.8, minReviewCount: 20, scoreThreshold: 0.9 },
  { minRating: 3.5, minReviewCount: 15, scoreThreshold: 0.8 },
  { minRating: 3.3, minReviewCount: 10, scoreThreshold: 0.7 },
  { minRating: 3.0, minReviewCount: 5,  scoreThreshold: 0.6 },
  { minRating: 2.5, minReviewCount: 3,  scoreThreshold: 0.5 },
  { minRating: 0,   minReviewCount: 1,  scoreThreshold: 0.3 },
];
// ─── Expand query keywords to venue type fragments (canonical copy) ───

function expandQueryToTypes(queryWords: string[]): Set<string> {
  const expandedTypes = new Set<string>();
  for (const word of queryWords) {
    expandedTypes.add(word);
    if (word === 'steak') { expandedTypes.add('steak_house'); expandedTypes.add('steakhouse'); }
    if (word === 'sushi') { expandedTypes.add('sushi_restaurant'); }
    if (word === 'vegan') { expandedTypes.add('vegan_restaurant'); }
    if (word === 'pizza') { expandedTypes.add('pizza_restaurant'); }
    if (word === 'ramen') { expandedTypes.add('ramen_restaurant'); }
    if (word === 'burger') { expandedTypes.add('hamburger_restaurant'); }
    if (word === 'thai') { expandedTypes.add('thai_restaurant'); }
    if (word === 'chinese') { expandedTypes.add('chinese_restaurant'); }
    if (word === 'indian') { expandedTypes.add('indian_restaurant'); }
    if (word === 'italian') { expandedTypes.add('italian_restaurant'); }
    if (word === 'mexican') { expandedTypes.add('mexican_restaurant'); }
    if (word === 'french') { expandedTypes.add('french_restaurant'); }
    if (word === 'greek') { expandedTypes.add('greek_restaurant'); }
    if (word === 'korean') { expandedTypes.add('korean_restaurant'); }
    if (word === 'japanese') { expandedTypes.add('japanese_restaurant'); }
    if (word === 'spanish') { expandedTypes.add('spanish_restaurant'); }
    if (word === 'vietnamese') { expandedTypes.add('vietnamese_restaurant'); }
    if (word === 'brunch') { expandedTypes.add('brunch_restaurant'); expandedTypes.add('breakfast_restaurant'); expandedTypes.add('cafe'); }
    if (word === 'breakfast') { expandedTypes.add('breakfast_restaurant'); expandedTypes.add('brunch_restaurant'); expandedTypes.add('diner'); }
    if (word === 'seafood') { expandedTypes.add('seafood_restaurant'); }
    if (word === 'cocktail') { expandedTypes.add('cocktail_bar'); expandedTypes.add('bar'); }
    if (word === 'wine') { expandedTypes.add('wine_bar'); }
    if (word === 'coffee') { expandedTypes.add('coffee_shop'); expandedTypes.add('coffee_roastery'); expandedTypes.add('coffee_stand'); }
    if (word === 'cafe') { expandedTypes.add('cafe'); expandedTypes.add('coffee_shop'); expandedTypes.add('bakery'); }
    if (word === 'tapas') { expandedTypes.add('tapas_restaurant'); expandedTypes.add('spanish_restaurant'); }
    if (word === 'diner') { expandedTypes.add('diner'); expandedTypes.add('breakfast_restaurant'); }
    if (word === 'brewery' || word === 'breweries') { expandedTypes.add('brewery'); expandedTypes.add('brewpub'); expandedTypes.add('bar'); expandedTypes.add('pub'); }
    if (word === 'winery') { expandedTypes.add('winery'); expandedTypes.add('wine_bar'); }
    if (word === 'lebanese') { expandedTypes.add('lebanese_restaurant'); expandedTypes.add('middle_eastern_restaurant'); }
    if (word === 'persian') { expandedTypes.add('persian_restaurant'); expandedTypes.add('middle_eastern_restaurant'); }
    if (word === 'ethiopian') { expandedTypes.add('ethiopian_restaurant'); expandedTypes.add('african_restaurant'); }
    if (word === 'latin') { expandedTypes.add('latin_american_restaurant'); expandedTypes.add('mexican_restaurant'); }
    if (word === 'peruvian') { expandedTypes.add('peruvian_restaurant'); expandedTypes.add('latin_american_restaurant'); }
    if (word === 'portuguese') { expandedTypes.add('portuguese_restaurant'); }
    if (word === 'dim') { expandedTypes.add('dim_sum_restaurant'); expandedTypes.add('chinese_restaurant'); }
    if (word === 'dumplings' || word === 'dumpling') { expandedTypes.add('dumpling_restaurant'); expandedTypes.add('chinese_restaurant'); }
    if (word === 'tacos' || word === 'taco') { expandedTypes.add('taco_restaurant'); expandedTypes.add('mexican_restaurant'); }
    if (word === 'noodles' || word === 'noodle') { expandedTypes.add('noodle_shop'); expandedTypes.add('vietnamese_restaurant'); expandedTypes.add('ramen_restaurant'); }
    if (word === 'pho') { expandedTypes.add('vietnamese_restaurant'); expandedTypes.add('noodle_shop'); }
    if (word === 'bar' || word === 'bars') { expandedTypes.add('bar'); expandedTypes.add('pub'); expandedTypes.add('cocktail_bar'); }
    if (word === 'pub' || word === 'pubs') { expandedTypes.add('pub'); expandedTypes.add('bar'); }
    if (word === 'sandwich' || word === 'sandwiches') { expandedTypes.add('sandwich_shop'); expandedTypes.add('deli_restaurant'); }
    if (word === 'bakery' || word === 'bakeries') { expandedTypes.add('bakery'); expandedTypes.add('cafe'); }
    if (word === 'dessert') { expandedTypes.add('dessert_shop'); expandedTypes.add('ice_cream_shop'); expandedTypes.add('bakery'); }
    if (word === 'cream') { expandedTypes.add('ice_cream_shop'); expandedTypes.add('dessert_shop'); }
    if (word === 'bbq' || word === 'barbecue') { expandedTypes.add('barbecue_restaurant'); }
    if (word === 'wings') { expandedTypes.add('chicken_wings_restaurant'); expandedTypes.add('fast_food_restaurant'); }
    if (word === 'shawarma' || word === 'kebab' || word === 'falafel') { expandedTypes.add('middle_eastern_restaurant'); expandedTypes.add('turkish_restaurant'); }
    if (word === 'mediterranean') { expandedTypes.add('mediterranean_restaurant'); expandedTypes.add('greek_restaurant'); }
    if (word === 'middle') { expandedTypes.add('middle_eastern_restaurant'); }
    if (word === 'turkish') { expandedTypes.add('turkish_restaurant'); expandedTypes.add('middle_eastern_restaurant'); }
  }
  return expandedTypes;
}

// ─── Helpers ───

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parsePeriods(periods: any[]): any[] {
  return (periods || []).map((p: any) => ({
    day: p.open?.day ?? 0,
    open: `${String(p.open?.hour ?? 0).padStart(2, '0')}:${String(p.open?.minute ?? 0).padStart(2, '0')}`,
    close: p.close
      ? `${String(p.close.hour ?? 23).padStart(2, '0')}:${String(p.close.minute ?? 59).padStart(2, '0')}`
      : '23:59',
  }));
}

async function fetchVenueHoursFromPlaces(placeId: string, apiKey: string): Promise<any[] | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { checkAndLog } = await import('../_shared/apiCallLog.ts');
    const allowed = await checkAndLog(sb, 'hours', placeId);
    if (!allowed) return null;

    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'regularOpeningHours',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hours = parsePeriods(data.regularOpeningHours?.periods ?? []);
    if (hours.length > 0) {
      try {
        await sb.from('venues').update({
          regular_opening_hours: hours,
          hours_last_updated: new Date().toISOString(),
        }).eq('google_place_id', placeId);
      } catch { /* non-critical */ }
    }
    return hours.length > 0 ? hours : null;
  } catch {
    return null;
  }
}

function isOpenNow(regularOpeningHours: any): boolean {
  if (!regularOpeningHours || !Array.isArray(regularOpeningHours) || regularOpeningHours.length === 0) return false;
  const now = new Date();
  const day = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayPeriods = regularOpeningHours.filter((p: any) => p.day === day);
  if (todayPeriods.length === 0) return false;
  return todayPeriods.some((p: any) => {
    const close = p.close === '23:59' ? '24:00' : p.close;
    return currentTime >= p.open && currentTime <= close;
  });
}

function calculateVenueScore(rating: number, reviewCount: number, isRelaxedAdmission = false): number {
  if (!rating || !reviewCount) return 0;
  const normalizedRating = Math.max(
    0,
    ((rating - SCORING.RATING_FLOOR) / (SCORING.RATING_CEILING - SCORING.RATING_FLOOR)) * 10,
  );
  const normalizedReviews = Math.max(
    0,
    Math.min((reviewCount - SCORING.REVIEW_FLOOR) / (SCORING.REVIEW_CAP - SCORING.REVIEW_FLOOR), 1.0),
  ) * 10;
  const rawScore = normalizedRating * SCORING.RATING_WEIGHT + normalizedReviews * SCORING.REVIEW_WEIGHT;
  return isRelaxedAdmission ? rawScore * 0.85 : rawScore;
}


async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    console.error(`[${label}] failed:`, e?.message || e);
    return fallback;
  }
}


// ─── LLM helper ───

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

async function callLLM(model: string, systemPrompt: string, userPrompt: string, tools?: any[], toolChoice?: any, options?: { max_tokens?: number; temperature?: number; thinkingBudget?: number }): Promise<any> {
  const body: any = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  };

  if (tools && tools.length > 0) {
    // Convert OpenAI-style tool format to Gemini format
    const functionDeclarations = tools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
    body.tools = [{ function_declarations: functionDeclarations }];
    if (toolChoice?.function?.name) {
      body.tool_config = {
        function_calling_config: {
          mode: 'ANY',
          allowed_function_names: [toolChoice.function.name],
        },
      };
    }
  }

  if (options?.temperature !== undefined || options?.max_tokens !== undefined || options?.thinkingBudget !== undefined) {
    body.generationConfig = {};
    if (options.temperature !== undefined) body.generationConfig.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.generationConfig.maxOutputTokens = options.max_tokens;
    if (options.thinkingBudget !== undefined) body.generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget };
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`LLM error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const part = data.candidates?.[0]?.content?.parts?.[0];

  // If function call, return args directly (already a parsed object in Gemini)
  if (part?.functionCall) {
    return part.functionCall.args;
  }
  // Otherwise return text content
  return part?.text || '';
}

// ─── Google Places helpers (inlined) ───

async function googlePlacesBroadSearch(apiKey: string, query: string, lat: number, lon: number, radiusKm: number, openNow?: boolean, priceLevels?: string[], useRestriction = false) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const locationConfig = useRestriction
    ? { locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: radiusKm * 1000 } } }
    : { locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: radiusKm * 1000 } } };
  const reqBody: any = {
    textQuery: query,
    maxResultCount: 20,
    ...locationConfig,
  };
  if (openNow) reqBody.openNow = true;
  if (priceLevels && priceLevels.length > 0) reqBody.priceLevels = priceLevels;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.name,places.displayName,places.formattedAddress,places.types,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus',
    },
    body: JSON.stringify(reqBody),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google Places error ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return (data.places || []).map((place: any) => {
    let placeId = place.name;
    if (!placeId && place.id) {
      placeId = place.id.startsWith('places/') ? place.id : `places/${place.id}`;
    }
    return {
      place_id: placeId,
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      types: place.types || [],
      lat: place.location?.latitude,
      lon: place.location?.longitude,
      rating: place.rating,
      user_ratings_total: place.userRatingCount,
      price_level: place.priceLevel,
      business_status: place.businessStatus,
    };
  });
}


// ─── Price level map ───
const priceLevelMap: Record<string, string> = {
  PRICE_LEVEL_FREE: '$',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

function mapIntPriceLevel(level: number | null | undefined): string | null {
  if (level == null) return null;
  const map: Record<number, string> = { 0: '$', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
  return map[level] ?? null;
}

// ─── getSupabaseVenues — discovery feed, Supabase-first, zero Google API calls ───

async function getSupabaseVenues(params: {
  lat: number; lon: number;
  admission: { maxRadius: number; minRating: number; minReviewCount: number };
  exclude_ids: string[];
  price_levels?: string[];
  cuisine_types?: string[];
  open_now?: boolean;
  GOOGLE_KEY?: string;
  isDiscoveryMode?: boolean;
}): Promise<{ filteredVenues: any[]; reserve_venues: any[]; staged_venues: any[]; servedFromSupabase: boolean; relaxation_applied: boolean; relaxation_level: number }> {
  const { lat, lon, admission, exclude_ids, price_levels, cuisine_types, open_now, GOOGLE_KEY } = params;

  // Never ripple past the caller's selected radius — a user-set distance filter takes
  // priority over progressive widening. If maxRadius falls between/below the standard
  // rings, add it as the final ring so there's still at least one attempt at exactly
  // the radius the user chose.
  const RIPPLE_RINGS = [2, 4, 6, 8, 10, 12].filter((r) => r <= admission.maxRadius);
  if (RIPPLE_RINGS.length === 0 || RIPPLE_RINGS[RIPPLE_RINGS.length - 1] < admission.maxRadius) {
    RIPPLE_RINGS.push(admission.maxRadius);
  }
  const THRESHOLD = 10; // minimum raw venue pool before Google fallback fires

  // ─── Ripple ring expansion: find smallest radius with >= 22 pass-1 quality venues ───
  let rawPool: any[] = [];
  let activeRadius = 0;

  for (const ring of RIPPLE_RINGS) {
    const raw = await getSupabaseVenuesForArea(lat, lon, ring, exclude_ids);
    const typed = raw.filter((v: any) => hasFoodDrinkType(v.venue_types));
    if (typed.length >= THRESHOLD) {
      rawPool = typed;
      activeRadius = ring;
      break;
    }
  }

  if (activeRadius === 0) {
    console.warn('⚠️ getSupabaseVenues: no ring produced >= 22 quality venues — falling back to Google');
    return { filteredVenues: [], reserve_venues: [], staged_venues: [], servedFromSupabase: false, relaxation_applied: false, relaxation_level: 0 };
  }

  console.log(`🗄️ getSupabaseVenues: viable at ${activeRadius}km, ${rawPool.length} typed venues`);

  // ─── Apply filters ───
  let filtered = rawPool;

  if (price_levels?.length) {
    filtered = filtered.filter((v: any) => {
      const pl = mapIntPriceLevel(v.price_level);
      return pl == null || price_levels.includes(pl);
    });
  }

  if (cuisine_types?.length) {
    filtered = filtered.filter((v: any) =>
      v.venue_types?.length && cuisine_types.some((ct: string) => v.venue_types.includes(ct))
    );
  }

  if (open_now) {
    filtered = filtered.filter((v: any) => isOpenNow(v.regular_opening_hours));
  }

  // ─── Criteria pass ladder ───
  let admittedPool: any[] = [];
  let passIndex = 0;

  for (let i = 0; i < DISCOVERY_CRITERIA.length; i++) {
    const c = DISCOVERY_CRITERIA[i];
    const passed = filtered
      .map((v: any) => {
        const distance_km = calculateDistance(lat, lon, v.lat, v.lng);
        const isRelaxedAdmission = i > 0;
        const score = calculateVenueScore(v.rating, v.review_count, isRelaxedAdmission);
        return { ...v, distance_km, score, isRelaxedAdmission };
      })
      .filter((v: any) =>
        (v.rating ?? 0) >= c.minRating &&
        (v.review_count ?? 0) >= c.minReviewCount &&
        v.score >= c.scoreThreshold &&
        v.distance_km <= admission.maxRadius
      );
    if (passed.length >= THRESHOLD || i === DISCOVERY_CRITERIA.length - 1) {
      admittedPool = passed;
      passIndex = i;
      break;
    }
  }

  // ─── Cap candidate pool at 200 by score ───
  if (admittedPool.length > 200) {
    admittedPool = admittedPool.sort((a: any, b: any) => b.score - a.score).slice(0, 200);
  }

  // ─── Deterministic sort by score ───
  // No jitter here: the caller's STEP 4 always recomputes score + display_weight (with its
  // own fresh randomization for discovery mode) for every venue before the final response is
  // built, so a randomized shuffle at this stage has no effect on what the user actually sees.
  const shuffled = admittedPool
    .map((v: any) => ({ ...v, display_weight: v.score }))
    .sort((a: any, b: any) => b.display_weight - a.display_weight);

  // ─── Shared venue shape mapper ───
  const toShape = (v: any, extra: Record<string, any> = {}) => ({
    name: v.name,
    address: v.address || '',
    lat: v.lat,
    lon: v.lng,
    distance_km: v.distance_km,
    rating: v.rating,
    review_count: v.review_count,
    price_level: mapIntPriceLevel(v.price_level),
    place_id: `places/${v.google_place_id}`,
    category: (v.venue_types ?? []).find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
    cuisine_type: (v.venue_types ?? []).find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
    isRelaxedAdmission: v.isRelaxedAdmission ?? false,
    unknownPrice: false,
    _rawTypes: v.venue_types ?? [],
    _photoUrls: v.photo_urls ?? [],
    _regularOpeningHours: v.regular_opening_hours ?? null,
    photos_complete: v.photos_complete ?? false,
    photos_fetched_count: v.photos_fetched_count ?? 0,
    score: v.score,
    display_weight: v.display_weight,
    ...extra,
  });

  // ─── Result split ───
  // filteredVenues = full shuffled pool for the handler's scoring/LLM/reserve/staged pipeline
  let filteredVenues: any[] = shuffled.map((v: any) => toShape(v));

  // Pre-computed split (for future handler use when it reads these fields directly)
  const reserve_venues = shuffled.slice(12, 22).map((v: any) => toShape(v, { image_urls: v.photo_urls ?? [] }));

  const admittedIds = new Set(shuffled.map((v: any) => v.google_place_id));
  const staged_venues = rawPool
    .filter((v: any) => !admittedIds.has(v.google_place_id))
    .map((v: any) => {
      const distance_km = calculateDistance(lat, lon, v.lat, v.lng);
      const score = calculateVenueScore(v.rating, v.review_count, true);
      return { ...toShape({ ...v, distance_km, score, isRelaxedAdmission: true, display_weight: score }), staged_for_relaxation: true };
    })
    .filter((v: any) => v.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 30);

  // ─── Places API missing-hours recovery (open_now only) ───
  // Inert while Places API is disabled — fetchVenueHoursFromPlaces returns null on failure.
  if (open_now && GOOGLE_KEY) {
    const includedIds = new Set(filteredVenues.map((v: any) => v.place_id));
    const missingHours = rawPool
      .filter((v: any) => hasFoodDrinkType(v.venue_types))
      .filter((v: any) => !v.regular_opening_hours || (v.regular_opening_hours as any[]).length === 0)
      .filter((v: any) => !v.current_hours_cached_at || (Date.now() - new Date(v.current_hours_cached_at).getTime()) >= 12 * 60 * 60 * 1000)
      .filter((v: any) => !includedIds.has(`places/${v.google_place_id}`))
      .filter((v: any) => (v.rating ?? 0) >= DISCOVERY_CRITERIA[passIndex].minRating && (v.review_count ?? 0) >= DISCOVERY_CRITERIA[passIndex].minReviewCount)
      .slice(0, 3);
    if (missingHours.length > 0) {
      const recovered = await Promise.all(missingHours.map(async (v: any) => {
        const hours = await fetchVenueHoursFromPlaces(v.google_place_id, GOOGLE_KEY);
        if (!hours || !isOpenNow(hours)) return null;
        const distance_km = calculateDistance(lat, lon, v.lat, v.lng);
        const isRelaxedAdmission = passIndex > 0;
        const score = calculateVenueScore(v.rating, v.review_count, isRelaxedAdmission);
        return toShape({ ...v, distance_km, score, isRelaxedAdmission, display_weight: score + Math.random() * 0.3, regular_opening_hours: hours });
      }));
      filteredVenues = [...filteredVenues, ...recovered.filter(Boolean)];
    }
  }

  console.log(`✅ getSupabaseVenues: pass ${passIndex + 1}/${DISCOVERY_CRITERIA.length}, radius ${activeRadius}km → ${filteredVenues.length} pool, ${reserve_venues.length} reserve, ${staged_venues.length} staged`);

  return {
    filteredVenues,
    reserve_venues,
    staged_venues,
    servedFromSupabase: true,
    relaxation_applied: passIndex > 0,
    relaxation_level: passIndex + 1,
  };
}

// ─── Club disambiguation helper (search path) ───

const CLUB_FOOD_PREFIXES = /\b(supper|dinner|lunch|breakfast|brunch|country|social)\s+club\b/i;
const CLUB_FOOD_SUFFIXES = /\bclub\s+(sandwich|sandwiches|soda|wrap|salad)\b/i;
const CLUB_DINING_CONTEXT = /\b(food|dining|dinner|eat|restaurant|menu|cuisine|brunch|lunch|breakfast)\b/i;

function disambiguateClub(q: string): string {
  if (!/\bclub\b/i.test(q)) return q;
  if (CLUB_FOOD_PREFIXES.test(q) || CLUB_FOOD_SUFFIXES.test(q) || CLUB_DINING_CONTEXT.test(q.replace(/\bclub\b/gi, ''))) {
    return q;
  }
  return q.replace(/\bclub\b/gi, 'nightclub');
}

// ─── getGoogleVenues — Google Places fallback when Supabase coverage is insufficient ───

async function getGoogleVenues(params: {
  GOOGLE_KEY: string;
  refinedSearchTerm: string;
  location_name: string;
  lat: number; lon: number;
  admission: { maxRadius: number; minRating: number; minReviewCount: number };
  open_now?: boolean;
  price_levels?: string[];
  cuisine_types?: string[];
  isDiscoveryMode: boolean;
  isOnStreetSearch: boolean;
  detectedStreetName: string;
  detectedStreetBase: string;
  exclude_ids: string[];
  relaxation_level: number;
}): Promise<any[] | null> {
  const {
    GOOGLE_KEY, refinedSearchTerm, location_name, lat, lon, admission,
    open_now, price_levels, cuisine_types, isDiscoveryMode,
    isOnStreetSearch, detectedStreetName, detectedStreetBase,
    exclude_ids, relaxation_level,
  } = params;

  const reversePriceLevelMap: Record<string, string[]> = {
    '$': ['PRICE_LEVEL_FREE', 'PRICE_LEVEL_INEXPENSIVE'],
    '$$': ['PRICE_LEVEL_MODERATE'],
    '$$$': ['PRICE_LEVEL_EXPENSIVE'],
    '$$$$': ['PRICE_LEVEL_VERY_EXPENSIVE'],
  };
  const googlePriceLevels: string[] = [];
  if (price_levels && price_levels.length > 0) {
    price_levels.forEach((pl: string) => {
      if (reversePriceLevelMap[pl]) googlePriceLevels.push(...reversePriceLevelMap[pl]);
    });
  }

  let googleSearchQuery = disambiguateClub(refinedSearchTerm);
  if (isOnStreetSearch && detectedStreetBase) {
    const streetWords = detectedStreetBase.split(/\s+/);
    const locationNameWords = location_name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const locationWords = [...streetWords, 'street', 'st', 'avenue', 'ave', 'road', 'rd', 'boulevard', 'blvd', 'drive', 'dr', 'lane', 'ln', ...locationNameWords];
    googleSearchQuery = refinedSearchTerm
      .split(/[\s,]+/)
      .filter(w => !locationWords.includes(w.toLowerCase()))
      .join(' ')
      .trim();
    if (googleSearchQuery && !/(restaurant|cafe|bar|bistro|pub|eatery|diner|trattoria|pizzeria|bakery)/i.test(googleSearchQuery)) {
      googleSearchQuery += ' restaurant';
    }
    if (!googleSearchQuery) googleSearchQuery = 'restaurant';
    console.log(`📍 On-street: cleaned query "${refinedSearchTerm}" → "${googleSearchQuery}"`);
  }

  const googleLocationContext = isOnStreetSearch && detectedStreetName
    ? `${detectedStreetName}, ${location_name}`
    : location_name;

  console.log(`🌍 STEP 2: Google Places search for "${googleSearchQuery}" in "${googleLocationContext}"...`);

  let googleResults: any[];
  if (isOnStreetSearch && detectedStreetName) {
    googleResults = await googlePlacesBroadSearch(
      GOOGLE_KEY,
      `${googleSearchQuery} on ${detectedStreetName}, ${location_name}`,
      lat, lon, 3, open_now, googlePriceLevels, false,
    );
    console.log(`📊 Google returned ${googleResults.length} venues (on-street, locationBias 3km)`);
  } else if (isDiscoveryMode) {
    googleResults = await googlePlacesBroadSearch(
      GOOGLE_KEY,
      'restaurant OR bar OR cafe',
      lat, lon, Math.min(admission.maxRadius, 12), open_now, googlePriceLevels,
    );
    console.log(`📊 Discovery Google fallback: ${googleResults.length} venues from Places API`);
  } else {
    googleResults = await googlePlacesBroadSearch(
      GOOGLE_KEY,
      `${googleSearchQuery} in ${googleLocationContext}`,
      lat, lon, admission.maxRadius, open_now, googlePriceLevels,
    );
    console.log(`📊 Google returned ${googleResults.length} venues`);
  }

  if (exclude_ids.length > 0) {
    const excludeSet = new Set(exclude_ids.map((id: string) => id.replace(/^places\//, '')));
    const before = googleResults.length;
    googleResults = googleResults.filter((r: any) => !excludeSet.has((r.place_id || '').replace(/^places\//, '')));
    console.log(`🚫 Excluded ${before - googleResults.length} previously seen venues (${exclude_ids.length} exclude_ids)`);
  }

  if (googleResults.length === 0) return null;

  // ─── STEP 3: Filter + admission tagging ───
  console.log('🔍 STEP 3: Filtering...');
  const activeCuisineTypes: string[] = Array.isArray(cuisine_types) ? cuisine_types : [];
  const KNOWN_CUISINE_TYPES = [
    'italian_restaurant', 'japanese_restaurant', 'mexican_restaurant', 'chinese_restaurant',
    'american_restaurant', 'thai_restaurant', 'indian_restaurant', 'korean_restaurant',
    'mediterranean_restaurant', 'french_restaurant', 'vietnamese_restaurant',
    'middle_eastern_restaurant', 'greek_restaurant', 'spanish_restaurant', 'breakfast_restaurant',
  ];
  const selectedCuisineKnown = activeCuisineTypes.filter(ct => ct !== 'other');
  const cuisineIncludesOther = activeCuisineTypes.includes('other');

  const venueRows = googleResults
    .map((place: any) => {
      const distance_km = calculateDistance(lat, lon, place.lat, place.lon);
      if (distance_km > admission.maxRadius) return null;
      if (place.business_status === 'CLOSED_PERMANENTLY') return null;
      if (!place.rating || !place.user_ratings_total) return null;
      if (place.rating < admission.minRating || place.user_ratings_total < admission.minReviewCount) return null;
      const mappedPriceLevel = priceLevelMap[place.price_level] || null;
      let unknownPrice = false;
      if (price_levels && price_levels.length > 0) {
        if (mappedPriceLevel && !price_levels.includes(mappedPriceLevel)) return null;
        if (!mappedPriceLevel) unknownPrice = true;
      }
      if (activeCuisineTypes.length > 0) {
        const rawTypes: string[] = Array.isArray(place.types) ? place.types : [];
        const hasKnownMatch = selectedCuisineKnown.some(ct => rawTypes.includes(ct));
        const isOtherCuisine = !KNOWN_CUISINE_TYPES.some(kt => rawTypes.includes(kt));
        if (!hasKnownMatch && !(cuisineIncludesOther && isOtherCuisine)) return null;
      }
      const isRelaxedAdmission = place.rating < SCORING.RATING_FLOOR || place.user_ratings_total < SCORING.REVIEW_FLOOR;
      return {
        name: place.name, address: place.address, lat: place.lat, lon: place.lon,
        distance_km, rating: place.rating, review_count: place.user_ratings_total,
        price_level: mappedPriceLevel, place_id: place.place_id,
        category: place.types?.find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
        cuisine_type: place.types?.find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
        isRelaxedAdmission, unknownPrice, _rawTypes: place.types,
        business_status: place.business_status ?? null,
      };
    })
    .filter((v: any) => v !== null)
    .filter((v: any) => !isDiscoveryMode || hasFoodDrinkType(v._rawTypes));

  // Fire-and-forget: persist Google venues as skeleton rows so future Supabase searches find them.
  // ignoreDuplicates=true means existing rows are never overwritten — only net-new venues are inserted.
  if (venueRows.length > 0) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const priceToInt: Record<string, number> = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };
    const rows = venueRows.map((v: any) => ({
      google_place_id: (v.place_id || '').replace(/^places\//, ''),
      name:            v.name,
      lat:             v.lat,
      lng:             v.lon,
      rating:          v.rating,
      review_count:    v.review_count,
      price_level:     v.price_level ? (priceToInt[v.price_level] ?? null) : null,
      venue_types:     v._rawTypes || [],
      business_status: v.business_status ?? null,
      address:         v.address,
      enriched:        false,
      is_chain:        false,
    }));
    sb.from('venues')
      .upsert(rows, { onConflict: 'google_place_id', ignoreDuplicates: true })
      .then(() => {})
      .catch(() => {});
  }

  return venueRows;
}

// ─── Shared dedup helper ───

function dedup(venues: any[]): any[] {
  const seen = new Set();
  return venues.filter((v) => {
    const key = v.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Search pipeline ───

async function handleSearch(params: {
  search_term:      string;
  lat:              number;
  lon:              number;
  location_name:    string;
  admission:        any;
  exclude_ids:      string[];
  price_levels:     string[];
  cuisine_types:    string[];
  open_now:         boolean;
  relaxation_level: number;
  intent:           any;
  authUserId:       string | null;
  GOOGLE_KEY:       string;
  refined_search_term?: string;
}): Promise<{
  finalVenues:        any[];
  reserveVenues:      any[];
  servedFromSupabase: boolean;
  wasGoogleFallback:  boolean;
  gated:              boolean;
  search_summary:     any;
  suggested_chips:    string[];
}> {
  const {
    search_term, exclude_ids, price_levels, cuisine_types,
    open_now, relaxation_level, intent, authUserId, GOOGLE_KEY,
    refined_search_term,
  } = params;

  let lat = params.lat;
  let lon = params.lon;
  let location_name = params.location_name;
  const admission = { ...params.admission };
  const isDiscoveryMode = false;

  let refinedSearchTerm = search_term;

  // ─── STEPS 1 & 1b: Query refinement + location detection ───
  // Both steps are skipped when the caller (searchOrchestrator.js) already ran
  // refine-query and passed its output through as refined_search_term — re-deriving the
  // same keywords/location here would be a redundant Gemini call. See issue #288.
  // Callers that don't pre-parse (e.g. mode: 'browse_category') still hit the Gemini
  // fallback below, which also handles location detection since refine-query doesn't
  // extract location today.
  if (refined_search_term) {
    refinedSearchTerm = refined_search_term;
    console.log(`⏭️ STEPS 1 & 1b skipped — using pre-refined term: "${refinedSearchTerm}"`);
  } else {
    console.log('🤖 STEPS 1 & 1b: Running in parallel...');
    let refinedSearchTermResult = search_term;

    const [refinementResult, locationDetectionResult] = await Promise.all([
      safe('step1-refinement', () => callLLM(
        'gemini-2.5-flash',
        'You extract cuisine keywords from search queries for Google Places API. IMPORTANT: Do NOT include any location names, street names, city names, or neighbourhood names in your output. Only return food/cuisine/dining keywords.',
        `The user is searching for "${search_term}" in ${location_name}.\nIdentify the primary cuisine types, dietary needs, or specific culinary styles mentioned.\nIf the query implies a very specific type of food, extract those keywords.\nIf the query is generic (e.g., "best restaurants", "places to eat"), return "restaurant".\nDo NOT include location words like street names, city names, or neighbourhoods (e.g. do NOT include "College Street", "${location_name}", etc.).\nReturn ONLY a comma-separated list of 1-3 highly relevant and concise cuisine/food keywords suitable for a Google Places search.`,
        [{ type: 'function', function: { name: 'refine_query', description: 'Return refined search keywords', parameters: { type: 'object', properties: { keywords: { type: 'string', description: 'Comma-separated refined cuisine/food keywords only, no location names' } }, required: ['keywords'] } } }],
        { type: 'function', function: { name: 'refine_query' } },
        { max_tokens: 100, temperature: 0 },
      ), null),
      safe('step1b-location', () => callLLM(
        'gemini-2.5-flash',
        'You detect neighbourhood, district, or city names in search queries.',
        `Given the search query "${search_term}" and current location "${location_name}", identify if the query mentions a specific neighbourhood, district, or city name that is different from or more specific than the current location. Return the detected location string or "NONE" if no specific location is mentioned.`,
        [{ type: 'function', function: { name: 'detect_location', description: 'Return detected location or NONE', parameters: { type: 'object', properties: { detected_location: { type: 'string', description: 'The detected neighbourhood/district/city name, or "NONE"' } }, required: ['detected_location'] } } }],
        { type: 'function', function: { name: 'detect_location' } },
        { max_tokens: 100, temperature: 0 },
      ), null),
    ]);

    if (refinementResult?.keywords && refinementResult.keywords.toLowerCase() !== search_term.toLowerCase()) {
      refinedSearchTermResult = refinementResult.keywords;
      console.log(`✅ STEP 1: Refined to: "${refinedSearchTermResult}"`);
    }
    refinedSearchTerm = refinedSearchTermResult;

    if (locationDetectionResult?.detected_location && locationDetectionResult.detected_location !== 'NONE') {
      const detectedLocation = locationDetectionResult.detected_location;
      const geocodeQuery = location_name ? `${detectedLocation}, ${location_name}` : detectedLocation;
      console.log(`📍 STEP 1b: Detected location: "${detectedLocation}", geocoding as "${geocodeQuery}"...`);
      try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const geocodeResp = await fetch(`${SUPABASE_URL}/functions/v1/geocode-address`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: geocodeQuery, city_name: location_name || undefined }),
        });
        if (geocodeResp.ok) {
          const geocodeData = await geocodeResp.json();
          if (geocodeData.lat && geocodeData.lon) {
            const dLat = (geocodeData.lat - lat) * Math.PI / 180;
            const dLon = (geocodeData.lon - lon) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180) * Math.cos(geocodeData.lat*Math.PI/180) * Math.sin(dLon/2)**2;
            const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            if (distKm > 100) {
              console.warn(`⚠️ STEP 1b: Geocode result too far from user location (${distKm.toFixed(1)}km), discarding override`);
            } else {
              lat = geocodeData.lat;
              lon = geocodeData.lon;
              location_name = detectedLocation;
              admission.maxRadius = 2;
              console.log(`📍 STEP 1b: Location override: ${detectedLocation} (${lat}, ${lon}), ${distKm.toFixed(1)}km from user`);
            }
          }
        }
      } catch (e: any) {
        console.warn('⚠️ STEP 1b: Geocoding failed:', e.message);
      }
    }
    console.log('✅ STEPS 1 & 1b complete');
  }

  const locationNameWords = (location_name || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);

  // ─── Street detection ───
  const STREET_IDENTIFIERS = /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)\b/i;
  const PROXIMITY_WORDS = /\b(near|around|by|close\s+to|nearby|near\s+me|off\s+of|around\s+the\s+corner)\b/i;
  let isOnStreetSearch = false;
  let detectedStreetName = '';
  let detectedStreetBase = '';

  const hasProximityWords = PROXIMITY_WORDS.test(search_term || '');
  const streetSourceText = `${search_term || ''} ${location_name || ''} ${refinedSearchTerm || ''}`;

  if (!hasProximityWords && STREET_IDENTIFIERS.test(streetSourceText)) {
    isOnStreetSearch = true;
    let streetSource = '';
    if (STREET_IDENTIFIERS.test(location_name || '')) {
      streetSource = (location_name || '').split(',')[0].trim();
    } else {
      const match = streetSourceText.match(/(\w+)\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)\b/i);
      if (match) {
        streetSource = `${match[1]} ${match[2]}`;
      }
    }
    detectedStreetName = streetSource;
    detectedStreetBase = streetSource.replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)\b/gi, '').trim().toLowerCase();
    console.log(`📍 On-street search detected: "${detectedStreetName}" (base: "${detectedStreetBase}") — strict address filtering applied`);
    admission.maxRadius = 3;
  } else if (hasProximityWords) {
    console.log(`📍 Proximity words detected in query — using standard radius logic`);
  }

  // ─── Supabase search track ───
  let filteredVenues: any[] = [];
  let servedFromSupabase = false;

  let effectiveCuisineTypes: string[] | null = null;

  if (!isDiscoveryMode && !servedFromSupabase) {
    if (Array.isArray(cuisine_types) && cuisine_types.length > 0) {
      effectiveCuisineTypes = cuisine_types;
    } else if (refinedSearchTerm) {
      const queryWords = refinedSearchTerm.toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 2)
        .filter((w: string) => !['best', 'most', 'good', 'great', 'near', 'with', 'that', 'have',
          'find', 'show', 'want', 'restaurants', 'restaurant'].includes(w) && !locationNameWords.includes(w));

      if (queryWords.length > 0) {
        const expandedTypes = expandQueryToTypes(queryWords);
        if (expandedTypes.size > 0) effectiveCuisineTypes = [...expandedTypes];
      }
    }

    let sbSearchVenues = await safe('supabase-search', () =>
      getSupabaseVenuesForArea(lat, lon, admission.maxRadius, exclude_ids), []);

    console.log(`🗄️ Supabase-search: ${sbSearchVenues.length} raw venues found`);
    const allAreaVenues = sbSearchVenues;

    if (effectiveCuisineTypes?.length) {
      sbSearchVenues = sbSearchVenues.filter((v: any) => {
        if (!v.venue_types?.length) return false;
        return effectiveCuisineTypes!.some((ct: string) => v.venue_types.includes(ct));
      });
      console.log(`🔍 After cuisine filter: ${sbSearchVenues.length} venues`);
    }

    if (open_now) {
      sbSearchVenues = sbSearchVenues.filter((v: any) => isOpenNow(v.regular_opening_hours));
    }

    const sbAdmitted = sbSearchVenues.filter((v: any) =>
      (v.rating ?? 0) >= admission.minRating && (v.review_count ?? 0) >= admission.minReviewCount
    );

    const threshold = (Array.isArray(cuisine_types) && cuisine_types.length > 0) || !GOOGLE_KEY ? 1 : 5;
    if (sbAdmitted.length >= threshold) {
      servedFromSupabase = true;
      filteredVenues = sbAdmitted
        .map((v: any) => {
          const distance_km = calculateDistance(lat, lon, v.lat, v.lng);
          const isRelaxedAdmission = v.rating < SCORING.RATING_FLOOR || v.review_count < SCORING.REVIEW_FLOOR;
          return {
            name: v.name,
            address: v.address || '',
            lat: v.lat,
            lon: v.lng,
            distance_km,
            rating: v.rating,
            review_count: v.review_count,
            price_level: mapIntPriceLevel(v.price_level),
            place_id: `places/${v.google_place_id}`,
            category: (v.venue_types ?? []).find((t: string) =>
              t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
            cuisine_type: (v.venue_types ?? []).find((t: string) =>
              t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
            isRelaxedAdmission,
            unknownPrice: false,
            _rawTypes: v.venue_types ?? [],
            _photoUrls: v.photo_urls ?? [],
            photos_complete: v.photos_complete ?? false,
            photos_fetched_count: v.photos_fetched_count ?? 0,
          };
        })
        .filter((v: any) => {
          if (!price_levels?.length) return true;
          if (v.price_level == null) return true;
          return price_levels.includes(v.price_level);
        });
      console.log(`✅ Search served from Supabase: ${filteredVenues.length} venues after filters`);
    } else {
      let nameMatchVenues: any[] = [];
      const searchTermLower = (refinedSearchTerm || search_term || '').toLowerCase().trim();
      const searchWords = searchTermLower.split(/\s+/)
        .filter((w: string) => w.length > 2)
        .filter((w: string) => !['best', 'most', 'good', 'great', 'near', 'with', 'that', 'have',
          'find', 'show', 'want', 'restaurants', 'restaurant'].includes(w) && !locationNameWords.includes(w));

      if (searchWords.length > 0) {
        const admittedIds = new Set(sbAdmitted.map((v: any) => v.google_place_id));
        nameMatchVenues = allAreaVenues
          .filter((v: any) => hasFoodDrinkType(v.venue_types))
          .filter((v: any) => {
            const nameLower = (v.name || '').toLowerCase();
            return searchWords.some((w: string) => nameLower.includes(w));
          })
          .filter((v: any) => !admittedIds.has(v.google_place_id))
          .filter((v: any) =>
            (v.rating ?? 0) >= admission.minRating && (v.review_count ?? 0) >= admission.minReviewCount
          );
        if (open_now) {
          nameMatchVenues = nameMatchVenues.filter((v: any) => isOpenNow(v.regular_opening_hours));
        }
        console.log(`🔤 Name search fallback: ${nameMatchVenues.length} additional venues matched`);
      }

      const combined = [...sbAdmitted, ...nameMatchVenues];
      if (combined.length >= 5) {
        servedFromSupabase = true;
        filteredVenues = combined
          .map((v: any) => {
            const distance_km = calculateDistance(lat, lon, v.lat, v.lng);
            const isRelaxedAdmission = v.rating < SCORING.RATING_FLOOR || v.review_count < SCORING.REVIEW_FLOOR;
            return {
              name: v.name,
              address: v.address || '',
              lat: v.lat,
              lon: v.lng,
              distance_km,
              rating: v.rating,
              review_count: v.review_count,
              price_level: mapIntPriceLevel(v.price_level),
              place_id: `places/${v.google_place_id}`,
              category: (v.venue_types ?? []).find((t: string) =>
                t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
              cuisine_type: (v.venue_types ?? []).find((t: string) =>
                t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
              isRelaxedAdmission,
              unknownPrice: false,
              _rawTypes: v.venue_types ?? [],
              _photoUrls: v.photo_urls ?? [],
              photos_complete: v.photos_complete ?? false,
              photos_fetched_count: v.photos_fetched_count ?? 0,
            };
          })
          .filter((v: any) => {
            if (!price_levels?.length) return true;
            if (v.price_level == null) return true;
            return price_levels.includes(v.price_level);
          });
        console.log(`✅ Search served from Supabase (with name fallback): ${filteredVenues.length} venues`);
      } else {
        console.log(`⚠️ Supabase search returned ${combined.length} combined venues — falling through to Google`);
      }
    }
  }

  // ─── Completeness pass: fill obvious gaps when Supabase already served enough venues ───
  if (!isDiscoveryMode && GEMINI_API_KEY && servedFromSupabase) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sbGround = createClient(supabaseUrl, supabaseKey);
      const { checkAndLog } = await import('../_shared/apiCallLog.ts');

      // Circuit breaker on the Gemini call itself — cheap per-call, but uncapped would
      // otherwise scale linearly with search volume. Separate budget from the Places-call guard below.
      const llmAllowed = await checkAndLog(sbGround, 'completeness_llm', location_name, 1, 'gemini');
      if (!llmAllowed) {
        console.warn('⚠️ Completeness pass: monthly Gemini call cap reached, skipping');
      } else {
        const groundingRaw = await callLLM(
          'gemini-2.5-flash',
          'You are a knowledgeable local venue expert.',
          `List the 8 best ${refinedSearchTerm} venues in ${location_name}. Return only a JSON array of venue names, nothing else. Example: ["Venue Name 1", "Venue Name 2"]. Only include well-known, highly regarded venues.`,
          undefined, undefined,
          { max_tokens: 500, temperature: 0, thinkingBudget: 0 },
        );

        let venueNames: string[] = [];
        try {
          const cleaned = groundingRaw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          venueNames = JSON.parse(cleaned);
          if (!Array.isArray(venueNames)) venueNames = [];
        } catch { console.warn(`⚠️ Completeness pass: failed to parse Gemini response (length=${groundingRaw.length}): ${groundingRaw.slice(0, 200)}`); }

        console.log(`🔍 Completeness pass: ${venueNames.length} venue names from Gemini`);
        console.log(`🔍 Completeness pass names: ${venueNames.join(', ')}`);

        if (venueNames.length > 0 && GOOGLE_KEY) {
          const existingPlaceIds = new Set(filteredVenues.map((v: any) => (v.place_id || '').replace(/^places\//, '')));
          const groundingBiasRadius = (isOnStreetSearch || admission.maxRadius <= 3) ? 2000 : 25000;
          let completenessApiCalls = 0;
          let completenessAdded = 0;

          for (const venueName of venueNames.slice(0, 10)) {
            if (completenessApiCalls >= 5) break;

            // Supabase name-based cache check — serve for free if already in DB
            const { data: nameMatch } = await sbGround
              .from('venues')
              .select('google_place_id, name, lat, lng, rating, review_count, price_level, venue_types, address')
              .ilike('name', `%${venueName}%`)
              .not('google_place_id', 'is', null)
              .order('review_count', { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();

            if (nameMatch) {
              if (!hasFoodDrinkType(nameMatch.venue_types || [])) continue;
              const existingDist = calculateDistance(lat, lon, nameMatch.lat, nameMatch.lng);
              if (existingDist > admission.maxRadius) continue;
              if (existingPlaceIds.has(nameMatch.google_place_id)) continue;
              if (effectiveCuisineTypes?.length && !(nameMatch.venue_types || []).some((t: string) => effectiveCuisineTypes!.includes(t))) continue;
              filteredVenues.push({
                name:               nameMatch.name,
                address:            nameMatch.address || '',
                lat:                nameMatch.lat,
                lon:                nameMatch.lng,
                distance_km:        existingDist,
                rating:             nameMatch.rating,
                review_count:       nameMatch.review_count,
                price_level:        mapIntPriceLevel(nameMatch.price_level),
                place_id:           `places/${nameMatch.google_place_id}`,
                category:           (nameMatch.venue_types || []).find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
                cuisine_type:       (nameMatch.venue_types || []).find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
                isRelaxedAdmission: (nameMatch.rating || 0) < SCORING.RATING_FLOOR || (nameMatch.review_count || 0) < SCORING.REVIEW_FLOOR,
                unknownPrice:       false,
                _rawTypes:          nameMatch.venue_types || [],
                _photoUrls:         [],
                _fromGrounding:     true,
              });
              completenessAdded++;
              existingPlaceIds.add(nameMatch.google_place_id);
              console.log(`✅ Completeness pass: "${nameMatch.name}" served from Supabase cache`);
              continue;
            }

            // Not in Supabase — spend-guarded Places Text Search
            const allowed = await checkAndLog(sbGround, 'search_grounding', venueName);
            if (!allowed) continue;

            const textSearchResp = await fetch(
              'https://places.googleapis.com/v1/places:searchText',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Goog-Api-Key': GOOGLE_KEY,
                  'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.businessStatus',
                },
                body: JSON.stringify({
                  textQuery: `${venueName} ${location_name}`,
                  locationBias: {
                    circle: {
                      center: { latitude: lat, longitude: lon },
                      radius: groundingBiasRadius,
                    },
                  },
                  maxResultCount: 1,
                }),
              },
            );

            if (!textSearchResp.ok) continue;
            const textSearchData = await textSearchResp.json();
            const place = textSearchData.places?.[0];
            if (!place) continue;

            const cleanId = place.id || '';
            if (!cleanId) continue;
            if (existingPlaceIds.has(cleanId)) continue;
            if (!hasFoodDrinkType(place.types || [])) continue;
            if (effectiveCuisineTypes?.length && !(place.types || []).some((t: string) => effectiveCuisineTypes!.includes(t))) continue;

            const vLat = place.location?.latitude;
            const vLon = place.location?.longitude;
            if (!vLat || !vLon) continue;

            const sgDist = calculateDistance(lat, lon, vLat, vLon);
            if (sgDist > admission.maxRadius) continue;

            const sgPLRaw = place.priceLevel;
            let sgPLInt: number | null = null;
            if (sgPLRaw != null) {
              if (typeof sgPLRaw === 'number') {
                sgPLInt = sgPLRaw === 0 ? 1 : Math.min(sgPLRaw, 4);
              } else {
                const sgPLMap: Record<string, number> = {
                  PRICE_LEVEL_FREE: 1, PRICE_LEVEL_INEXPENSIVE: 1,
                  PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
                };
                sgPLInt = sgPLMap[sgPLRaw] ?? null;
              }
            }
            const sgPLStrs = ['$', '$', '$$', '$$$', '$$$$'];
            const sgMappedPL = sgPLInt != null ? (sgPLStrs[sgPLInt] || null) : null;

            await sbGround.from('venues').upsert([{
              google_place_id: cleanId,
              name:            place.displayName?.text || venueName,
              lat:             vLat,
              lng:             vLon,
              rating:          place.rating ?? null,
              review_count:    place.userRatingCount ?? null,
              price_level:     sgPLInt,
              venue_types:     place.types || [],
              business_status: place.businessStatus || null,
              address:         place.formattedAddress || '',
              enriched:        false,
              is_chain:        false,
            }], { onConflict: 'google_place_id', ignoreDuplicates: true });

            filteredVenues.push({
              name:               place.displayName?.text || venueName,
              address:            place.formattedAddress || '',
              lat:                vLat,
              lon:                vLon,
              distance_km:        sgDist,
              rating:             place.rating ?? null,
              review_count:       place.userRatingCount ?? null,
              price_level:        sgMappedPL,
              place_id:           `places/${cleanId}`,
              category:           (place.types || []).find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
              cuisine_type:       (place.types || []).find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
              isRelaxedAdmission: (place.rating || 0) < SCORING.RATING_FLOOR || (place.userRatingCount || 0) < SCORING.REVIEW_FLOOR,
              unknownPrice:       false,
              _rawTypes:          place.types || [],
              _photoUrls:         [],
              _fromGrounding:     true,
            });
            completenessAdded++;
            existingPlaceIds.add(cleanId);
            completenessApiCalls++;
            console.log(`✅ Completeness pass: "${place.displayName?.text || venueName}" added via Text Search`);
          }
          console.log(`🔍 Completeness pass total: ${completenessAdded} venues added to filteredVenues`);
        }
      }
    } catch (e: any) {
      console.warn('⚠️ Completeness pass failed silently:', e.message);
    }
  }

  // ─── Google fallback ───
  let wasGoogleFallback = false;

  if (!servedFromSupabase) {
    if (!GOOGLE_KEY) {
      console.warn('⚠️ Google Places API key not configured — no fallback available, returning empty results');
      throw new Error('GOOGLE_PLACES_API_KEY not configured');
    }
    if (!isDiscoveryMode && !GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    // Spend guard — tracks all Google fallback calls against monthly cap
    const { checkAndLog } = await import('../_shared/apiCallLog.ts');
    const sbGuard = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const locationKey = `disc_${Math.round(lat * 10) / 10}_${Math.round(lon * 10) / 10}`;
    const allowed = await checkAndLog(sbGuard, 'discovery_fallback', locationKey);
    if (!allowed) {
      return { gated: true, finalVenues: [], reserveVenues: [], servedFromSupabase: false, wasGoogleFallback: false, search_summary: null, suggested_chips: [] };
    }

    const googleVenues = await getGoogleVenues({
      GOOGLE_KEY, refinedSearchTerm, location_name, lat, lon, admission,
      open_now, price_levels, cuisine_types, isDiscoveryMode,
      isOnStreetSearch, detectedStreetName, detectedStreetBase,
      exclude_ids, relaxation_level,
    });

    if (googleVenues === null) {
      return { gated: false, finalVenues: [], reserveVenues: [], servedFromSupabase: false, wasGoogleFallback: false, search_summary: null, suggested_chips: [] };
    }
    filteredVenues = googleVenues;
    wasGoogleFallback = true;

    // ─── Live-grounding pass: real Google Search-grounded results, appended on top of the plain fallback ───
    // Runs after filteredVenues is populated above so results are appended/deduped, never overwritten.
    if (GEMINI_API_KEY) {
      try {
        const groundingResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Find venues in ${location_name} matching: ${refinedSearchTerm}` }] }],
              tools: [{ googleSearch: {} }],
              toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            }),
          },
        );

        if (groundingResp.ok) {
          const groundingData = await groundingResp.json();
          const chunks: any[] = groundingData.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          console.log('🗺️ Live grounding chunks:', JSON.stringify(chunks));

          const extractedIds: Array<{ cid?: string; placeId?: string; title: string }> = [];
          for (const chunk of chunks) {
            const uri: string  = chunk.web?.uri   || '';
            const title: string = chunk.web?.title || '';
            const cidMatch   = uri.match(/[?&]cid=(\d+)/);
            const placeMatch = uri.match(/place_id=(ChIJ[^&]+)/);
            if (cidMatch)   { extractedIds.push({ cid:     cidMatch[1],   title }); continue; }
            if (placeMatch) { extractedIds.push({ placeId: placeMatch[1], title }); }
          }

          if (extractedIds.length === 0) {
            console.log('🗺️ Live grounding: no placeIds extracted from response');
          } else if (GOOGLE_KEY) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const sbLive = createClient(supabaseUrl, supabaseKey);
            const { checkAndLog } = await import('../_shared/apiCallLog.ts');
            const existingPlaceIds = new Set(filteredVenues.map((v: any) => (v.place_id || '').replace(/^places\//, '')));
            let liveGroundingApiCalls = 0;
            let liveGroundingAdded = 0;

            for (const item of extractedIds.slice(0, 5)) {
              if (liveGroundingApiCalls >= 5) break;

              // Supabase name-based cache check — serve for free if already in DB, before spending on resolution
              if (item.title) {
                const { data: nameMatch } = await sbLive
                  .from('venues')
                  .select('google_place_id, name, lat, lng, rating, review_count, price_level, venue_types, address')
                  .ilike('name', `%${item.title}%`)
                  .not('google_place_id', 'is', null)
                  .limit(1)
                  .maybeSingle();

                if (
                  nameMatch &&
                  hasFoodDrinkType(nameMatch.venue_types || []) &&
                  !existingPlaceIds.has(nameMatch.google_place_id) &&
                  (!effectiveCuisineTypes?.length || (nameMatch.venue_types || []).some((t: string) => effectiveCuisineTypes!.includes(t)))
                ) {
                  const cacheDist = calculateDistance(lat, lon, nameMatch.lat, nameMatch.lng);
                  if (cacheDist <= admission.maxRadius) {
                    filteredVenues.push({
                      name:               nameMatch.name,
                      address:            nameMatch.address || '',
                      lat:                nameMatch.lat,
                      lon:                nameMatch.lng,
                      distance_km:        cacheDist,
                      rating:             nameMatch.rating,
                      review_count:       nameMatch.review_count,
                      price_level:        mapIntPriceLevel(nameMatch.price_level),
                      place_id:           `places/${nameMatch.google_place_id}`,
                      category:           (nameMatch.venue_types || []).find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
                      cuisine_type:       (nameMatch.venue_types || []).find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
                      isRelaxedAdmission: (nameMatch.rating || 0) < SCORING.RATING_FLOOR || (nameMatch.review_count || 0) < SCORING.REVIEW_FLOOR,
                      unknownPrice:       false,
                      _rawTypes:          nameMatch.venue_types || [],
                      _photoUrls:         [],
                      _fromGrounding:     true,
                    });
                    existingPlaceIds.add(nameMatch.google_place_id);
                    liveGroundingAdded++;
                    console.log(`✅ Live grounding: "${nameMatch.name}" served from Supabase cache`);
                    continue;
                  }
                }
              }

              // Spend guard before any Places API call
              const guardKey = item.cid ? `live_cid_${item.cid}` : `live_${item.placeId}`;
              const allowed = await checkAndLog(sbLive, 'live_grounding', guardKey);
              if (!allowed) continue;

              let cleanId: string | null = null;
              let resolvedDetails: any = null;

              if (item.cid) {
                // CID → place details in one call via legacy Places Details endpoint
                const legacyResp = await fetch(
                  `https://maps.googleapis.com/maps/api/place/details/json?cid=${item.cid}&fields=place_id,name,formatted_address,geometry,rating,user_ratings_total,price_level,types,business_status&key=${GOOGLE_KEY}`,
                );
                if (!legacyResp.ok) continue;
                const legacyData = await legacyResp.json();
                if (!legacyData.result?.place_id) continue;
                cleanId = legacyData.result.place_id.replace(/^places\//, '');
                resolvedDetails = legacyData.result;
              } else if (item.placeId) {
                cleanId = item.placeId.replace(/^places\//, '');
              }

              if (!cleanId) continue;
              if (existingPlaceIds.has(cleanId)) continue;

              const { data: existingById } = await sbLive
                .from('venues')
                .select('google_place_id')
                .eq('google_place_id', cleanId)
                .maybeSingle();

              if (existingById) continue;

              // Fetch full details via new Places API if not already resolved via CID
              if (!resolvedDetails) {
                const newDetailsResp = await fetch(
                  `https://places.googleapis.com/v1/places/${cleanId}`,
                  {
                    headers: {
                      'X-Goog-Api-Key': GOOGLE_KEY,
                      'X-Goog-FieldMask': 'displayName,formattedAddress,location,rating,userRatingCount,priceLevel,types,businessStatus',
                    },
                  },
                );
                if (!newDetailsResp.ok) continue;
                const nd = await newDetailsResp.json();
                // Normalise to legacy-style shape so the write-back below works for both paths
                resolvedDetails = {
                  name:               nd.displayName?.text    || '',
                  formatted_address:  nd.formattedAddress     || '',
                  geometry:           { location: { lat: nd.location?.latitude, lng: nd.location?.longitude } },
                  rating:             nd.rating               ?? null,
                  user_ratings_total: nd.userRatingCount      ?? null,
                  price_level:        nd.priceLevel           ?? null,
                  types:              nd.types                || [],
                  business_status:    nd.businessStatus       || null,
                };
              }

              const vLat = resolvedDetails.geometry?.location?.lat;
              const vLon = resolvedDetails.geometry?.location?.lng;
              if (!vLat || !vLon) continue;

              const liveDist = calculateDistance(lat, lon, vLat, vLon);
              if (liveDist > admission.maxRadius) continue;

              if (!hasFoodDrinkType(resolvedDetails.types || [])) continue;
              if (effectiveCuisineTypes?.length && !(resolvedDetails.types || []).some((t: string) => effectiveCuisineTypes!.includes(t))) continue;

              const livePLRaw = resolvedDetails.price_level;
              let livePLInt: number | null = null;
              if (livePLRaw != null) {
                if (typeof livePLRaw === 'number') {
                  livePLInt = livePLRaw === 0 ? 1 : Math.min(livePLRaw, 4);
                } else {
                  const livePLMap: Record<string, number> = {
                    PRICE_LEVEL_FREE: 1, PRICE_LEVEL_INEXPENSIVE: 1,
                    PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
                  };
                  livePLInt = livePLMap[livePLRaw] ?? null;
                }
              }
              const livePLStrs = ['$', '$', '$$', '$$$', '$$$$'];
              const liveMappedPL = livePLInt != null ? (livePLStrs[livePLInt] || null) : null;

              // Write skeleton row
              await sbLive.from('venues').upsert([{
                google_place_id: cleanId,
                name:            resolvedDetails.name || item.title || '',
                lat:             vLat,
                lng:             vLon,
                rating:          resolvedDetails.rating,
                review_count:    resolvedDetails.user_ratings_total,
                price_level:     livePLInt,
                venue_types:     resolvedDetails.types || [],
                business_status: null,
                address:         resolvedDetails.formatted_address || '',
                enriched:        false,
                is_chain:        false,
              }], { onConflict: 'google_place_id', ignoreDuplicates: true });

              const liveRelaxed = (resolvedDetails.rating || 0) < SCORING.RATING_FLOOR || (resolvedDetails.user_ratings_total || 0) < SCORING.REVIEW_FLOOR;
              filteredVenues.push({
                name:               resolvedDetails.name || item.title || '',
                address:            resolvedDetails.formatted_address || '',
                lat:                vLat,
                lon:                vLon,
                distance_km:        liveDist,
                rating:             resolvedDetails.rating,
                review_count:       resolvedDetails.user_ratings_total,
                price_level:        liveMappedPL,
                place_id:           `places/${cleanId}`,
                category:           (resolvedDetails.types || []).find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
                cuisine_type:       (resolvedDetails.types || []).find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
                isRelaxedAdmission: liveRelaxed,
                unknownPrice:       false,
                _rawTypes:          resolvedDetails.types || [],
                _photoUrls:         [],
                _fromGrounding:     true,
              });

              existingPlaceIds.add(cleanId);
              liveGroundingApiCalls++;
              liveGroundingAdded++;
              console.log(`✅ Live grounding: "${resolvedDetails.name || item.title}" added to DB and current results`);
            }
            console.log(`🗺️ Live grounding total: ${liveGroundingAdded} venues added to filteredVenues`);
          }
        }
      } catch (e: any) {
        console.warn('⚠️ Live grounding failed silently:', e.message);
      }
    }
  }
  console.log(`✅ ${filteredVenues.length} passed filters`);

  // ─── STEP 3a: Skip history suppression ───
  if (authUserId) {
    const suppressedIds = await getSuppressedVenueIds(authUserId);
    if (suppressedIds.size > 0) {
      const beforeSuppression = filteredVenues.length;
      filteredVenues = filteredVenues.filter((v: any) => {
        const placeId = (v.place_id || '').replace(/^places\//, '');
        return !suppressedIds.has(placeId);
      });
      console.log(`🚫 Skip history suppressed ${beforeSuppression - filteredVenues.length} venues (${suppressedIds.size} in history)`);
    }
  }

  // ─── STEP 3b: Street-level address validation ───
  let streetFilteredVenues = filteredVenues;

  if (isOnStreetSearch && filteredVenues.length > 0 && detectedStreetBase) {
    const streetNameLower = detectedStreetName.toLowerCase();
    const baseLower = detectedStreetBase.toLowerCase();

    const streetValidated = filteredVenues.map((v: any) => {
      const addrLower = (v.address || '').toLowerCase();

      // Tier 1 — Address match: venue address contains the detected street name
      const streetVariants = [
        streetNameLower,
        `${baseLower} street`, `${baseLower} st`,
        `${baseLower} avenue`, `${baseLower} ave`,
        `${baseLower} road`, `${baseLower} rd`,
        `${baseLower} boulevard`, `${baseLower} blvd`,
        `${baseLower} drive`, `${baseLower} dr`,
        `${baseLower} lane`, `${baseLower} ln`,
      ];
      if (streetVariants.some(variant => addrLower.includes(variant))) {
        console.log(`  ✅ Tier 1 (address match): "${v.name}" — ${v.address}`);
        return { ...v, streetTier: 1 };
      }

      // Tier 2 — Proximity match: within 50m of geocoded street centerline
      const distFromStreet = calculateDistance(lat, lon, v.lat, v.lon);
      if (distFromStreet <= 0.05) {
        console.log(`  ✅ Tier 2 (proximity ${(distFromStreet * 1000).toFixed(0)}m): "${v.name}" — ${v.address}`);
        return { ...v, streetTier: 2 };
      }

      console.log(`  ❌ Failed both tiers: "${v.name}" — ${v.address} (dist: ${(distFromStreet * 1000).toFixed(0)}m)`);
      return null;
    }).filter((v: any) => v !== null);

    if (streetValidated.length >= 3) {
      streetFilteredVenues = streetValidated;
      console.log(`📍 Street filter kept ${streetFilteredVenues.length}/${filteredVenues.length} venues on "${detectedStreetName}"`);
    } else {
      console.warn(`⚠️ Street filter returned too few results (${streetValidated.length}), falling back to radius search`);
      const nonStreet = filteredVenues.filter((v: any) => !streetValidated.find((sv: any) => sv.place_id === v.place_id));
      streetFilteredVenues = [...streetValidated, ...nonStreet];
    }
  }

  if (streetFilteredVenues.length === 0) {
    return { gated: false, finalVenues: [], reserveVenues: [], servedFromSupabase, wasGoogleFallback, search_summary: null, suggested_chips: [] };
  }

  // ─── STEP 4: Score + sort ───
  const intentPriceLevels: Record<string, number[]> = {
    budget: [0, 1],
    mid: [2],
    upscale: [3, 4],
  };
  const intentPriceTarget = intent?.price_signal ? intentPriceLevels[intent.price_signal] : null;

  const scoredMapped = streetFilteredVenues
    .map((venue: any) => {
      let score = calculateVenueScore(venue.rating, venue.review_count, venue.isRelaxedAdmission);
      if (venue.unknownPrice) score *= 0.7; // Down-rank venues with unknown price when price filter is active

      // Soft intent boost — never hard-filters, only nudges ranking
      if (!isDiscoveryMode && intent) {
        const priceNum = typeof venue.price_level === 'number'
          ? venue.price_level
          : { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 }[venue.price_level as string] ?? null;
        if (intentPriceTarget && priceNum !== null && intentPriceTarget.includes(priceNum)) {
          score *= 1.15;
        }
      }

      const display_weight = isDiscoveryMode ? score + (Math.random() * 0.3) : score;
      return { ...venue, score, display_weight };
    });

  const groundingInStep4 = scoredMapped.filter((v: any) => v._fromGrounding);
  const groundingWouldDrop = groundingInStep4.filter((v: any) => v.score <= admission.minScore).length;
  if (groundingInStep4.length > 0) {
    console.log(`🔍 STEP 4 grounding: ${groundingInStep4.length - groundingWouldDrop} passed score filter naturally, ${groundingWouldDrop} exempted (score ≤ ${admission.minScore})`);
  }

  const scoredVenues = scoredMapped
    .filter((v: any) => v._fromGrounding || v.score > admission.minScore)
    .sort((a: any, b: any) => b.display_weight - a.display_weight);

  console.log(`📊 STEP 4: ${scoredVenues.length} scored above ${admission.minScore}`);

  const candidates = dedup(scoredVenues).slice(0, 20);

  // ─── Query-intent pre-filter ───
  const isSearchMode = !!search_term;
  let filteredCandidates = candidates;
  let typeMatchedIds = new Set<string>();

  if (isSearchMode && refinedSearchTerm) {
    const queryWords = refinedSearchTerm.toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 2)
      .filter((w: string) => !['best', 'most', 'good', 'great', 'near', 'with', 'that', 'have', 'find', 'show', 'want', 'restaurants', 'restaurant'].includes(w) && !locationNameWords.includes(w));

    if (queryWords.length > 0) {
      const expandedTypes = expandQueryToTypes(queryWords);

      const typeMatched = candidates.filter((v: any) => {
        const rawTypes: string[] = (v._rawTypes || []).map((t: string) => t.toLowerCase());
        const cat = (v.category || '').toLowerCase();
        const restaurantTypes = rawTypes.filter((t: string) => t.endsWith('_restaurant'));
        const hasContradiction = restaurantTypes.length > 0 && !restaurantTypes.some((t: string) => expandedTypes.has(t));
        if (hasContradiction) return false;
        return rawTypes.some((t: string) => expandedTypes.has(t)) || expandedTypes.has(cat);
      });

      typeMatchedIds = new Set(typeMatched.map((v: any) => v.place_id));
      const unmatched = candidates.filter((v: any) => !typeMatchedIds.has(v.place_id));
      const unmatchedFiltered = unmatched.filter((v: any) =>
        !(v._rawTypes || []).some((t: string) => t.endsWith('_restaurant'))
      );

      // Priority order: type-matched first, then contradiction-filtered unmatched to fill up to 20
      filteredCandidates = [...typeMatched, ...unmatchedFiltered].slice(0, 20);
      console.log(`🎯 Query-intent pre-filter: ${typeMatched.length} type-matched + ${Math.min(unmatchedFiltered.length, 20 - typeMatched.length)} unmatched = ${filteredCandidates.length} candidates`);
    }
  }

  // ─── Comprehensive LLM ───
  console.log('🤖 COMPREHENSIVE LLM: Scoring, descriptors, summary & chips...');
  const llmCallStart = Date.now();

  const candidateList = filteredCandidates.map((v: any, i: number) => {
    const displayName = v.name.split(/[|–—:]/).at(0).trim();
    const typeHints = (v._rawTypes || []).slice(0, 2).join(', ');
    return `${i + 1}. ${displayName} | PRIMARY TYPE: ${v.cuisine_type || 'restaurant'} | also tagged: ${typeHints || 'none'} | ${v.rating}★, ${v.review_count} reviews, ${v.price_level || 'price unknown'}, ${v.distance_km?.toFixed(1)}km`;
  }).join('\n');

  let finalVenues: any[] = [];
  let search_summary: any = null;
  let suggested_chips: string[] = [];

  const comprehensiveResult = await safe('comprehensive-llm', () => callLLM(
    'gemini-2.5-flash',
    `You are a knowledgeable local friend who knows the city's food and drink scene intimately. Evaluate venues and only include genuinely suitable matches. Venue types reflect what the place actually serves — use them as the primary relevance signal. A venue is NOT relevant if its primary purpose does not match the query intent. Examples of venues to exclude with confidence 0: an Italian restaurant for a coffee query, a shisha lounge for a coffee query, a sushi restaurant for a wine bar query, a gym for any food or drink query. A venue's PRIMARY TYPE is the strongest signal. If the PRIMARY TYPE is a cuisine category (italian, vegan, french, japanese, etc.) and the query is for a different category (coffee, wine bar, etc.), assign confidence 0 regardless of secondary tags. A venue scores below 0.5 only if the queried item is incidental to its primary activity. Only include venues where the queried item is a core part of what the venue is known for.`,
    `The user searched for "${search_term}" in ${location_name}.\n\nCandidate venues:\n${candidateList}\n\nReturn a JSON object with exactly these fields:\n- "rankings": array of objects for EVERY candidate venue listed above, each with { "index": number (1-based), "confidence": number (0.0-1.0), "reasoning": string (one sentence why this venue fits or doesn't) }. Score honestly: venues that are primarily what the query is about score 0.7-1.0. Venues where the queried item is incidental to a different primary purpose (e.g. a vegan restaurant or bakery that also happens to serve coffee, for a coffee query) score 0.2-0.4. Venues completely unrelated to the query score 0.0-0.1. Order by confidence descending.\n- "descriptors": array of arrays, one per rankings entry with confidence >= 0.5 only (in that same relative order — do not generate descriptors for venues scored below 0.5), each containing exactly 3 short evocative phrases (3-6 words each) that capture the venue's vibe, food or drink style, and one standout quality. Write them like a knowledgeable local would describe the place — specific and evocative, never generic. Examples: "candlelit date setting", "handmade pasta daily", "hidden neighbourhood gem", "natural wine focus", "wood-fired everything".\n- "summary": object with "intro" (one short phrase, max 10 words) and "bullets" (array of { name, note } where note is max 8 words).\n- "chips": array of 3-4 short follow-up search suggestions.`,
    [
      {
        type: 'function',
        function: {
          name: 'comprehensive_venue_analysis',
          description: 'Score venues, generate descriptors, summary and chips',
          parameters: {
            type: 'object',
            properties: {
              rankings: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'number' },
                    confidence: { type: 'number' },
                    reasoning: { type: 'string' }
                  },
                  required: ['index', 'confidence', 'reasoning']
                }
              },
              descriptors: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
              summary: {
                type: 'object',
                properties: {
                  intro: { type: 'string' },
                  bullets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { name: { type: 'string' }, note: { type: 'string' } },
                      required: ['name', 'note']
                    }
                  }
                },
                required: ['intro', 'bullets']
              },
              chips: { type: 'array', items: { type: 'string' } }
            },
            required: ['rankings', 'descriptors', 'chips'],
          }
        }
      }
    ],
    { type: 'function', function: { name: 'comprehensive_venue_analysis' } },
    { max_tokens: 4000, temperature: 0, thinkingBudget: 0 }
  ), { rankings: [], descriptors: [], summary: null, chips: [] });

  const rankings = comprehensiveResult.rankings || [];
  finalVenues = rankings
    .filter((r: any) => r.confidence >= 0.5)
    .slice(0, 8)
    .map((r: any, i: number) => {
      const venue = filteredCandidates[r.index - 1];
      if (!venue) return null;
      return {
        ...venue,
        descriptors: comprehensiveResult.descriptors?.[i] || [],
        llm_confidence: r.confidence,
        reasoning_explanation: r.reasoning,
      };
    })
    .filter(Boolean);


  // Backfill to guarantee 8 results — pool is type-matched only when typeMatchedIds is populated.
  if (finalVenues.length < 8) {
    const usedPlaceIds = new Set(
      rankings
        .filter((r: any) => r.confidence >= 0.5)
        .map((r: any) => filteredCandidates[r.index - 1]?.place_id)
        .filter(Boolean)
    );
    const rejectedPlaceIds = new Set(
      rankings
        .filter((r: any) => r.confidence < 0.1)
        .map((r: any) => filteredCandidates[r.index - 1]?.place_id)
        .filter(Boolean)
    );
    const confidenceByPlaceId = new Map(
      rankings
        .map((r: any) => [filteredCandidates[r.index - 1]?.place_id, r.confidence])
        .filter(([id]: any) => Boolean(id))
    );
    const backfillPool = typeMatchedIds.size > 0
      ? filteredCandidates.filter((v: any) => typeMatchedIds.has(v.place_id))
      : filteredCandidates;
    const backfill = backfillPool
      .filter((v: any) => !usedPlaceIds.has(v.place_id) && !rejectedPlaceIds.has(v.place_id))
      .map((v: any) => ({ ...v, descriptors: [], reasoning_explanation: '', llm_confidence: confidenceByPlaceId.get(v.place_id) ?? 0 }))
      .sort((a: any, b: any) => (b.llm_confidence || 0) - (a.llm_confidence || 0))
      .slice(0, 8 - finalVenues.length);
    finalVenues.push(...backfill);
  }

  search_summary = comprehensiveResult.summary || null;
  suggested_chips = comprehensiveResult.chips || [];

  console.log(`⏱️ Comprehensive LLM duration: ${Date.now() - llmCallStart}ms`);
  console.log(`✅ COMPREHENSIVE LLM complete — ${finalVenues.length} venues selected`);

  // ─── Reserve venues ───
  const finalVenueIds = new Set(finalVenues.map((v: any) => v.place_id));
  const reserveVenues = candidates
    .filter((v: any) => !finalVenueIds.has(v.place_id))
    .slice(0, 10);

  return {
    gated: false,
    finalVenues,
    reserveVenues,
    servedFromSupabase,
    wasGoogleFallback,
    search_summary,
    suggested_chips,
  };
}

// ─── Per-tab Gemini grounding for unseeded cities ────────────────────────────

async function getGroundedVenuesForTab(params: {
  tab: string;
  lat: number;
  lon: number;
  location_name: string;
  GOOGLE_KEY: string;
  sb: any;
  exclude_ids: string[];
  maxRadius: number;
}): Promise<any[]> {
  // `tab` is accepted for a future per-tab grounding prompt, but is currently unused:
  // the Walk-in/Popular/New/Trending tabs are served entirely by the free client-side
  // fetchTabVenues() query in useDiscoveryFeed.js and never call recommend() with a
  // non-default tab value, so this only ever runs for the default ambient feed's
  // cold-start fallback. Confirmed with the team (2026-07) this isn't being wired up
  // in the near term — removed the four per-tab prompt variants that could never be
  // reached as a result.
  const { lat, lon, location_name, GOOGLE_KEY, sb, exclude_ids, maxRadius } = params;

  const prompt = `Best restaurants bars and cafes in ${location_name}`;

  const groundingResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      }),
    },
  );

  if (!groundingResp.ok) {
    console.warn(`[getGroundedVenuesForTab] Gemini grounding failed: ${groundingResp.status}`);
    return [];
  }

  const groundingData = await groundingResp.json();
  const chunks: any[] = groundingData.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  console.log(`🗺️ Grounded discovery (${tab}): ${chunks.length} chunks`);

  const extractedIds: Array<{ cid?: string; placeId?: string; title: string }> = [];
  for (const chunk of chunks) {
    const uri: string   = chunk.web?.uri   || '';
    const title: string = chunk.web?.title || '';
    const cidMatch   = uri.match(/[?&]cid=(\d+)/);
    const placeMatch = uri.match(/place_id=(ChIJ[^&]+)/);
    if (cidMatch)   { extractedIds.push({ cid: cidMatch[1], title }); continue; }
    if (placeMatch) { extractedIds.push({ placeId: placeMatch[1], title }); }
  }

  if (extractedIds.length === 0) return [];

  const { checkAndLog } = await import('../_shared/apiCallLog.ts');
  const excludeSet = new Set(exclude_ids.map((id: string) => id.replace(/^places\//, '')));
  const PLMap: Record<string, number> = {
    PRICE_LEVEL_FREE: 1, PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  const PLStrs = ['$', '$', '$$', '$$$', '$$$$'];
  const results: any[] = [];

  for (const item of extractedIds.slice(0, 10)) {
    const guardKey = item.cid ? `gdisc_cid_${item.cid}` : `gdisc_${item.placeId}`;
    const allowed = await checkAndLog(sb, 'grounded_discovery', guardKey);
    if (!allowed) continue;

    let cleanId: string | null = null;
    let resolvedDetails: any = null;

    if (item.cid) {
      const legacyResp = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?cid=${item.cid}&fields=place_id,name,formatted_address,geometry,rating,user_ratings_total,price_level,types,business_status&key=${GOOGLE_KEY}`,
      );
      if (!legacyResp.ok) continue;
      const legacyData = await legacyResp.json();
      if (!legacyData.result?.place_id) continue;
      cleanId = legacyData.result.place_id.replace(/^places\//, '');
      resolvedDetails = legacyData.result;
    } else if (item.placeId) {
      cleanId = item.placeId.replace(/^places\//, '');
    }

    if (!cleanId || excludeSet.has(cleanId)) continue;

    const { data: existing } = await sb.from('venues').select('google_place_id').eq('google_place_id', cleanId).maybeSingle();
    if (existing) continue;

    if (!resolvedDetails) {
      const newDetailsResp = await fetch(
        `https://places.googleapis.com/v1/places/${cleanId}`,
        {
          headers: {
            'X-Goog-Api-Key': GOOGLE_KEY,
            'X-Goog-FieldMask': 'displayName,formattedAddress,location,rating,userRatingCount,priceLevel,types,businessStatus',
          },
        },
      );
      if (!newDetailsResp.ok) continue;
      const nd = await newDetailsResp.json();
      resolvedDetails = {
        name:               nd.displayName?.text    || '',
        formatted_address:  nd.formattedAddress     || '',
        geometry:           { location: { lat: nd.location?.latitude, lng: nd.location?.longitude } },
        rating:             nd.rating               ?? null,
        user_ratings_total: nd.userRatingCount      ?? null,
        price_level:        nd.priceLevel           ?? null,
        types:              nd.types                || [],
        business_status:    nd.businessStatus       || null,
      };
    }

    const vLat = resolvedDetails.geometry?.location?.lat;
    const vLon = resolvedDetails.geometry?.location?.lng;
    if (!vLat || !vLon) continue;

    const dist = calculateDistance(lat, lon, vLat, vLon);
    if (dist > maxRadius) continue;

    if (!hasFoodDrinkType(resolvedDetails.types || [])) continue;

    const plRaw = resolvedDetails.price_level;
    let plInt: number | null = null;
    if (plRaw != null) {
      plInt = typeof plRaw === 'number'
        ? (plRaw === 0 ? 1 : Math.min(plRaw, 4))
        : (PLMap[plRaw] ?? null);
    }
    const mappedPL = plInt != null ? (PLStrs[plInt] || null) : null;

    await sb.from('venues').upsert([{
      google_place_id: cleanId,
      name:            resolvedDetails.name || item.title || '',
      lat:             vLat,
      lng:             vLon,
      rating:          resolvedDetails.rating,
      review_count:    resolvedDetails.user_ratings_total,
      price_level:     plInt,
      venue_types:     resolvedDetails.types || [],
      business_status: null,
      address:         resolvedDetails.formatted_address || '',
      enriched:        false,
      is_chain:        false,
    }], { onConflict: 'google_place_id', ignoreDuplicates: true });

    results.push({
      name:               resolvedDetails.name || item.title || '',
      address:            resolvedDetails.formatted_address || '',
      lat:                vLat,
      lon:                vLon,
      distance_km:        dist,
      rating:             resolvedDetails.rating,
      review_count:       resolvedDetails.user_ratings_total,
      price_level:        mappedPL,
      place_id:           `places/${cleanId}`,
      category:           (resolvedDetails.types || []).find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
      cuisine_type:       (resolvedDetails.types || []).find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
      isRelaxedAdmission: false,
      unknownPrice:       false,
      _rawTypes:          resolvedDetails.types || [],
      _photoUrls:         [],
    });

    console.log(`✅ Grounded discovery (${tab}): "${resolvedDetails.name || item.title}" added`);
  }

  return results;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      mode,
      category,
      query,
      tab = 'discovery',
      radius_km,
      lat: originalLat,
      lon: originalLon,
      location_name: originalLocationName,
      relaxation_level = 0,
      open_now,
      price_levels,
      cuisine_types,
      exclude_ids = [],
      criteria_pass,
      intent,
      refined_search_term,
    } = await req.json();

    let lat = originalLat;
    let lon = originalLon;
    let location_name = originalLocationName;

    // ─── Extract authenticated user ID for skip_history suppression ───
    let authUserId: string | null = null;
    try {
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await sb.auth.getUser(token);
        authUserId = user?.id || null;
      }
    } catch {
      // Not authenticated — skip suppression
    }

    const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

    const isDiscoveryMode = mode === 'discovery' || (!query && mode !== 'browse_category');
    const searchTerm = isDiscoveryMode ? 'restaurant OR bar OR cafe' : (mode === 'browse_category' && category ? category : query);
    
    if (isDiscoveryMode) {
      console.log(`🎯 DISCOVERY MODE: returning top venues near (${lat}, ${lon})`);
    } else {
      console.log(`🎯 recommend: "${searchTerm}" at (${lat}, ${lon}) relaxation=${relaxation_level}`);
    }
    console.log(`🔧 Filters received — open_now: ${open_now}, price_levels: ${JSON.stringify(price_levels)}, radius_km: ${radius_km}`);

    // ─── Admission thresholds ───
    const admission = {
      minRating: 3.8,
      minReviewCount: 15,
      minScore: 0,
      maxRadius: radius_km || 5,
    };
    if (isDiscoveryMode) {
      // Threshold ladder for discovery — relaxes over successive passes
      const criteriaIndex = Math.min(Math.max((criteria_pass ?? 1) - 1, 0), 6);
      const discoveryCriteria = DISCOVERY_CRITERIA[criteriaIndex];
      admission.minRating = discoveryCriteria.minRating;
      admission.minReviewCount = discoveryCriteria.minReviewCount;
      admission.minScore = discoveryCriteria.scoreThreshold;
      admission.maxRadius = radius_km || 5;
      console.log(`🎚️ Discovery criteria_pass=${criteria_pass ?? 1} → minRating=${admission.minRating}, minReviews=${admission.minReviewCount}, minScore=${admission.minScore}`);
    } else if (relaxation_level === 1) {
      admission.maxRadius = 10;
    } else if (relaxation_level === 2) {
      admission.maxRadius = 10;
      admission.minRating = 3.5;
      admission.minScore = 0.8;
    } else if (relaxation_level >= 3) {
      admission.maxRadius = 15;
      admission.minRating = 3.5;
      admission.minScore = 0.5;
      admission.minReviewCount = 10;
    }

    let refinedSearchTerm = searchTerm;

    if (!isDiscoveryMode) {
      const searchResult = await handleSearch({
        search_term: searchTerm,
        lat,
        lon,
        location_name,
        admission,
        exclude_ids,
        price_levels: price_levels || [],
        cuisine_types: cuisine_types || [],
        open_now: open_now || false,
        relaxation_level,
        intent: intent || null,
        authUserId,
        GOOGLE_KEY: GOOGLE_KEY || '',
        refined_search_term: refined_search_term || undefined,
      });

      if (searchResult.gated) {
        return new Response(
          JSON.stringify({
            results: [], suggested_chips: [], search_summary: null,
            pagination: { has_more: false },
            relaxation_applied: relaxation_level > 0, relaxation_level,
            gated: true, nearby_overflow: [], reserve_venues: [], staged_venues: [],
            was_google_fallback: false,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { finalVenues, reserveVenues, wasGoogleFallback: searchGoogleFallback, search_summary, suggested_chips } = searchResult;
      const enrichedSearch = finalVenues.map((venue: any) => ({ ...venue, image_urls: venue._photoUrls || [] }));
      const searchResultsForFrontend = enrichedSearch.map(({ isRelaxedAdmission, unknownPrice, ...rest }: any) => rest);
      reserveVenues.forEach((venue: any) => { venue.image_urls = venue._photoUrls || []; });

      return new Response(
        JSON.stringify({
          results: searchResultsForFrontend,
          suggested_chips,
          search_summary,
          pagination: { has_more: false },
          relaxation_applied: relaxation_level > 0,
          relaxation_level,
          gated: false,
          nearby_overflow: [],
          reserve_venues: reserveVenues,
          staged_venues: [],
          was_google_fallback: searchGoogleFallback,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ─── Discovery: Supabase-first ───
    let filteredVenues: any[] = [];
    let servedFromSupabase = false;
    const discResult = await getSupabaseVenues({ lat, lon, admission, exclude_ids, price_levels, cuisine_types, open_now, GOOGLE_KEY, isDiscoveryMode: true });
    filteredVenues = discResult.filteredVenues;
    servedFromSupabase = discResult.servedFromSupabase;

    let wasGoogleFallback = false;

    if (!servedFromSupabase) {
      if (!GOOGLE_KEY) {
        console.warn('⚠️ Google Places API key not configured — no fallback available, returning empty results');
        throw new Error('GOOGLE_PLACES_API_KEY not configured');
      }
      // Spend guard — location-level circuit breaker for all discovery fallback paths
      const { checkAndLog } = await import('../_shared/apiCallLog.ts');
      const sbGuard = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const locationKey = `disc_${Math.round(lat * 10) / 10}_${Math.round(lon * 10) / 10}`;
      const allowed = await checkAndLog(sbGuard, 'discovery_fallback', locationKey);
      if (!allowed) {
        return new Response(
          JSON.stringify({
            results: [], suggested_chips: [], search_summary: null,
            pagination: { has_more: false },
            relaxation_applied: relaxation_level > 0, relaxation_level,
            gated: false, nearby_overflow: [], reserve_venues: [], staged_venues: [],
            was_google_fallback: false,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      let groundedVenues: any[] | null = null;
      if (GEMINI_API_KEY) {
        try {
          groundedVenues = await getGroundedVenuesForTab({
            tab, lat, lon, location_name, GOOGLE_KEY,
            sb: sbGuard, exclude_ids, maxRadius: admission.maxRadius,
          });
        } catch (e: any) {
          console.warn('[getGroundedVenuesForTab] failed silently:', e.message);
          groundedVenues = null;
        }
      }

      if (!groundedVenues || groundedVenues.length === 0) {
        const googleVenues = await getGoogleVenues({
          GOOGLE_KEY, refinedSearchTerm, location_name, lat, lon, admission,
          open_now, price_levels, cuisine_types, isDiscoveryMode: true,
          isOnStreetSearch: false, detectedStreetName: '', detectedStreetBase: '',
          exclude_ids, relaxation_level,
        });
        if (googleVenues === null) {
          return new Response(
            JSON.stringify({
              results: [], suggested_chips: [], search_summary: null,
              pagination: { has_more: false },
              relaxation_applied: relaxation_level > 0, relaxation_level,
              gated: false, nearby_overflow: [], reserve_venues: [], staged_venues: [],
              was_google_fallback: false,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        filteredVenues = googleVenues;
        wasGoogleFallback = true;
      } else {
        filteredVenues = groundedVenues;
        wasGoogleFallback = false;
      }
    }
    console.log(`✅ ${filteredVenues.length} passed filters`);

    // ─── STEP 3a: Skip history suppression (authenticated users only) ───
    if (authUserId) {
      const suppressedIds = await getSuppressedVenueIds(authUserId);
      if (suppressedIds.size > 0) {
        const beforeSuppression = filteredVenues.length;
        filteredVenues = filteredVenues.filter((v: any) => {
          const placeId = (v.place_id || '').replace(/^places\//, '');
          return !suppressedIds.has(placeId);
        });
        console.log(`🚫 Skip history suppressed ${beforeSuppression - filteredVenues.length} venues (${suppressedIds.size} in history)`);
      }
    }

    if (filteredVenues.length === 0) {
      return new Response(
        JSON.stringify({
          results: [],
          suggested_chips: [],
          search_summary: null,
          pagination: { has_more: false },
          relaxation_applied: relaxation_level > 0,
          relaxation_level,
          gated: false,
          nearby_overflow: [],
          reserve_venues: [],
          staged_venues: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ─── STEP 4: Score + sort (discovery) ───
    const scoredVenues = filteredVenues
      .map((venue: any) => {
        const score = calculateVenueScore(venue.rating, venue.review_count, venue.isRelaxedAdmission);
        const display_weight = score + (Math.random() * 0.3);
        return { ...venue, score, display_weight };
      })
      .filter((v: any) => v.score > admission.minScore)
      .sort((a: any, b: any) => b.display_weight - a.display_weight);

    console.log(`📊 STEP 4: ${scoredVenues.length} scored above ${admission.minScore}`);

    const candidates = dedup(scoredVenues).slice(0, 30);

    // ─── Discovery LLM: descriptors & chips ───
    console.log('🤖 Discovery LLM: descriptors & chips...');
    const llmCallStart = Date.now();

    let finalVenues: any[] = [];
    let search_summary: any = null;
    let suggested_chips: string[] = [];
    // ─── Descriptor cache lookup ───
    {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sbDesc = createClient(supabaseUrl, supabaseKey);

      // Only check/generate descriptors for the 12 that will be served
      const top12 = candidates.slice(0, 12);
      const batchIds = top12.map((v: any) => (v.place_id || '').replace(/^places\//, ''));

      const { data: cachedRows } = await sbDesc
        .from('venues')
        .select('google_place_id, descriptors')
        .in('google_place_id', batchIds);

      const cachedMap = new Map<string, string[]>();
      for (const row of (cachedRows || [])) {
        if (row.descriptors && row.descriptors.length > 0) {
          cachedMap.set(row.google_place_id, row.descriptors);
        }
      }

      const needsLLM = top12.filter((v: any) => !cachedMap.has((v.place_id || '').replace(/^places\//, '')));

      let newDescriptors: string[][] = [];
      let chips: string[] = [];

      if (needsLLM.length === 0) {
        console.log('⚡ All descriptors cached — chips-only LLM call');
        const venueNames = top12.map((v: any, i: number) => `${i + 1}. ${v.name}`).join('\n');
        const chipsResult = await safe('chips-only-llm', () => callLLM(
          'gemini-2.5-flash',
          `You are a knowledgeable local friend who knows the city's food and drink scene intimately.`,
          `Here are venues a user was shown:\n${venueNames}\n\nReturn a JSON object with:\n- "chips": array of 3-4 short follow-up search suggestions for discovering more venues nearby.`,
          [
            {
              type: 'function',
              function: {
                name: 'chips_only',
                description: 'Generate follow-up search chips',
                parameters: {
                  type: 'object',
                  properties: {
                    chips: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['chips'],
                },
              },
            },
          ],
          { type: 'function', function: { name: 'chips_only' } },
        ), { chips: [] });
        chips = chipsResult.chips || [];
      } else {
        console.log(`🤖 LLM needed for ${needsLLM.length}/${top12.length} venues`);
        const partialList = needsLLM.map((v: any, i: number) =>
          `${i + 1}. ${v.name} (${v.cuisine_type || 'restaurant'}, ${v.rating}★, ${v.review_count} reviews, ${v.price_level || 'price unknown'}, ${v.distance_km?.toFixed(1)}km)`
        ).join('\n');

        const discoveryResult = await safe('discovery-llm', () => callLLM(
          'gemini-2.5-flash',
          `You are a knowledgeable local friend who knows the city's food and drink scene intimately.`,
          `Here are nearby venues to describe:\n${partialList}\n\nReturn a JSON object with:\n- "descriptors": array of ${needsLLM.length} arrays, one per venue in order, each containing exactly 3 short evocative phrases (3-6 words each) that capture the venue's vibe, food or drink style, and one standout quality. Write them like a knowledgeable local would describe the place — specific and evocative, never generic. Examples: "candlelit date setting", "handmade pasta daily", "hidden neighbourhood gem", "natural wine focus", "wood-fired everything".\n- "chips": array of 3-4 short follow-up search suggestions for discovering more venues nearby.`,
          [
            {
              type: 'function',
              function: {
                name: 'discovery_venue_content',
                description: 'Generate descriptors and chips for discovery feed',
                parameters: {
                  type: 'object',
                  properties: {
                    descriptors: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                    chips: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['descriptors', 'chips'],
                }
              }
            }
          ],
          { type: 'function', function: { name: 'discovery_venue_content' } }
        ), { descriptors: [], chips: [] });

        newDescriptors = discoveryResult.descriptors || [];
        chips = discoveryResult.chips || [];

        // Fire-and-forget write-back of new descriptors to Supabase
        const writeRows = needsLLM
          .map((v: any, i: number) => ({
            google_place_id: (v.place_id || '').replace(/^places\//, ''),
            descriptors: newDescriptors[i] || [],
          }))
          .filter((r: any) => r.descriptors.length > 0);

        if (writeRows.length > 0) {
          sbDesc.from('venues')
            .upsert(writeRows, { onConflict: 'google_place_id' })
            .then(() => {})
            .catch(() => {});
        }
      }

      // Merge cached + new descriptors in original top12 order
      let llmIdx = 0;
      finalVenues = top12.map((v: any) => {
        const rawId = (v.place_id || '').replace(/^places\//, '');
        const cached = cachedMap.get(rawId);
        if (cached) return { ...v, descriptors: cached };
        return { ...v, descriptors: newDescriptors[llmIdx++] || [] };
      });
      suggested_chips = chips;
    }

    console.log(`⏱️ Discovery LLM duration: ${Date.now() - llmCallStart}ms`);
    console.log(`✅ Discovery LLM complete — ${finalVenues.length} venues selected`);

    // ─── Build reserve + staged venues ───
    const finalVenueIds = new Set(finalVenues.map((v: any) => v.place_id));
    const reserveVenues = candidates
      .filter((v: any) => !finalVenueIds.has(v.place_id))
      .slice(0, 10);

    const allSelectedIds = new Set([...finalVenueIds, ...reserveVenues.map((v: any) => v.place_id)]);
    const stagedVenues = dedup(filteredVenues)
      .filter((v: any) => !allSelectedIds.has(v.place_id))
      .map((v: any) => {
        const score = calculateVenueScore(v.rating, v.review_count, v.isRelaxedAdmission);
        return { ...v, score, staged_for_relaxation: true };
      })
      .filter((v: any) => v.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 30);
    console.log(`📦 Staged venues: ${stagedVenues.length}`);
    console.log(`📦 Reserve venues: ${reserveVenues.length}`);

    // ─── Reserve venues — photos served from Supabase cache ───
    reserveVenues.forEach((venue: any) => {
      venue.image_urls = venue._photoUrls || [];
    });

    // ─── STEP 5: Photos — serve from Supabase cache, no Google API calls ───
    const enriched = finalVenues.map((venue: any) => ({
      ...venue,
      image_urls: venue._photoUrls || [],
    }));

    const resultsWithDescriptors = enriched;

    // ─── Strip internal fields ───
    const resultsForFrontend = resultsWithDescriptors.map(({ isRelaxedAdmission, unknownPrice, ...rest }: any) => rest);

    return new Response(
      JSON.stringify({
        results: resultsForFrontend,
        suggested_chips,
        search_summary,
        pagination: { has_more: false },
        relaxation_applied: relaxation_level > 0,
        relaxation_level,
        gated: false,
        nearby_overflow: [],
        reserve_venues: reserveVenues,
        staged_venues: stagedVenues || [],
        was_google_fallback: wasGoogleFallback,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('❌ recommend error:', error);
    return new Response(
      JSON.stringify({ error: error.message, results: [], pagination: { has_more: false } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
