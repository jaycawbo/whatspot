const SWIPE_KEY = 'whatspot_guest_swipes';
const SEARCH_KEY = 'whatspot_guest_searches';

export const MAX_GUEST_SWIPES = 8;
export const MAX_GUEST_SEARCHES = 3;

function readInt(key) {
  return parseInt(localStorage.getItem(key) || '0', 10);
}

export function useGuestLimits(isAuthenticated) {
  const getSwipeCount = () => (isAuthenticated ? Infinity : readInt(SWIPE_KEY));
  const getSearchCount = () => (isAuthenticated ? Infinity : readInt(SEARCH_KEY));

  const hasReachedSwipeLimit = () => !isAuthenticated && readInt(SWIPE_KEY) >= MAX_GUEST_SWIPES;
  const hasReachedSearchLimit = () => !isAuthenticated && readInt(SEARCH_KEY) >= MAX_GUEST_SEARCHES;

  const incrementSwipe = () => {
    if (isAuthenticated) return;
    localStorage.setItem(SWIPE_KEY, String(readInt(SWIPE_KEY) + 1));
  };

  const incrementSearch = () => {
    if (isAuthenticated) return;
    localStorage.setItem(SEARCH_KEY, String(readInt(SEARCH_KEY) + 1));
  };

  return { getSwipeCount, getSearchCount, hasReachedSwipeLimit, hasReachedSearchLimit, incrementSwipe, incrementSearch };
}
