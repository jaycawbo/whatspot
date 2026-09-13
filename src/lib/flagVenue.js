import { supabase } from '@/integrations/supabase/client';

/**
 * Record a user report that a venue doesn't belong on the platform
 * (wrong category, closed, duplicate, etc). Moderation-only data —
 * not readable by the reporting user, only by admins.
 */
export async function flagVenue(venueId, reason) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !venueId || !reason) return { error: new Error('Missing user, venueId, or reason') };

  return supabase.from('venue_flags').insert({
    user_id: user.id,
    venue_id: venueId,
    reason,
  });
}

/**
 * Admin-only: soft-hide a venue from Feed/Search. RLS enforces the
 * admin check server-side, so this fails safely for non-admins.
 */
export async function removeVenue(venueId) {
  if (!venueId) return { error: new Error('Missing venueId') };

  return supabase
    .from('venues')
    .update({ is_removed: true })
    .eq('google_place_id', venueId);
}
