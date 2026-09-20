import { supabase } from '@/integrations/supabase/client';
import { getAnonId, getSessionId } from '@/lib/identity';

export async function logEvent(eventType, payload = {}) {
  try {
    const now = new Date();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('user_events').insert({
      user_id: user?.id ?? null,
      anonymous_id: getAnonId(),
      session_id: getSessionId(),
      event_type: eventType,
      time_of_day_hour: now.getHours(),
      day_of_week: now.getDay(),
      ...payload,
    });
  } catch (e) {
    // Logging must never break the app — fail silently
    console.warn('logEvent failed:', e.message, JSON.stringify(e));
  }
}

// user_events.venue_price_level is an integer, but recommend returns '$'-strings ('$$') and Places
// returns PRICE_LEVEL_* enums — passing either through 400s the whole insert. See issue #364.
const PRICE_ENUMS = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function normalizePriceLevel(value) {
  if (Number.isInteger(value)) return value >= 0 && value <= 4 ? value : null;
  if (typeof value !== 'string') return null;
  if (/^\$+$/.test(value)) return value.length <= 4 ? value.length : null;
  return PRICE_ENUMS[value] ?? null;
}

export function venueSnapshot(venue) {
  return {
    venue_name: (venue?.name || '').split('|')[0].trim() || null,
    venue_cuisine_type: (venue?.cuisine_type ?? venue?.category ?? '').split('|')[0].trim() || null,
    venue_price_level: normalizePriceLevel(venue?.price_level),
    venue_distance_km: venue?.distance_km ?? null,
    venue_rating: venue?.rating ?? null,
  };
}
