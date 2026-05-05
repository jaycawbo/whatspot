/**
 * generate-response
 *
 * Edge function that uses Gemini to write conversational copy around
 * venue search results. Called by buildResponsePrompt.js on the client.
 *
 * Request:  { venues, originalQuery, vibeKeywords, conversationHistory }
 * Response: { conversational_response, venue_copy, refinement_suggestions }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    conversational_response: { type: 'string' },
    venue_copy: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          place_id: { type: 'string' },
          why_recommended: { type: 'string' },
        },
        required: ['place_id', 'why_recommended'],
      },
    },
    refinement_suggestions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['conversational_response', 'venue_copy', 'refinement_suggestions'],
};

function serializeVenues(venues: any[]) {
  return venues.map((v: any) => ({
    place_id: v.place_id,
    name: v.name,
    address: v.address,
    price_level: v.price_level ?? null,
    rating: v.rating ?? null,
    review_count: v.review_count ?? null,
    venue_types: v.types ?? [],
  }));
}

function buildUserPrompt(originalQuery: string, vibeKeywords: string[], serializedVenues: any[]) {
  return [
    `The user searched for: "${originalQuery}"`,
    `Vibe signals from their query: ${JSON.stringify(vibeKeywords)}`,
    '',
    'Here are the top venues retrieved from our database (already ranked by rating and review count):',
    JSON.stringify(serializedVenues, null, 2),
    '',
    'Your job is to write the conversational layer. Do not retrieve venues. Do not reorder results. Do not add venues not in the list above.',
    '',
    'Return JSON only matching this schema:',
    '{',
    '  "conversational_response": "string — one sentence intro to the results, referencing the vibe or intent",',
    '  "venue_copy": [',
    '    {',
    '      "place_id": "string",',
    '      "why_recommended": "string — one sentence specific to this venue, not generic"',
    '    }',
    '  ],',
    '  "refinement_suggestions": ["string", "string", "string"] — contextual follow-up chips',
    '}',
    '',
    'Rules:',
    '- venue_copy must contain one entry per venue, in the same order as the input',
    '- why_recommended must reference something specific about the venue (not "great atmosphere" generically)',
    '- refinement_suggestions should reflect what a user might logically ask next given this query',
  ].join('\n');
}

const FALLBACK = {
  conversational_response: '',
  venue_copy: [] as any[],
  refinement_suggestions: [] as string[],
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
      return new Response(JSON.stringify(FALLBACK), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { venues = [], originalQuery = '', vibeKeywords = [], conversationHistory = [] } = body;

    if (!venues.length) {
      return new Response(JSON.stringify(FALLBACK), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serializedVenues = serializeVenues(venues);
    const userPrompt = buildUserPrompt(originalQuery, vibeKeywords, serializedVenues);

    const historyContents = (conversationHistory as any[]).map((turn: any) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));

    const geminiBody = {
      system_instruction: {
        parts: [{
          text: 'You are a conversational copy writer for a venue discovery app. Your only job is to write natural language around venue results that have already been retrieved and ranked. You must never suggest, retrieve, reorder, or invent venues. You must never call external APIs or use grounding tools.',
        }],
      },
      contents: [
        ...historyContents,
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    const resp = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error(`generate-response: Gemini error ${resp.status}: ${txt.slice(0, 500)}`);
      return new Response(JSON.stringify(FALLBACK), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`generate-response: Gemini status=${resp.status}`);
    const data = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return new Response(JSON.stringify(FALLBACK), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = JSON.parse(rawText);
    console.log(`generate-response: "${originalQuery}" → "${parsed.conversational_response?.slice(0, 60)}"`);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('generate-response error:', error);
    return new Response(JSON.stringify(FALLBACK), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
