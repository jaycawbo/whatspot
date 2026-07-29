import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAndLog } from '../_shared/apiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function fetchWithConcurrency<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 3): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];

  async function processNext() {
    if (queue.length === 0) return;
    const item = queue.shift()!;
    const result = await fn(item);
    results.push(result);
    await processNext();
  }

  await Promise.all(Array(limit).fill(null).map(() => processNext()));
  return results;
}

// ── Pure decision logic (net-new resume/merge) — exported for unit testing ──

/** How many more photos are needed to reach maxPhotos, given what's already stored. */
export function planPhotoFetch(existingCount: number, maxPhotos: number): number {
  return Math.max(0, maxPhotos - existingCount);
}

/** The net-new slice of Google's photo list — resumes at existingCount, never re-requests earlier photos. */
export function selectNetNewPhotos<T>(googlePhotos: T[], existingCount: number, maxPhotos: number): T[] {
  return googlePhotos.slice(existingCount, maxPhotos);
}

/** Merges newly-fetched photos onto existing ones (never overwrites) and derives the completeness flag. */
export function mergeFetchedPhotos(
  existingPhotoUrls: string[],
  fetched: ({ index: number; url: string } | null)[],
  maxPhotos: number,
  totalAvailable: number,
): { mergedUrls: string[]; photosComplete: boolean } {
  const newValid = fetched
    .filter((r): r is { index: number; url: string } => r !== null)
    .sort((a, b) => a.index - b.index)
    .map((r) => r.url);

  const mergedUrls = [...existingPhotoUrls, ...newValid];

  return {
    mergedUrls,
    photosComplete: mergedUrls.length >= maxPhotos || mergedUrls.length >= totalAvailable,
  };
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { place_id, max_photos = 4 } = await req.json();

  if (!place_id) {
    return new Response(JSON.stringify({ error: 'place_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Google Places API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const cleanId = place_id.replace(/^places\//, '');

  // ── Step 1: Cache-first — return stored URLs if photos are complete ────────
  let existingPhotoUrls: string[] = [];
  try {
    const { data: cached } = await sb
      .from('venues')
      .select('photo_urls, photos_complete')
      .eq('google_place_id', cleanId)
      .maybeSingle();

    if (cached?.photos_complete && cached?.photo_urls?.length) {
      console.log(`📸 Cache hit for ${cleanId} — ${cached.photo_urls.length} photos`);
      return new Response(JSON.stringify({ success: true, photo_urls: cached.photo_urls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    existingPhotoUrls = cached?.photo_urls || [];
  } catch {
    // DB check failed — fall through to Google
  }

  // Net-new only: only fetch what's missing to reach max_photos, resuming from
  // where we left off. Never re-request/re-download photos already stored.
  const existingCount = existingPhotoUrls.length;
  const delta = planPhotoFetch(existingCount, max_photos);

  if (delta <= 0) {
    return new Response(JSON.stringify({ success: true, photo_urls: existingPhotoUrls }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Step 2: Fetch photo resource names from Google ─────────────────────────
  const allowed = await checkAndLog(sb, 'photos', cleanId, delta + 1);
  if (!allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Monthly API cap reached', photo_urls: existingPhotoUrls }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const placeRef = cleanId.startsWith('places/') ? cleanId : `places/${cleanId}`;
    const detailsResp = await fetch(`https://places.googleapis.com/v1/${placeRef}?fields=photos`, {
      headers: { 'X-Goog-Api-Key': apiKey },
    });

    if (!detailsResp.ok) {
      console.error(`Google Places error ${detailsResp.status} for ${cleanId}`);
      return new Response(JSON.stringify({ success: false, error: 'Google Places API error', photo_urls: existingPhotoUrls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await detailsResp.json();
    const totalAvailable = (data.photos || []).length;
    // Resume from existingCount — this is the net-new slice, never re-fetching
    // photos already downloaded.
    const photoResources = selectNetNewPhotos((data.photos || []) as any[], existingCount, max_photos);

    if (photoResources.length === 0) {
      // Google has nothing beyond what we already have — genuinely complete.
      const { error: updateError } = await sb.from('venues')
        .update({ photos_complete: true, photos_fetched_count: existingCount })
        .eq('google_place_id', cleanId);
      if (updateError) {
        console.error(`Failed to persist empty-photos state for ${cleanId}:`, updateError.message);
      }
      return new Response(JSON.stringify({ success: true, photo_urls: existingPhotoUrls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 3: Fetch bytes + upload to Supabase Storage ──────────────────
    const fetched = await fetchWithConcurrency(
      photoResources.map((photo: any, i: number) => ({ photo, index: existingCount + i })),
      async ({ photo, index }: { photo: any; index: number }) => {
        try {
          const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=800&skipHttpRedirect=false&key=${apiKey}`;
          const imgResp = await fetch(mediaUrl, { redirect: 'follow' });
          if (!imgResp.ok) {
            console.warn(`Media fetch failed (${imgResp.status}) for photo ${index} of ${cleanId}`);
            return null;
          }

          const imageBytes = await imgResp.arrayBuffer();
          const storagePath = `${cleanId}/${index}.jpg`;

          const { error: uploadError } = await sb.storage
            .from('venue-photos')
            .upload(storagePath, imageBytes, { contentType: 'image/jpeg', upsert: true });

          if (uploadError) {
            console.warn(`Storage upload failed for ${storagePath}:`, uploadError.message);
            return null;
          }

          const { data: urlData } = sb.storage
            .from('venue-photos')
            .getPublicUrl(storagePath);

          return { index, url: urlData.publicUrl };
        } catch (err: any) {
          console.error(`Error processing photo ${index} for ${cleanId}:`, err?.message);
          return null;
        }
      },
      3,
    );

    const fetchedCount = fetched.filter((r) => r !== null).length;
    console.log(`📸 Stored ${fetchedCount}/${photoResources.length} new photos for ${cleanId} (had ${existingCount})`);

    if (fetchedCount === 0) {
      // Nothing new landed — leave existing state untouched so the same delta
      // is retried (not skipped) on the next call.
      return new Response(JSON.stringify({ success: true, photo_urls: existingPhotoUrls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 4: Merge with existing and write permanent URLs to DB ────────
    const { mergedUrls, photosComplete } = mergeFetchedPhotos(existingPhotoUrls, fetched, max_photos, totalAvailable);
    const { error: updateError } = await sb.from('venues')
      .update({
        photo_urls: mergedUrls,
        photos_complete: photosComplete,
        photos_fetched_count: mergedUrls.length,
        enriched: true,
      })
      .eq('google_place_id', cleanId);
    if (updateError) {
      console.error(`Failed to persist photo_urls for ${cleanId}:`, updateError.message);
    }

    return new Response(JSON.stringify({ success: true, photo_urls: mergedUrls }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('get-place-photos error:', error?.message);
    return new Response(JSON.stringify({ success: false, error: 'Internal error', photo_urls: existingPhotoUrls }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
