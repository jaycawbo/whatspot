import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { weightedShuffleTopK } from './weightedShuffle.ts';

interface Scored { id: number; score: number }

function pool(n: number, scoreFor: (i: number) => number): Scored[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, score: scoreFor(i) }));
}

Deno.test('weightedShuffleTopK: output size matches limit', () => {
  const p = pool(60, (i) => 100 - i);
  const out = weightedShuffleTopK(p, (v) => v.score, 20);
  assertEquals(out.length, 20);
});

Deno.test('weightedShuffleTopK: never returns fewer than the full pool when pool < limit', () => {
  const p = pool(3, (i) => 10 - i);
  const out = weightedShuffleTopK(p, (v) => v.score, 20);
  assertEquals(out.length, 3);
});

Deno.test('weightedShuffleTopK: never includes a far-below-band item while excluding a far-above-band item', () => {
  const p = pool(60, (i) => 100 - i); // rank 0 = score 100 (best), rank 59 = score 41 (worst)
  for (let trial = 0; trial < 200; trial++) {
    const out = weightedShuffleTopK(p, (v) => v.score, 20);
    const ids = new Set(out.map((v) => v.id));
    const hasFarBelowBand = out.some((v) => v.id >= 50); // well outside the K=40 band
    const missingTopTier = [0, 1, 2].some((id) => !ids.has(id)); // best 3 scorers
    assert(!(hasFarBelowBand && missingTopTier), 'quality inversion detected');
  }
});

Deno.test('weightedShuffleTopK: produces more than one distinct first element across repeated calls', () => {
  const p = pool(60, (i) => 100 - i);
  const seen = new Set<number>();
  for (let trial = 0; trial < 300; trial++) {
    const out = weightedShuffleTopK(p, (v) => v.score, 20);
    seen.add(out[0].id);
  }
  assert(seen.size > 1, 'first element was identical across every trial — no variety introduced');
});

Deno.test('weightedShuffleTopK: handles an empty pool', () => {
  const out = weightedShuffleTopK([] as Scored[], (v) => v.score, 20);
  assertEquals(out, []);
});

Deno.test('weightedShuffleTopK: zero/negative scores do not throw (clamped internally)', () => {
  const p = pool(15, (i) => (i % 3 === 0 ? -5 : 0));
  const out = weightedShuffleTopK(p, (v) => v.score, 10);
  assertEquals(out.length, 10);
});
