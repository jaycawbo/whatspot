import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { normalizePriceLevel, venueSnapshot } from './logEvent';

describe('normalizePriceLevel', () => {
  it('passes integers 0-4 through', () => {
    expect(normalizePriceLevel(0)).toBe(0);
    expect(normalizePriceLevel(3)).toBe(3);
  });
  it('converts $ strings to their length', () => {
    expect(normalizePriceLevel('$')).toBe(1);
    expect(normalizePriceLevel('$$')).toBe(2);
    expect(normalizePriceLevel('$$$$')).toBe(4);
  });
  it('converts Places enums', () => {
    expect(normalizePriceLevel('PRICE_LEVEL_MODERATE')).toBe(2);
  });
  it('returns null for missing or unrecognised values', () => {
    expect(normalizePriceLevel(null)).toBeNull();
    expect(normalizePriceLevel(undefined)).toBeNull();
    expect(normalizePriceLevel('cheap')).toBeNull();
    expect(normalizePriceLevel(9)).toBeNull();
  });
  it('venueSnapshot never emits a string price level', () => {
    expect(venueSnapshot({ name: 'A', price_level: '$$' }).venue_price_level).toBe(2);
  });
});
