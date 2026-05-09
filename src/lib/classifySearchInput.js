// Vibe/occasion phrases that signal an intent-based search rather than a direct venue name lookup.
const VIBE_PHRASES = [
  'cozy', 'vibe', 'night out', 'good for', 'late night', 'happy hour',
  'near me', 'best', 'cheap', 'romantic', 'lively', 'quiet',
];

/**
 * Classify a search query as "direct" (venue name lookup) or "intent" (conversational search).
 *
 * Rules applied in order:
 *   1. Vibe/occasion words present → "intent"  (strongest signal; suppresses autocomplete)
 *   2. Fewer than 4 words with any capitalised word → "direct"  (looks like a proper noun / venue name)
 *   3. Default → "direct"
 *
 * When VITE_GOOGLE_PLACES_SEARCH_ENABLED is false the caller short-circuits before this
 * function is reached, but it still returns a safe default if called directly.
 */
export function classifySearchInput(query) {
  if (!query?.trim()) return 'intent';

  const lower = query.toLowerCase().trim();

  if (VIBE_PHRASES.some((phrase) => lower.includes(phrase))) return 'intent';

  const words = query.trim().split(/\s+/);
  if (words.length < 4 && words.some((w) => /^[A-Z]/.test(w))) return 'direct';

  return 'direct';
}
