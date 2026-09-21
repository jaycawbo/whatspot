import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

// Personalization needs breadth, not just volume: 10+ interactions AND activity across 2+ sessions,
// since a single sitting can't say what someone is generally interested in. Deliberately stricter
// than the server's MIN_INTERACTIONS_FOR_PERSONALIZATION (5), which only decides when ranking
// starts to nudge results, not when the tab is worth showing.
export const FOR_YOU_MIN_INTERACTIONS = 10;
export const FOR_YOU_MIN_SESSIONS = 2;

// Ambient exposure, not deliberate activity — doesn't make a session count.
const PASSIVE_EVENT_TYPES = ['card_shown', 'view', 'photo_advanced'];

// Once a user crosses the threshold they stay eligible for the session, so only "not yet"
// results are re-queried on later mounts. Keyed by user id so a sign-out/in can't leak eligibility.
const _eligibleUserIds = new Set();

/**
 * Whether the personalized "For You" feed tab should exist for the current user.
 * Guests are never eligible. Returns { eligible, resolved } — callers must treat
 * resolved === false as "don't render or fetch For You yet".
 */
export function useForYouEligibility() {
  const { user, isLoadingAuth } = useAuth();
  const userId = user?.id ?? null;
  const [countedFor, setCountedFor] = useState(() => (userId && _eligibleUserIds.has(userId) ? userId : null));
  const [eligibleForId, setEligibleForId] = useState(() => (userId && _eligibleUserIds.has(userId) ? userId : null));

  useEffect(() => {
    if (!userId || _eligibleUserIds.has(userId)) return;
    let cancelled = false;
    const countInteractions = supabase
      .from('user_venue_interactions')
      .select('venue_id', { count: 'exact', head: true })
      .eq('user_id', userId);
    // A "session" is a distinct session_id (one per browser tab/visit, see lib/identity.js).
    const listSessions = supabase
      .from('user_events')
      .select('session_id')
      .eq('user_id', userId)
      .not('event_type', 'in', `(${PASSIVE_EVENT_TYPES.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(1000);
    Promise.all([countInteractions, listSessions]).then(([interactions, sessions]) => {
      if (cancelled) return;
      const err = interactions.error || sessions.error;
      if (err) console.warn('[ForYou] eligibility check failed:', err.message);
      const sessionCount = new Set((sessions.data || []).map((r) => r.session_id)).size;
      if (!err && (interactions.count ?? 0) >= FOR_YOU_MIN_INTERACTIONS && sessionCount >= FOR_YOU_MIN_SESSIONS) {
        _eligibleUserIds.add(userId);
        setEligibleForId(userId);
      }
      // A failed check resolves as "not eligible" — safer to hide the tab than show a cold-start one.
      setCountedFor(userId);
    });
    return () => { cancelled = true; };
  }, [userId]);

  if (isLoadingAuth) return { eligible: false, resolved: false };
  if (!userId) return { eligible: false, resolved: true };
  return { eligible: eligibleForId === userId, resolved: countedFor === userId };
}
