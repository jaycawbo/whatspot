import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';
import { haversineKm } from '../_shared/geo.ts';
import { getSuppressedVenueIds } from '../_shared/skipHistory.ts';
import { weightedShuffleTopK } from '../_shared/weightedShuffle.ts';

const PRICE_CHIP_TO_INT: Record<string, number> = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };

const WALKIN_BAR_TYPES = new Set(['bar', 'pub', 'cocktail_bar', 'wine_bar', 'brewery', 'tavern']);

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
    const { tab, lat, lon, radius_km, price_levels, cuisines, skipped_ids, exclude_ids, local_hour, local_day } = await req.json();
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
    const skipSet = new Set([...(skipped_ids || []), ...(exclude_ids || []), ...suppressedIds]);
    const excludeIds = skipSet.size ? Array.from(skipSet) : null;

    const priceInts = (price_levels?.length
      ? price_levels.map((p: string) => PRICE_CHIP_TO_INT[p]).filter(Boolean)
      : null) as number[] | null;
    const cuisineTypes = cuisines?.length ? cuisines : null;

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

    // Shared RPC (see supabase/migrations/20260918000001_venues_geo_postgis.sql) — does
    // exact-circle radius filtering via PostGIS ST_DWithin, plus chain/removed/rating/
    // price/cuisine/exclusion filtering, entirely in SQL. Replaces the old bounding-box
    // query + JS haversine/skipSet filter pattern that let popular venues sitting in the
    // box's corners (outside the true radius) eat LIMIT slots before the JS correction
    // ever ran. See issue #356.
    const venuesNear = (params: {
      minReviewCount?: number | null;
      requireReviewCount?: boolean;
      maxReviewCountAtIngestion?: number | null;
      requireTrendingScore?: boolean;
      createdAfter?: string | null;
      orderByColumn?: string;
      resultLimit: number;
    }) => supabase.rpc('venues_near', {
      center_lat: lat,
      center_lng: lon,
      radius_km: radiusKm,
      min_rating: 4.0,
      min_review_count: params.minReviewCount ?? null,
      require_review_count: params.requireReviewCount ?? false,
      max_review_count_at_ingestion: params.maxReviewCountAtIngestion ?? null,
      require_trending_score: params.requireTrendingScore ?? false,
      created_after: params.createdAfter ?? null,
      price_levels: priceInts,
      cuisine_types: cuisineTypes,
      exclude_ids: excludeIds,
      order_by_column: params.orderByColumn ?? 'review_count',
      result_limit: params.resultLimit,
    });

    if (tab === 'popular') {
      const { data, error } = await venuesNear({
        requireReviewCount: true,
        orderByColumn: 'review_count',
        resultLimit: 40,
      });
      if (error) {
        console.error('[feed-tabs] Popular query error:', error);
        return jsonResponse({ venues: [], isEmpty: true });
      }
      const shaped = (data || []).map(toShape);
      const selected = weightedShuffleTopK(shaped, (v: any) => v.review_count ?? 0, 20);
      return jsonResponse({ venues: selected, isEmpty: false });
    }

    if (tab === 'new') {
      let results: any[] = [];
      let yearWindow = 0;
      for (let years = 1; years <= 10; years++) {
        yearWindow = years;
        const cutoff = new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000).toISOString();
        const { data: newData, error: newError } = await venuesNear({
          maxReviewCountAtIngestion: 75,
          createdAfter: cutoff,
          orderByColumn: 'created_at',
          resultLimit: 30,
        });
        if (newError) {
          console.error('[feed-tabs] New query error:', newError);
          break;
        }
        results = newData || [];
        if (results.length >= 30) break;
      }
      console.log('[feed-tabs] New: found', results.length, 'venues within', yearWindow, 'year(s)');
      const now = Date.now();
      const shaped = results.map((v: any) => ({
        ...toShape(v),
        _recencyWeight: 1 / ((now - new Date(v.created_at).getTime()) / 86_400_000 + 1),
      }));
      const selected = weightedShuffleTopK(shaped, (v: any) => v._recencyWeight, shaped.length);
      return jsonResponse({ venues: selected, isEmpty: selected.length === 0 });
    }

    if (tab === 'trending') {
      const { data, error } = await venuesNear({
        minReviewCount: 50,
        requireTrendingScore: true,
        orderByColumn: 'trending_score',
        resultLimit: 30,
      });
      if (error) {
        console.error('[feed-tabs] Trending query error:', error);
        return jsonResponse({ venues: [], isEmpty: true });
      }
      let filtered = data || [];

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
        const { data: fallbackData, error: fallbackError } = await venuesNear({
          minReviewCount: 50,
          orderByColumn: 'rating_review',
          resultLimit: 30,
        });
        if (!fallbackError && fallbackData?.length) {
          filtered = fallbackData;
        }
      }
      const shaped = filtered.map((v: any) => ({
        ...toShape(v),
        _trendWeight: v.trending_score ?? (v.rating ?? 0) * (v.review_count ?? 0),
      }));
      const selected = weightedShuffleTopK(shaped, (v: any) => v._trendWeight, shaped.length);
      return jsonResponse({ venues: selected, isEmpty: false });
    }

    if (tab === 'walkin') {
      const { data: walkinData, error: walkinError } = await venuesNear({
        minReviewCount: 50,
        orderByColumn: 'review_count',
        resultLimit: 60,
      });
      if (walkinError) {
        console.error('[feed-tabs] Walkin query error:', walkinError);
        return jsonResponse({ venues: [], isEmpty: true });
      }
      const scored = (walkinData || [])
        .map((v: any) => {
          const shaped = toShape(v);
          return { ...shaped, _walkinScore: computeInlineWalkinScore(shaped, local_hour ?? 12, local_day ?? 1) };
        })
        .sort((a: any, b: any) => b._walkinScore - a._walkinScore);
      const selected = weightedShuffleTopK(scored, (v: any) => v._walkinScore, 20);
      console.log('[feed-tabs] Walkin: scored', scored.length, 'venues, top score:', scored[0]?._walkinScore);
      return jsonResponse({ venues: selected, isEmpty: selected.length === 0 });
    }

    return errorResponse(`Unknown tab: ${tab}`, 400);
  } catch (error) {
    console.error('[feed-tabs] error:', error);
    return errorResponse(error.message, 500);
  }
});
