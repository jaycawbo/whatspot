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
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  tools: any[],
  toolChoice: any,
  options: { max_tokens?: number; temperature?: number },
): Promise<any> {
  const body: any = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  };

  const functionDeclarations = tools.map((t: any) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
  body.tools = [{ function_declarations: functionDeclarations }];
  body.tool_config = {
    function_calling_config: {
      mode: 'ANY',
      allowed_function_names: [toolChoice.function.name],
    },
  };

  body.generationConfig = {
    temperature: options.temperature ?? 0,
    maxOutputTokens: options.max_tokens ?? 100,
  };

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
  if (part?.functionCall) return part.functionCall.args;
  return part?.text || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const { query, locationName } = await req.json();
    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ keywords: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await callLLM(
      'gemini-2.0-flash',
      `You extract short food and venue keywords from search queries for text search.
Return keywords that would appear in venue names or descriptions.
Do NOT include location names, city names, or neighbourhood names.
Do NOT use underscores — use plain words only.`,
      `The user is searching for "${query}" in ${locationName || 'their city'}.
Return a comma-separated list of 1-4 short keywords that would appear in the names or descriptions of matching venues.
Example: "quick bites near me" → "burger,sandwich,fast food,grill"
Example: "romantic date night" → "bistro,wine bar,italian,french"
Example: "coffee and wifi" → "cafe,coffee"`,
      [
        {
          type: 'function',
          function: {
            name: 'refine_query',
            description: 'Extract venue/food keywords for text search',
            parameters: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'string',
                  description: 'Comma-separated plain-text keywords, no underscores, no location names',
                },
              },
              required: ['keywords'],
            },
          },
        },
      ],
      { type: 'function', function: { name: 'refine_query' } },
      { max_tokens: 100, temperature: 0 },
    );

    const keywords = (result?.keywords || '')
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
