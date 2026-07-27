import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PHOTOS_MONTHLY_CAP = 3000;
const DEFAULT_MONTHLY_CAP = 500;
// Gemini calls are individually cheap (~$0.001-0.0015 each) — this cap is a circuit
// breaker against runaway cost (bug/spike/abuse), not a routine per-search throttle.
const LLM_MONTHLY_CAP = 75000;

export function monthlyCapFor(callType: string): number {
  if (callType === 'photos') return PHOTOS_MONTHLY_CAP;
  if (callType === 'completeness_llm') return LLM_MONTHLY_CAP;
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
 * Returns false → cap reached, call blocked.
 *
 * Fails open: if the count query itself errors, the call is allowed so a logging
 * failure never silently breaks functionality. The error is console.warn'd instead.
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
    console.warn('[apiCallLog] Count query failed — failing open:', countError.message);
    const rows = Array.from({ length: count }, () => ({
      service,
      call_type: callType,
      venue_id:  venueId ?? null,
      called_at: new Date().toISOString(),
      month_key: monthKey,
    }));
    const { error: insertError } = await sb.from('api_call_log').insert(rows);
    if (insertError) {
      console.error('[apiCallLog] Insert also failed after count error:', insertError.message);
    }
    return true;
  }

  if ((currentCount ?? 0) + count > cap) {
    console.warn(
      `[apiCallLog] Monthly cap reached for call_type="${callType}" (${currentCount}/${cap}). Blocking venue="${venueId ?? 'n/a'}".`,
    );
    return false;
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
    console.error('[apiCallLog] Insert failed — call will still proceed:', insertError.message);
  }

  return true;
}
