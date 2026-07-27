import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAndPersistPhotos } from '../_shared/venuePhotos.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

  // ── Step 2: Fetch photos from Google (or persist empty/cap state) ──────────
  const result = await fetchAndPersistPhotos(sb, apiKey, cleanId, max_photos);

  if (result.capped) {
    return new Response(JSON.stringify(result), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!result.success) {
    return new Response(JSON.stringify(result), {
      status: result.error === 'Internal error' ? 500 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
