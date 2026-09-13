// ─── Server-side interaction-history affinity, for ranking (not just query interpretation) ───
// Deno port of src/lib/buildSearchContext.js's signal computation, reused here so Discovery's
// calculateVenueScore (and Search's) can be nudged by the same category/price/area affinities
// that already bias Search's query-refinement LLM prompt. See issue #255 / #308.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

// Fewer than this many qualifying interactions → treat as cold-start, no personalization applied.
// Matches buildSearchContext's behavior for logged-out users: empty maps, zero behavior change.
const MIN_INTERACTIONS_FOR_PERSONALIZATION = 5;

// view/card_shown rows are weak per-row signal (ambient exposure, not a deliberate action) — require
// real volume before trusting them at all. See issue #310.
const MIN_IMPLICIT_EVENTS_FOR_SIGNAL = 15;

// Caps how much a maxed-out implicit-only preference can contribute once blended in, so browsing
// noise never reaches the same strength as an explicit swipe/rate signal (which reaches 1.0). Only
// applies when explicit history is sparse (see MIN_INTERACTIONS_FOR_PERSONALIZATION) — untouched
// otherwise. See issue #310.
const IMPLICIT_SIGNAL_CAP = 0.3;

// Bounded nudge — quality (rating/reviews) always remains the dominant signal in calculateVenueScore.
const PERSONALIZATION_WEIGHT = 0.18;

// For You tab gets a stronger personalization pull than the other discovery tabs — see #309.
// Cold-start users still fall back to PERSONALIZATION_WEIGHT's no-op behavior (weight only
// matters when hasAnySignal is true), so this never changes the cold-start experience.
export const FOR_YOU_PERSONALIZATION_WEIGHT = 0.35;

// Same $ / $$ / $$$ / $$$$ buckets calculateVenueScore's callers already use, so affinity keys
// match venue.price_level as already threaded through the response shape (no raw-int plumbing needed).
const PRICE_BUCKETS: Record<number, string> = { 0: '$', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };

export interface UserAffinity {
  priceAffinities: Record<string, number>;
  categoryAffinities: Record<string, number>;
  avoidCategories: Record<string, number>;
  areaAffinity: Record<string, number>;
}

export const EMPTY_AFFINITY: UserAffinity = {
  priceAffinities: {},
  categoryAffinities: {},
  avoidCategories: {},
  areaAffinity: {},
};

function recencyWeight(createdAt: string): number {
  const age = Date.now() - new Date(createdAt).getTime();
  if (age < HOUR) return 1.0;
  if (age < DAY) return 0.9;
  if (age < WEEK) return 0.75;
  if (age < MONTH) return 0.5;
  return 0.2;
}

function isPositive(interaction_type: string, rating: string | null): boolean {
  if (interaction_type === 'interested' || interaction_type === 'been_here') return true;
  if (interaction_type === 'rated' && (rating === 'liked' || rating === 'loved')) return true;
  return false;
}

function isNegative(interaction_type: string, rating: string | null): boolean {
  if (interaction_type === 'not_interested') return true;
  if (interaction_type === 'rated' && rating === 'disliked') return true;
  return false;
}

function isFavourite(interaction_type: string, rating: string | null): boolean {
  return interaction_type === 'rated' && rating === 'loved';
}

function normalise(map: Record<string, number>): Record<string, number> {
  const values = Object.values(map);
  if (values.length === 0) return map;
  const max = Math.max(...values);
  if (!max) return map;
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v / max]));
}

// user_events.venue_cuisine_type is the single derived string recommend/index.ts stamps on venues
// (e.g. "italian_restaurant" -> "italian"), not the raw venue_types array explicit interactions key
// affinity off of. Reverse that derivation so implicit rows land in the same key space. "Restaurant"
// is the generic fallback used when no specific type matched — not a real signal, so it's dropped.
function cuisineToCategoryKey(cuisineType: string | null): string | null {
  if (!cuisineType || cuisineType === 'Restaurant') return null;
  return `${cuisineType}_restaurant`;
}

// Weighted raw sums (recency only — no favourite bonus, there's no "loved" equivalent for a passive
// view) from view/card_shown events, for the two fields user_events denormalizes that also exist on
// explicit interactions: cuisine and price. No neighbourhood/rating columns on user_events, so area
// affinity and avoid-categories stay explicit-only. Returns null when there isn't enough volume to
// trust (see MIN_IMPLICIT_EVENTS_FOR_SIGNAL) — caller falls back to explicit-only behavior.
async function buildImplicitAffinity(
  sb: any,
  userId: string,
): Promise<{ categoryAffinities: Record<string, number>; priceAffinities: Record<string, number> } | null> {
  const { data, error } = await sb
    .from('user_events')
    .select('venue_cuisine_type, venue_price_level, created_at')
    .eq('user_id', userId)
    .in('event_type', ['view', 'card_shown'])
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data || data.length < MIN_IMPLICIT_EVENTS_FOR_SIGNAL) return null;

  const categoryAffinities: Record<string, number> = {};
  const priceAffinities: Record<string, number> = {};

  for (const row of data as any[]) {
    const weight = recencyWeight(row.created_at);

    const categoryKey = cuisineToCategoryKey(row.venue_cuisine_type);
    if (categoryKey) categoryAffinities[categoryKey] = (categoryAffinities[categoryKey] ?? 0) + weight;

    const priceBucket = row.venue_price_level != null ? PRICE_BUCKETS[row.venue_price_level] : null;
    if (priceBucket) priceAffinities[priceBucket] = (priceAffinities[priceBucket] ?? 0) + weight;
  }

  return { categoryAffinities: normalise(categoryAffinities), priceAffinities: normalise(priceAffinities) };
}

// Adds implicit's normalized preference-shape into explicit's at a capped weight, without a final
// re-normalize — re-normalizing here would rescale a maxed implicit-only value straight back up to
// 1.0, silently undoing the cap. Clamping per-key instead keeps IMPLICIT_SIGNAL_CAP meaningful.
function blendCapped(
  explicitNormalised: Record<string, number>,
  implicitNormalised: Record<string, number>,
): Record<string, number> {
  const combined: Record<string, number> = { ...explicitNormalised };
  for (const [key, value] of Object.entries(implicitNormalised)) {
    combined[key] = Math.min(1, (combined[key] ?? 0) + value * IMPLICIT_SIGNAL_CAP);
  }
  return combined;
}

// ─── buildUserAffinity — last 60 interactions, recency + favourite weighted, normalized ───
export async function buildUserAffinity(sb: any, userId: string | null): Promise<UserAffinity> {
  if (!userId) return EMPTY_AFFINITY;

  const { data, error } = await sb
    .from('user_venue_interactions')
    .select(`
      venue_id,
      interaction_type,
      rating,
      created_at,
      venues!inner(venue_types, price_level, neighbourhood)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);

  const explicitRows = (!error && data) ? (data as any[]) : [];
  const explicitCount = explicitRows.length;

  const priceAffinities: Record<string, number> = {};
  const categoryAffinities: Record<string, number> = {};
  const avoidCategories: Record<string, number> = {};
  const areaAffinity: Record<string, number> = {};

  for (const row of explicitRows) {
    const { interaction_type, rating, created_at, venues } = row;
    if (!venues) continue;

    const { venue_types, price_level, neighbourhood } = venues;
    const types: string[] = Array.isArray(venue_types) ? venue_types : [];
    const priceBucket = price_level != null ? PRICE_BUCKETS[price_level] : null;

    if (isPositive(interaction_type, rating)) {
      let weight = recencyWeight(created_at);
      if (isFavourite(interaction_type, rating)) weight *= 1.5;

      if (priceBucket) {
        priceAffinities[priceBucket] = (priceAffinities[priceBucket] ?? 0) + weight;
      }
      for (const type of types) {
        categoryAffinities[type] = (categoryAffinities[type] ?? 0) + weight;
      }
      if (neighbourhood) {
        areaAffinity[neighbourhood] = (areaAffinity[neighbourhood] ?? 0) + weight;
      }
    } else if (isNegative(interaction_type, rating)) {
      for (const type of types) {
        avoidCategories[type] = (avoidCategories[type] ?? 0) + 1.0;
      }
    }
  }

  // Enough explicit history on its own — implicit browsing data would only add noise. Unchanged
  // from pre-#310 behavior.
  if (explicitCount >= MIN_INTERACTIONS_FOR_PERSONALIZATION) {
    return {
      priceAffinities: normalise(priceAffinities),
      categoryAffinities: normalise(categoryAffinities),
      avoidCategories: normalise(avoidCategories),
      areaAffinity: normalise(areaAffinity),
    };
  }

  // Sparse (including zero) explicit history — see if view/card_shown volume is enough to fill the
  // gap. If not, fall back exactly to pre-#310 behavior: too little of either signal → cold-start no-op.
  const implicit = await buildImplicitAffinity(sb, userId);
  if (!implicit) return EMPTY_AFFINITY;

  const explicitCategoryNorm = normalise(categoryAffinities);
  const explicitPriceNorm = normalise(priceAffinities);

  return {
    categoryAffinities: blendCapped(explicitCategoryNorm, implicit.categoryAffinities),
    priceAffinities: blendCapped(explicitPriceNorm, implicit.priceAffinities),
    avoidCategories: normalise(avoidCategories),
    areaAffinity: normalise(areaAffinity),
  };
}

function hasAnySignal(affinity: UserAffinity): boolean {
  return (
    Object.keys(affinity.categoryAffinities).length > 0 ||
    Object.keys(affinity.priceAffinities).length > 0 ||
    Object.keys(affinity.avoidCategories).length > 0 ||
    Object.keys(affinity.areaAffinity).length > 0
  );
}

// ─── personalizationMultiplier — bounded score adjustment applied at final ranking time ───
// Never touches admission (rating/review floors, chain blocklist, geographic caps, skip_history) —
// only reorders within whatever pool those already gated. Returns 1 (no-op) for cold-start users
// and guests, so unpersonalized traffic scores identically to before this change.
export function personalizationMultiplier(
  types: string[] | null | undefined,
  priceLevel: string | number | null | undefined,
  neighbourhood: string | null | undefined,
  affinity: UserAffinity,
  weight: number = PERSONALIZATION_WEIGHT,
): number {
  if (!affinity || !hasAnySignal(affinity)) return 1;

  const list = Array.isArray(types) ? types : [];

  let categoryScore = 0;
  let avoidScore = 0;
  for (const t of list) {
    if (affinity.categoryAffinities[t]) categoryScore = Math.max(categoryScore, affinity.categoryAffinities[t]);
    if (affinity.avoidCategories[t]) avoidScore = Math.max(avoidScore, affinity.avoidCategories[t]);
  }

  const priceBucket = typeof priceLevel === 'number' ? PRICE_BUCKETS[priceLevel] : priceLevel;
  const priceScore = priceBucket ? (affinity.priceAffinities[priceBucket] ?? 0) : 0;
  const areaScore = neighbourhood ? (affinity.areaAffinity[neighbourhood] ?? 0) : 0;

  const raw = categoryScore * 0.5 + priceScore * 0.25 + areaScore * 0.25 - avoidScore * 0.5;
  const personalizationScore = Math.max(-1, Math.min(1, raw));

  return 1 + weight * personalizationScore;
}
