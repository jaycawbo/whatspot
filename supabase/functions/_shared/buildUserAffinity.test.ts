import { assert, assertEquals } from 'jsr:@std/assert';
import { buildUserAffinity, personalizationMultiplier, EMPTY_AFFINITY, FOR_YOU_PERSONALIZATION_WEIGHT } from './buildUserAffinity.ts';

// Minimal stand-in for the supabase client: returns the given rows for the interactions query.
const fakeSb = (rows: any[]) => ({
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }), in: () => ({}) }) }),
});

const GENERIC = ['restaurant', 'food', 'point_of_interest', 'establishment'];
const venue = (type: string, price = 2) => ({ venue_types: [type, ...GENERIC], price_level: price, neighbourhood: null });
const now = new Date().toISOString();
const row = (interaction_type: string, type: string, rating: string | null = null) =>
  ({ interaction_type, rating, created_at: now, venues: venue(type) });

// A user who reliably says yes to one type and no to everything else.
const loverOf = (liked: string, others: string[]) => [
  ...Array.from({ length: 8 }, () => row('interested', liked)),
  ...others.flatMap((o) => Array.from({ length: 4 }, () => row('not_interested', o))),
];

const POOL = ['japanese_restaurant', 'bar', 'italian_restaurant', 'cafe'];
const rank = (aff: any) => [...POOL].sort((a, b) =>
  personalizationMultiplier([b, ...GENERIC], 2, null, aff, FOR_YOU_PERSONALIZATION_WEIGHT) -
  personalizationMultiplier([a, ...GENERIC], 2, null, aff, FOR_YOU_PERSONALIZATION_WEIGHT));

Deno.test('different tastes produce different top venues', async () => {
  const sushiFan = await buildUserAffinity(fakeSb(loverOf('japanese_restaurant', ['bar', 'italian_restaurant', 'cafe'])), 'u1');
  const barFan = await buildUserAffinity(fakeSb(loverOf('bar', ['japanese_restaurant', 'italian_restaurant', 'cafe'])), 'u2');
  assertEquals(rank(sushiFan)[0], 'japanese_restaurant');
  assertEquals(rank(barFan)[0], 'bar');
});

Deno.test('liked type boosts, avoided type penalises', async () => {
  const aff = await buildUserAffinity(fakeSb(loverOf('japanese_restaurant', ['bar', 'italian_restaurant'])), 'u');
  const m = (t: string) => personalizationMultiplier([t, ...GENERIC], 2, null, aff, FOR_YOU_PERSONALIZATION_WEIGHT);
  assert(m('japanese_restaurant') > 1.05, `liked ${m('japanese_restaurant')}`);
  assert(m('bar') < 0.97, `avoided ${m('bar')}`);
});

Deno.test('generic types and the common price bucket carry ~no signal', async () => {
  const aff = await buildUserAffinity(fakeSb(loverOf('japanese_restaurant', ['bar', 'italian_restaurant'])), 'u');
  for (const g of GENERIC) {
    assert(Math.abs((aff.categoryAffinities[g] ?? 0) - (aff.avoidCategories[g] ?? 0)) < 0.05, g);
  }
  assert((aff.priceAffinities['$$'] ?? 0) < 0.05, 'price $$ should be ~neutral when every venue is $$');
});

Deno.test('cold start and guests are unaffected', async () => {
  assertEquals(await buildUserAffinity(fakeSb([]), null), EMPTY_AFFINITY);
  assertEquals(personalizationMultiplier(['bar'], 2, null, EMPTY_AFFINITY, FOR_YOU_PERSONALIZATION_WEIGHT), 1);
});

Deno.test('a mostly-right-swiper still gets contrast from skips', async () => {
  const rows = [
    ...Array.from({ length: 8 }, () => row('interested', 'cafe')),
    ...Array.from({ length: 6 }, () => row('skipped', 'bar')),
  ];
  const aff = await buildUserAffinity(fakeSb(rows), 'u');
  assert(personalizationMultiplier(['cafe', ...GENERIC], 2, null, aff) > personalizationMultiplier(['bar', ...GENERIC], 2, null, aff));
});
