const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, lat, lon, radius_km } = await req.json();

    if (!query || !lat || !lon) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: query, lat, lon' }), {
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

    const radius = (radius_km || 5) * 1000;
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const requestBody = {
      textQuery: query,
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: radius,
        },
      },
    };

    console.log(`🔍 Google Places Text Search (New): "${query}" at (${lat}, ${lon}), radius: ${radius_km}km`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.name,places.displayName,places.formattedAddress,places.types,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Google Places API (New) error:', errorData);
      return new Response(JSON.stringify({ success: false, error: `Google Places API error: ${response.status}` }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    const results = (data.places || []).map((place: any) => {
      let placeId = place.name;
      if (!placeId && place.id) {
        placeId = place.id.startsWith('places/') ? place.id : `places/${place.id}`;
      }

      return {
        place_id: placeId,
        name: place.displayName?.text || '',
        address: place.formattedAddress || '',
        types: place.types || [],
        lat: place.location?.latitude,
        lon: place.location?.longitude,
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        price_level: place.priceLevel,
        business_status: place.businessStatus,
      };
    });

    console.log(`✅ Found ${results.length} venues from Google Places`);

    return new Response(JSON.stringify({ success: true, results, query }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Broad search error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
