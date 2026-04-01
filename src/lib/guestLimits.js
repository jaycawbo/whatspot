const KEY = 'whatspot_guest_limits';
export const SWIPE_LIMIT = 10;
export const SEARCH_LIMIT = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function now() { return Date.now(); }

function fresh() {
  return { swipes: 0, searches: 0, resetAt: now() + WINDOW_MS };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    if (now() > data.resetAt) {
      const f = fresh();
      localStorage.setItem(KEY, JSON.stringify(f));
      return f;
    }
    return data;
  } catch {
    return fresh();
  }
}

function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function getLimits() {
  return read();
}

export function setSwipes(count) {
  const data = read();
  data.swipes = count;
  write(data);
}

export function incrementSearch() {
  const data = read();
  data.searches += 1;
  write(data);
  return data;
}

export function isSwipeLimitHit() {
  return read().swipes >= SWIPE_LIMIT;
}

export function isSearchLimitHit() {
  return read().searches >= SEARCH_LIMIT;
}
