import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAndLog } from '../_shared/apiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Google Places type → best-effort category guess, matching the convention
// already used in recommend/index.ts. Real category backfill still happens
// via the infer-venue-categories cron; this just avoids an empty filter UI
// immediately after import.
function guessCategory(types: string[]): string | null {
  return (types || []).find((t) => t.includes('restaurant') || t.includes('cafe') || t.includes('bar')) || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venue_name, lat, lon, city_name, register = false } = await req.json();

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

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Monthly spend-cap circuit breaker — shared with the other Places API
    // functions. Matters most here: bulk list-import can fire dozens of these
    // in one user action.
    const allowed = await checkAndLog(sb, 'text_search', undefined);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Monthly API cap reached' }), {
        status: 429,
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
        // Basic-tier fields only (no Atmosphere fields like rating/priceLevel/photos —
        // those stay behind the existing lazy enrichment path in google-places-details).
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus',
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
    const cleanId = (placeId || '').replace(/^places\//, '');

    // Optional: register a minimal venue row so the caller can immediately
    // save this place to Spots without a separate insert step. Used by the
    // bulk list-import flow (issue #285). Basic-tier fields only; `enriched`
    // stays false so photos/reviews/hours load lazily like any other venue.
    let venueId: string | null = null;
    if (register && cleanId) {
      // ignoreDuplicates so an existing (possibly already-enriched) venue row
      // is never overwritten — we only ever fill in a row that doesn't exist yet.
      const { error: upsertError } = await sb.from('venues').upsert([{
        google_place_id: cleanId,
        name:             place.displayName?.text || venue_name,
        address:          place.formattedAddress   || '',
        lat:              place.location?.latitude  || null,
        lng:              place.location?.longitude || null,
        venue_types:      place.types || [],
        category:         guessCategory(place.types || []),
        business_status:  place.businessStatus || null,
        enriched:         false,
        is_chain:         false,
      }], { onConflict: 'google_place_id', ignoreDuplicates: true });

      if (upsertError) {
        console.error('[search-google-place] venue upsert failed:', upsertError.message);
      }

      // Upsert with ignoreDuplicates doesn't RETURNING a skipped conflict row,
      // so fetch the id separately regardless of whether this call inserted it.
      // If the upsert itself failed AND no prior row exists, this legitimately
      // returns null — the client treats a null venue_id as a failed match.
      const { data: venueRow } = await sb
        .from('venues')
        .select('id')
        .eq('google_place_id', cleanId)
        .maybeSingle();
      venueId = venueRow?.id ?? null;
    }

    return new Response(JSON.stringify({
      success: true,
      place_id: cleanId,
      venue_id: venueId,
      name: place.displayName?.text || venue_name,
      address: place.formattedAddress || '',
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
