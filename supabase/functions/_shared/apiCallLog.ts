import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Circuit-breaker caps (issue #319 cost review): these are a backstop against a
// runaway bug/spike, not the primary cost control — search itself is now gated
// by sign-in + a 5/day/user quota (see _shared/searchQuota.ts), which bounds
// real volume far below these numbers. Sized with headroom above a worst-case
// 5,000-user soft launch (5,000 users × 5 searches/day × 30 days = 750,000
// search-actions/month ceiling), not tuned to any single-digit-thousands
// testing-era volume.
const PHOTOS_MONTHLY_CAP = 3000; // unrelated to search volume — quarterly cron only, see venueDataRouter.js
const DEFAULT_MONTHLY_CAP = 500;
const DISCOVERY_FALLBACK_MONTHLY_CAP = 500000; // broad Places Text Search, up to 60% of searches
const HOURS_MONTHLY_CAP = 250000; // open_now-triggered Place Details refresh
const LIVE_GROUNDING_MONTHLY_CAP = 200000; // Gemini grounding + place resolution
const LLM_MONTHLY_CAP = 500000; // completeness_llm gap-fill pass
// 'weekly' (issue #324): the on-demand path (search-venues-db) is now deduped
// and batched, and indirectly bounded by the search rate limit upstream — this
// no longer needs to share the generic 500/month default, which would starve
// legitimate refreshes at any real search volume. Sized well above realistic
// need (cron alone is ~217/month; this covers that plus real on-demand use)
// while still catching a genuine bug/loop.
const WEEKLY_REFRESH_MONTHLY_CAP = 10000;
// 'photos_refresh': refresh-venue-photos previously had no cap at all, relying
// solely on its quarterly-cron-only invocation (~17/month average) for safety.
// This is insurance in case an on-demand trigger is ever added later, not a
// response to any current volume.
const PHOTOS_REFRESH_MONTHLY_CAP = 2000;

// Log (not just block) once a call type crosses this share of its cap, so
// saturation shows up in edge function logs before it actually blocks anything.
const ALERT_THRESHOLD = 0.8;

function monthlyCapFor(callType: string): number {
  if (callType === 'photos') return PHOTOS_MONTHLY_CAP;
  if (callType === 'completeness_llm') return LLM_MONTHLY_CAP;
  if (callType === 'discovery_fallback') return DISCOVERY_FALLBACK_MONTHLY_CAP;
  if (callType === 'hours') return HOURS_MONTHLY_CAP;
  if (callType === 'live_grounding') return LIVE_GROUNDING_MONTHLY_CAP;
  if (callType === 'weekly') return WEEKLY_REFRESH_MONTHLY_CAP;
  if (callType === 'photos_refresh') return PHOTOS_REFRESH_MONTHLY_CAP;
  return DEFAULT_MONTHLY_CAP;
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Check the monthly Google Places API spend cap, then log the call if allowed.
 *
 * Returns true  → cap not reached, call logged, proceed with API call.
 * Returns false → cap reached (or cap status couldn't be verified), call blocked.
 *
 * Fails closed: if the count query itself errors, the call is blocked rather than
 * allowed through for free — a logging outage should never silently remove the
 * cost cap (issue #319). The error is console.error'd so it's visible as an
 * incident, not just a routine block.
 */
export async function checkAndLog(
  sb: SupabaseClient,
  callType: string,
  venueId?: string,
  count: number = 1,
  service: string = 'google_places',
): Promise<boolean> {
  const monthKey = currentMonthKey();
  const cap = monthlyCapFor(callType);

  const { count: currentCount, error: countError } = await sb
    .from('api_call_log')
    .select('*', { count: 'exact', head: true })
    .eq('service', service)
    .eq('call_type', callType)
    .eq('month_key', monthKey);

  if (countError) {
    console.error('[apiCallLog] Count query failed — failing closed:', countError.message);
    return false;
  }

  const projectedCount = (currentCount ?? 0) + count;

  if (projectedCount > cap) {
    console.warn(
      `[apiCallLog] Monthly cap reached for call_type="${callType}" (${currentCount}/${cap}). Blocking venue="${venueId ?? 'n/a'}".`,
    );
    return false;
  }

  if (projectedCount >= cap * ALERT_THRESHOLD) {
    console.warn(
      `[apiCallLog] ALERT: call_type="${callType}" at ${projectedCount}/${cap} (${Math.round((projectedCount / cap) * 100)}%) — approaching monthly cap.`,
    );
  }

  const rows = Array.from({ length: count }, () => ({
    service,
    call_type:  callType,
    venue_id:   venueId ?? null,
    called_at:  new Date().toISOString(),
    month_key:  monthKey,
  }));

  const { error: insertError } = await sb.from('api_call_log').insert(rows);

  if (insertError) {
    console.error('[apiCallLog] Insert failed after cap check passed — logging is now undercounting this call_type:', insertError.message);
  }

  return true;
}
