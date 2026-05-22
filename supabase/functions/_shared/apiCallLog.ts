import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const MONTHLY_CAP = 4000;

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
): Promise<boolean> {
  const monthKey = currentMonthKey();

  const { count: currentCount, error: countError } = await sb
    .from('api_call_log')
    .select('*', { count: 'exact', head: true })
    .eq('service', 'google_places')
    .eq('month_key', monthKey);

  if (countError) {
    console.warn('[apiCallLog] Count query failed — failing open:', countError.message);
    return true;
  }

  if ((currentCount ?? 0) + count > MONTHLY_CAP) {
    console.warn(
      `[apiCallLog] Monthly cap reached (${currentCount}/${MONTHLY_CAP}). Blocking call_type="${callType}" venue="${venueId ?? 'n/a'}".`,
    );
    return false;
  }

  const rows = Array.from({ length: count }, () => ({
    service:    'google_places',
    call_type:  callType,
    venue_id:   venueId ?? null,
    called_at:  new Date().toISOString(),
    month_key:  monthKey,
  }));

  const { error: insertError } = await sb.from('api_call_log').insert(rows);

  if (insertError) {
    console.warn('[apiCallLog] Insert failed — call will still proceed:', insertError.message);
  }

  return true;
}
