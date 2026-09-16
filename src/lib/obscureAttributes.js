// Mirrors supabase/functions/_shared/obscureAttributes.ts — kept as a separate copy
// because supabase/functions (Deno) and src/ (Vite/browser) aren't a shared runtime in
// this repo. Only the key list is needed client-side; the human-readable descriptions
// used in the Gemini prompt live in the edge-function copy. See issue #331.
const OBSCURE_ATTRIBUTE_KEYS = new Set([
  'byob',
  'dog-friendly',
  'dog friendly',
  'wifi',
  'wi-fi',
  'outlets',
  'power outlets',
  'quiet',
  'hidden gem',
]);

// Fuzzy-matches a query's constraints + vibe descriptors against the known obscure
// attributes (substring match, case-insensitive) and returns the matched attribute keys.
export function matchObscureAttributes(constraints = [], vibe = []) {
  const haystack = [...constraints, ...vibe].map((s) => (s || '').toLowerCase());
  const matched = new Set();
  for (const phrase of haystack) {
    for (const key of OBSCURE_ATTRIBUTE_KEYS) {
      if (phrase.includes(key)) matched.add(key);
    }
  }
  return [...matched];
}
