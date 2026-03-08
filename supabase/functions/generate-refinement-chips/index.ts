const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ chips: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(JSON.stringify({ chips: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `You generate short refinement chip labels for a venue search app. Each label is a noun phrase (2-4 words) that reads naturally when appended with "with" or "and" to a search query. Examples: "outdoor seating", "craft cocktails", "cozy vibes", "budget-friendly prices". Return exactly 6 labels. Do not include generic terms like "restaurant", "bar", "cafe".`,
          },
          {
            role: 'user',
            content: `Generate 6 refinement chip labels for this search: "${query}"`,
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'return_chips',
              description: 'Return refinement chip labels',
              parameters: {
                type: 'object',
                properties: {
                  chips: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 6,
                    maxItems: 6,
                  },
                },
                required: ['chips'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'return_chips' } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error(`AI gateway error [${status}]:`, text);
      return new Response(JSON.stringify({ chips: [] }), {
        status: status === 429 || status === 402 ? status : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let chips: string[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        chips = parsed.chips || [];
      } catch {
        console.error('Failed to parse tool call arguments');
      }
    }

    return new Response(JSON.stringify({ chips }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('generate-refinement-chips error:', error);
    return new Response(JSON.stringify({ chips: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
