/**
 * census-sweep
 *
 * Supplemental Toronto venue sweep for types the original census missed.
 * Uses the same grid and Nearby Search pattern as toronto-census.js but:
 *   - Tighter grid (0.005° vs 0.008°) to reduce corner blind spots
 *   - Targets cafe, bakery, night_club and other non-restaurant/bar types
 *   - Skips venues already in DB (ignoreDuplicates: true) — safe to re-run
 *   - Resumable via start_cell offset
 *
 * Usage:
 *   POST { dry_run?: boolean, target_types?: string[], batch_cells?: number, start_cell?: number }
 *
 * Hard cap: never processes more than 200 cells per call.
 * Cost: $0.032/call × batch_cells × target_types.length
 *   Default (10 cells × 10 types): 100 calls = $3.20 per run
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Grid constants (tighter than original census to reduce blind spots) ────────

const LAT_MIN = 43.580;
const LAT_MAX = 43.773;
const LNG_MIN = -79.640;
const LNG_MAX = -79.270;
const STEP    = 0.005;
const LAT_CAP = 43.7730; // Steeles Ave northern boundary
const RADIUS  = 600;     // metres per cell search radius
const MAX_RESULTS = 20;
const MAX_CELLS = 200;
const DEFAULT_BATCH = 10;
const FREE_TIER_MONTHLY = 5000;

// ── Default target types — everything the original restaurant/bar census missed ─

const DEFAULT_TARGET_TYPES = [
  'cafe',
  'bakery',
  'night_club',
  'comedy_club',
  'sandwich_shop',
  'food_court',
  'fast_food_restaurant',
  'wine_bar',
  'cocktail_bar',
  'coffee_shop',
];

// ── Chain blocklist (kept in sync with recommend/index.ts) ─────────────────────

const CHAIN_BLOCKLIST = [
  "mcdonald's", "mcdonalds", "subway", "starbucks", "tim hortons", "burger king",
  "wendy's", "wendys", "kfc", "pizza hut", "domino's", "dominoes", "taco bell",
  "popeyes", "dairy queen", "harvey's", "harveys", "a&w", "second cup",
  "country style", "boston pizza", "swiss chalet", "st. louis", "milestones",
  "earls", "cactus club", "joeys", "montanas", "kelseys", "jack astors",
  "the keg", "hero certified burgers", "mucho burrito", "chipotle", "panera",
  "five guys", "shake shack", "nandos", "pita pit", "quiznos", "mr. sub",
  "extreme pita", "thai express", "manchu wok", "new york fries", "orange julius",
  "baskin robbins", "gregory's", "gregorys", "pizza pizza", "little caesars",
  "papa johns", "mary browns", "church's chicken", "cultures",
  "jugo juice", "booster juice", "kernels", "great canadian bagel",
  "robin's donuts", "robins donuts", "baton rouge", "red lobster", "olive garden",
];

const FOOD_DRINK_TYPES = new Set([
  'restaurant', 'bar', 'cafe', 'pub', 'night_club', 'brewery', 'bakery',
  'food_court', 'coffee_shop', 'sandwich_shop', 'fast_food_restaurant',
  'meal_takeaway', 'meal_delivery', 'wine_bar', 'cocktail_bar', 'diner', 'bistro',
]);

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  return CHAIN_BLOCKLIST.some((c) => lower.includes(c));
}

function isFoodDrink(types: string[] = []): boolean {
  return types.some((t) => FOOD_DRINK_TYPES.has(t));
}

// ── Grid generation ────────────────────────────────────────────────────────────

function generateGrid(): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (
    let lat = LAT_MIN;
    lat <= LAT_MAX + 0.0001;
    lat = Math.round((lat + STEP) * 1e6) / 1e6
  ) {
    for (
      let lng = LNG_MIN;
      lng <= LNG_MAX + 0.0001;
      lng = Math.round((lng + STEP) * 1e6) / 1e6
    ) {
      points.push({ lat, lng });
    }
  }
  return points;
}

// ── Nearby Search ──────────────────────────────────────────────────────────────

const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.types',
  'places.businessStatus',
  'places.formattedAddress',
].join(',');

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function nearbySearch(
  apiKey: string,
  lat: number,
  lng: number,
  type: string,
): Promise<any[]> {
  const res = await fetch(NEARBY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: MAX_RESULTS,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: RADIUS },
      },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.places || [];
}

function toRow(place: any): Record<string, any> {
  const priceRaw = place.priceLevel;
  const priceInt = priceRaw == null
    ? null
    : typeof priceRaw === 'number'
      ? priceRaw
      : (PRICE_LEVEL_MAP[priceRaw] ?? null);
  return {
    google_place_id: place.id,
    name:            place.displayName?.text ?? 'Unknown',
    address:         place.formattedAddress ?? '',
    lat:             place.location?.latitude  ?? null,
    lng:             place.location?.longitude ?? null,
    rating:          place.rating          ?? null,
    review_count:    place.userRatingCount  ?? null,
    price_level:     priceInt,
    venue_types:     place.types            ?? [],
    business_status: place.businessStatus   ?? null,
    enriched:        false,
    photos_complete: false,
    photo_urls:      [],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey     = Deno.env.get('GOOGLE_PLACES_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: {
    dry_run?: boolean;
    target_types?: string[];
    batch_cells?: number;
    start_cell?: number;
  } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const dryRun      = body.dry_run ?? false;
  const targetTypes = (body.target_types && body.target_types.length > 0)
    ? body.target_types
    : DEFAULT_TARGET_TYPES;
  const batchCells  = Math.min(body.batch_cells ?? DEFAULT_BATCH, MAX_CELLS);
  const startCell   = body.start_cell ?? 0;

  const grid       = generateGrid();
  const totalCells = grid.length;

  // ── Dry run ──────────────────────────────────────────────────────────────
  if (dryRun) {
    const estimatedCalls  = batchCells * targetTypes.length;
    const costPerRun      = (estimatedCalls * 0.032).toFixed(2);
    const runsRemainingFree = Math.floor(FREE_TIER_MONTHLY / estimatedCalls);
    return new Response(JSON.stringify({
      dry_run: true,
      total_cells: totalCells,
      batch_cells: batchCells,
      start_cell: startCell,
      types_count: targetTypes.length,
      target_types: targetTypes,
      estimated_calls: estimatedCalls,
      estimated_cost_usd: `$${costPerRun}`,
      cost_per_run: `$${costPerRun}`,
      runs_remaining_free_this_month: runsRemainingFree,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── Live run ─────────────────────────────────────────────────────────────
  const cells = grid.slice(startCell, startCell + batchCells);

  if (cells.length === 0) {
    return new Response(JSON.stringify({
      cells_processed: 0, venues_added: 0, api_calls_used: 0,
      next_cell_offset: startCell, total_cells: totalCells,
      message: 'start_cell is beyond grid end — sweep complete',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const sb      = createClient(supabaseUrl, supabaseKey);
  const seen    = new Set<string>();
  let apiCalls  = 0;
  let venuesAdded = 0;

  console.log(`[census-sweep] ${cells.length} cells × ${targetTypes.length} types, start_cell=${startCell}`);

  for (let i = 0; i < cells.length; i++) {
    const { lat, lng } = cells[i];
    const cellRows: Record<string, any>[] = [];

    for (const type of targetTypes) {
      await sleep(200);
      apiCalls++;

      try {
        const places = await nearbySearch(apiKey, lat, lng, type);

        for (const place of places) {
          if (!place.id)                                continue;
          if (seen.has(place.id))                       continue;
          if ((place.location?.latitude ?? 0) > LAT_CAP) continue;
          if (!isFoodDrink(place.types))                continue;
          const name = place.displayName?.text ?? '';
          if (isChain(name))                            continue;

          seen.add(place.id);
          cellRows.push(toRow(place));
        }
      } catch (err: any) {
        console.warn(`[census-sweep] API error cell ${startCell + i} [${type}]:`, err?.message);
      }
    }

    // Upsert in batches of 50 — ignoreDuplicates so existing venues are never overwritten
    for (let b = 0; b < cellRows.length; b += 50) {
      const batch = cellRows.slice(b, b + 50);
      try {
        const { error } = await sb
          .from('venues')
          .upsert(batch, { onConflict: 'google_place_id', ignoreDuplicates: true });
        if (error) {
          console.warn(`[census-sweep] Upsert error cell ${startCell + i}:`, error.message);
        } else {
          venuesAdded += batch.length;
        }
      } catch (err: any) {
        console.warn(`[census-sweep] Upsert exception:`, err?.message);
      }
    }

    console.log(
      `[census-sweep] Cell ${startCell + i + 1}/${totalCells} ` +
      `(${i + 1}/${cells.length} this batch) | +${cellRows.length} venues | ` +
      `total_added: ${venuesAdded} | calls: ${apiCalls}`,
    );

    await sleep(500);
  }

  const nextCellOffset = startCell + cells.length;
  const summary = {
    cells_processed: cells.length,
    venues_added: venuesAdded,
    api_calls_used: apiCalls,
    next_cell_offset: nextCellOffset,
    total_cells: totalCells,
  };
  console.log('[census-sweep] Done —', summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
