/**
 * refresh-venue-hours
 *
 * Fetches structured opening hours from Google Places API (New) for venues
 * where hours_last_updated IS NULL or older than 7 days, then writes them
 * back to the venues table in machine-readable format.
 *
 * Hours format stored in venues.opening_hours (jsonb array):
 *   [{ day: 0-6, open: "HH:MM", close: "HH:MM" }]
 *   day follows JS Date.getDay() convention: 0 = Sunday, 6 = Saturday
 *   open/close are 24-hour "HH:MM" strings
 *
 * Can be called:
 *   - Manually via Supabase Dashboard or curl (runs batch of up to 50 stale venues)
 *   - Via pg_cron (daily, same as aggregate-venue-signals)
 *   - Fire-and-forget from venueDataRouter when serving stale hours
 *   - With a specific place_ids array to refresh targeted venues immediately
 *
 * Body (all optional):
 *   { place_ids?: string[], batch_size?: number }
 *   If place_ids is provided, only those venues are refreshed (ignores staleness window).
 *   If omitted, queries the DB for the most-stale batch.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STALE_DAYS = 7;
const DEFAULT_BATCH = 50;

// ─── Hours parsing ────────────────────────────────────────────────────────────

interface Period {
  day: number;
  open: string;
  close: string;
}

/**
 * Parse Google Places API (New) currentOpeningHours.periods into our storage format.
 * Google returns: { open: { day, hour, minute }, close: { day, hour, minute } }
 * We store:       { day: 0-6, open: "HH:MM", close: "HH:MM" }
 *
 * A null close means the venue is open 24h that day — we store close: "23:59".
 */
function parsePeriods(periods: any[]): Period[] {
  if (!Array.isArray(periods)) return [];
  return periods.map((p: any) => {
    const openDay = p.open?.day ?? 0;
    const openH   = String(p.open?.hour   ?? 0).padStart(2, '0');
    const openM   = String(p.open?.minute  ?? 0).padStart(2, '0');
    const closeH  = p.close ? String(p.close.hour   ?? 23).padStart(2, '0') : '23';
    const closeM  = p.close ? String(p.close.minute ?? 59).padStart(2, '0') : '59';
    return {
      day:   openDay,
      open:  `${openH}:${openM}`,
      close: `${closeH}:${closeM}`,
    };
  });
}

// ─── Places API fetch ─────────────────────────────────────────────────────────

async function fetchHoursFromPlaces(
  googlePlaceId: string,
  apiKey: string,
): Promise<{ periods: Period[]; isTemporarilyClosed: boolean } | null> {
  const placeRef = googlePlaceId.startsWith('places/')
    ? googlePlaceId
    : `places/${googlePlaceId}`;

  const url = `https://places.googleapis.com/v1/${placeRef}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      // currentOpeningHours.periods gives structured data.
      // weekdayDescriptions gives human-readable strings — we do NOT store those.
      'X-Goog-FieldMask': 'currentOpeningHours.periods,currentOpeningHours.openNow,businessStatus',
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.warn(`[refresh-venue-hours] Places API ${resp.status} for ${googlePlaceId}: ${body}`);
    return null;
  }

  const data = await resp.json();
  const periods = parsePeriods(data.currentOpeningHours?.periods || []);
  const isTemporarilyClosed = data.businessStatus === 'TEMPORARILY_CLOSED';

  return { periods, isTemporarilyClosed };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    let body: { place_ids?: string[]; batch_size?: number } = {};
    try { body = await req.json(); } catch { /* no body = use defaults */ }

    const batchSize = body.batch_size ?? DEFAULT_BATCH;
    const now = new Date().toISOString();

    // Determine which venues to refresh
    let rows: { google_place_id: string }[] = [];

    if (body.place_ids && body.place_ids.length > 0) {
      // Targeted refresh — caller specified exact IDs
      rows = body.place_ids.map((id) => ({ google_place_id: id }));
    } else {
      // Batch refresh — pick the most stale venues first
      const staleThreshold = new Date(
        Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data, error } = await supabase
        .from('venues')
        .select('google_place_id')
        .or(`hours_last_updated.is.null,hours_last_updated.lt.${staleThreshold}`)
        .order('hours_last_updated', { ascending: true, nullsFirst: true })
        .limit(batchSize);

      if (error) throw error;
      rows = data ?? [];
    }

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No stale venues to refresh', updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[refresh-venue-hours] Processing ${rows.length} venues`);

    let updated = 0;
    let failed  = 0;

    for (const row of rows) {
      try {
        const result = await fetchHoursFromPlaces(row.google_place_id, apiKey);
        if (!result) { failed++; continue; }

        const { error: upsertError } = await supabase
          .from('venues')
          .update({
            opening_hours:         result.periods,
            is_temporarily_closed: result.isTemporarilyClosed,
            hours_last_updated:    now,
          })
          .eq('google_place_id', row.google_place_id);

        if (upsertError) {
          console.warn(`[refresh-venue-hours] DB update failed for ${row.google_place_id}:`, upsertError.message);
          failed++;
        } else {
          updated++;
        }
      } catch (err) {
        console.warn(`[refresh-venue-hours] Error for ${row.google_place_id}:`, err);
        failed++;
      }
    }

    console.log(`[refresh-venue-hours] Done — updated: ${updated}, failed: ${failed}`);

    return new Response(
      JSON.stringify({ updated, failed, total: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[refresh-venue-hours] Fatal:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
