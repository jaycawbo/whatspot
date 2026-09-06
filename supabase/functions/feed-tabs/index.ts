import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';
import { boundingBox, haversineKm } from '../_shared/geo.ts';
import { getSuppressedVenueIds } from '../_shared/skipHistory.ts';

const PRICE_CHIP_TO_INT: Record<string, number> = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };

const WALKIN_BAR_TYPES = new Set(['bar', 'pub', 'cocktail_bar', 'wine_bar', 'brewery', 'tavern']);

const VENUE_COLUMNS = 'google_place_id, name, address, lat, lng, rating, review_count, price_level, venue_types, photo_urls, photos_complete, descriptors, regular_opening_hours, is_temporarily_closed, trending_score, created_at';

// hour/day are the viewing user's own local time, supplied by the client — a Deno
// edge function has no notion of "the user's local time" on its own, so this must
// be computed client-side (see getLocalHourAndDay in useDiscoveryFeed.js) and
// threaded through rather than computed here against the server's timezone.
function computeInlineWalkinScore(venue: { price_level: number | null; review_count: number | null; types: string[] }, hour: number, day: number): number {
  const isWeekday = day >= 1 && day <= 4;
  const isWeekend = day === 5 || day === 6;
  let timeScore: number;
  if (isWeekday) {
    if (hour >= 11 && hour <= 14) timeScore = 27;
    else if (hour >= 17 && hour <= 19) timeScore = 25;
    else if (hour >= 21) timeScore = 15;
    else timeScore = 18;
  } else if (isWeekend) {
    if (hour >= 11 && hour <= 14) timeScore = 22;
    else if (hour >= 18 && hour <= 21) timeScore = 5;
    else if (hour >= 22) timeScore = 12;
    else timeScore = 10;
  } else {
    if (hour >= 10 && hour <= 14) timeScore = 20;
    else if (hour >= 17 && hour <= 20) timeScore = 14;
    else timeScore = 12;
  }
  const pl = venue.price_level;
  const priceScore = pl === 1 ? 8 : pl === 2 ? 10 : pl === 3 ? 7 : pl === 4 ? 4 : 6;
  const rc = venue.review_count ?? 0;
  const seatScore = rc < 100 ? 5 : rc < 300 ? 12 : rc < 700 ? 18 : 20;
  const types = venue.types ?? [];
  const typeModifier = types.some((t) => WALKIN_BAR_TYPES.has(t)) ? 10
    : (types.includes('fine_dining') || types.includes('fine_dining_restaurant')) ? -15
    : 0;
  const primaryType = types[0] ?? '';
  const isRestaurant = primaryType.endsWith('_restaurant') || primaryType === 'restaurant';
  const isBar = types.some((t) => WALKIN_BAR_TYPES.has(t));
  const restaurantPeakPenalty = (isRestaurant && !isBar && (day === 0 || day === 5 || day === 6) && hour >= 17 && hour <= 21) ? -10 : 0;
  return Math.min(100, Math.max(0, 20 + timeScore + priceScore + seatScore + typeModifier + restaurantPeakPenalty));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tab, lat, lon, radius_km, price_levels, cuisines, skipped_ids, local_hour, local_day } = await req.json();
    if (!tab || lat == null || lon == null) {
      return errorResponse('tab, lat, and lon are required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ─── Extract authenticated user ID for skip_history suppression ───
    let authUserId: string | null = null;
    try {
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        authUserId = user?.id || null;
      }
    } catch {
      // Not authenticated — skip suppression
    }
    const suppressedIds = authUserId ? await getSuppressedVenueIds(authUserId) : new Set<string>();

    const radiusKm = radius_km || 5;
    const bb = boundingBox(lat, lon, radiusKm);
    const withinRadius = (v: { lat: number; lng: number }) => haversineKm(lat, lon, v.lat, v.lng) <= radiusKm;
    const skipSet = new Set([...(skipped_ids || []), ...suppressedIds]);

    const applyPriceAndCuisine = (qb: any) => {
      if (price_levels?.length) {
        const ints = price_levels.map((p: string) => PRICE_CHIP_TO_INT[p]).filter(Boolean);
        if (ints.length) qb = qb.in('price_level', ints);
      }
      if (cuisines?.length) {
        const cuisineFilter = cuisines.map((c: string) => `types.cs.${JSON.stringify([c])}`).join(',');
        qb = qb.or(cuisineFilter);
      }
      return qb;
    };

    const toShape = (v: any) => ({
      google_place_id: v.google_place_id,
      place_id: v.google_place_id,
      name: v.name,
      address: v.address,
      lat: v.lat,
      lon: v.lng,
      distance_km: haversineKm(lat, lon, v.lat, v.lng),
      rating: v.rating,
      review_count: v.review_count,
      price_level: v.price_level,
      types: v.venue_types || [],
      image_urls: v.photo_urls || [],
      descriptors: v.descriptors || [],
      photos_complete: v.photos_complete ?? false,
    });

    if (tab === 'popular') {
      let query = supabase
        .from('venues')
        .select(VENUE_COLUMNS)
        .gte('lat', bb.latMin).lte('lat', bb.latMax)
        .gte('lng', bb.lngMin).lte('lng', bb.lngMax)
        .eq('is_chain', false)
        .not('review_count', 'is', null)
        .gte('rating', 4.0)
        .order('review_count', { ascending: false })
        .limit(20);
      query = applyPriceAndCuisine(query);
      const { data, error } = await query;
      if (error) {
        console.error('[feed-tabs] Popular query error:', error);
        return jsonResponse({ venues: [], isEmpty: true });
      }
      const filtered = (data || []).filter((v: any) => {
        const id = (v.google_place_id || '').replace(/^places\//, '');
        return !skipSet.has(id) && withinRadius(v);
      });
      return jsonResponse({ venues: filtered.map(toShape), isEmpty: false });
    }

    if (tab === 'new') {
      let results: any[] = [];
      let yearWindow = 0;
      for (let years = 1; years <= 10; years++) {
        yearWindow = years;
        const cutoff = new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000).toISOString();
        let newQuery = supabase
          .from('venues')
          .select(VENUE_COLUMNS)
          .gte('lat', bb.latMin).lte('lat', bb.latMax)
          .gte('lng', bb.lngMin).lte('lng', bb.lngMax)
          .eq('is_chain', false)
          .gte('rating', 4.0)
          .not('review_count_at_ingestion', 'is', null)
          .lt('review_count_at_ingestion', 75)
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(30);
        newQuery = applyPriceAndCuisine(newQuery);
        const { data: newData, error: newError } = await newQuery;
        if (newError) {
          console.error('[feed-tabs] New query error:', newError);
          break;
        }
        results = newData || [];
        if (results.length >= 30) break;
      }
      console.log('[feed-tabs] New: found', results.length, 'venues within', yearWindow, 'year(s)');
      const filtered = results.filter((v: any) => {
        const id = (v.google_place_id || '').replace(/^places\//, '');
        return !skipSet.has(id) && withinRadius(v);
      });
      return jsonResponse({ venues: filtered.map(toShape), isEmpty: filtered.length === 0 });
    }

    if (tab === 'trending') {
      let query = supabase
        .from('venues')
        .select(VENUE_COLUMNS)
        .gte('lat', bb.latMin).lte('lat', bb.latMax)
        .gte('lng', bb.lngMin).lte('lng', bb.lngMax)
        .eq('is_chain', false)
        .not('trending_score', 'is', null)
        .not('review_count_30d_ago', 'is', null)
        .gte('review_count', 50)
        .gte('rating', 4.0)
        .order('trending_score', { ascending: false })
        .limit(30);
      query = applyPriceAndCuisine(query);
      const { data, error } = await query;
      if (error) {
        console.error('[feed-tabs] Trending query error:', error);
        return jsonResponse({ venues: [], isEmpty: true });
      }
      let filtered = (data || []).filter((v: any) => {
        const id = (v.google_place_id || '').replace(/^places\//, '');
        return !skipSet.has(id) && withinRadius(v);
      });

      const hasRealScores = filtered.some((v: any) => v.trending_score != null);
      if (hasRealScores) {
        const scores = filtered.map((v: any) => v.trending_score).filter((s: any) => s != null);
        if (scores.length >= 3) {
          const mean = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
          const stdDev = Math.sqrt(scores.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / scores.length);
          const threshold = mean + stdDev;
          filtered = filtered.filter((v: any) => v.trending_score > threshold);
        }
        if (filtered.length < 10) {
          return jsonResponse({ venues: filtered.map(toShape), isEmpty: true });
        }
      } else {
        // No real trending scores yet — proxy fallback: top-rated with review_count >= 50
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('venues')
          .select(VENUE_COLUMNS)
          .gte('lat', bb.latMin).lte('lat', bb.latMax)
          .gte('lng', bb.lngMin).lte('lng', bb.lngMax)
          .gte('review_count', 50)
          .gte('rating', 4.0)
          .order('rating', { ascending: false })
          .order('review_count', { ascending: false })
          .limit(30);
        if (!fallbackError && fallbackData?.length) {
          filtered = fallbackData.filter((v: any) => {
            const id = (v.google_place_id || '').replace(/^places\//, '');
            return !skipSet.has(id) && withinRadius(v);
          });
        }
      }
      return jsonResponse({ venues: filtered.map(toShape), isEmpty: false });
    }

    if (tab === 'walkin') {
      let walkinQuery = supabase
        .from('venues')
        .select('google_place_id, name, address, lat, lng, rating, review_count, price_level, venue_types, photo_urls, photos_complete, descriptors')
        .eq('is_chain', false)
        .gte('rating', 4.0)
        .gte('review_count', 50)
        .gte('lat', bb.latMin).lte('lat', bb.latMax)
        .gte('lng', bb.lngMin).lte('lng', bb.lngMax)
        .order('review_count', { ascending: false })
        .limit(60);
      if (price_levels?.length) {
        const ints = price_levels.map((p: string) => PRICE_CHIP_TO_INT[p]).filter(Boolean);
        if (ints.length) walkinQuery = walkinQuery.in('price_level', ints);
      }
      const { data: walkinData, error: walkinError } = await walkinQuery;
      if (walkinError) {
        console.error('[feed-tabs] Walkin query error:', walkinError);
        return jsonResponse({ venues: [], isEmpty: true });
      }
      const scored = (walkinData || [])
        .filter((v: any) => {
          const id = (v.google_place_id || '').replace(/^places\//, '');
          return !skipSet.has(id) && withinRadius(v);
        })
        .map((v: any) => {
          const shaped = toShape(v);
          return { ...shaped, _walkinScore: computeInlineWalkinScore(shaped, local_hour ?? 12, local_day ?? 1) };
        })
        .sort((a: any, b: any) => b._walkinScore - a._walkinScore)
        .slice(0, 20);
      console.log('[feed-tabs] Walkin: scored', scored.length, 'venues, top score:', scored[0]?._walkinScore);
      return jsonResponse({ venues: scored, isEmpty: scored.length === 0 });
    }

    return errorResponse(`Unknown tab: ${tab}`, 400);
  } catch (error) {
    console.error('[feed-tabs] error:', error);
    return errorResponse(error.message, 500);
  }
});
