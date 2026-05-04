import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BAR_TYPES = new Set(['bar', 'pub', 'cocktail_bar', 'wine_bar', 'brewery', 'tavern']);

function getTorontoHourAndDay(): { hour: number; day: number } {
  const now = new Date();
  const dayStr = now.toLocaleDateString('en-US', { timeZone: 'America/Toronto', weekday: 'short' });
  const hourStr = now.toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: '2-digit', hour12: false });
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(hourStr.split(':')[0], 10);
  if (hour === 24) hour = 0;
  const day = weekdayMap[dayStr] ?? 1;
  return { hour, day };
}

function computeTimeScore(hour: number, day: number): number {
  const isWeekday = day >= 1 && day <= 4;
  const isWeekend = day === 5 || day === 6;

  if (isWeekday) {
    if (hour >= 11 && hour <= 14) return 27;
    if (hour >= 17 && hour <= 19) return 25;
    if (hour >= 21) return 15;
    return 18;
  }
  if (isWeekend) {
    if (hour >= 11 && hour <= 14) return 22;
    if (hour >= 18 && hour <= 21) return 5;
    if (hour >= 22) return 12;
    return 10;
  }
  // Sunday
  if (hour >= 10 && hour <= 14) return 20;
  if (hour >= 17 && hour <= 20) return 14;
  return 12;
}

function computePriceScore(priceLevel: number | null): number {
  if (priceLevel === 1) return 8;
  if (priceLevel === 2) return 10;
  if (priceLevel === 3) return 7;
  if (priceLevel === 4) return 4;
  return 6;
}

function computeSeatScore(reviewCount: number | null): number {
  const rc = reviewCount ?? 0;
  if (rc < 100) return 5;
  if (rc < 300) return 12;
  if (rc < 700) return 18;
  return 20;
}

function computeTypeModifier(venueTypes: string[] | null): number {
  const types = venueTypes ?? [];
  if (types.some((t) => BAR_TYPES.has(t))) return 10;
  if (types.includes('fine_dining') || types.includes('fine_dining_restaurant')) return -15;
  return 0;
}

function computeRestaurantPeakPenalty(venueTypes: string[] | null, hour: number, day: number): number {
  const types = venueTypes ?? [];
  const primaryType = types[0] ?? '';
  const isRestaurant = primaryType.endsWith('_restaurant') || primaryType === 'restaurant';
  const isBar = types.some((t) => BAR_TYPES.has(t));
  if (!isRestaurant || isBar) return 0;
  const isPeakDinner = (day === 0 || day === 5 || day === 6) && hour >= 17 && hour <= 21;
  return isPeakDinner ? -10 : 0;
}

function scoreToLabel(score: number): string {
  if (score >= 90) return 'Very likely';
  if (score >= 75) return 'Good chance';
  if (score >= 55) return 'Decent shot';
  if (score >= 35) return 'Tough tonight';
  return 'Unlikely';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { placeId } = await req.json();
    if (!placeId) {
      return new Response(JSON.stringify({ error: 'placeId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [venueResult, signalResult] = await Promise.all([
      supabase
        .from('venues')
        .select('price_level, rating, review_count, venue_types, category')
        .eq('google_place_id', placeId)
        .single(),
      supabase
        .from('walkin_signals')
        .select('signal_type')
        .eq('venue_id', placeId)
        .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
    ]);

    const venue = venueResult.data;
    const signals = signalResult.data ?? [];
    const gotInCount = signals.filter((s) => s.signal_type === 'got_in').length;
    const turnedAwayCount = signals.filter((s) => s.signal_type === 'turned_away').length;

    const { hour, day } = getTorontoHourAndDay();
    const timeScore = computeTimeScore(hour, day);
    const priceScore = computePriceScore(venue?.price_level ?? null);
    const seatScore = computeSeatScore(venue?.review_count ?? null);
    const typeModifier = computeTypeModifier(venue?.venue_types ?? null);
    const restaurantPeakPenalty = computeRestaurantPeakPenalty(venue?.venue_types ?? null, hour, day);
    const signalModifier = Math.min(gotInCount * 2, 10) - Math.min(turnedAwayCount * 5, 15);

    const raw = 20 + timeScore + priceScore + seatScore + typeModifier + restaurantPeakPenalty + signalModifier;
    const score = Math.min(100, Math.max(0, raw));

    return new Response(
      JSON.stringify({
        score,
        label: scoreToLabel(score),
        signal_count: signals.length,
        computed_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('get-walkin-score error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
