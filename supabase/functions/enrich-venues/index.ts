/**
 * enrich-venues
 *
 * Batch-enriches unenriched venues by calling Google Places Details API.
 * Fetches phone, website, opening hours, and photos in a single API call per venue.
 * Photos are downloaded and stored permanently in Supabase Storage (venue-photos bucket).
 *
 * Usage:
 *   POST { batch_size?: number, dry_run?: boolean, place_ids?: string[] }
 *
 * Hard cap: never processes more than 100 venues per call regardless of batch_size.
 * Cost: ~$0.017/venue (Atmosphere tier — photos field included).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAndLog } from '../_shared/apiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_VENUES = 200;
const MAX_PHOTOS = 4;

const FIELD_MASK = [
  'nationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'currentOpeningHours',
  'businessStatus',
  'photos',
].join(',');

async function fetchWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = 3,
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  async function processNext() {
    if (queue.length === 0) return;
    const item = queue.shift()!;
    results.push(await fn(item));
    await processNext();
  }
  await Promise.all(Array(limit).fill(null).map(() => processNext()));
  return results;
}

async function fetchAndUploadPhoto(
  photoName: string,
  index: number,
  cleanId: string,
  apiKey: string,
  sb: ReturnType<typeof createClient>,
): Promise<string | null> {
  try {
    const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&skipHttpRedirect=false&key=${apiKey}`;
    const imgResp = await fetch(mediaUrl, { redirect: 'follow' });
    if (!imgResp.ok) {
      console.warn(`  Media fetch failed (${imgResp.status}) for photo ${index} of ${cleanId}`);
      return null;
    }
    const imageBytes = await imgResp.arrayBuffer();
    const storagePath = `${cleanId}/${index}.jpg`;
    const { error: uploadError } = await sb.storage
      .from('venue-photos')
      .upload(storagePath, imageBytes, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) {
      console.warn(`  Storage upload failed for ${storagePath}:`, uploadError.message);
      return null;
    }
    const { data: urlData } = sb.storage.from('venue-photos').getPublicUrl(storagePath);
    return urlData.publicUrl;
  } catch (err: any) {
    console.warn(`  Photo ${index} error for ${cleanId}:`, err?.message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const apiKey      = Deno.env.get('GOOGLE_PLACES_API_KEY');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  let body: { batch_size?: number; dry_run?: boolean; place_ids?: string[] } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const batchSize = Math.min(body.batch_size ?? 50, MAX_VENUES);
  const dryRun    = body.dry_run ?? false;

  // ── Dry run — count only, zero API calls ────────────────────────────────
  if (dryRun) {
    const { count, error } = await sb
      .from('venues')
      .select('*', { count: 'exact', head: true })
      .or('enriched.is.null,enriched.eq.false');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      dry_run: true,
      unenriched_count: count ?? 0,
      estimated_calls: Math.min(count ?? 0, batchSize),
      estimated_cost_usd: `$${(Math.min(count ?? 0, batchSize) * 0.017).toFixed(2)}`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── Live run — fetch venue IDs to process ───────────────────────────────
  let rows: { google_place_id: string }[] = [];

  if (body.place_ids?.length) {
    rows = body.place_ids.slice(0, MAX_VENUES).map((id) => ({ google_place_id: id }));
  } else {
    const { data, error } = await sb
      .from('venues')
      .select('google_place_id')
      .or('enriched.is.null,enriched.eq.false')
      .order('review_count', { ascending: false })
      .limit(batchSize);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    rows = data ?? [];
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({
      processed: 0, failed: 0, api_calls_used: 0, venues_enriched: 0,
      message: 'No unenriched venues found',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  console.log(`[enrich-venues] Starting — ${rows.length} venues, batch_size=${batchSize}`);

  let processed = 0;
  let failed    = 0;
  let apiCallsUsed = 0;

  for (const row of rows) {
    const cleanId = row.google_place_id.replace(/^places\//, '');
    const placeRef = `places/${cleanId}`;

    const allowed = await checkAndLog(sb, 'enrich', cleanId);
    if (!allowed) {
      console.warn(`[enrich-venues] Monthly cap reached — skipping ${cleanId}`);
      failed++;
      continue;
    }

    try {
      // ── Step 1: Google Places Details (single call, Atmosphere tier) ──
      const detailsResp = await fetch(
        `https://places.googleapis.com/v1/${placeRef}`,
        { headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK } },
      );
      apiCallsUsed++;

      if (!detailsResp.ok) {
        console.warn(`[enrich-venues] Places API ${detailsResp.status} for ${cleanId}`);
        failed++;
        continue;
      }

      const data = await detailsResp.json();

      // ── Step 2: Map detail fields ──────────────────────────────────────
      const updateRow: Record<string, any> = {
        phone:                   data.nationalPhoneNumber ?? null,
        website:                 data.websiteUri ?? null,
        regular_opening_hours:   data.regularOpeningHours ?? null,
        is_temporarily_closed:   data.businessStatus === 'TEMPORARILY_CLOSED',
        hours_last_updated:      new Date().toISOString(),
        rating_last_updated:     new Date().toISOString(),
        enriched:                true,
      };

      // ── Step 3: Photos — download bytes, upload to Supabase Storage ───
      const photoResources = ((data.photos || []) as any[]).slice(0, MAX_PHOTOS);
      if (photoResources.length > 0) {
        const photoUrls = await fetchWithConcurrency(
          photoResources.map((p: any, i: number) => ({ photo: p, index: i })),
          ({ photo, index }: { photo: any; index: number }) =>
            fetchAndUploadPhoto(photo.name, index, cleanId, apiKey, sb),
          3,
        );
        const validUrls = photoUrls.filter((u): u is string => u !== null);
        if (validUrls.length > 0) {
          updateRow.photo_urls      = validUrls;
          updateRow.photos_complete = true;
        }
        console.log(`[enrich-venues] ${cleanId} — ${validUrls.length}/${photoResources.length} photos stored`);
      } else {
        updateRow.photos_complete = true;
        console.log(`[enrich-venues] ${cleanId} — no photos returned by Google, marking complete`);
      }

      // ── Step 4: Upsert to DB ───────────────────────────────────────────
      const { error: dbError } = await sb
        .from('venues')
        .update(updateRow)
        .eq('google_place_id', cleanId);

      if (dbError) {
        console.warn(`[enrich-venues] DB error for ${cleanId}:`, dbError.message);
        failed++;
      } else {
        processed++;
        console.log(`[enrich-venues] ✓ ${cleanId} enriched (${processed}/${rows.length})`);
      }
    } catch (err: any) {
      console.warn(`[enrich-venues] Error for ${cleanId}:`, err?.message);
      failed++;
    }
  }

  const summary = { processed, failed, api_calls_used: apiCallsUsed, venues_enriched: processed };
  console.log(`[enrich-venues] Done —`, summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
