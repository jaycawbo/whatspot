/**
 * refresh-venue-photos
 *
 * Enterprise + Atmosphere tier call — fetches photos only, completely isolated
 * from all other refresh functions. Never batched with rating, hours, or any
 * other field to avoid elevating cheaper calls into Atmosphere pricing.
 *
 * What it does per venue:
 *   1. Calls Places API (New) with fieldMask: photos
 *   2. Resolves the first photo reference into a durable media URL
 *   3. Updates venues.photo_url and venues.photos_last_updated
 *
 * Staleness window: 90 days (quarterly)
 *
 * Invocation:
 *   - pg_cron: quarterly, 1st of Jan/Apr/Jul/Oct at 5am UTC
 *   - Manual: POST with optional { place_ids?: string[], batch_size?: number }
 *   - NOT called from venueDataRouter — photos are never refreshed on-demand
 *     because the Atmosphere cost cannot be justified per-request.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STALE_DAYS    = 90;
const DEFAULT_BATCH = 50;

// ─── Places API fetch ─────────────────────────────────────────────────────────

async function fetchPhotoUrl(googlePlaceId: string, apiKey: string): Promise<string | null> {
  const placeRef = googlePlaceId.startsWith('places/')
    ? googlePlaceId
    : `places/${googlePlaceId}`;

  // Step 1: get photo references (photos field only — Atmosphere tier)
  const resp = await fetch(`https://places.googleapis.com/v1/${placeRef}`, {
    headers: {
      'X-Goog-Api-Key':   apiKey,
      'X-Goog-FieldMask': 'photos',
    },
  });

  if (!resp.ok) {
    console.warn(`[refresh-venue-photos] Places ${resp.status} for ${googlePlaceId}: ${await resp.text()}`);
    return null;
  }

  const data  = await resp.json();
  const photos = data.photos as any[] | undefined;
  if (!photos?.length) return null;

  // Step 2: resolve the first photo reference into a durable redirect URL.
  // The media endpoint returns a 302 to the actual CDN URL; we store the
  // resolved URL so the browser doesn't need a second round-trip with the key.
  const photoName = photos[0].name; // e.g. "places/{id}/photos/{ref}"
  const mediaUrl  = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&key=${apiKey}&skipHttpRedirect=false`;

  const mediaResp = await fetch(mediaUrl, { redirect: 'follow' });
  if (!mediaResp.ok) return null;

  // Return the final resolved URL (after redirect)
  return mediaResp.url || mediaUrl;
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
        .or(`photos_last_updated.is.null,photos_last_updated.lt.${staleThreshold}`)
        .order('photos_last_updated', { ascending: true, nullsFirst: true })
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

    console.log(`[refresh-venue-photos] Processing ${rows.length} venues`);
    let updated = 0, failed = 0;

    for (const row of rows) {
      try {
        const photoUrl = await fetchPhotoUrl(row.google_place_id, apiKey);
        // Even if no photo found, stamp photos_last_updated so we don't retry
        // this venue again until next quarter.
        const { error } = await supabase
          .from('venues')
          .update({
            ...(photoUrl ? { photo_url: photoUrl } : {}),
            photos_last_updated: now,
          })
          .eq('google_place_id', row.google_place_id);

        if (error) {
          console.warn(`[refresh-venue-photos] DB error for ${row.google_place_id}:`, error.message);
          failed++;
        } else {
          updated++;
        }
      } catch (err) {
        console.warn(`[refresh-venue-photos] Error for ${row.google_place_id}:`, err);
        failed++;
      }
    }

    console.log(`[refresh-venue-photos] Done — updated: ${updated}, failed: ${failed}`);
    return new Response(
      JSON.stringify({ updated, failed, total: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[refresh-venue-photos] Fatal:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
