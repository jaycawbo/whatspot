/**
 * Toronto Venue Census Sweep
 * Seeds the Supabase venues table with all Toronto food/drink venues
 * via Google Places Nearby Search (New API).
 *
 * Usage:
 *   node --env-file=.env scripts/toronto-census.js
 *
 * Prerequisites — these columns must exist on the venues table before running:
 *   types            text[]
 *   business_status  text
 *   enriched         boolean  default false
 *   photos_complete  boolean  default false
 *   photo_urls       text[]   default '{}'
 *
 * Run the migration in supabase/migrations or the Supabase SQL editor:
 *   ALTER TABLE venues
 *     ADD COLUMN IF NOT EXISTS types           text[]   DEFAULT '{}',
 *     ADD COLUMN IF NOT EXISTS business_status text,
 *     ADD COLUMN IF NOT EXISTS enriched        boolean  DEFAULT false,
 *     ADD COLUMN IF NOT EXISTS photos_complete boolean  DEFAULT false,
 *     ADD COLUMN IF NOT EXISTS photo_urls      text[]   DEFAULT '{}';
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────

const GOOGLE_API_KEY    = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL      = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars. Need: GOOGLE_PLACES_API_KEY, SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Grid ──────────────────────────────────────────────────────────────────────

const LAT_MIN   = 43.580;
const LAT_MAX   = 43.773;
const LNG_MIN   = -79.640;
const LNG_MAX   = -79.270;
const STEP      = 0.008;
const LAT_CAP   = 43.7730; // Steeles Ave northern boundary

function generateGrid() {
  const points = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX + 0.0001; lat = Math.round((lat + STEP) * 1e6) / 1e6) {
    for (let lng = LNG_MIN; lng <= LNG_MAX + 0.0001; lng = Math.round((lng + STEP) * 1e6) / 1e6) {
      points.push({ lat, lng });
    }
  }
  return points;
}

// ── Chain blocklist (copied from recommend/index.ts) ─────────────────────────

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
  "papa johns", "mary browns", "popeyes", "church's chicken", "cultures",
  "jugo juice", "booster juice", "kernels", "great canadian bagel",
  "robin's donuts", "robins donuts", "baton rouge", "red lobster", "olive garden"
];

function isChain(name) {
  const lower = name.toLowerCase();
  return CHAIN_BLOCKLIST.some(chain => lower.includes(chain));
}

// ── Food/drink allowlist ──────────────────────────────────────────────────────

const FOOD_DRINK_TYPES = new Set([
  'restaurant', 'bar', 'cafe', 'pub', 'night_club', 'brewery', 'bakery',
  'food_court', 'coffee_shop', 'sandwich_shop', 'fast_food_restaurant',
  'meal_takeaway', 'meal_delivery', 'wine_bar', 'cocktail_bar', 'diner', 'bistro',
]);

function isFoodDrink(types = []) {
  return types.some(t => FOOD_DRINK_TYPES.has(t));
}

// ── Google Places Nearby Search ───────────────────────────────────────────────

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

async function nearbySearch(lat, lng, type) {
  const body = {
    includedTypes: [type],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 600,
      },
    },
  };

  const res = await fetch(NEARBY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.places || [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const PRICE_LEVEL_MAP = {
  PRICE_LEVEL_FREE:           0,
  PRICE_LEVEL_INEXPENSIVE:    1,
  PRICE_LEVEL_MODERATE:       2,
  PRICE_LEVEL_EXPENSIVE:      3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function parsePriceLevel(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return PRICE_LEVEL_MAP[value] ?? null;
}

function toRow(place) {
  return {
    google_place_id: place.id,
    name:            place.displayName?.text ?? 'Unknown',
    address:         place.formattedAddress ?? '',
    lat:             place.location?.latitude  ?? null,
    lng:             place.location?.longitude ?? null,
    rating:          place.rating          ?? null,
    review_count:    place.userRatingCount  ?? null,
    price_level:     parsePriceLevel(place.priceLevel),
    types:           place.types            ?? [],
    business_status: place.businessStatus   ?? null,
    enriched:        false,
    photos_complete: false,
    photo_urls:      [],
  };
}

async function upsertBatch(rows) {
  const { error } = await supabase
    .from('venues')
    .upsert(rows, { onConflict: 'google_place_id' });
  if (error) throw error;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const grid = generateGrid();
  const totalCells = grid.length;

  console.log(`\nToronto Census Sweep`);
  console.log(`Grid: ${totalCells} cells (${LAT_MIN}–${LAT_MAX} lat, ${LNG_MIN}–${LNG_MAX} lng, step ${STEP}°)`);
  console.log(`─────────────────────────────────────────\n`);

  const seen     = new Set();
  let totalVenues = 0;
  let totalCalls  = 0;
  let totalErrors = 0;

  for (let i = 0; i < grid.length; i++) {
    const { lat, lng } = grid[i];
    const cellLabel = `Cell ${i + 1}/${totalCells}`;
    const cellRows  = [];

    for (const type of ['restaurant', 'bar']) {
      await sleep(200); // 200ms between each API call
      totalCalls++;

      try {
        const places = await nearbySearch(lat, lng, type);

        for (const place of places) {
          if (!place.id)                              continue;
          if (seen.has(place.id))                    continue;
          if ((place.location?.latitude ?? 0) > LAT_CAP) continue;
          if (!isFoodDrink(place.types))             continue;
          const venueName = place.displayName?.text ?? '';
          if (isChain(venueName)) {
            console.log(`  Skipped chain: ${venueName}`);
            continue;
          }

          seen.add(place.id);
          cellRows.push(toRow(place));
        }
      } catch (err) {
        totalErrors++;
        console.error(`  ✗ ${cellLabel} [${type}] — ${err.message}`);
      }
    }

    // Upsert this cell's venues in batches of 50
    if (cellRows.length > 0) {
      for (let b = 0; b < cellRows.length; b += 50) {
        const batch = cellRows.slice(b, b + 50);
        try {
          await upsertBatch(batch);
        } catch (err) {
          totalErrors++;
          console.error(`  ✗ ${cellLabel} upsert failed — ${err.message}`);
        }
      }
      totalVenues += cellRows.length;
    }

    // Progress log every cell
    console.log(`${cellLabel} | +${cellRows.length} venues | total: ${totalVenues} | calls: ${totalCalls} | errors: ${totalErrors}`);

    await sleep(500); // 500ms between cells
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const estimatedCost = (totalCalls * 0.032).toFixed(2);
  console.log(`\n═════════════════════════════════════════`);
  console.log(`Census complete`);
  console.log(`  Unique venues written : ${totalVenues}`);
  console.log(`  API calls made        : ${totalCalls}`);
  console.log(`  Errors                : ${totalErrors}`);
  console.log(`  Estimated cost        : $${estimatedCost} (@ $0.032/call)`);
  console.log(`═════════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
