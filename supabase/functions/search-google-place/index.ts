const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venue_name, lat, lon, city_name } = await req.json();

    if (!venue_name) {
      return new Response(JSON.stringify({ error: 'venue_name is required' }), {
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

    const url = 'https://places.googleapis.com/v1/places:searchText';

    const requestBody: Record<string, unknown> = {
      textQuery: city_name ? `${venue_name} in ${city_name}` : venue_name,
      maxResultCount: 1,
    };

    if (lat && lon) {
      requestBody.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: 5000.0,
        },
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Google Places Search API error:', errorData);
      return new Response(JSON.stringify({ error: `Google Places Search API error: ${response.status}` }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    if (!data.places || data.places.length === 0) {
      return new Response(JSON.stringify({ error: 'Place not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const place = data.places[0];
    let placeId = place.name;
    if (!placeId && place.id) {
      placeId = place.id.startsWith('places/') ? place.id : `places/${place.id}`;
    }

    return new Response(JSON.stringify({
      success: true,
      place_id: placeId,
      name: place.displayName?.text || venue_name,
      lat: place.location?.latitude || null,
      lon: place.location?.longitude || null,
      types: place.types || [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error searching for place:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
