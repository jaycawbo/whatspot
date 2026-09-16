// Attributes with no reliable structured field in Places/Supabase data. Matched against
// a query's Gemini-parsed constraints/vibe (see refine-query) to decide whether a Gemini
// Flash verification pass should run over candidate venues before they're returned.
// Deliberately excludes things no public information source can answer either (e.g.
// seating capacity) — those stay unfiltered rather than have Gemini guess. See issue #331.
export const OBSCURE_ATTRIBUTES: Record<string, string> = {
  byob: 'BYOB — customers may bring their own wine/alcohol',
  'dog-friendly': 'allows dogs, especially on the patio',
  'dog friendly': 'allows dogs, especially on the patio',
  wifi: 'has wifi available for customers',
  'wi-fi': 'has wifi available for customers',
  outlets: 'has power outlets available at tables, good for working',
  'power outlets': 'has power outlets available at tables, good for working',
  quiet: 'known for being quiet / low noise — good for conversation or work, not a loud bar scene',
  'hidden gem': 'a lesser-known, under-the-radar spot rather than a well-known or popular chain',
};

// Fuzzy-matches a query's constraints + vibe descriptors against the known obscure
// attributes (substring match, case-insensitive) and returns the matched attribute keys.
export function matchObscureAttributes(constraints: string[] = [], vibe: string[] = []): string[] {
  const haystack = [...constraints, ...vibe].map((s) => (s || '').toLowerCase());
  const matched = new Set<string>();
  for (const phrase of haystack) {
    for (const key of Object.keys(OBSCURE_ATTRIBUTES)) {
      if (phrase.includes(key)) matched.add(key);
    }
  }
  return [...matched];
}
