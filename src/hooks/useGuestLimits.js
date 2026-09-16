import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getLimits, setSwipes, SWIPE_LIMIT } from '@/lib/guestLimits';

const SEEN_KEY = 'whatspot_skipped_venues';

function getSessionSwipeCount() {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return 0;
    return JSON.parse(raw).length;
  } catch {
    return 0;
  }
}

// Guest swipe gate for the free Discovery Feed (10/24h). Search has its own,
// server-enforced gate now — see useSearchConversation.js / issue #319 — since
// this same client-side-only approach was trivially bypassable for search.
export function useGuestLimits() {
  const { isAuthenticated } = useAuth();
  const [showGate, setShowGate] = useState(false);
  // Baseline = swipes already counted from prior sessions in this 24h window
  const baselineRef = useRef(null);
  // Track count at time of dismissal — gate only re-shows if count increases
  const dismissedAtCountRef = useRef(null);

  // On mount, determine baseline from localStorage so we carry over prior session counts
  useEffect(() => {
    if (isAuthenticated) return;
    const limits = getLimits();
    // Baseline is whatever is already stored, minus what may have been added this session
    // We conservatively treat stored swipes as the baseline
    baselineRef.current = limits.swipes;
  }, [isAuthenticated]);

  // Poll sessionStorage for swipe count changes
  useEffect(() => {
    if (isAuthenticated) return;

    const tick = () => {
      if (baselineRef.current === null) return;
      const sessionSwipes = getSessionSwipeCount();
      if (sessionSwipes === 0) return;
      const total = baselineRef.current + sessionSwipes;
      setSwipes(total);
      if (total >= SWIPE_LIMIT) {
        // Only re-show if count has increased since last dismissal (or never dismissed)
        if (dismissedAtCountRef.current === null || total > dismissedAtCountRef.current) {
          dismissedAtCountRef.current = null;
          setShowGate(true);
        }
      }
    };

    tick(); // run immediately
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  const closeGate = useCallback(() => {
    const sessionSwipes = getSessionSwipeCount();
    dismissedAtCountRef.current = baselineRef.current !== null
      ? baselineRef.current + sessionSwipes
      : sessionSwipes;
    setShowGate(false);
  }, []);

  return { showGate, closeGate };
}
