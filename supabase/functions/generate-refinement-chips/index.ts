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

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(JSON.stringify({ chips: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `You generate short search refinement chips for a venue discovery app.
Given a search query, return exactly 6 short noun phrases that a user might want to add to refine their search.
Rules:
- Each phrase must be 1-4 words
- Phrases must read naturally after "with" or "and" (e.g. "outdoor seating", "cozy vibes", "late night hours")
- Be specific and useful, not generic
- No duplicates
- Return ONLY a JSON array of 6 strings, nothing else. No markdown, no explanation.
Example output: ["outdoor seating", "craft cocktails", "cozy vibes", "late night hours", "pet-friendly patio", "happy hour deals"]`,
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: `Search query: "${query}"` }],
            },
          ],
          generationConfig: { maxOutputTokens: 150, temperature: 0.7 },
        }),
      },
    );

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error(`Gemini error [${status}]:`, text);
      return new Response(JSON.stringify({ chips: [] }), {
        status: status === 429 ? status : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

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
