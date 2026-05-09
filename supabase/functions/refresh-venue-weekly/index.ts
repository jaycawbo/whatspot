/**
 * refresh-venue-weekly
 *
 * Single Enterprise-tier call per venue. Bundles all fields that sit at
 * the Enterprise pricing level so we never pay that rate twice for the same venue.
 *
 * Fields refreshed (one API call per venue):
 *   rating, userRatingCount, currentOpeningHours, regularOpeningHours,
 *   businessStatus, nationalPhoneNumber, websiteUri
 *
 * FieldMask pricing note:
 *   All six fields sit in Google's Enterprise tier.
 *   Photos are deliberately excluded — they push into Enterprise + Atmosphere
 *   and are handled by refresh-venue-photos on a quarterly schedule.
 *   AI descriptions are never fetched from the API; generated internally.
 *
 * Staleness window: 7 days
 *
 * Invocation:
 *   - pg_cron: weekly, Monday 6am UTC
 *   - Fire-and-forget from venueDataRouter when serving a stale venue (live_fallback mode only)
 *   - Manual: POST with optional { place_ids?: string[], batch_size?: number }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAndLog } from '../_shared/apiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STALE_DAYS    = 7;
const DEFAULT_BATCH = 50;

// Fields that belong to the Enterprise tier — never mix photos into this call.
const ENTERPRISE_FIELD_MASK = [
  'rating',
  'userRatingCount',
  'currentOpeningHours',
  'regularOpeningHours',
  'businessStatus',
  'nationalPhoneNumber',
  'websiteUri',
].join(',');

// ─── Hours parsing ────────────────────────────────────────────────────────────

interface Period { day: number; open: string; close: string; }

/**
 * Parse Google Places API (New) currentOpeningHours.periods into our storage format.
 * Input:  { open: { day, hour, minute }, close: { day, hour, minute } }
 * Output: { day: 0–6, open: "HH:MM", close: "HH:MM" }
 * Null close (24h day) → close: "23:59"
 */
function parsePeriods(periods: any[]): Period[] {
  if (!Array.isArray(periods)) return [];
  return periods.map((p: any) => ({
    day:   p.open?.day ?? 0,
    open:  `${String(p.open?.hour   ?? 0).padStart(2, '0')}:${String(p.open?.minute  ?? 0).padStart(2, '0')}`,
    close: p.close
      ? `${String(p.close.hour ?? 23).padStart(2, '0')}:${String(p.close.minute ?? 59).padStart(2, '0')}`
      : '23:59',
  }));
}

// ─── Places API fetch ─────────────────────────────────────────────────────────

async function fetchEnterpriseFields(googlePlaceId: string, apiKey: string) {
  const placeRef = googlePlaceId.startsWith('places/')
    ? googlePlaceId
    : `places/${googlePlaceId}`;

  const resp = await fetch(`https://places.googleapis.com/v1/${placeRef}`, {
    headers: {
      'X-Goog-Api-Key':  apiKey,
      'X-Goog-FieldMask': ENTERPRISE_FIELD_MASK,
    },
  });

  if (!resp.ok) {
    console.warn(`[refresh-venue-weekly] Places ${resp.status} for ${googlePlaceId}: ${await resp.text()}`);
    return null;
  }

  const d = await resp.json();
  return {
    rating:                  d.rating                              ?? null,
    review_count:            d.userRatingCount                     ?? null,
    opening_hours:           parsePeriods(d.currentOpeningHours?.periods || []),
    regular_opening_hours:   parsePeriods(d.regularOpeningHours?.periods || []),
    is_temporarily_closed:   d.businessStatus === 'TEMPORARILY_CLOSED',
    phone:                   d.nationalPhoneNumber                 ?? null,
    website:                 d.websiteUri                         ?? null,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    let body: { place_ids?: string[]; batch_size?: number } = {};
    try { body = await req.json(); } catch { /* no body */ }

    const batchSize = body.batch_size ?? DEFAULT_BATCH;
    const now       = new Date().toISOString();
    let rows: { google_place_id: string }[] = [];

    if (body.place_ids?.length) {
      rows = body.place_ids.map((id) => ({ google_place_id: id }));
    } else {
      const staleThreshold = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
      const { data, error } = await supabase
        .from('venues')
        .select('google_place_id')
        .or(`rating_last_updated.is.null,rating_last_updated.lt.${staleThreshold}`)
        .order('rating_last_updated', { ascending: true, nullsFirst: true })
        .limit(batchSize);
      if (error) throw error;
      rows = data ?? [];
    }

    if (!rows.length) {
      return new Response(
        JSON.stringify({ message: 'No stale venues', updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[refresh-venue-weekly] Processing ${rows.length} venues`);
    let updated = 0, failed = 0;

    for (const row of rows) {
      const allowed = await checkAndLog(supabase, 'weekly', row.google_place_id);
      if (!allowed) {
        console.warn(`[refresh-venue-weekly] Monthly cap reached — skipping ${row.google_place_id}`);
        failed++;
        continue;
      }

      try {
        const fields = await fetchEnterpriseFields(row.google_place_id, apiKey);
        if (!fields) { failed++; continue; }

        const { error } = await supabase
          .from('venues')
          .update({
            ...fields,
            rating_last_updated:  now,
            hours_last_updated:   now,
          })
          .eq('google_place_id', row.google_place_id);

        if (error) {
          console.warn(`[refresh-venue-weekly] DB error for ${row.google_place_id}:`, error.message);
          failed++;
        } else {
          updated++;
        }
      } catch (err) {
        console.warn(`[refresh-venue-weekly] Error for ${row.google_place_id}:`, err);
        failed++;
      }
    }

    console.log(`[refresh-venue-weekly] Done — updated: ${updated}, failed: ${failed}`);
    return new Response(
      JSON.stringify({ updated, failed, total: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[refresh-venue-weekly] Fatal:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
