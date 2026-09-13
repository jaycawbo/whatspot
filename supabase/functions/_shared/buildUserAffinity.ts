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

// Bounded nudge — quality (rating/reviews) always remains the dominant signal in calculateVenueScore.
const PERSONALIZATION_WEIGHT = 0.18;

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

  if (error || !data || data.length < MIN_INTERACTIONS_FOR_PERSONALIZATION) return EMPTY_AFFINITY;

  const priceAffinities: Record<string, number> = {};
  const categoryAffinities: Record<string, number> = {};
  const avoidCategories: Record<string, number> = {};
  const areaAffinity: Record<string, number> = {};

  for (const row of data as any[]) {
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

  return {
    priceAffinities: normalise(priceAffinities),
    categoryAffinities: normalise(categoryAffinities),
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
