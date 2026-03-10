import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ chips: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        max_tokens: 150,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `You generate short search refinement chips for a venue discovery app. 
Given a search query, return exactly 6 short noun phrases that a user might want to add to refine their search.
Rules:
- Each phrase must be 1-4 words
- Phrases must read naturally after "with" or "and" (e.g. "outdoor seating", "cozy vibes", "late night hours")
- Be specific and useful, not generic
- No duplicates
- Return ONLY a JSON array of 6 strings, nothing else. No markdown, no explanation.
Example output: ["outdoor seating", "craft cocktails", "cozy vibes", "late night hours", "pet-friendly patio", "happy hour deals"]`,
          },
          {
            role: "user",
            content: `Search query: "${query}"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error(`AI gateway error [${status}]:`, text);
      return new Response(JSON.stringify({ chips: [] }), {
        status: status === 429 || status === 402 ? status : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim();

    let chips: string[] = [];
    try {
      chips = JSON.parse(raw);
    } catch {
      chips = [];
    }

    return new Response(JSON.stringify({ chips }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-refinement-chips error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
