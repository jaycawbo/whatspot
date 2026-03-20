const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Fixed scoring constants — never modified by relaxation level ───
const SCORING = {
  RATING_FLOOR: 4.0,
  RATING_CEILING: 5.0,
  REVIEW_FLOOR: 25,
  REVIEW_CAP: 500,
  RATING_WEIGHT: 0.75,
  TRUST_WEIGHT: 0.25,
};

// ─── Chain blocklist (discovery mode only) ───
const CHAIN_BLOCKLIST = [
  "mcdonald's", "mcdonalds", "subway", "starbucks", "tim hortons", "burger king",
  "wendy's", "wendys", "kfc", "pizza hut", "domino's", "dominoes", "taco bell",
  "popeyes", "dairy queen", "harvey's", "harveys", "a&w", "second cup",
  "country style", "boston pizza", "swiss chalet", "st. louis", "milestones",
  "earls", "cactus club", "joeys", "montanas", "kelseys", "jack astors",
  "the keg", "hero certified burgers", "mucho burrito", "chipotle", "panera",
  "five guys", "shake shack", "nandos", "pita pit", "quiznos", "mr. sub",
  "extreme pita", "thai express", "manchu wok", "new york fries", "orange julius",
  "baskin robbins", "gregory's", "gregorys", "pizza pizza", "little caesars",
  "papa johns", "mary browns", "popeyes", "church's chicken", "cultures",
  "jugo juice", "booster juice", "kernels", "great canadian bagel",
  "robin's donuts", "robins donuts", "baton rouge", "red lobster", "olive garden"
];

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  return CHAIN_BLOCKLIST.some(chain => lower.includes(chain));
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

const OPENAI_KEY = Deno.env.get('CHATGPT_API_KEY') ?? '';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const LLM_MODEL = 'gpt-4o-mini';

async function callLLM(apiKey: string, systemPrompt: string, userPrompt: string, tools?: any[], toolChoice?: any, options?: { max_tokens?: number; temperature?: number }): Promise<any> {
  const body: any = {
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (tools) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }
  if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  if (options?.temperature !== undefined) body.temperature = options.temperature;

  const resp = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`LLM error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];

  // If tool call, parse the arguments
  if (choice?.message?.tool_calls?.[0]) {
    return JSON.parse(choice.message.tool_calls[0].function.arguments);
  }
  // Otherwise return content as string
  return choice?.message?.content || '';
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
      lat: originalLat,
      lon: originalLon,
      location_name: originalLocationName,
      relaxation_level = 0,
      open_now,
      price_levels,
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

    const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!GOOGLE_KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');
    if (!OPENAI_KEY) throw new Error('CHATGPT_API_KEY not configured');

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
      minRating: 4.4,
      minReviewCount: 50,
      minScore: 1.2,
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
        OPENAI_KEY,
        'You extract cuisine keywords from search queries for Google Places API. IMPORTANT: Do NOT include any location names, street names, city names, or neighbourhood names in your output. Only return food/cuisine/dining keywords.',
        `The user is searching for "${searchTerm}" in ${location_name}.\nIdentify the primary cuisine types, dietary needs, or specific culinary styles mentioned.\nIf the query implies a very specific type of food, extract those keywords.\nIf the query is generic (e.g., "best restaurants", "places to eat"), return "restaurant".\nDo NOT include location words like street names, city names, or neighbourhoods (e.g. do NOT include "College Street", "Toronto", etc.).\nReturn ONLY a comma-separated list of 1-3 highly relevant and concise cuisine/food keywords suitable for a Google Places search.${sessionContextString}`,
        [{ type: 'function', function: { name: 'refine_query', description: 'Return refined search keywords', parameters: { type: 'object', properties: { keywords: { type: 'string', description: 'Comma-separated refined cuisine/food keywords only, no location names' } }, required: ['keywords'], additionalProperties: false } } }],
        { type: 'function', function: { name: 'refine_query' } },
        { max_tokens: 100, temperature: 0 },
      ), null),
      safe('step1b-location', () => callLLM(
        OPENAI_KEY,
        'You detect neighbourhood, district, or city names in search queries.',
        `Given the search query "${searchTerm}" and current location "${location_name}", identify if the query mentions a specific neighbourhood, district, or city name that is different from or more specific than the current location. Return the detected location string or "NONE" if no specific location is mentioned.`,
        [{ type: 'function', function: { name: 'detect_location', description: 'Return detected location or NONE', parameters: { type: 'object', properties: { detected_location: { type: 'string', description: 'The detected neighbourhood/district/city name, or "NONE"' } }, required: ['detected_location'], additionalProperties: false } } }],
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
          OPENAI_KEY,
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
                additionalProperties: false,
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

    // For on-street searches, strip any location words that may have leaked into the refined term
    let googleSearchQuery = refinedSearchTerm;
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
        // Discovery mode — two parallel searches for venue type diversity
        const [foodResults, drinkResults] = await Promise.all([
          googlePlacesBroadSearch(
            GOOGLE_KEY,
            `restaurant OR cafe OR bistro in ${googleLocationContext}`,
            lat, lon, admission.maxRadius, open_now, googlePriceLevels
          ),
          googlePlacesBroadSearch(
            GOOGLE_KEY,
            `bar OR pub OR lounge OR club OR brewery in ${googleLocationContext}`,
            lat, lon, admission.maxRadius, open_now, googlePriceLevels
          ),
        ]);
        // Merge and deduplicate by place_id
        const seenPlaceIds = new Set<string>();
        googleResults = [];
        for (const r of [...foodResults, ...drinkResults]) {
          const pid = (r.place_id || '').replace(/^places\//, '');
          if (!seenPlaceIds.has(pid)) {
            seenPlaceIds.add(pid);
            googleResults.push(r);
          }
        }
        console.log(`📊 Discovery: ${foodResults.length} food + ${drinkResults.length} drink = ${googleResults.length} unique venues`);
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
          pagination: { has_more: false },
          relaxation_applied: relaxation_level > 0,
          relaxation_level,
          gated: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ─── STEP 3: Filter + admission tagging ───
    console.log('🔍 STEP 3: Filtering...');
    const filteredVenues = googleResults
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
        };
      })
      .filter((v: any) => v !== null)
      .filter((v: any) => !isDiscoveryMode || !isChain(v.name || ''))
      .filter((v: any) => !isDiscoveryMode || !v.lat || v.lat <= 43.7730);

    console.log(`✅ ${filteredVenues.length} passed filters`);

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
          pagination: { has_more: false },
          relaxation_applied: relaxation_level > 0,
          relaxation_level,
          gated: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ─── STEP 4: Score + sort ───
    const scoredVenues = streetFilteredVenues
      .map((venue: any) => {
        let score = calculateVenueScore(venue.rating, venue.review_count, venue.isRelaxedAdmission);
        if (venue.unknownPrice) score *= 0.7; // Down-rank venues with unknown price when price filter is active
        return { ...venue, score };
      })
      .filter((v: any) => v.score > admission.minScore)
      .sort((a: any, b: any) => {
        const diff = b.score - a.score;
        if (Math.abs(diff) < 0.01) return a.distance_km - b.distance_km;
        return diff;
      });

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

    // ─── COMPREHENSIVE LLM: Confidence scoring, descriptors, summary & chips ───
    console.log('🤖 COMPREHENSIVE LLM: Scoring, descriptors, summary & chips...');
    const llmCallStart = Date.now();

    const candidateList = candidates.map((v: any, i: number) =>
      `${i + 1}. ${v.name} (${v.cuisine_type || 'restaurant'}, ${v.rating}★, ${v.review_count} reviews, ${v.price_level || 'price unknown'}, ${v.distance_km?.toFixed(1)}km)`
    ).join('\n');

    let finalVenues: any[] = [];
    let search_summary: any = null;
    let suggested_chips: string[] = [];
    let overflowVenues: any[] = [];

    if (isDiscoveryMode) {
      // Discovery mode — skip confidence scoring, only generate descriptors and chips
      const discoveryResult = await safe('discovery-llm', () => callLLM(
        OPENAI_KEY,
        `You are a knowledgeable local friend who knows the city's food and drink scene intimately.`,
        `Here are nearby venues to describe:\n${candidateList}\n\nReturn a JSON object with:\n- "descriptors": array of ${candidates.length} arrays, one per venue in order, each containing exactly 3 short evocative phrases (3-6 words each) that capture the venue's vibe, food or drink style, and one standout quality. Write them like a knowledgeable local would describe the place — specific and evocative, never generic. Examples: "candlelit date setting", "handmade pasta daily", "hidden neighbourhood gem", "natural wine focus", "wood-fired everything".\n- "chips": array of 3-4 short follow-up search suggestions for discovering more venues nearby.`,
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
                additionalProperties: false
              }
            }
          }
        ],
        { type: 'function', function: { name: 'discovery_venue_content' } }
      ), { descriptors: [], chips: [] });

      finalVenues = candidates.slice(0, 8).map((v: any, i: number) => ({
        ...v,
        descriptors: discoveryResult.descriptors?.[i] || [],
      }));
      suggested_chips = discoveryResult.chips || [];

    } else {
      // Normal search mode — full confidence scoring, descriptors, summary and chips
      const comprehensiveResult = await safe('comprehensive-llm', () => callLLM(
        OPENAI_KEY,
        `You are a knowledgeable local friend who knows the city's food and drink scene intimately. Evaluate venues honestly and only include genuinely suitable matches.`,
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
                additionalProperties: false
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
          const venue = candidates[r.index - 1];
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
        const backfill = candidates
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
    console.log(`📦 Reserve venues: ${reserveVenues.length}`);

    // ─── Photo enrichment for reserve venues (lightweight, 3 photos each) ───
    if (reserveVenues.length > 0) {
      console.log(`🖼️ Reserve photo enrichment: ${reserveVenues.length} venues (3 photos each)...`);
      await Promise.all(
        reserveVenues.map(async (venue: any) => {
          if (!venue.place_id) { venue.image_urls = []; return; }
          venue.image_urls = await safe('reserve-photos', () => getPlacePhotos(GOOGLE_KEY, venue.place_id, 3), []);
        }),
      );
    }

    // ─── STEP 5: Photo enrichment ───
    console.log(`🖼️ STEP 5: Photos for ${finalVenues.length} venues...`);
    const enriched = await Promise.all(
      finalVenues.map(async (venue: any) => {
        if (!venue.place_id) return { ...venue, image_urls: [] };
        const urls = await safe('photos', () => getPlacePhotos(GOOGLE_KEY, venue.place_id, 4), []);
        return { ...venue, image_urls: urls };
      }),
    );

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
