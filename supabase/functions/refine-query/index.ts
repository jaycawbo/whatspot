/**
 * refine-query
 *
 * Lightweight edge function that uses Gemini to extract search keywords
 * AND correct typos/unclear phrasing from a natural language query.
 * Called by venueDataRouter.js (db_only) and api.js (live_fallback).
 *
 * Request:  { query: string, locationName: string, bypassCorrection?: boolean }
 * Response: { keywords: string[], corrected_query: string, correction_applied: boolean }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

interface GeminiResult {
  keywords: string[];
  corrected_query: string;
  correction_applied: boolean;
}

async function getStructuredOutputFromGemini(query: string, cityName: string): Promise<GeminiResult> {
  const body = {
    system_instruction: {
      parts: [{
        text: 'You help interpret venue search queries. Extract 1-4 short keywords that would appear in venue names or descriptions (no location names, no underscores). Also, if the query contains typos, misspellings, or unclear phrasing, return the most likely intended query in corrected_query and set correction_applied to true. If the query is already clear and correct, return it unchanged in corrected_query and set correction_applied to false.',
      }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: `Search: "${query}" in ${cityName}.` }],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 200,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' } },
          corrected_query: { type: 'string' },
          correction_applied: { type: 'boolean' },
        },
        required: ['keywords', 'corrected_query', 'correction_applied'],
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
        JSON.stringify({ keywords: [], corrected_query: '', correction_applied: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { query, locationName, bypassCorrection } = body;
    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ keywords: [], corrected_query: '', correction_applied: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cityName = locationName || 'the city';
    const result = await getStructuredOutputFromGemini(query, cityName);

    const keywords = (result.keywords || [])
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => k.length > 0);

    // When bypass is requested, caller already knows the raw query is canonical
    const correctedQuery = bypassCorrection ? query : (result.corrected_query || query);
    const correctionApplied = bypassCorrection ? false : (result.correction_applied === true && correctedQuery !== query);

    console.log(`🔍 refine-query: "${query}" → [${keywords.join(', ')}] | corrected: "${correctedQuery}" applied: ${correctionApplied}`);

    return new Response(
      JSON.stringify({ keywords, corrected_query: correctedQuery, correction_applied: correctionApplied }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('❌ refine-query error:', error);
    return new Response(
      JSON.stringify({ keywords: [], corrected_query: '', correction_applied: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
