import { supabase } from '@/integrations/supabase/client';

const CACHE_KEY = 'ws_search_context';
const CACHE_TTL_MS = 10 * 60 * 1000;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

function recencyWeight(createdAt) {
  const age = Date.now() - new Date(createdAt).getTime();
  if (age < HOUR)  return 1.0;
  if (age < DAY)   return 0.9;
  if (age < WEEK)  return 0.75;
  if (age < MONTH) return 0.5;
  return 0.2;
}

function isPositive(interaction_type, rating) {
  if (interaction_type === 'interested' || interaction_type === 'been_here') return true;
  if (interaction_type === 'rated' && (rating === 'liked' || rating === 'loved')) return true;
  return false;
}

function isNegative(interaction_type, rating) {
  if (interaction_type === 'not_interested') return true;
  if (interaction_type === 'rated' && rating === 'disliked') return true;
  return false;
}

function isFavourite(interaction_type, rating) {
  return interaction_type === 'rated' && rating === 'loved';
}

function normalise(map) {
  const max = Math.max(...Object.values(map));
  if (!max) return map;
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v / max]));
}

export async function buildSearchContext(userId) {
  if (!userId) return {};

  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
    }
  } catch {}

  const { data, error } = await supabase
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

  if (error || !data) return {};

  const priceAffinities = {};
  const categoryAffinities = {};
  const avoidCategories = {};
  const areaAffinity = {};

  for (const row of data) {
    const { interaction_type, rating, created_at, venues } = row;
    if (!venues) continue;

    const { venue_types, price_level, neighbourhood } = venues;
    const types = Array.isArray(venue_types) ? venue_types : [];

    if (isPositive(interaction_type, rating)) {
      let weight = recencyWeight(created_at);
      if (isFavourite(interaction_type, rating)) weight *= 1.5;

      if (price_level != null) {
        priceAffinities[price_level] = (priceAffinities[price_level] ?? 0) + weight;
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

  const context = {
    priceAffinities: normalise(priceAffinities),
    categoryAffinities: normalise(categoryAffinities),
    avoidCategories: normalise(avoidCategories),
    areaAffinity: normalise(areaAffinity),
  };

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: context }));
  } catch {}

  return context;
}

export function invalidateSearchContext() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {}
}
