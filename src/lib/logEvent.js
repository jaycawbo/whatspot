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

export function venueSnapshot(venue) {
  return {
    venue_name: (venue?.name || '').split('|')[0].trim() || null,
    venue_cuisine_type: venue?.cuisine_type ?? null,
    venue_price_level: venue?.price_level ?? null,
    venue_distance_km: venue?.distance_km ?? null,
    venue_rating: venue?.rating ?? null,
  };
}
