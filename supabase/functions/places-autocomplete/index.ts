/**
 * places-autocomplete
 *
 * Server-side proxy for Google Places API (New) calls made by the direct venue search
 * path (issue #127). Keeps GOOGLE_PLACES_API_KEY server-side so browser API key
 * restrictions do not apply.
 *
 * Handles two modes via the `mode` field in the request body:
 *
 *   mode: "autocomplete"
 *     Calls places:autocomplete with the provided query, session token, and optional
 *     location bias. Returns { suggestions: [] }.
 *
 *   mode: "close_session"
 *     Calls GET places/{placeId} with the minimum safe field mask to properly close
 *     a billing session. Returns the place details object or null.
 *
 * Field masks are defined as constants here — callers cannot override them.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const PLACES_BASE = 'https://places.googleapis.com/v1';

// Autocomplete: suggestions-only field mask (no per-place data charged).
const AUTOCOMPLETE_FIELD_MASK = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text',
  'suggestions.placePrediction.structuredFormat',
].join(',');

// Session close: minimum field mask that properly terminates a billing session.
// Do NOT reduce to `id` alone — IDs-only termination reverts all autocomplete
// requests in the session to per-request billing.
const SESSION_CLOSE_FIELD_MASK = 'id,displayName,formattedAddress,location,businessStatus';

const INCLUDED_PRIMARY_TYPES = [
  'restaurant', 'bar', 'night_club', 'cafe', 'bakery',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!API_KEY) {
    return new Response(
      JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { mode } = body;

  // ── Autocomplete ────────────────────────────────────────────────────────────
  if (mode === 'autocomplete') {
    const { query, sessionToken, lat, lng } = body;

    if (!query || query.length < 2 || query.length > 100) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payload: any = {
      input: query,
      sessionToken,
      includedPrimaryTypes: INCLUDED_PRIMARY_TYPES,
    };

    if (lat != null && lng != null) {
      payload.locationBias = {
        circle: { center: { latitude: lat, longitude: lng }, radius: 5000 },
      };
    }

    const resp = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Session close (Place Details) ───────────────────────────────────────────
  if (mode === 'close_session') {
    const { placeId, sessionToken } = body;

    if (!placeId) {
      return new Response(
        JSON.stringify({ error: 'placeId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const url = new URL(`${PLACES_BASE}/places/${placeId}`);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);

    const resp = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': SESSION_CLOSE_FIELD_MASK,
      },
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ error: `Unknown mode: ${mode}` }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
