/**
 * refine-query
 *
 * Lightweight edge function that uses Gemini 2.0-flash to extract
 * plain-text search keywords from a natural language query.
 * Called by venueDataRouter.js before ilike search to improve
 * search quality without requiring Google Places API.
 *
 * Request:  { query: string, locationName: string }
 * Response: { keywords: string[] }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

async function getKeywordsFromGemini(query: string, cityName: string): Promise<string> {
  const body = {
    system_instruction: {
      parts: [{ text: 'You extract short venue and food keywords from search queries. Return only a comma-separated list of 1-4 keywords that would appear in venue names or descriptions. No location names. No underscores. No explanation. Just the keywords.' }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: `Search: "${query}" in ${cityName}. Keywords:` }],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 50 },
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
        JSON.stringify({ keywords: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { query, locationName } = body;
    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ keywords: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cityName = locationName || 'the city';
    const rawText = await getKeywordsFromGemini(query, cityName);
    const keywords = rawText
      .split(',')
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => k.length > 0);

    console.log(`🔍 refine-query: "${query}" → [${keywords.join(', ')}]`);

    return new Response(
      JSON.stringify({ keywords }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('❌ refine-query error:', error);
    // Return empty keywords — caller falls back to keyword splitting
    return new Response(
      JSON.stringify({ keywords: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
