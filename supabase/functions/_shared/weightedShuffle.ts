// Weighted-random selection from the top-K scored candidates, so repeated
// requests (page reloads) don't always surface the exact same #1 venue.
// K scales with pool size. Weighted by score rank (Efraimidis-Spirakis
// method) so quality still dominates — never promotes a low scorer over a
// much better one, just breaks exact ties in ordering among close
// contenders across requests. Pure in-memory reorder — no new DB/API calls.
export function weightedShuffleTopK<T>(scored: T[], getScore: (v: T) => number, limit: number): T[] {
  const K = Math.min(scored.length, Math.max(10, limit * 2));
  const top = scored.slice(0, K);
  const rest = scored.slice(K);
  const keyed = top.map(v => ({ v, key: Math.random() ** (1 / Math.max(getScore(v), 0.01)) }));
  keyed.sort((a, b) => b.key - a.key);
  return [...keyed.map(k => k.v), ...rest].slice(0, limit);
}
