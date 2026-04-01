import { supabase } from '@/integrations/supabase/client';
import { routeVenueRequest } from '@/services/venueDataRouter';

export async function recommend(params) {
  // Route through data router first.
  // In db_only mode this returns a DB result; in live_fallback it returns null.
  const routed = await routeVenueRequest(params);
  if (routed !== null) return routed;

  // Fall through to live edge function (live_fallback mode or router returned null).
  const { session_context, ...rest } = params;
  const { data, error } = await supabase.functions.invoke('recommend', {
    body: { ...rest, session_context: session_context || [] },
  });
  if (error) throw error;
  return data;
}

export async function recommendPage() {
  return { results: [], pagination: { has_more: false } };
}
