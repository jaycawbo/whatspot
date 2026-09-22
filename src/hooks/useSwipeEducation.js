import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';
import { getAnonId } from '@/lib/identity';

const DISMISS_KEY = 'whatspot_swipe_hint_dismissed';
const LAPSED_DAYS = 90;
const SWIPE_TYPES = ['interested', 'not_interested', 'skipped'];

// Secondary swipe-education prompt (issue #369) — a fallback for the onboarding
// interstitial, which is one-time and easy to skip. Eligibility is derived
// straight from swipe history (never swiped, or last swipe >90 days ago) rather
// than a separate "have they seen this" flag, so it correctly re-triggers for
// lapsed users without any new schema. Fetched once per mount; not polled.
export function useSwipeEducation() {
  const { user, isAuthenticated } = useAuth();
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === 'true'; } catch { return false; }
  });
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const filterColumn = isAuthenticated ? 'user_id' : 'anonymous_id';
    const filterValue = isAuthenticated ? user?.id : getAnonId();
    if (!filterValue) return;

    supabase
      .from('user_venue_interactions')
      .select('updated_at')
      .eq(filterColumn, filterValue)
      .in('interaction_type', SWIPE_TYPES)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) return; // fail closed — don't show the hint if we can't tell
        const lastSwipeAt = data?.[0]?.updated_at ?? null;
        if (!lastSwipeAt) {
          setEligible(true);
          return;
        }
        const daysSince = (Date.now() - new Date(lastSwipeAt).getTime()) / 86_400_000;
        setEligible(daysSince > LAPSED_DAYS);
      });
  }, [isAuthenticated, user?.id]);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, 'true'); } catch {}
  };

  return {
    show: eligible && !dismissed,
    dismiss,
  };
}
