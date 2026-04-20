import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Suppression windows (in days) by interaction type ───
const SUPPRESSION_DAYS: Record<string, number | null> = {
  passive_skip: 21,
  skip_for_now: 30,
  interested: 90,
  not_interested: 45,
  been_here: null, // indefinite
};

/**
 * Query skip_history and return venue IDs that should be suppressed.
 */
async function getSuppressedVenueIds(userId: string): Promise<Set<string>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await sb
    .from('skip_history')
    .select('venue_id, interaction_type, created_at')
    .eq('user_id', userId);

  if (error || !data) return new Set();

  const now = Date.now();
  const suppressed = new Set<string>();

  for (const row of data) {
    const days = SUPPRESSION_DAYS[row.interaction_type];
    if (days === null) {
      // Indefinite suppression (been_here)
      suppressed.add(row.venue_id);
    } else if (days !== undefined) {
      const createdAt = new Date(row.created_at).getTime();
      const windowMs = days * 24 * 60 * 60 * 1000;
      if (now - createdAt < windowMs) {
        suppressed.add(row.venue_id);
      }
    }
  }

  return suppressed;
}

async function getSupabaseVenuesForArea(lat: number, lon: number, radiusKm: number, excludeIds: string[]): Promise<any[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  // Bounding box pre-filter (1.5× buffer), exact haversine applied in JS
  const latBuf = (radiusKm * 1.5) / 111;
  const lngBuf = (radiusKm * 1.5) / (111 * Math.cos(lat * Math.PI / 180));

  const { data, error } = await sb
    .from('venues')
    .select('google_place_id, name, lat, lng, rating, review_count, price_level, venue_types, business_status, photo_urls, photos_complete, photos_fetched_count, updated_at, address, regular_opening_hours')
    .gte('lat', lat - latBuf)
    .lte('lat', Math.min(lat + latBuf, 43.773))
    .gte('lng', lon - lngBuf)
    .lte('lng', lon + lngBuf)
    .or('business_status.eq.OPERATIONAL,business_status.is.null')
    .eq('is_chain', false)
    .limit(5000);

  if (error || !data) return [];

  const excludeSet = new Set(excludeIds.map((id: string) => id.replace(/^places\//, '')));

  return data.filter((v: any) => {
    if (!v.lat || !v.lng) return false;
    if (excludeSet.has(v.google_place_id)) return false;
    return calculateDistance(lat, lon, v.lat, v.lng) <= radiusKm;
  });
}

async function getSupabaseVenuesByType(expandedTypes: string[], lat: number, lon: number): Promise<any[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  // Build OR filter: match any expanded type keyword in the venue_types array
  const typeFilter = expandedTypes
    .map((t: string) => `venue_types.cs.{${t}}`)
    .join(',');

  const { data, error } = await sb
    .from('venues')
    .select('google_place_id, name, lat, lng, rating, review_count, price_level, venue_types, business_status, photo_urls, photos_complete, photos_fetched_count, updated_at, address')
    .or(typeFilter)
    .or('business_status.eq.OPERATIONAL,business_status.is.null')
    .order('rating', { ascending: false })
    .order('review_count', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []).map((v: any) => ({
    ...v,
    distance_km: calculateDistance(lat, lon, v.lat, v.lng),
  }));
}

// ─── Fixed scoring constants — never modified by relaxation level ───
const SCORING = {
  RATING_FLOOR: 4.0,
  RATING_CEILING: 5.0,
  REVIEW_FLOOR: 25,
  REVIEW_CAP: 500,
  RATING_WEIGHT: 0.75,
  TRUST_WEIGHT: 0.25,
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

// ─── Cuisine filter map — label → Google Places venue_types ───
const CUISINE_FILTER_MAP: Record<string, string[]> = {
  "Italian":            ["italian_restaurant", "pizza_restaurant", "pizza_delivery"],
  "Japanese":           ["japanese_restaurant", "japanese_izakaya_restaurant", "sushi_restaurant", "ramen_restaurant", "yakitori_restaurant", "yakiniku_restaurant"],
  "Mexican":            ["mexican_restaurant", "taco_restaurant", "burrito_restaurant", "tex_mex_restaurant"],
  "Chinese":            ["chinese_restaurant", "cantonese_restaurant", "chinese_noodle_restaurant", "dim_sum_restaurant", "dumpling_restaurant", "hot_pot_restaurant"],
  "American":           ["american_restaurant", "hamburger_restaurant", "hot_dog_restaurant", "hot_dog_stand", "chicken_wings_restaurant", "soul_food_restaurant", "cajun_restaurant", "californian_restaurant", "western_restaurant"],
  "Thai":               ["thai_restaurant"],
  "Indian":             ["indian_restaurant", "north_indian_restaurant", "south_indian_restaurant"],
  "Korean":             ["korean_restaurant", "korean_barbecue_restaurant"],
  "French":             ["french_restaurant", "bistro"],
  "Vietnamese":         ["vietnamese_restaurant"],
  "Spanish":            ["spanish_restaurant", "tapas_restaurant", "basque_restaurant"],
  "Breakfast & Brunch": ["breakfast_restaurant", "brunch_restaurant", "bagel_shop", "diner"],
  "Latin American":     ["latin_american_restaurant", "brazilian_restaurant", "argentinian_restaurant", "peruvian_restaurant", "colombian_restaurant", "chilean_restaurant", "south_american_restaurant", "caribbean_restaurant"],
  "African":            ["african_restaurant", "ethiopian_restaurant"],
  "Seafood":            ["seafood_restaurant", "oyster_bar_restaurant", "fish_and_chips_restaurant"],
  "Mediterranean & Middle Eastern": ["mediterranean_restaurant", "greek_restaurant", "turkish_restaurant", "lebanese_restaurant", "israeli_restaurant", "falafel_restaurant", "gyro_restaurant", "shawarma_restaurant", "kebab_shop", "moroccan_restaurant", "persian_restaurant", "middle_eastern_restaurant", "afghani_restaurant", "pakistani_restaurant"],
};

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

function isOpenNow(regularOpeningHours: any): boolean {
  if (!regularOpeningHours || !Array.isArray(regularOpeningHours) || regularOpeningHours.length === 0) return true;
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
  const normalizedRating =
    ((rating - SCORING.RATING_FLOOR) / (SCORING.RATING_CEILING - SCORING.RATING_FLOOR)) * 10;
  const trustFactor = Math.max(
    0,
    Math.min((reviewCount - SCORING.REVIEW_FLOOR) / (SCORING.REVIEW_CAP - SCORING.REVIEW_FLOOR), 1.0),
  );
  const rawScore = normalizedRating * (SCORING.RATING_WEIGHT + SCORING.TRUST_WEIGHT * trustFactor);
  return isRelaxedAdmission ? rawScore * 0.85 : rawScore;
}

function isSimpleQuery(originalTerm: string, refinedTerm: string): boolean {
  if (refinedTerm.toLowerCase() === originalTerm.toLowerCase()) return true;
  const words = originalTerm.trim().split(/\s+/);
  if (
    words.length <= 3 &&
    !/(for|with|near|group|party|date|romantic|quiet|outdoor|large|private|vegan|gluten)/i.test(originalTerm)
  ) {
    return true;
  }
  if (originalTerm.toLowerCase().includes('best')) return false;
  return false;
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    console.error(`[${label}] failed:`, e?.message || e);
    return fallback;
  }
}

async function fetchWithConcurrency<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 3): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  async function processNext() {
    if (queue.length === 0) return;
    const item = queue.shift()!;
    const result = await fn(item);
    results.push(result);
    await processNext();
  }
  await Promise.all(Array(limit).fill(null).map(() => processNext()));
  return results;
}

// ─── LLM helper ───

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

async function callLLM(model: string, systemPrompt: string, userPrompt: string, tools?: any[], toolChoice?: any, options?: { max_tokens?: number; temperature?: number }): Promise<any> {
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

  if (options?.temperature !== undefined || options?.max_tokens !== undefined) {
    body.generationConfig = {};
    if (options.temperature !== undefined) body.generationConfig.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.generationConfig.maxOutputTokens = options.max_tokens;
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

async function getPlacePhotos(apiKey: string, placeId: string, maxPhotos = 4): Promise<string[]> {
  const detailsUrl = `https://places.googleapis.com/v1/${placeId}?fields=photos`;
  const detailsResp = await fetch(detailsUrl, {
    method: 'GET',
    headers: { 'X-Goog-Api-Key': apiKey },
  });
  if (!detailsResp.ok) return [];
  const data = await detailsResp.json();
  if (!data.photos || data.photos.length === 0) return [];

  const photoResources = data.photos.slice(0, maxPhotos);
  const urls = await fetchWithConcurrency(
    photoResources,
    async (photo: any) => {
      const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=800`;
      try {
        const mediaResp = await fetch(mediaUrl, {
          method: 'GET',
          headers: { 'X-Goog-Api-Key': apiKey },
          redirect: 'manual',
        });
        if (mediaResp.status === 302 || mediaResp.status === 301) {
          return mediaResp.headers.get('Location');
        }
        if (mediaResp.ok) return mediaResp.url;
        return null;
      } catch {
        return null;
      }
    },
    3,
  );
  return urls.filter((u): u is string => u !== null);
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
      radius_km,
      tile_radius_km,
      lat: originalLat,
      lon: originalLon,
      location_name: originalLocationName,
      relaxation_level = 0,
      open_now,
      price_levels,
      cuisine_types,
      session_context = [],
      exclude_ids = [],
      criteria_pass,
    } = await req.json();

    // Build session context string for LLM prompts
    let sessionContextString = '';
    if (Array.isArray(session_context) && session_context.length > 0) {
      sessionContextString = '\n\nPrevious searches this session:\n' + session_context.map((s: any) =>
        `- Query: "${s.query}"\n  Top results: ${(s.results || []).map((r: any) => `${r.name}${r.cuisine_type ? ` (${r.cuisine_type})` : ''}`).join(', ')}${s.search_summary ? `\n  Summary: ${typeof s.search_summary === 'string' ? s.search_summary : s.search_summary?.intro || ''}` : ''}`
      ).join('\n');
      console.log(`📝 Session context: ${session_context.length} previous searches`);
    }

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

    // ─── STEPS 1, 1b, 1c: Skip entirely for discovery mode ───
    if (!isDiscoveryMode) {
    console.log('🤖 STEPS 1 & 1b: Running in parallel...');
    let refinedSearchTermResult = searchTerm;

    const [refinementResult, locationDetectionResult] = await Promise.all([
      safe('step1-refinement', () => callLLM(
        'gemini-2.5-flash',
        'You extract cuisine keywords from search queries for Google Places API. IMPORTANT: Do NOT include any location names, street names, city names, or neighbourhood names in your output. Only return food/cuisine/dining keywords.',
        `The user is searching for "${searchTerm}" in ${location_name}.\nIdentify the primary cuisine types, dietary needs, or specific culinary styles mentioned.\nIf the query implies a very specific type of food, extract those keywords.\nIf the query is generic (e.g., "best restaurants", "places to eat"), return "restaurant".\nDo NOT include location words like street names, city names, or neighbourhoods (e.g. do NOT include "College Street", "Toronto", etc.).\nReturn ONLY a comma-separated list of 1-3 highly relevant and concise cuisine/food keywords suitable for a Google Places search.${sessionContextString}`,
        [{ type: 'function', function: { name: 'refine_query', description: 'Return refined search keywords', parameters: { type: 'object', properties: { keywords: { type: 'string', description: 'Comma-separated refined cuisine/food keywords only, no location names' } }, required: ['keywords'] } } }],
        { type: 'function', function: { name: 'refine_query' } },
        { max_tokens: 100, temperature: 0 },
      ), null),
      safe('step1b-location', () => callLLM(
        'gemini-2.5-flash',
        'You detect neighbourhood, district, or city names in search queries.',
        `Given the search query "${searchTerm}" and current location "${location_name}", identify if the query mentions a specific neighbourhood, district, or city name that is different from or more specific than the current location. Return the detected location string or "NONE" if no specific location is mentioned.`,
        [{ type: 'function', function: { name: 'detect_location', description: 'Return detected location or NONE', parameters: { type: 'object', properties: { detected_location: { type: 'string', description: 'The detected neighbourhood/district/city name, or "NONE"' } }, required: ['detected_location'] } } }],
        { type: 'function', function: { name: 'detect_location' } },
        { max_tokens: 100, temperature: 0 },
      ), null),
    ]);

    // Apply Step 1 result
    if (refinementResult?.keywords && refinementResult.keywords.toLowerCase() !== searchTerm.toLowerCase()) {
      refinedSearchTermResult = refinementResult.keywords;
      console.log(`✅ STEP 1: Refined to: "${refinedSearchTermResult}"`);
    }
    refinedSearchTerm = refinedSearchTermResult;

    // Apply Step 1b result
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
            // Sanity check: distance between geocoded result and original user location
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
    } else {
      console.log('⏩ DISCOVERY MODE: Skipping Steps 1, 1b (no query refinement needed)');
    }

    // ─── Street-level precision detection + Step 1c (skip for discovery) ───
    const STREET_IDENTIFIERS = /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)\b/i;
    const PROXIMITY_WORDS = /\b(near|around|by|close\s+to|nearby|near\s+me|off\s+of|around\s+the\s+corner)\b/i;
    let isOnStreetSearch = false;
    let detectedStreetName = '';
    let detectedStreetBase = '';
    let refinementIntent: { is_refinement: boolean; keep_results: string[]; replace_count: number; refined_query: string } | null = null;

    if (!isDiscoveryMode) {
    // Check both searchTerm AND location_name for street identifiers
    const hasProximityWords = PROXIMITY_WORDS.test(searchTerm || '');
    const streetSourceText = `${searchTerm || ''} ${location_name || ''} ${refinedSearchTerm || ''}`;

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

    // ─── STEP 1c: Refinement intent detection ───
    if (Array.isArray(session_context) && session_context.length > 0) {
      console.log('🔄 STEP 1c: Checking for refinement intent...');
      try {
        const lastSearch = session_context[session_context.length - 1];
        const previousResultNames = (lastSearch?.results || []).map((r: any) => r.name);

        refinementIntent = await callLLM(
          'gemini-2.5-flash',
          'You detect whether a search query is asking to modify/replace specific results from a previous search, or is a fresh new search.',
          `Given the query "${searchTerm}" and the session history, determine if this query is asking to modify previous results rather than start a fresh search. Specifically detect phrases like "replace", "swap", "different option", "something else", "instead of", "change #[number]", or "not that one".\n\nPrevious search query: "${lastSearch?.query || ''}"\nPrevious results: ${previousResultNames.map((n: string, i: number) => `#${i + 1} ${n}`).join(', ')}\n\nReturn a JSON object.${sessionContextString}`,
          [{
            type: 'function',
            function: {
              name: 'detect_refinement',
              description: 'Detect if query is a refinement of previous results',
              parameters: {
                type: 'object',
                properties: {
                  is_refinement: { type: 'boolean', description: 'True if the query asks to modify/replace previous results' },
                  keep_results: { type: 'array', items: { type: 'string' }, description: 'Venue names from previous search to keep unchanged' },
                  replace_count: { type: 'number', description: 'Number of venues to replace' },
                  refined_query: { type: 'string', description: 'The underlying search intent stripped of refinement language' },
                },
                required: ['is_refinement', 'keep_results', 'replace_count', 'refined_query'],
              },
            },
          }],
          { type: 'function', function: { name: 'detect_refinement' } },
          { max_tokens: 100, temperature: 0 },
        );

        if (refinementIntent?.is_refinement) {
          console.log(`✅ STEP 1c: Refinement detected — keep ${refinementIntent.keep_results.length} venues, replace ${refinementIntent.replace_count}, refined query: "${refinementIntent.refined_query}"`);
          refinedSearchTerm = refinementIntent.refined_query;
        } else {
          console.log('⏩ STEP 1c: Not a refinement, proceeding normally');
          refinementIntent = null;
        }
      } catch (e: any) {
        console.warn('⚠️ STEP 1c: Refinement detection failed:', e.message);
        refinementIntent = null;
      }
    }
    } // end !isDiscoveryMode for street detection + step 1c

    // ─── SUPABASE-FIRST DISCOVERY TRACK ───
    let filteredVenues: any[] = [];
    let servedFromSupabase = false;
    let googleCallCap = Infinity;

    if (isDiscoveryMode) {
      const sbVenues = await safe('supabase-first', () =>
        getSupabaseVenuesForArea(lat, lon, admission.maxRadius, exclude_ids), []);
      console.log(`🗄️ Supabase-first: ${sbVenues.length} venues found for area`);

      if (sbVenues.length >= 15) {
        console.log('✅ Serving from Supabase');
        servedFromSupabase = true;
        filteredVenues = sbVenues
          .filter((v: any) => hasFoodDrinkType(v.venue_types))
          .map((v: any) => {
            const distance_km = calculateDistance(lat, lon, v.lat, v.lng);
            const isRelaxedAdmission = (v.rating ?? 0) < SCORING.RATING_FLOOR || (v.review_count ?? 0) < SCORING.REVIEW_FLOOR;
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
              category: (v.venue_types ?? []).find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || 'Restaurant',
              cuisine_type: (v.venue_types ?? []).find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
              isRelaxedAdmission,
              unknownPrice: false,
              _rawTypes: v.venue_types ?? [],
              _photoUrls: v.photo_urls ?? [],
              _regularOpeningHours: v.regular_opening_hours ?? null,
            };
          })
          .filter((v: any) => {
            if (!price_levels?.length) return true;
            if (v.price_level == null) return true;
            return price_levels.includes(v.price_level);
          })
          .filter((v: any) => {
            if (!cuisine_types?.length) return true;
            if (!v._rawTypes?.length) return false;
            return cuisine_types.some((ct: string) => v._rawTypes.includes(ct));
          })
          .filter((v: any) => {
            if (!open_now) return true;
            return isOpenNow(v._regularOpeningHours);
          })
          .filter((v: any) => (v.rating ?? 0) >= admission.minRating && (v.review_count ?? 0) >= admission.minReviewCount);
      } else {
        console.warn('⚠️ Supabase coverage insufficient for area — falling back to Google');
        googleCallCap = 3;
      }
    }

    // ─── SUPABASE-FIRST SEARCH TRACK ───
    // Explicit cuisine_types (from filter chips) take priority; fall back to
    // keyword expansion from the refined query text. Uses getSupabaseVenuesForArea
    // so that regular_opening_hours is available for open_now filtering.
    if (!isDiscoveryMode && !servedFromSupabase) {
      let effectiveCuisineTypes: string[] | null = null;

      if (Array.isArray(cuisine_types) && cuisine_types.length > 0) {
        effectiveCuisineTypes = cuisine_types;
      } else if (refinedSearchTerm) {
        const queryWords = refinedSearchTerm.toLowerCase()
          .split(/\s+/)
          .filter((w: string) => w.length > 2)
          .filter((w: string) => !['best', 'most', 'good', 'great', 'near', 'with', 'that', 'have',
            'find', 'show', 'want', 'restaurants', 'restaurant', 'toronto'].includes(w));

        if (queryWords.length > 0) {
          const expandedTypes = new Set<string>();
          for (const word of queryWords) {
            expandedTypes.add(word.replace(/\s+/g, '_'));
            if (word === 'steak') { expandedTypes.add('steak_house'); expandedTypes.add('steakhouse'); }
            if (word === 'sushi') expandedTypes.add('sushi_restaurant');
            if (word === 'vegan') expandedTypes.add('vegan_restaurant');
            if (word === 'pizza') expandedTypes.add('pizza_restaurant');
            if (word === 'ramen') expandedTypes.add('ramen_restaurant');
            if (word === 'burger') expandedTypes.add('hamburger_restaurant');
            if (word === 'thai') expandedTypes.add('thai_restaurant');
            if (word === 'chinese') expandedTypes.add('chinese_restaurant');
            if (word === 'indian') expandedTypes.add('indian_restaurant');
            if (word === 'italian') expandedTypes.add('italian_restaurant');
            if (word === 'mexican') expandedTypes.add('mexican_restaurant');
            if (word === 'french') expandedTypes.add('french_restaurant');
            if (word === 'greek') expandedTypes.add('greek_restaurant');
            if (word === 'korean') expandedTypes.add('korean_restaurant');
            if (word === 'japanese') expandedTypes.add('japanese_restaurant');
            if (word === 'spanish') expandedTypes.add('spanish_restaurant');
            if (word === 'vietnamese') expandedTypes.add('vietnamese_restaurant');
            if (word === 'brunch') { expandedTypes.add('brunch_restaurant'); expandedTypes.add('breakfast_restaurant'); expandedTypes.add('cafe'); }
            if (word === 'breakfast') { expandedTypes.add('breakfast_restaurant'); expandedTypes.add('brunch_restaurant'); expandedTypes.add('diner'); }
            if (word === 'seafood') expandedTypes.add('seafood_restaurant');
            if (word === 'cocktail') { expandedTypes.add('cocktail_bar'); expandedTypes.add('bar'); }
            if (word === 'wine') expandedTypes.add('wine_bar');
            if (word === 'coffee') { expandedTypes.add('coffee_shop'); expandedTypes.add('cafe'); expandedTypes.add('coffee_roastery'); expandedTypes.add('coffee_stand'); }
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
          if (expandedTypes.size > 0) effectiveCuisineTypes = [...expandedTypes];
        }
      }

      let sbSearchVenues = await safe('supabase-search', () =>
        getSupabaseVenuesForArea(lat, lon, admission.maxRadius, exclude_ids), []);

      console.log(`🗄️ Supabase-search: ${sbSearchVenues.length} raw venues found`);
      const allAreaVenues = sbSearchVenues; // pre-filter snapshot for name fallback

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

      // Explicit filter: serve with 1+ results. Text-derived: require 5+ to ensure relevance.
      const threshold = Array.isArray(cuisine_types) && cuisine_types.length > 0 ? 1 : 5;
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
            };
          })
          .filter((v: any) => {
            if (!price_levels?.length) return true;
            if (v.price_level == null) return true;
            return price_levels.includes(v.price_level);
          });
        console.log(`✅ Search served from Supabase: ${filteredVenues.length} venues after filters`);
      } else {
        // Name text search fallback — catches venues tagged generically (e.g. steakhouse tagged only as "restaurant")
        let nameMatchVenues: any[] = [];
        const searchTermLower = (refinedSearchTerm || searchTerm || '').toLowerCase().trim();
        const searchWords = searchTermLower.split(/\s+/).filter((w: string) => w.length > 2);

        if (searchWords.length > 0) {
          const admittedIds = new Set(sbAdmitted.map((v: any) => v.google_place_id));
          nameMatchVenues = allAreaVenues
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

    if (!servedFromSupabase) {
    if (!GOOGLE_KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    // ─── STEP 2: Google Places broad search ───
    const reversePriceLevelMap: Record<string, string[]> = {
      '$': ['PRICE_LEVEL_FREE', 'PRICE_LEVEL_INEXPENSIVE'],
      '$$': ['PRICE_LEVEL_MODERATE'],
      '$$$': ['PRICE_LEVEL_EXPENSIVE'],
      '$$$$': ['PRICE_LEVEL_VERY_EXPENSIVE'],
    };

    let googlePriceLevels: string[] = [];
    if (price_levels && Array.isArray(price_levels) && price_levels.length > 0) {
      price_levels.forEach((pl: string) => {
        if (reversePriceLevelMap[pl]) {
          googlePriceLevels.push(...reversePriceLevelMap[pl]);
        }
      });
    }

    // ─── "Club" disambiguation ───
    // Bare "club" → nightclub intent, unless qualified by food/dining context
    const CLUB_FOOD_PREFIXES = /\b(supper|dinner|lunch|breakfast|brunch|country|social)\s+club\b/i;
    const CLUB_FOOD_SUFFIXES = /\bclub\s+(sandwich|sandwiches|soda|wrap|salad)\b/i;
    const CLUB_DINING_CONTEXT = /\b(food|dining|dinner|eat|restaurant|menu|cuisine|brunch|lunch|breakfast)\b/i;

    function disambiguateClub(q: string): string {
      if (!/\bclub\b/i.test(q)) return q;
      // If food-qualified, leave as-is for the LLM/Google to interpret
      if (CLUB_FOOD_PREFIXES.test(q) || CLUB_FOOD_SUFFIXES.test(q) || CLUB_DINING_CONTEXT.test(q.replace(/\bclub\b/gi, ''))) {
        return q;
      }
      // Bare "club" → replace with "nightclub"
      return q.replace(/\bclub\b/gi, 'nightclub');
    }

    // For on-street searches, strip any location words that may have leaked into the refined term
    let googleSearchQuery = disambiguateClub(refinedSearchTerm);
    if (isOnStreetSearch && detectedStreetBase) {
      // Remove the street name and common location words from the refined query
      const streetWords = detectedStreetBase.split(/\s+/);
      const locationWords = [...streetWords, 'street', 'st', 'avenue', 'ave', 'road', 'rd', 'boulevard', 'blvd', 'drive', 'dr', 'lane', 'ln', 'toronto', 'ontario', 'canada'];
      googleSearchQuery = refinedSearchTerm
        .split(/[\s,]+/)
        .filter(w => !locationWords.includes(w.toLowerCase()))
        .join(' ')
        .trim();
      // Ensure we have a meaningful cuisine query; append "restaurant" if it's just a cuisine word
      if (googleSearchQuery && !/(restaurant|cafe|bar|bistro|pub|eatery|diner|trattoria|pizzeria|bakery)/i.test(googleSearchQuery)) {
        googleSearchQuery += ' restaurant';
      }
      if (!googleSearchQuery) googleSearchQuery = 'restaurant';
      console.log(`📍 On-street: cleaned query "${refinedSearchTerm}" → "${googleSearchQuery}"`);
    }
    // For on-street searches, include the street name in the Google query to bias toward that street
    let googleLocationContext = location_name;
    if (isOnStreetSearch && detectedStreetName) {
      googleLocationContext = `${detectedStreetName}, ${location_name}`;
    }
    console.log(`🌍 STEP 2: Google Places search for "${googleSearchQuery}" in "${googleLocationContext}"...`);
    
    let googleResults: any[];
    if (isOnStreetSearch && detectedStreetName) {
      // Use locationBias (not locationRestriction) with 3km radius centered on geocoded street coords
      googleResults = await googlePlacesBroadSearch(
        GOOGLE_KEY,
        `${googleSearchQuery} on ${detectedStreetName}, ${location_name}`,
        lat, lon, 3, open_now, googlePriceLevels, false // locationBias, 3km radius
      );
      console.log(`📊 Google returned ${googleResults.length} venues (on-street, locationBias 3km)`);
    } else {
      if (isDiscoveryMode) {
        // Tiling disabled — extracted to supabase/functions/tile-search/index.ts
        // Re-enable by calling tile-search edge function here when Supabase-first gating is complete
        googleResults = [];
      } else {
        googleResults = await googlePlacesBroadSearch(
          GOOGLE_KEY,
          `${googleSearchQuery} in ${googleLocationContext}`,
          lat, lon, admission.maxRadius, open_now, googlePriceLevels
        );
        console.log(`📊 Google returned ${googleResults.length} venues`);
      }
    }

    // ─── Exclude previously seen venues (discovery offset) ───
    if (Array.isArray(exclude_ids) && exclude_ids.length > 0) {
      const excludeSet = new Set(exclude_ids.map((id: string) => id.replace(/^places\//, '')));
      const before = googleResults.length;
      googleResults = googleResults.filter((r: any) => {
        const stripped = (r.place_id || '').replace(/^places\//, '');
        return !excludeSet.has(stripped);
      });
      console.log(`🚫 Excluded ${before - googleResults.length} previously seen venues (${exclude_ids.length} exclude_ids)`);
    }

    if (googleResults.length === 0) {
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

    // ─── STEP 3: Filter + admission tagging ───
    console.log('🔍 STEP 3: Filtering...');

    // Precompute cuisine filter state once (not inside the map loop)
    const activeCuisineTypes: string[] = Array.isArray(cuisine_types) ? cuisine_types : [];
    const KNOWN_CUISINE_TYPES = [
      'italian_restaurant', 'japanese_restaurant', 'mexican_restaurant', 'chinese_restaurant',
      'american_restaurant', 'thai_restaurant', 'indian_restaurant', 'korean_restaurant',
      'mediterranean_restaurant', 'french_restaurant', 'vietnamese_restaurant',
      'middle_eastern_restaurant', 'greek_restaurant', 'spanish_restaurant', 'breakfast_restaurant',
    ];
    const selectedCuisineKnown = activeCuisineTypes.filter(ct => ct !== 'other');
    const cuisineIncludesOther = activeCuisineTypes.includes('other');

    filteredVenues = googleResults
      .map((place: any) => {
        const distance_km = calculateDistance(lat, lon, place.lat, place.lon);
        if (distance_km > admission.maxRadius) return null;
        if (place.business_status === 'CLOSED_PERMANENTLY') return null;
        if (!place.rating || !place.user_ratings_total) return null;
        if (place.rating < admission.minRating || place.user_ratings_total < admission.minReviewCount) return null;

        const mappedPriceLevel = priceLevelMap[place.price_level] || null;
        let unknownPrice = false;
        if (price_levels && Array.isArray(price_levels) && price_levels.length > 0) {
            if (mappedPriceLevel && !price_levels.includes(mappedPriceLevel)) {
                // Known price that doesn't match filter — exclude
                return null;
            }
            if (!mappedPriceLevel) {
                // Unknown price — keep but flag for down-ranking
                unknownPrice = true;
            }
        }

        // Cuisine type filter
        if (activeCuisineTypes.length > 0) {
          const rawTypes: string[] = Array.isArray(place.types) ? place.types : [];
          const hasKnownMatch = selectedCuisineKnown.some(ct => rawTypes.includes(ct));
          const isOtherCuisine = !KNOWN_CUISINE_TYPES.some(kt => rawTypes.includes(kt));
          if (!hasKnownMatch && !(cuisineIncludesOther && isOtherCuisine)) return null;
        }

        const isRelaxedAdmission =
          place.rating < SCORING.RATING_FLOOR || place.user_ratings_total < SCORING.REVIEW_FLOOR;

        return {
          name: place.name,
          address: place.address,
          lat: place.lat,
          lon: place.lon,
          distance_km,
          rating: place.rating,
          review_count: place.user_ratings_total,
          price_level: mappedPriceLevel,
          place_id: place.place_id,
          category:
            place.types?.find((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) ||
            'Restaurant',
          cuisine_type: place.types?.find((t: string) => t.includes('_restaurant'))?.replace('_restaurant', '') || 'Restaurant',
          isRelaxedAdmission,
          unknownPrice,
          _rawTypes: place.types,
        };
      })
      .filter((v: any) => v !== null)
      .filter((v: any) => !isDiscoveryMode || hasFoodDrinkType(v._rawTypes))
      .filter((v: any) => !isDiscoveryMode || !v.lat || v.lat <= 43.7730);

    } // end !servedFromSupabase (Steps 2–3)
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

    // ─── STEP 3b: Street-level address validation (STRICT) ───
    let streetFilterApplied = false;
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
        streetFilterApplied = true;
        console.log(`📍 Street filter kept ${streetFilteredVenues.length}/${filteredVenues.length} venues on "${detectedStreetName}"`);
      } else {
        console.warn(`⚠️ Street filter returned too few results (${streetValidated.length}), falling back to radius search`);
        // Put street-validated venues first, then others
        const nonStreet = filteredVenues.filter((v: any) => !streetValidated.find((sv: any) => sv.place_id === v.place_id));
        streetFilteredVenues = [...streetValidated, ...nonStreet];
      }
    }

    if (streetFilteredVenues.length === 0) {
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

    // ─── STEP 4: Score + sort ───
    const scoredVenues = streetFilteredVenues
      .map((venue: any) => {
        let score = calculateVenueScore(venue.rating, venue.review_count, venue.isRelaxedAdmission);
        if (venue.unknownPrice) score *= 0.7; // Down-rank venues with unknown price when price filter is active
        const display_weight = isDiscoveryMode ? score + (Math.random() * 0.3) : score;
        return { ...venue, score, display_weight };
      })
      .filter((v: any) => v.score > admission.minScore)
      .sort((a: any, b: any) => b.display_weight - a.display_weight);

    console.log(`📊 STEP 4: ${scoredVenues.length} scored above ${admission.minScore}`);

    const dedup = (venues: any[]) => {
      const seen = new Set();
      return venues.filter((v) => {
        const key = v.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    // ─── STEP 4c: Apply refinement post-processing (needs finalResults, set below) ───
    // First, select initial candidates for the comprehensive LLM or discovery path
    const candidatePoolSize = isDiscoveryMode ? 30 : 20;
    const candidates = dedup(scoredVenues).slice(0, candidatePoolSize);

    // ─── Query-intent pre-filter (search mode only) ───
    // Type-matched venues appear first so the LLM scores them higher.
    // Unmatched venues (e.g. unclassified gems) fill the remainder so they
    // can still be selected if the LLM judges them relevant.
    const isSearchMode = !!searchTerm;
    let filteredCandidates = candidates;

    if (isSearchMode && refinedSearchTerm) {
      const queryWords = refinedSearchTerm.toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 2)
        .filter((w: string) => !['best', 'most', 'good', 'great', 'near', 'with', 'that', 'have', 'find', 'show', 'want', 'restaurants', 'restaurant', 'toronto'].includes(w));

      if (queryWords.length > 0) {
        // Expand each keyword to related Google place type fragments
        const expandedTypes = new Set<string>();
        for (const word of queryWords) {
          expandedTypes.add(word);
          // Common expansions — add more as needed
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
          if (word === 'coffee') { expandedTypes.add('coffee_shop'); expandedTypes.add('cafe'); expandedTypes.add('coffee_roastery'); expandedTypes.add('coffee_stand'); }
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

        const typeMatched = candidates.filter((v: any) => {
          const types = (v._rawTypes || []).join(' ').toLowerCase();
          const cat = (v.category || '').toLowerCase();
          return [...expandedTypes].some((t: string) => types.includes(t) || cat.includes(t));
        });

        const typeMatchedIds = new Set(typeMatched.map((v: any) => v.place_id));
        const unmatched = candidates.filter((v: any) => !typeMatchedIds.has(v.place_id));

        // Priority order: type-matched first, then unmatched to fill up to 20
        filteredCandidates = [...typeMatched, ...unmatched].slice(0, 20);
        console.log(`🎯 Query-intent pre-filter: ${typeMatched.length} type-matched + ${Math.min(unmatched.length, 20 - typeMatched.length)} unmatched = ${filteredCandidates.length} candidates`);
      }
    }

    // ─── COMPREHENSIVE LLM: Confidence scoring, descriptors, summary & chips ───
    console.log('🤖 COMPREHENSIVE LLM: Scoring, descriptors, summary & chips...');
    const llmCallStart = Date.now();

    const candidateList = filteredCandidates.map((v: any, i: number) => {
      const displayName = v.name.split(/[|\u2013\u2014:]/).at(0).trim();
      const typeHints = (v._rawTypes || []).slice(0, 2).join(', ');
      return `${i + 1}. ${displayName} (${v.cuisine_type || 'restaurant'}${typeHints ? `, types: ${typeHints}` : ''}, ${v.rating}★, ${v.review_count} reviews, ${v.price_level || 'price unknown'}, ${v.distance_km?.toFixed(1)}km)`;
    }).join('\n');

    let finalVenues: any[] = [];
    let search_summary: any = null;
    let suggested_chips: string[] = [];
    let overflowVenues: any[] = [];

    if (isDiscoveryMode) {
      // ─── Descriptor cache lookup ───
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

    } else {
      // Normal search mode — full confidence scoring, descriptors, summary and chips
      const comprehensiveResult = await safe('comprehensive-llm', () => callLLM(
        'gemini-2.5-flash',
        `You are a knowledgeable local friend who knows the city's food and drink scene intimately. Evaluate venues honestly and only include genuinely suitable matches. Venue types reflect what the place actually serves — use them as the primary relevance signal. A venue is NOT relevant if its types don't match the query intent even if keywords coincide in the name.`,
        `The user searched for "${searchTerm}" in ${location_name}.${sessionContextString ? `\n\nSession context:\n${sessionContextString}` : ''}\n\nCandidate venues:\n${candidateList}\n\nReturn a JSON object with exactly these fields:\n- "rankings": array of objects for venues that genuinely match the query, each with { "index": number (1-based), "confidence": number (0.0-1.0), "reasoning": string (one sentence why this venue fits) }. Only include venues with confidence >= 0.5. Order by confidence descending. Maximum 5 entries.\n- "descriptors": array of arrays, one per entry in rankings in the same order, each containing exactly 3 short evocative phrases (3-6 words each) that capture the venue's vibe, food or drink style, and one standout quality. Write them like a knowledgeable local would describe the place — specific and evocative, never generic. Examples: "candlelit date setting", "handmade pasta daily", "hidden neighbourhood gem", "natural wine focus", "wood-fired everything".\n- "summary": object with "intro" (one short phrase, max 10 words) and "bullets" (array of { name, note } where note is max 8 words).\n- "chips": array of 3-4 short follow-up search suggestions.`,
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
        { max_tokens: 1500, temperature: 0 }
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

      // Backfill to guarantee 8 results
      if (finalVenues.length < 8) {
        const usedIndices = new Set(rankings.filter((r: any) => r.confidence >= 0.5).map((r: any) => r.index - 1));
        const backfill = filteredCandidates
          .filter((_: any, i: number) => !usedIndices.has(i))
          .slice(0, 8 - finalVenues.length)
          .map((v: any) => ({ ...v, descriptors: [], reasoning_explanation: '' }));
        finalVenues.push(...backfill);
      }

      // Separate overflow venues (>2km) from finalVenues
      overflowVenues = finalVenues
        .filter((v: any) => v.distance_km > 2.0)
        .slice(0, 3)
        .map((v: any) => ({
          name: v.name,
          address: v.address,
          distance_km: v.distance_km,
          rating: v.rating,
          cuisine_type: v.cuisine_type,
          descriptors: v.descriptors || [],
        }));
      finalVenues = finalVenues.filter((v: any) => !(v.distance_km > 2.0));

      search_summary = comprehensiveResult.summary || null;
      suggested_chips = comprehensiveResult.chips || [];
    }

    console.log(`⏱️ Comprehensive LLM duration: ${Date.now() - llmCallStart}ms`);
    console.log(`✅ COMPREHENSIVE LLM complete — ${finalVenues.length} venues selected`);

    // ─── STEP 4c: Apply refinement post-processing ───
    if (refinementIntent) {
      console.log('🔄 STEP 4c: Applying refinement post-processing...');

      const allPreviousNames = new Set<string>();
      for (const s of session_context) {
        for (const r of (s.results || [])) {
          allPreviousNames.add(r.name.toLowerCase().trim());
        }
      }

      const keepNamesLower = new Set(refinementIntent.keep_results.map((n: string) => n.toLowerCase().trim()));
      const newCandidates = finalVenues.filter((v: any) => {
        const nameLower = v.name.toLowerCase().trim();
        return !allPreviousNames.has(nameLower) && !keepNamesLower.has(nameLower);
      });

      const replacements = newCandidates.slice(0, refinementIntent.replace_count);

      const lastSearch = session_context[session_context.length - 1];
      const previousResults = lastSearch?.results || [];
      const keptVenues: any[] = [];
      for (const prev of previousResults) {
        if (keepNamesLower.has(prev.name.toLowerCase().trim())) {
          const matchInCurrent = finalVenues.find((v: any) => v.name.toLowerCase().trim() === prev.name.toLowerCase().trim());
          if (matchInCurrent) {
            keptVenues.push(matchInCurrent);
          } else {
            keptVenues.push({
              name: prev.name,
              address: prev.address || '',
              lat: prev.lat,
              lon: prev.lon,
              distance_km: prev.distance_km,
              rating: prev.rating,
              review_count: prev.review_count,
              price_level: prev.price_level,
              place_id: prev.place_id,
              category: prev.category,
              cuisine_type: prev.cuisine_type,
              descriptors: prev.descriptors || [],
              reasoning_explanation: prev.reasoning_explanation,
              image_urls: prev.image_urls || [],
              score: prev.score,
            });
          }
        }
      }

      finalVenues = [...keptVenues, ...replacements];
      console.log(`✅ STEP 4c: Kept ${keptVenues.length} venues, added ${replacements.length} replacements`);
    }

    // ─── Build reserve venues from remaining candidates ───
    const finalVenueIds = new Set(finalVenues.map((v: any) => v.place_id));
    const reserveVenues = candidates
      .filter((v: any) => !finalVenueIds.has(v.place_id))
      .slice(0, 10);

    // ─── Build staged venues (below current criteria but scored) for discovery ───
    let stagedVenues: any[] = [];
    if (isDiscoveryMode) {
      const allSelectedIds = new Set([...finalVenueIds, ...reserveVenues.map((v: any) => v.place_id)]);
      // Venues that passed Google but failed criteria thresholds — score them anyway
      const belowCriteria = dedup(streetFilteredVenues)
        .filter((v: any) => !allSelectedIds.has(v.place_id))
        .map((v: any) => {
          const score = calculateVenueScore(v.rating, v.review_count, v.isRelaxedAdmission);
          return { ...v, score, staged_for_relaxation: true };
        })
        .filter((v: any) => v.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 30);
      stagedVenues = belowCriteria;
      console.log(`📦 Staged venues (for future relaxation): ${stagedVenues.length}`);
    }
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
        nearby_overflow: overflowVenues || [],
        reserve_venues: reserveVenues,
        staged_venues: stagedVenues || [],
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
