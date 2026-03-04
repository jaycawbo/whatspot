const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, city_name } = await req.json();

    if (!address) {
      return new Response(JSON.stringify({ error: 'address is required' }), {
        status: 400,
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

    const cleanAddress = address
      .replace(/\s+(Unit|Suite|Ste|Apt|#)\s+[A-Za-z0-9-]+/gi, '')
      .replace(/,\s*(Unit|Suite|Ste|Apt|#)[^,]*/gi, '');

    const strategies = [
      cleanAddress,
      cleanAddress.split(',').slice(0, 2).join(','),
      city_name ? `${cleanAddress.split(',')[0]}, ${city_name}` : null,
    ].filter(Boolean);

    for (const query of strategies) {
      if (!query || query.trim() === '') continue;

      console.log(`🔍 Geocoding: "${query}"`);

      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`❌ Google Geocoding API error: ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        console.log(`✅ Geocoded: [${location.lat}, ${location.lng}]`);
        return new Response(JSON.stringify({
          success: true,
          lat: location.lat,
          lon: location.lng,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Unable to geocode address' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Geocoding error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
