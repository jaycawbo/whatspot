import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Suppression windows (in days) by interaction_type. null = indefinite (never resurface).
export const SUPPRESSION_DAYS: Record<string, number | null> = {
  passive_skip: 7,
  skip_for_now: 30,
  interested: null,
  not_interested: 90,
  been_here: null,
};

export interface SkipHistoryRow {
  venue_id: string;
  interaction_type: string;
  created_at: string;
}

/**
 * Pure suppression-window logic, split out from the DB I/O so it can be unit
 * tested without a network call. `expired` is the subset of rows whose finite
 * window has actually passed — the only rows safe to garbage-collect (indefinite
 * types are never returned here, so they're never deleted).
 */
export function computeSuppressedIds(
  rows: SkipHistoryRow[],
  now: number = Date.now()
): { suppressed: Set<string>; expired: string[] } {
  const suppressed = new Set<string>();
  const expired: string[] = [];

  for (const row of rows) {
    const days = SUPPRESSION_DAYS[row.interaction_type];
    if (days === undefined) continue; // unknown type — leave untouched

    if (days === null) {
      suppressed.add(row.venue_id);
      continue;
    }

    const createdAt = new Date(row.created_at).getTime();
    const windowMs = days * 24 * 60 * 60 * 1000;
    if (now - createdAt < windowMs) {
      suppressed.add(row.venue_id);
    } else {
      expired.push(row.venue_id);
    }
  }

  return { suppressed, expired };
}

/**
 * Query skip_history and return the set of venue IDs that should currently be
 * suppressed from a user's Discovery feed (deck + tabs), per SUPPRESSION_DAYS.
 */
export async function getSuppressedVenueIds(userId: string): Promise<Set<string>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await sb
    .from('skip_history')
    .select('venue_id, interaction_type, created_at')
    .eq('user_id', userId);

  if (error || !data) return new Set();

  const { suppressed, expired } = computeSuppressedIds(data);

  if (expired.length > 0) {
    // Fire-and-forget cleanup — only rows whose finite window has actually
    // passed. Indefinite-type rows (interested, been_here) are never here.
    sb.from('skip_history').delete().eq('user_id', userId).in('venue_id', expired);
  }

  return suppressed;
}
