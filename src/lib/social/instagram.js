// Validation for the only Instagram data we store: a handle and post permalinks.
// Pure functions with no DOM or app imports, so the seed script
// (scripts/generate-instagram-seed.js) can import this under plain Node.

const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;
const PERMALINK_PATH_RE = /^\/(p|reel|tv)\/([A-Za-z0-9_-]{1,64})\/?$/;
const HANDLE_URL_PREFIX_RE = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i;
const MAX_INPUT_LENGTH = 2048;

/**
 * Normalize a user-entered Instagram handle.
 * Accepts "name", "@name", "instagram.com/name", "https://www.instagram.com/name/?hl=en".
 * Returns the lowercase handle without "@", or null if it isn't a valid handle.
 */
export function normalizeHandle(input) {
  if (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH) return null;

  let value = input.trim();

  if (HANDLE_URL_PREFIX_RE.test(value)) {
    value = value.replace(HANDLE_URL_PREFIX_RE, '').split(/[?#]/)[0].replace(/\/$/, '');
    // "instagram.com/p/abc" is a post, not a profile
    if (value.includes('/')) return null;
  }

  value = value.replace(/^@/, '');

  return HANDLE_RE.test(value) ? value.toLowerCase() : null;
}

/**
 * Parse an Instagram post permalink.
 * Accepts only https://www.instagram.com/(p|reel|tv)/{shortcode}/ with query
 * string, hash and a missing trailing slash tolerated (and stripped).
 * Returns { permalink, shortcode } with a canonical permalink, or null.
 */
export function parsePermalink(input) {
  if (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH) return null;

  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'www.instagram.com') return null;
  if (url.username || url.password || url.port) return null;

  const match = url.pathname.match(PERMALINK_PATH_RE);
  if (!match) return null;

  const [, type, shortcode] = match;
  return {
    permalink: `https://www.instagram.com/${type}/${shortcode}/`,
    shortcode,
  };
}

export function instagramProfileUrl(handle) {
  const normalized = normalizeHandle(handle);
  return normalized ? `https://www.instagram.com/${normalized}/` : null;
}
