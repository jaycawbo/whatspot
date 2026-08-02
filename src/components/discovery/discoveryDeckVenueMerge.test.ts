import { describe, it, expect } from 'vitest';
import { getVenueId, mergeVenuesOnBackgroundExpansion } from './discoveryDeckVenueMerge';

const v = (id: string) => ({ place_id: id });

describe('getVenueId', () => {
  it('reads place_id', () => {
    expect(getVenueId({ place_id: 'abc' })).toBe('abc');
  });

  it('falls back to google_place_id', () => {
    expect(getVenueId({ google_place_id: 'xyz' })).toBe('xyz');
  });

  it('strips a places/ prefix', () => {
    expect(getVenueId({ place_id: 'places/abc' })).toBe('abc');
  });

  it('returns empty string when neither id is present', () => {
    expect(getVenueId({})).toBe('');
  });
});

describe('mergeVenuesOnBackgroundExpansion', () => {
  it('preserves the current card and everything before it unchanged', () => {
    const prev = [v('a'), v('b'), v('c'), v('d')];
    const result = mergeVenuesOnBackgroundExpansion(prev, 1, [v('x'), v('y')]);
    // index 0 and 1 (the current card) survive untouched, including identity
    expect(result[0]).toBe(prev[0]);
    expect(result[1]).toBe(prev[1]);
  });

  it('appends the incoming venues after the kept prefix', () => {
    const prev = [v('a'), v('b'), v('c')];
    const result = mergeVenuesOnBackgroundExpansion(prev, 0, [v('x'), v('y')]);
    expect(result.map(getVenueId)).toEqual(['a', 'x', 'y']);
  });

  it('drops incoming venues that duplicate an already-kept id', () => {
    const prev = [v('a'), v('b')];
    const result = mergeVenuesOnBackgroundExpansion(prev, 1, [v('b'), v('c')]);
    expect(result.map(getVenueId)).toEqual(['a', 'b', 'c']);
  });

  it('drops the old trailing tail (the venues the user has not reached yet)', () => {
    const prev = [v('a'), v('b'), v('stale-1'), v('stale-2')];
    const result = mergeVenuesOnBackgroundExpansion(prev, 1, [v('fresh-1')]);
    expect(result.map(getVenueId)).toEqual(['a', 'b', 'fresh-1']);
  });

  it('handles currentIndex at the end of a shorter-than-expected prev array', () => {
    const prev = [v('a')];
    const result = mergeVenuesOnBackgroundExpansion(prev, 3, [v('x')]);
    expect(result.map(getVenueId)).toEqual(['a', 'x']);
  });
});
