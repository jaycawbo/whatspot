import { supabase } from '@/integrations/supabase/client';
import { getAnonId, getSessionId } from '@/lib/identity';

export async function logEvent(eventType, payload = {}) {
  try {
    const now = new Date();
    await supabase.from('user_events').insert({
      user_id: null,
      anonymous_id: getAnonId(),
      session_id: getSessionId(),
      event_type: eventType,
      time_of_day_hour: now.getHours(),
      day_of_week: now.getDay(),
      ...payload,
    });
  } catch (e) {
    // Logging must never break the app — fail silently
    console.warn('logEvent failed:', e.message);
  }
}
