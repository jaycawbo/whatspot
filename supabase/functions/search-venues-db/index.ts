import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';
import { boundingBox, haversineKm } from '../_shared/geo.ts';

const WEEKLY_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function rowToVenue(row: any, distanceKm: number | null) {
  return {
    place_id: row.google_place_id,
    google_place_id: row.google_place_id,
    name: row.name,
    address: row.address || '',
    lat: row.lat,
    lon: row.lng,
    rating: row.rating,
    review_count: row.review_count,
    price_level: row.price_level,
    image_urls: row.photo_urls || [],
    types: row.venue_types || row.types || [],
    neighbourhood: row.neighbourhood || null,
    phone: row.phone || null,
    website: row.website || null,
    ai_description: row.ai_description || null,
    opening_hours: row.opening_hours || null,
    is_temporarily_closed: row.is_temporarily_closed || false,
    data_source: 'db',
    descriptors: [],
    distance_km: distanceKm,
  };
}

function isWeeklyStale(row: any): boolean {
  if (!row.rating_last_updated) return true;
  return Date.now() - new Date(row.rating_last_updated).getTime() > WEEKLY_STALE_MS;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      keywords, venue_types, price_level, area_override,
      exclude_ids = [], limit = 22, lat, lon, radius_km = 5, is_db_only = false,
    } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let qb = supabase.from('venues').select('*');

    if (keywords?.length > 0) {
      // Name-only: address matching causes false positives when cuisine keywords
      // (e.g. "italian") match neighbourhood names (e.g. "Little Italy, Toronto").
      const conditions = keywords.flatMap((kw: string) => [`name.ilike.%${kw}%`]).join(',');
      qb = qb.or(conditions);
    }

    // Apply bounding box when coords are available (1.5x radius buffer, trimmed
    // to the exact circle below via haversineKm — same pattern as feed-tabs).
    if (lat != null && lon != null) {
      const bb = boundingBox(lat, lon, radius_km * 1.5);
      qb = qb
        .gte('lat', bb.latMin).lte('lat', bb.latMax)
        .gte('lng', bb.lngMin).lte('lng', bb.lngMax);
    }

    if (venue_types?.length > 0) {
      qb = qb.contains('venue_types', venue_types);
    }
    if (price_level != null) {
      qb = qb.eq('price_level', price_level);
    }
    if (area_override) {
      qb = qb.ilike('neighbourhood', `%${area_override}%`);
    }
    if (exclude_ids.length > 0) {
      qb = qb.not('google_place_id', 'in', `(${exclude_ids.join(',')})`);
    }

    qb = qb.order('rating', { ascending: false, nullsFirst: false }).limit(limit);

    const { data, error } = await qb;
    if (error) throw error;

    let rows = data || [];

    // Trim the bounding-box over-fetch down to the exact circle.
    if (lat != null && lon != null) {
      rows = rows.filter((row: any) => {
        if (row.lat == null || row.lng == null) return true;
        return haversineKm(lat, lon, row.lat, row.lng) <= radius_km;
      });
    }

    // Queue background weekly refresh for any stale venues (live_fallback only).
    // Photos are never queued on-demand.
    if (!is_db_only) {
      for (const row of rows) {
        if (isWeeklyStale(row)) {
          supabase.functions
            .invoke('refresh-venue-weekly', { body: { place_ids: [row.google_place_id] } })
            .catch(() => {}); // best-effort, never throws
        }
      }
    }

    const venues = rows.map((row: any) => {
      const distanceKm = (lat != null && lon != null && row.lat != null && row.lng != null)
        ? haversineKm(lat, lon, row.lat, row.lng)
        : null;
      return rowToVenue(row, distanceKm);
    });

    return jsonResponse({
      results: venues.slice(0, 12),
      reserve_venues: venues.slice(12, 22),
      nearby_overflow: [],
      suggested_chips: [],
      search_summary: null,
      pagination: { has_more: false },
    });
  } catch (error) {
    console.error('[search-venues-db] error:', error);
    return errorResponse(error.message, 500);
  }
});
