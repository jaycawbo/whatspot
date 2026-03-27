const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venue_name, reviews } = await req.json();

    if (!reviews || reviews.length === 0) {
      return new Response(JSON.stringify({ review_summary: null, recommended_items: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reviewsText = reviews.slice(0, 10).join('\n---\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `You are a concise venue review analyst. Given reviews for "${venue_name}", extract two things:
1. A 2-3 sentence summary of what people enjoy about this place, covering food quality, atmosphere, service, and value as applicable.
2. A list of 1-5 specific dishes or drinks that reviewers recommend ordering.
Use the provided tool to return structured output.`,
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Here are the reviews:\n\n${reviewsText}` }],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'venue_insights',
                  description: 'Return a review summary and recommended items for a venue.',
                  parameters: {
                    type: 'object',
                    properties: {
                      review_summary: {
                        type: 'string',
                        description: 'A 2-3 sentence summary of what people enjoy about this place.',
                      },
                      recommended_items: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of 1-5 specific dishes or drinks reviewers recommend.',
                      },
                    },
                    required: ['review_summary', 'recommended_items'],
                  },
                },
              ],
            },
          ],
          tool_config: {
            function_calling_config: {
              mode: 'ANY',
              allowed_function_names: ['venue_insights'],
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await response.text();
      console.error('Gemini API error:', status, errText);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    const functionCall = aiData.candidates?.[0]?.content?.parts?.[0]?.functionCall;

    if (functionCall?.args) {
      return new Response(JSON.stringify(functionCall.args), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ review_summary: null, recommended_items: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('venue-ai-insights error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
