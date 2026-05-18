import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * @typedef {Object} RequestRow
 * @property {string}      id
 * @property {string}      diner_id
 * @property {string}      venue_id
 * @property {number}      party_size
 * @property {'pending'|'accepted'|'declined'|'expired'|'redeemed'|'cancelled'} status
 * @property {string|null} decline_comment
 * @property {string}      created_at
 * @property {string|null} accepted_at
 * @property {string}      expires_at
 * @property {string|null} holding_expires_at
 */

const ACTIVE_STATUSES = ['pending', 'accepted'];

// ---------------------------------------------------------------------------
// useRequestUpdates
// Watches a single request row for any UPDATE. Calls onUpdate(newRow) each
// time the row changes. Used by the diner's active request overlay to keep
// the countdown and status badge live.
// ---------------------------------------------------------------------------

/**
 * @param {string} requestId
 * @param {(row: RequestRow) => void} onUpdate
 */
export function useRequestUpdates(requestId, onUpdate) {
  // Stabilise the callback so the channel isn't recreated on every render.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`request-updates-${requestId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${requestId}` },
        (payload) => { onUpdateRef.current(payload.new); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [requestId]);
}

// ---------------------------------------------------------------------------
// useDinerRequests
// Maintains the diner's active request list (pending + accepted).
// Used by the diner requests overlay.
// ---------------------------------------------------------------------------

/**
 * @param {string} dinerId
 * @returns {{ activeRequests: RequestRow[], isLoading: boolean, error: Error|null }}
 */
export function useDinerRequests(dinerId) {
  const [activeRequests, setActiveRequests] = useState([]);
  const [recentlyExpiredRequests, setRecentlyExpiredRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasSubscribedRef = useRef(false);
  const expiredTimersRef = useRef({});

  const fetchActive = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('requests')
      .select('*')
      .eq('diner_id', dinerId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError);
    } else {
      setActiveRequests(data ?? []);
      setError(null);
    }
  }, [dinerId]);

  useEffect(() => {
    if (!dinerId) {
      setIsLoading(false);
      return;
    }

    hasSubscribedRef.current = false;
    setIsLoading(true);
    fetchActive().finally(() => setIsLoading(false));

    const channel = supabase
      .channel(`diner-requests-${dinerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'requests', filter: `diner_id=eq.${dinerId}` },
        (payload) => {
          setActiveRequests((prev) => [payload.new, ...prev]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'requests', filter: `diner_id=eq.${dinerId}` },
        (payload) => {
          const updated = payload.new;
          setActiveRequests((prev) => {
            if (ACTIVE_STATUSES.includes(updated.status)) {
              return prev.map((r) => (r.id === updated.id ? updated : r));
            }
            // Track expired requests briefly so the overlay can show a waitlist prompt
            if (updated.status === 'expired') {
              setRecentlyExpiredRequests((prev2) => {
                if (prev2.some((r) => r.id === updated.id)) return prev2;
                return [...prev2, updated];
              });
              // Auto-clear after 30 seconds
              const timer = setTimeout(() => {
                setRecentlyExpiredRequests((prev2) => prev2.filter((r) => r.id !== updated.id));
                delete expiredTimersRef.current[updated.id];
              }, 30000);
              if (expiredTimersRef.current[updated.id]) clearTimeout(expiredTimersRef.current[updated.id]);
              expiredTimersRef.current[updated.id] = timer;
            }
            return prev.filter((r) => r.id !== updated.id);
          });
        },
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (hasSubscribedRef.current) {
            await fetchActive();
          }
          hasSubscribedRef.current = true;
        }
      });

    return () => {
      supabase.removeChannel(channel);
      // Clear any pending expire timers
      Object.values(expiredTimersRef.current).forEach(clearTimeout);
      expiredTimersRef.current = {};
    };
  }, [dinerId, fetchActive]);

  const dismissExpired = useCallback((requestId) => {
    setRecentlyExpiredRequests((prev) => prev.filter((r) => r.id !== requestId));
    if (expiredTimersRef.current[requestId]) {
      clearTimeout(expiredTimersRef.current[requestId]);
      delete expiredTimersRef.current[requestId];
    }
  }, []);

  return { activeRequests, recentlyExpiredRequests, dismissExpired, isLoading, error };
}

// ---------------------------------------------------------------------------
// useVenueRequests
// Maintains separate pending and accepted request lists for a venue.
// Used by the venue portal queue. Requires requests_select_venue_owner RLS
// policy (migration 20260511000002).
// ---------------------------------------------------------------------------

/**
 * @param {string} venueId
 * @returns {{ pendingRequests: RequestRow[], acceptedRequests: RequestRow[], isLoading: boolean, error: Error|null }}
 */
export function useVenueRequests(venueId) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [acceptedRequests, setAcceptedRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasSubscribedRef = useRef(false);

  const fetchCurrent = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('requests')
      .select('*')
      .eq('venue_id', venueId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true });

    if (fetchError) {
      setError(fetchError);
    } else {
      const rows = data ?? [];
      setPendingRequests(rows.filter((r) => r.status === 'pending'));
      setAcceptedRequests(rows.filter((r) => r.status === 'accepted'));
      setError(null);
    }
  }, [venueId]);

  useEffect(() => {
    if (!venueId) {
      setIsLoading(false);
      return;
    }

    hasSubscribedRef.current = false;
    setIsLoading(true);
    fetchCurrent().finally(() => setIsLoading(false));

    const channel = supabase
      .channel(`venue-requests-${venueId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'requests', filter: `venue_id=eq.${venueId}` },
        (payload) => {
          // New requests always arrive as pending.
          setPendingRequests((prev) => [...prev, payload.new]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'requests', filter: `venue_id=eq.${venueId}` },
        (payload) => {
          const updated = payload.new;

          if (updated.status === 'pending') {
            setPendingRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            return;
          }

          if (updated.status === 'accepted') {
            setPendingRequests((prev) => prev.filter((r) => r.id !== updated.id));
            setAcceptedRequests((prev) => {
              const exists = prev.some((r) => r.id === updated.id);
              return exists
                ? prev.map((r) => (r.id === updated.id ? updated : r))
                : [...prev, updated];
            });
            return;
          }

          // declined / expired / redeemed / cancelled — remove from both queues
          setPendingRequests((prev) => prev.filter((r) => r.id !== updated.id));
          setAcceptedRequests((prev) => prev.filter((r) => r.id !== updated.id));
        },
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (hasSubscribedRef.current) {
            await fetchCurrent();
          }
          hasSubscribedRef.current = true;
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [venueId, fetchCurrent]);

  return { pendingRequests, acceptedRequests, isLoading, error };
}
