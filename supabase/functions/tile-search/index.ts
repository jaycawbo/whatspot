/**
 * tile-search — Geographic tiling system for discovery mode
 *
 * Extracted from recommend/index.ts. Fires up to 15 parallel Google Places API
 * calls per invocation (5 tiles × 3 queries). DO NOT enable without explicit
 * sign-off and verified Supabase-first gating to cap call volume.
 *
 * To re-enable: set TILE_SEARCH_ENABLED = true and wire into recommend/index.ts
 * at the isDiscoveryMode branch (was lines 978-1030).
 */

// DISABLED — change to true only with explicit sign-off
const TILE_SEARCH_ENABLED = false;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISCOVERY_QUERIES = [
  "restaurant OR cafe OR bistro OR diner OR brasserie",
  "bar OR pub OR lounge OR nightclub OR brewery OR dive bar",
  "snack bar OR sandwich shop OR burger joint OR food market OR hotel restaurant",
];

const GOOGLE_PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

async function googlePlacesBroadSearch(
  apiKey: string,
  query: string,
  lat: number,
  lon: number,
  radiusKm: number,
  openNow?: boolean,
  priceLevels?: number[],
): Promise<any[]> {
  const body: Record<string, any> = {
    textQuery: query,
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: radiusKm * 1000,
      },
    },
  };
  if (openNow) body.openNow = true;
  if (priceLevels?.length) body.priceLevels = priceLevels;

  const res = await fetch(GOOGLE_PLACES_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id', 'places.displayName', 'places.location',
        'places.rating', 'places.userRatingCount', 'places.priceLevel',
        'places.types', 'places.businessStatus', 'places.formattedAddress',
        'places.currentOpeningHours',
      ].join(','),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.places || []).map((p: any) => ({
    place_id: p.id,
    name: p.displayName?.text,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating,
    review_count: p.userRatingCount,
    price_level: p.priceLevel,
    types: p.types,
    business_status: p.businessStatus,
    address: p.formattedAddress,
    is_open_now: p.currentOpeningHours?.openNow ?? null,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (!TILE_SEARCH_ENABLED) {
    return new Response(
      JSON.stringify({ disabled: true, venues: [], message: 'tile-search is disabled' }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!GOOGLE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing GOOGLE_PLACES_API_KEY' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const {
    lat, lon,
    tile_radius_km,
    max_radius_km,
    google_call_cap = 99,
    open_now,
    price_levels,
    location_context,
  } = await req.json();

  // ── Tile geometry (identical to original recommend/index.ts logic) ──────────
  const tileSearchRadius = tile_radius_km || max_radius_km || 5;
  const latOffset = (tileSearchRadius * 0.5) / 111;
  const lonOffset = (tileSearchRadius * 0.5) / (111 * Math.cos(lat * Math.PI / 180));
  const tileRadius = tileSearchRadius * 0.75;
  const allTiles = [
    { tlat: lat,              tlon: lon,              tradius: tileSearchRadius }, // center
    { tlat: lat + latOffset,  tlon: lon,              tradius: tileRadius },       // north
    { tlat: lat - latOffset,  tlon: lon,              tradius: tileRadius },       // south
    { tlat: lat,              tlon: lon + lonOffset,  tradius: tileRadius },       // east
    { tlat: lat,              tlon: lon - lonOffset,  tradius: tileRadius },       // west
  ];
  // Cap to center tile only when google_call_cap is low (Supabase fallback path)
  const tiles = google_call_cap <= 3 ? allTiles.slice(0, 1) : allTiles;

  // ── Build and fire all tile × query combinations in parallel ─────────────
  const tileCalls: Promise<any[]>[] = [];
  for (const tile of tiles) {
    for (const q of DISCOVERY_QUERIES) {
      tileCalls.push(
        googlePlacesBroadSearch(
          GOOGLE_KEY,
          `${q} in ${location_context}`,
          tile.tlat, tile.tlon, tile.tradius,
          open_now, price_levels,
        ).catch(() => [])
      );
    }
  }

  const allTileResults = await Promise.all(tileCalls);
  const totalRaw = allTileResults.reduce((s, r) => s + r.length, 0);

  // ── Merge and deduplicate by place_id ────────────────────────────────────
  const seenPlaceIds = new Set<string>();
  const venues: any[] = [];
  for (const batch of allTileResults) {
    for (const r of batch) {
      const pid = (r.place_id || '').replace(/^places\//, '');
      if (!seenPlaceIds.has(pid)) {
        seenPlaceIds.add(pid);
        venues.push(r);
      }
    }
  }

  console.log(
    `tile-search: ${tiles.length} tiles × ${DISCOVERY_QUERIES.length} queries = ` +
    `${tileCalls.length} calls, ${totalRaw} raw → ${venues.length} unique`,
  );

  return new Response(JSON.stringify({ venues, disabled: false }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
