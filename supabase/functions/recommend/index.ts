const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Fixed scoring constants — never modified by relaxation level ───
const SCORING = {
  RATING_FLOOR: 4.0,
  RATING_CEILING: 5.0,
  REVIEW_FLOOR: 25,
  REVIEW_CAP: 2000,
  RATING_WEIGHT: 0.5,
  TRUST_WEIGHT: 0.5,
};

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

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const LLM_MODEL = 'google/gemini-2.5-flash';

async function callLLM(apiKey: string, systemPrompt: string, userPrompt: string, tools?: any[], toolChoice?: any): Promise<any> {
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

  const resp = await fetch(AI_GATEWAY, {
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

async function googlePlacesBroadSearch(apiKey: string, query: string, lat: number, lon: number, radiusKm: number, openNow?: boolean, priceLevels?: string[]) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const reqBody: any = {
    textQuery: query,
    maxResultCount: 20,
    locationBias: {
      circle: { center: { latitude: lat, longitude: lon }, radius: radiusKm * 1000 },
    },
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
      lat,
      lon,
      location_name,
      relaxation_level = 0,
      open_now,
      price_levels,
    } = await req.json();

    const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    const LOVABLE_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!GOOGLE_KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');
    if (!LOVABLE_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const searchTerm = mode === 'browse_category' && category ? category : query;
    console.log(`🎯 recommend: "${searchTerm}" at (${lat}, ${lon}) relaxation=${relaxation_level}`);
    console.log(`🔧 Filters received — open_now: ${open_now}, price_levels: ${JSON.stringify(price_levels)}, radius_km: ${radius_km}`);

    // ─── Admission thresholds ───
    const admission = {
      minRating: 4.0,
      minReviewCount: 25,
      minScore: 1.2,
      maxRadius: radius_km || 5,
    };
    if (relaxation_level === 1) {
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

    // ─── STEP 1: LLM query refinement ───
    let refinedSearchTerm = searchTerm;
    try {
      console.log('🤖 STEP 1: Refining search query...');
      const refinement = await callLLM(
        LOVABLE_KEY,
        'You extract cuisine keywords from search queries for Google Places API.',
        `The user is searching for "${searchTerm}" in ${location_name}.\nIdentify the primary cuisine types, dietary needs, or specific culinary styles mentioned.\nIf the query implies a very specific type of food, extract those keywords.\nIf the query is generic (e.g., "best restaurants", "places to eat"), return the original query.\nReturn ONLY a comma-separated list of 1-3 highly relevant and concise keywords/phrases suitable for a Google Places search, or the original query if no specific culinary focus is detected.`,
        [
          {
            type: 'function',
            function: {
              name: 'refine_query',
              description: 'Return refined search keywords',
              parameters: {
                type: 'object',
                properties: {
                  keywords: { type: 'string', description: 'Comma-separated refined keywords or original query' },
                },
                required: ['keywords'],
                additionalProperties: false,
              },
            },
          },
        ],
        { type: 'function', function: { name: 'refine_query' } },
      );
      if (refinement.keywords && refinement.keywords.toLowerCase() !== searchTerm.toLowerCase()) {
        refinedSearchTerm = refinement.keywords;
        console.log(`✅ Refined to: "${refinedSearchTerm}"`);
      }
    } catch (e: any) {
      console.warn('⚠️ LLM refinement failed:', e.message);
    }

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

    console.log(`🌍 STEP 2: Google Places search for "${refinedSearchTerm}"...`);
    const googleResults = await googlePlacesBroadSearch(
      GOOGLE_KEY,
      `${refinedSearchTerm} in ${location_name}`,
      lat,
      lon,
      admission.maxRadius,
      open_now,
      googlePriceLevels
    );
    console.log(`📊 Google returned ${googleResults.length} venues`);

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
      .filter((v: any) => v !== null);

    console.log(`✅ ${filteredVenues.length} passed filters`);

    if (filteredVenues.length === 0) {
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
    const scoredVenues = filteredVenues
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

    const TARGET = 5;
    const LLM_THRESHOLD = 0.6;
    const LLM_BATCH = 5;
    const skipLLM = isSimpleQuery(searchTerm, refinedSearchTerm) || scoredVenues.length < 3;

    let finalResults: any[] = [];

    if (skipLLM) {
      console.log('⏩ STEP 4b: Skipping LLM re-ranking');
      let r = 1;
      while (r <= admission.maxRadius && finalResults.length < TARGET) {
        const inR = scoredVenues.filter((v: any) => v.distance_km <= r);
        if (inR.length >= TARGET) {
          finalResults = dedup(inR).slice(0, TARGET);
          break;
        }
        r += 1;
      }
      if (finalResults.length < TARGET) {
        finalResults = dedup(scoredVenues).slice(0, TARGET);
      }
    } else {
      console.log(`🧠 STEP 4b: LLM intent re-ranking for "${searchTerm}"`);
      const pool = [...dedup(scoredVenues)];
      const confident: any[] = [];

      while (confident.length < TARGET && pool.length > 0) {
        const batch = pool.splice(0, LLM_BATCH);
        const evaluated = await Promise.all(
          batch.map(async (venue: any) => {
            try {
              const result = await callLLM(
                LOVABLE_KEY,
                'You assess how well a venue matches a user search query.',
                `The user searched for "${searchTerm}" in ${location_name}.\nVenue: ${venue.name}, ${venue.address}. Category: ${venue.category}. Cuisine: ${venue.cuisine_type}. Price: ${venue.price_level || 'Unknown'}. Rating: ${venue.rating} (${venue.review_count} reviews). Distance: ${venue.distance_km?.toFixed(1)}km.\nAssess how well this venue matches. Consider occasion suitability, culinary style, ambiance, dietary needs.`,
                [
                  {
                    type: 'function',
                    function: {
                      name: 'assess_venue',
                      description: 'Return confidence score and reasoning',
                      parameters: {
                        type: 'object',
                        properties: {
                          confidence_score: { type: 'number', description: '0.0-1.0 match score' },
                          reasoning: { type: 'string', description: '1-2 sentences starting with "This spot"' },
                        },
                        required: ['confidence_score', 'reasoning'],
                        additionalProperties: false,
                      },
                    },
                  },
                ],
                { type: 'function', function: { name: 'assess_venue' } },
              );
              console.log(`🎯 ${venue.name}: confidence=${result.confidence_score?.toFixed(2)}`);
              return { ...venue, llm_confidence: result.confidence_score, reasoning_explanation: result.reasoning };
            } catch {
              return { ...venue, llm_confidence: 1.0, reasoning_explanation: null };
            }
          }),
        );
        for (const v of evaluated) {
          if (v.llm_confidence >= LLM_THRESHOLD && confident.length < TARGET) {
            confident.push(v);
          }
        }
      }

      finalResults = confident;
      if (finalResults.length < TARGET) {
        const ids = new Set(finalResults.map((v: any) => v.place_id));
        const fillers = dedup(scoredVenues)
          .filter((v: any) => !ids.has(v.place_id))
          .slice(0, TARGET - finalResults.length);
        finalResults = [...finalResults, ...fillers];
      }
    }

    // ─── STEP 5: Photo enrichment ───
    console.log(`🖼️ STEP 5: Photos for ${finalResults.length} venues...`);
    const enriched = await Promise.all(
      finalResults.map(async (venue: any) => {
        if (!venue.place_id) return { ...venue, image_urls: [] };
        const urls = await safe('photos', () => getPlacePhotos(GOOGLE_KEY, venue.place_id, 4), []);
        return { ...venue, image_urls: urls };
      }),
    );

    // ─── STEP 6: LLM descriptors ───
    console.log('🤖 STEP 6: Generating descriptors...');
    let resultsWithDescriptors = enriched;
    try {
      const venueList = enriched.map((v: any) => `- ${v.name}`).join('\n');
      const descResult = await callLLM(
        LOVABLE_KEY,
        'You generate short descriptive tags for venues. Do NOT include generic words like restaurant, cafe, bar, eatery, dining, food, place.',
        `For each venue in ${location_name}, generate 2-3 SHORT descriptive tags (max 3-4 words each) capturing unique characteristics like ambiance, vibe, or standout qualities.\n\nVenues:\n${venueList}`,
        [
          {
            type: 'function',
            function: {
              name: 'generate_descriptors',
              description: 'Return descriptors per venue',
              parameters: {
                type: 'object',
                properties: {
                  venues: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        descriptors: { type: 'array', items: { type: 'string' } },
                      },
                      required: ['name', 'descriptors'],
                    },
                  },
                },
                required: ['venues'],
                additionalProperties: false,
              },
            },
          },
        ],
        { type: 'function', function: { name: 'generate_descriptors' } },
      );

      const genericTerms = ['restaurant', 'cafe', 'bar', 'eatery', 'dining', 'food', 'place'];
      const descMap = new Map<string, string[]>();
      for (const v of descResult.venues || []) {
        const filtered = (v.descriptors || []).filter(
          (d: string) => !genericTerms.some((g) => d.toLowerCase() === g || d.toLowerCase() === `${g}s`),
        );
        descMap.set(v.name, filtered.slice(0, 4));
      }
      resultsWithDescriptors = enriched.map((v: any) => ({
        ...v,
        descriptors: descMap.get(v.name) || [],
      }));
    } catch (e: any) {
      console.warn('⚠️ Descriptor generation failed:', e.message);
      resultsWithDescriptors = enriched.map((v: any) => ({ ...v, descriptors: [] }));
    }

    // ─── Suggested chips ───
    let suggested_chips: string[] = [];
    try {
      const chipResult = await callLLM(
        LOVABLE_KEY,
        'You suggest related search queries.',
        `Based on the search "${searchTerm}", suggest 3-4 related search queries the user might want to try next.`,
        [
          {
            type: 'function',
            function: {
              name: 'suggest_chips',
              description: 'Return suggested search queries',
              parameters: {
                type: 'object',
                properties: {
                  chips: { type: 'array', items: { type: 'string' } },
                },
                required: ['chips'],
                additionalProperties: false,
              },
            },
          },
        ],
        { type: 'function', function: { name: 'suggest_chips' } },
      );
      suggested_chips = chipResult.chips || [];
    } catch (e: any) {
      console.warn('⚠️ Chip generation failed:', e.message);
    }

    // ─── Strip internal fields ───
    const resultsForFrontend = resultsWithDescriptors.map(({ isRelaxedAdmission, unknownPrice, ...rest }: any) => rest);

    return new Response(
      JSON.stringify({
        results: resultsForFrontend,
        suggested_chips,
        pagination: { has_more: false },
        relaxation_applied: relaxation_level > 0,
        relaxation_level,
        gated: false,
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
