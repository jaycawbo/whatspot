const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ success: true, suggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Google Places API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const autocompleteUrl = 'https://places.googleapis.com/v1/places:autocomplete';

    const autocompleteResponse = await fetch(autocompleteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({
        input: query,
        languageCode: 'en',
      }),
    });

    if (!autocompleteResponse.ok) {
      const errorText = await autocompleteResponse.text();
      console.error(`❌ Google Places Autocomplete API error: ${autocompleteResponse.status}`, errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch location suggestions' }), {
        status: autocompleteResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const autocompleteData = await autocompleteResponse.json();

    const suggestions = (autocompleteData.suggestions || []).slice(0, 5).map((s: any) => ({
      display_name: s.placePrediction.text.text,
      full_name:
        s.placePrediction.structuredFormat.mainText.text +
        (s.placePrediction.structuredFormat.secondaryText?.text
          ? ', ' + s.placePrediction.structuredFormat.secondaryText.text
          : ''),
      place_id: s.placePrediction.placeId,
      lat: null,
      lon: null,
    }));

    return new Response(JSON.stringify({ success: true, suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Location search error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
