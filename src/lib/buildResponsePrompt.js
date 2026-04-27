const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    conversational_response: { type: 'STRING' },
    venue_copy: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          place_id: { type: 'STRING' },
          why_recommended: { type: 'STRING' },
        },
        required: ['place_id', 'why_recommended'],
      },
    },
    refinement_suggestions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['conversational_response', 'venue_copy', 'refinement_suggestions'],
};

function serializeVenues(venues) {
  return venues.map(v => ({
    place_id: v.place_id,
    name: v.name,
    address: v.address,
    price_level: v.price_level ?? null,
    rating: v.rating ?? null,
    review_count: v.review_count ?? null,
    venue_types: v.types ?? [],
  }));
}

function buildUserPrompt(originalQuery, vibeKeywords, serializedVenues) {
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

export async function buildResponsePrompt({
  venues = [],
  originalQuery = '',
  vibeKeywords = [],
  conversationHistory = [],
}) {
  const fallback = {
    conversational_response: '',
    venue_copy: venues.map(v => ({ place_id: v.place_id, why_recommended: '' })),
    refinement_suggestions: [],
  };

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || !venues.length) return fallback;

  try {
    const serializedVenues = serializeVenues(venues);
    const userPrompt = buildUserPrompt(originalQuery, vibeKeywords, serializedVenues);

    const historyContents = conversationHistory.map(turn => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));

    const body = {
      system_instruction: {
        parts: [
          {
            text: 'You are a conversational copy writer for a venue discovery app. Your only job is to write natural language around venue results that have already been retrieved and ranked. You must never suggest, retrieve, reorder, or invent venues. You must never call external APIs or use grounding tools.',
          },
        ],
      },
      contents: [
        ...historyContents,
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    const resp = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) return fallback;

    const data = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return fallback;

    const parsed = JSON.parse(rawText);
    return parsed;
  } catch {
    return fallback;
  }
}
