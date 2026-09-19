import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

// Mirrors MIN_INTERACTIONS_FOR_PERSONALIZATION in supabase/functions/_shared/buildUserAffinity.ts —
// below this the server treats a user as cold-start and For You is identical to ambient ranking,
// so the tab has nothing personal to offer yet. Keep the two in sync.
export const FOR_YOU_MIN_INTERACTIONS = 5;

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
    supabase
      .from('user_venue_interactions')
      .select('venue_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count, error }) => {
        if (cancelled) return;
        if (error) console.warn('[ForYou] eligibility count failed:', error.message);
        if (!error && (count ?? 0) >= FOR_YOU_MIN_INTERACTIONS) {
          _eligibleUserIds.add(userId);
          setEligibleForId(userId);
        }
        // A failed count resolves as "not eligible" — safer to hide the tab than show a cold-start one.
        setCountedFor(userId);
      });
    return () => { cancelled = true; };
  }, [userId]);

  if (isLoadingAuth) return { eligible: false, resolved: false };
  if (!userId) return { eligible: false, resolved: true };
  return { eligible: eligibleForId === userId, resolved: countedFor === userId };
}
