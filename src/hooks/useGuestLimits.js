import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import {
  getLimits,
  setSwipes,
  incrementSearch as _incrementSearch,
  isSwipeLimitHit,
  isSearchLimitHit,
  SWIPE_LIMIT,
  SEARCH_LIMIT,
} from '@/lib/guestLimits';

const SEEN_KEY = 'whatspot_seen_venues';

function getSessionSwipeCount() {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return 0;
    return JSON.parse(raw).length;
  } catch {
    return 0;
  }
}

export function useGuestLimits() {
  const { isAuthenticated } = useAuth();
  const [showGate, setShowGate] = useState(false);
  const [gateReason, setGateReason] = useState(null); // 'swipes' | 'searches'
  // Baseline = swipes already counted from prior sessions in this 24h window
  const baselineRef = useRef(null);

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
      const total = baselineRef.current + sessionSwipes;
      setSwipes(total);
      if (total >= SWIPE_LIMIT) {
        setShowGate(true);
        setGateReason('swipes');
      }
    };

    tick(); // run immediately
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  const incrementSearch = useCallback(() => {
    if (isAuthenticated) return false;
    if (isSearchLimitHit()) {
      setShowGate(true);
      setGateReason('searches');
      return true; // blocked
    }
    _incrementSearch();
    // Check again after increment
    if (isSearchLimitHit()) {
      setShowGate(true);
      setGateReason('searches');
      return true;
    }
    return false; // allowed
  }, [isAuthenticated]);

  const closeGate = useCallback(() => {
    setShowGate(false);
  }, []);

  return { showGate, gateReason, closeGate, incrementSearch };
}
