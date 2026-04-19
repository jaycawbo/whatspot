const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, lat, lon } = await req.json();

    // Reverse geocode: lat/lon → place name
    if (lat !== undefined && lon !== undefined) {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'WhatSpot/1.0 (whatspot.app)' },
      });
      if (!response.ok) {
        return new Response(JSON.stringify({ success: true, name: 'Current Location' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const data = await response.json();
      const a = data.address || {};
      const name = a.city || a.town || a.village || a.suburb || 'Current Location';
      return new Response(JSON.stringify({ success: true, name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!address) {
      return new Response(JSON.stringify({ error: 'address or lat/lon is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔍 Geocoding: "${address}"`);

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'WhatSpot/1.0 (whatspot.app)' },
    });

    if (!response.ok) {
      console.error(`❌ Nominatim geocoding error: ${response.status}`);
      return new Response(JSON.stringify({ success: false, error: 'Geocoding service unavailable' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await response.json();

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Unable to geocode address' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const r = results[0];
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    const type = r.type || r.class || '';
    const addressClass = r.addresstype || '';

    const BROAD_TYPES = ['city', 'town', 'village', 'municipality', 'administrative', 'county', 'state', 'country', 'postal_code'];
    const NEIGHBOURHOOD_TYPES = ['neighbourhood', 'suburb', 'quarter', 'city_district'];
    const STREET_TYPES = ['house', 'building', 'amenity', 'shop', 'tourism', 'leisure', 'road', 'street', 'path'];

    let locationType = 'other';
    const checkVal = (addressClass || type).toLowerCase();
    if (BROAD_TYPES.some(t => checkVal.includes(t))) {
      locationType = 'city';
    } else if (NEIGHBOURHOOD_TYPES.some(t => checkVal.includes(t))) {
      locationType = 'neighbourhood';
    } else if (STREET_TYPES.some(t => checkVal.includes(t))) {
      locationType = 'street';
    }

    console.log(`✅ Geocoded: [${lat}, ${lon}], type: ${locationType}`);

    return new Response(JSON.stringify({ success: true, lat, lon, locationType }), {
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
