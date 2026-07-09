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

Deno.serve(async (req) => {
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
  } catch {
    // DB check failed — fall through to Google
  }

  // ── Step 2: Fetch photo resource names from Google ─────────────────────────
  const allowed = await checkAndLog(sb, 'photos', cleanId, max_photos + 1);
  if (!allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Monthly API cap reached', photo_urls: [] }), {
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
      return new Response(JSON.stringify({ success: false, error: 'Google Places API error', photo_urls: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await detailsResp.json();
    const totalAvailable = (data.photos || []).length;
    const photoResources = ((data.photos || []) as any[]).slice(0, max_photos);

    if (photoResources.length === 0) {
      return new Response(JSON.stringify({ success: true, photo_urls: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 3: Fetch bytes + upload to Supabase Storage ──────────────────
    const photoUrls = await fetchWithConcurrency(
      photoResources.map((photo: any, index: number) => ({ photo, index })),
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

          return urlData.publicUrl;
        } catch (err: any) {
          console.error(`Error processing photo ${index} for ${cleanId}:`, err?.message);
          return null;
        }
      },
      3,
    );

    const validUrls = photoUrls.filter((url): url is string => url !== null);
    console.log(`📸 Stored ${validUrls.length}/${photoResources.length} photos for ${cleanId}`);

    // ── Step 4: Write permanent URLs to DB (fire-and-forget) ──────────────
    if (validUrls.length > 0) {
      const { error: updateError } = await sb.from('venues')
        .update({ photo_urls: validUrls, photos_complete: validUrls.length >= totalAvailable, enriched: true })
        .eq('google_place_id', cleanId);
      if (updateError) {
        console.error(`Failed to persist photo_urls for ${cleanId}:`, updateError.message);
      }
    }

    return new Response(JSON.stringify({ success: true, photo_urls: validUrls }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('get-place-photos error:', error?.message);
    return new Response(JSON.stringify({ success: false, error: 'Internal error', photo_urls: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
