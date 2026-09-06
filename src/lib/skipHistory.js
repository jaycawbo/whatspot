import { supabase } from '@/integrations/supabase/client';

/**
 * Upsert skip_history for authenticated users. Shared by the Discovery deck
 * (swipe gestures) and the Spots hook (classifications made from Search /
 * Save-to-Spots / the Spots page) so any surface a venue gets classified from
 * suppresses it from Discovery.
 *
 * Returns the previous interaction_type (if any) for list membership transitions.
 */
export async function upsertSkipHistory(venueId, interactionType) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !venueId) return null;

  // Fetch existing record to capture previous_interaction_type
  const { data: existing } = await supabase
    .from('skip_history')
    .select('interaction_type')
    .eq('user_id', user.id)
    .eq('venue_id', venueId)
    .maybeSingle();

  const previousType = existing?.interaction_type || null;

  // Don't downgrade stronger interactions with passive_skip
  // (edge case: venue resurfaces after suppression window)
  if (interactionType === 'passive_skip' && previousType && previousType !== 'passive_skip') {
    return previousType;
  }

  await supabase.from('skip_history').upsert(
    {
      user_id: user.id,
      venue_id: venueId,
      interaction_type: interactionType,
      previous_interaction_type: previousType !== interactionType ? previousType : existing?.interaction_type || null,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,venue_id' }
  );

  return previousType;
}
