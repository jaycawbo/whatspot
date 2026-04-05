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

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=ca`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'WhatSpot/1.0 (whatspot.app)' },
    });

    if (!response.ok) {
      console.error(`❌ Nominatim error: ${response.status}`);
      return new Response(JSON.stringify({ success: true, suggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await response.json();

    const suggestions = results.map((r: any) => {
      const a = r.address || {};
      const mainText = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.city || a.town || a.village || r.display_name.split(',')[0];
      const parts = [a.city || a.town || a.village, a.state, a.country].filter(Boolean);
      const secondaryText = parts.join(', ');
      return {
        display_name: r.display_name,
        full_name: secondaryText ? `${mainText}, ${secondaryText}` : mainText,
        place_id: r.place_id,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      };
    });

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
