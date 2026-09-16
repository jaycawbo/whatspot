import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

const STALE_PCT_THRESHOLD = 50;
const DISMISS_KEY = 'whatspot_admin_health_dismissed';

// Admin-only: surfaces the weekly-refresh stale backlog in-app instead of
// only in edge function logs, which don't get checked on a hobby project
// (issue #326). Fetched once per session on login as admin, not polled.
export function useVenueRefreshHealth() {
  const { isAdmin } = useAuth();
  const [stalePct, setStalePct] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === 'true'; } catch { return false; }
  });
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isAdmin || fetchedRef.current) return;
    fetchedRef.current = true;
    supabase.functions.invoke('venue-refresh-health')
      .then(({ data }) => {
        if (typeof data?.stalePct === 'number') setStalePct(data.stalePct);
      })
      .catch(() => {});
  }, [isAdmin]);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, 'true'); } catch {}
  };

  return {
    show: isAdmin && !dismissed && stalePct !== null && stalePct >= STALE_PCT_THRESHOLD,
    stalePct,
    dismiss,
  };
}
