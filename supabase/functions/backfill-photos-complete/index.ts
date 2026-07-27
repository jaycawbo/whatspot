/**
 * backfill-photos-complete
 *
 * One-off/on-demand cleanup for venues left in an ambiguous photo state before
 * the #276/#277 fix: enriched = true (a Details call already succeeded) but
 * photos_complete is still false/null and photo_urls is empty. Pre-fix, this
 * could mean Google genuinely returned zero photos (never persisted) or that
 * photo downloads/uploads failed (a real retry candidate) — indistinguishable
 * from the DB alone. Re-running the (already-correct) fetchAndPersistPhotos
 * logic against this set resolves each venue correctly either way.
 *
 * Usage:
 *   POST { batch_size?: number, dry_run?: boolean, place_ids?: string[] }
 *
 * Shares the same 'photos' monthly cap as organic on-demand fetches
 * (supabase/functions/_shared/apiCallLog.ts) — this is fixing the same
 * population that cap already governs, not a separate budget.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAndPersistPhotos } from '../_shared/venuePhotos.ts';
import { currentMonthKey, monthlyCapFor } from '../_shared/apiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BATCH = 200;
const DEFAULT_BATCH = 50;
const MAX_PHOTOS = 4;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  let body: { batch_size?: number; dry_run?: boolean; place_ids?: string[] } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const batchSize = Math.min(body.batch_size ?? DEFAULT_BATCH, MAX_BATCH);
  const dryRun = body.dry_run ?? false;

  // ── Candidate selection ─────────────────────────────────────────────────
  let candidateIds: string[];

  if (body.place_ids?.length) {
    candidateIds = body.place_ids.slice(0, MAX_BATCH);
  } else {
    // photo_urls "empty" (null or zero-length) can't be expressed directly in a
    // PostgREST filter, so over-fetch on the cheap columns and filter client-side.
    const { data, error } = await sb
      .from('venues')
      .select('google_place_id, photo_urls')
      .eq('enriched', true)
      .or('photos_complete.is.null,photos_complete.eq.false')
      .order('review_count', { ascending: false, nullsFirst: false })
      .limit(batchSize * 4);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    candidateIds = (data ?? [])
      .filter((v) => !v.photo_urls?.length)
      .slice(0, batchSize)
      .map((v) => v.google_place_id);
  }

  // ── Dry run — report scope + cap headroom, zero API calls ──────────────
  if (dryRun) {
    const { count: capUsed, error: capError } = await sb
      .from('api_call_log')
      .select('*', { count: 'exact', head: true })
      .eq('service', 'google_places')
      .eq('call_type', 'photos')
      .eq('month_key', currentMonthKey());

    if (capError) {
      return new Response(JSON.stringify({ error: capError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const capTotal = monthlyCapFor('photos');
    const capRemaining = Math.max(0, capTotal - (capUsed ?? 0));

    return new Response(JSON.stringify({
      dry_run: true,
      candidate_count: candidateIds.length,
      cap_used: capUsed ?? 0,
      cap_total: capTotal,
      cap_remaining: capRemaining,
      would_process: Math.min(candidateIds.length, capRemaining),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (candidateIds.length === 0) {
    return new Response(JSON.stringify({
      processed: 0, marked_complete_no_photos: 0, photos_found: 0, capped_skipped: 0, failed: 0,
      message: 'No candidate venues found',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  console.log(`[backfill-photos-complete] Processing ${candidateIds.length} venues`);

  let markedCompleteNoPhotos = 0;
  let photosFound = 0;
  let cappedSkipped = 0;
  let failed = 0;

  for (const cleanId of candidateIds) {
    const result = await fetchAndPersistPhotos(sb, apiKey, cleanId, MAX_PHOTOS);
    if (result.capped) {
      cappedSkipped++;
    } else if (!result.success) {
      failed++;
    } else if (result.photo_urls.length > 0) {
      photosFound++;
    } else {
      markedCompleteNoPhotos++;
    }
  }

  console.log(`[backfill-photos-complete] Done — complete: ${markedCompleteNoPhotos}, found: ${photosFound}, capped: ${cappedSkipped}, failed: ${failed}`);

  return new Response(JSON.stringify({
    processed: candidateIds.length,
    marked_complete_no_photos: markedCompleteNoPhotos,
    photos_found: photosFound,
    capped_skipped: cappedSkipped,
    failed,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
