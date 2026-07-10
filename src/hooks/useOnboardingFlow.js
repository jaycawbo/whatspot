import { useCallback, useState } from 'react';

const SEEN_KEY = 'whatspot_onboarding_seen';
const SCREEN_COUNT = 3;

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {}
}

/**
 * Owns onboarding interstitial state: current screen, the seen/dismiss flag,
 * and next/close handlers. Shared by the mobile and desktop variants so
 * neither duplicates this logic.
 */
export function useOnboardingFlow() {
  const [seen, setSeen] = useState(readSeen);
  const [screenIndex, setScreenIndex] = useState(0);

  const close = useCallback(() => {
    writeSeen();
    setSeen(true);
  }, []);

  const next = useCallback(() => {
    setScreenIndex((i) => {
      if (i >= SCREEN_COUNT - 1) {
        close();
        return i;
      }
      return i + 1;
    });
  }, [close]);

  return {
    isOpen: !seen,
    screenIndex,
    screenCount: SCREEN_COUNT,
    next,
    close,
  };
}
