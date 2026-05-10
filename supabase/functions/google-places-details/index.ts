const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { place_id, fields } = await req.json();

    if (!place_id) {
      return new Response(JSON.stringify({ error: 'place_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestedFields = fields || [
      'displayName',
      'formattedAddress',
      'location',
      'rating',
      'userRatingCount',
      'priceLevel',
    ];

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Google Places API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const placeIdFormatted = place_id.startsWith('places/') ? place_id : `places/${place_id}`;
    const url = `https://places.googleapis.com/v1/${placeIdFormatted}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': requestedFields.join(','),
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Google Places API error:', response.status, errorData);
      return new Response(JSON.stringify({
        error: `Google Places API error: ${response.status}`,
        details: errorData,
        requested_fields: requestedFields,
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    const transformed = {
      name: data.displayName?.text || '',
      address: data.formattedAddress || '',
      rating: data.rating || 0,
      review_count: data.userRatingCount || 0,
      website: data.websiteUri || null,
      phone: data.nationalPhoneNumber || null,
      price_level: data.priceLevel ? '$'.repeat(Math.min(data.priceLevel, 4)) : null,
      business_status: data.businessStatus || null,
      lat: data.location?.latitude || null,
      lon: data.location?.longitude || null,
      is_open_now: data.currentOpeningHours?.openNow || null,
      opening_hours: data.currentOpeningHours?.weekdayDescriptions || [],
      description: data.editorialSummary?.text || null,
      reviews: data.reviews
        ? data.reviews.map((review: any) => ({
            author: review.authorAttribution?.displayName || 'Anonymous',
            rating: review.rating || 0,
            text: review.text?.text || '',
            time: review.publishTime || null,
          }))
        : [],
    };

    return new Response(JSON.stringify({ success: true, data: transformed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching place details:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
