/**
 * refine-query
 *
 * Edge function that uses Gemini to extract search keywords, correct typos,
 * and parse structured intent from a natural language query.
 * Called by venueDataRouter.js (db_only) and api.js (live_fallback).
 *
 * Request:  { query: string, locationName: string, bypassCorrection?: boolean, userContext?: object }
 * Response: { keywords: string[], corrected_query: string, correction_applied: boolean, intent: IntentObject }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

interface Intent {
  occasion: string | null;
  vibe: string[];
  constraints: string[];
  price_signal: 'budget' | 'mid' | 'upscale' | null;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'late_night' | null;
  interpreted_summary: string;
}

interface GeminiResult {
  keywords: string[];
  corrected_query: string;
  correction_applied: boolean;
  intent: Intent;
}

function buildSystemPrompt(userContext: any): string {
  let contextBlock = '';

  if (userContext && Object.keys(userContext).length > 0) {
    const topCategories = Object.entries(userContext.categoryAffinities || {})
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([k]) => k);

    const topPrice = Object.entries(userContext.priceAffinities || {})
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 1)
      .map(([k]) => k)[0];

    const topAreas = Object.entries(userContext.areaAffinity || {})
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([k]) => k);

    contextBlock = `
User preference context (use when the query is ambiguous — do not override explicit intent):
- Preferred categories: ${topCategories.join(', ') || 'unknown'}
- Preferred price level: ${topPrice ?? 'unknown'} (1=budget, 2=mid, 3=upscale, 4=luxury)
- Frequented areas: ${topAreas.join(', ') || 'unknown'}
`;
  }

  return `You interpret venue search queries for a local discovery app.${contextBlock}

For each query, return a JSON object with:
- keywords: 1-4 short words that would appear in venue names or descriptions (no location names, no underscores)
- corrected_query: the query with typos/misspellings fixed; unchanged if already correct
- correction_applied: true only if corrected_query differs from the input
- intent: structured object with:
  - occasion: the social context if present, e.g. "date night", "birthday dinner", "business lunch", "solo lunch" — null if none
  - vibe: array of atmosphere descriptors mentioned or strongly implied, e.g. ["cozy", "lively", "quiet", "trendy"] — empty array if none
  - constraints: array of specific requirements mentioned, e.g. ["open late", "outdoor seating", "dog-friendly", "vegetarian options"] — empty array if none
  - price_signal: "budget" if cheap/affordable/inexpensive implied; "upscale" if fancy/fine dining/splurge implied; "mid" if moderate; null if not implied
  - time_of_day: "morning" (breakfast/brunch), "afternoon" (lunch), "evening" (dinner), "late_night" (after 10pm) — null if not implied
  - interpreted_summary: one short sentence describing what the user is looking for, e.g. "Cozy Italian spot for a date night" or "Affordable late-night ramen"`;
}

async function getStructuredOutputFromGemini(query: string, cityName: string, userContext: any): Promise<GeminiResult> {
  const body = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(userContext) }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: `Search: "${query}" in ${cityName}.` }],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' } },
          corrected_query: { type: 'string' },
          correction_applied: { type: 'boolean' },
          intent: {
            type: 'object',
            properties: {
              occasion: { type: 'string', nullable: true },
              vibe: { type: 'array', items: { type: 'string' } },
              constraints: { type: 'array', items: { type: 'string' } },
              price_signal: { type: 'string', nullable: true },
              time_of_day: { type: 'string', nullable: true },
              interpreted_summary: { type: 'string' },
            },
            required: ['occasion', 'vibe', 'constraints', 'price_signal', 'time_of_day', 'interpreted_summary'],
          },
        },
        required: ['keywords', 'corrected_query', 'correction_applied', 'intent'],
      },
    },
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(rawText) as GeminiResult;
}

const EMPTY_INTENT: Intent = {
  occasion: null,
  vibe: [],
  constraints: [],
  price_signal: null,
  time_of_day: null,
  interpreted_summary: '',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ keywords: [], corrected_query: '', correction_applied: false, intent: EMPTY_INTENT }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { query, locationName, bypassCorrection, userContext } = body;

    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ keywords: [], corrected_query: '', correction_applied: false, intent: EMPTY_INTENT }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cityName = locationName || 'the city';
    const result = await getStructuredOutputFromGemini(query, cityName, userContext || {});

    const keywords = (result.keywords || [])
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => k.length > 0);

    const correctedQuery = bypassCorrection ? query : (result.corrected_query || query);
    const correctionApplied = bypassCorrection ? false : (result.correction_applied === true && correctedQuery !== query);

    const intent: Intent = {
      occasion: result.intent?.occasion ?? null,
      vibe: Array.isArray(result.intent?.vibe) ? result.intent.vibe : [],
      constraints: Array.isArray(result.intent?.constraints) ? result.intent.constraints : [],
      price_signal: result.intent?.price_signal ?? null,
      time_of_day: result.intent?.time_of_day ?? null,
      interpreted_summary: result.intent?.interpreted_summary ?? '',
    };

    console.log(`🔍 refine-query: "${query}" → [${keywords.join(', ')}] | corrected: "${correctedQuery}" applied: ${correctionApplied} | intent: ${JSON.stringify(intent)}`);

    return new Response(
      JSON.stringify({ keywords, corrected_query: correctedQuery, correction_applied: correctionApplied, intent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('❌ refine-query error:', error);
    return new Response(
      JSON.stringify({ keywords: [], corrected_query: '', correction_applied: false, intent: EMPTY_INTENT }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
