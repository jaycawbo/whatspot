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

  const { place_id, max_photos = 4, debug = false } = await req.json();

  if (!place_id) {
    return new Response(JSON.stringify({ error: 'place_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const debugInfo: Record<string, unknown> = {
    placeId: place_id,
    placeDetailsUrl: null,
    placeDetailsStatus: null,
    placeDetailsBodySnippet: null,
    photoMediaUrl: null,
    photoMediaStatus: null,
    photoMediaLocation: null,
  };

  try {
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Google Places API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const placeResourceName = place_id;
    console.log('📸 GETPLACEPHOTOS - Incoming place_id:', place_id);

    const detailsUrl = `https://places.googleapis.com/v1/${placeResourceName}?fields=photos`;
    debugInfo.placeDetailsUrl = detailsUrl;

    const detailsResponse = await fetch(detailsUrl, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': apiKey },
    });

    debugInfo.placeDetailsStatus = detailsResponse.status;
    const responseText = await detailsResponse.text();
    const bodySnippet = responseText.substring(0, 300);
    debugInfo.placeDetailsBodySnippet = bodySnippet;

    if (!detailsResponse.ok) {
      console.error('❌ GETPLACEPHOTOS - Place Details Error:', responseText);
      return new Response(JSON.stringify({
        success: false,
        error: 'Google Places API error',
        debug: {
          googleRequestUrl: detailsUrl,
          httpMethod: 'GET',
          status: detailsResponse.status,
          responseBodySnippet: bodySnippet,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = JSON.parse(responseText);

    if (!data.photos || data.photos.length === 0) {
      return new Response(JSON.stringify({ success: true, photo_urls: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const photoResources = data.photos.slice(0, max_photos);

    let isFirstPhoto = true;
    const photoUrls = await fetchWithConcurrency(
      photoResources,
      async (photo: any) => {
        const photoName = photo.name;
        const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800`;

        if (isFirstPhoto) {
          debugInfo.photoMediaUrl = mediaUrl;
          isFirstPhoto = false;
        }

        try {
          const mediaResponse = await fetch(mediaUrl, {
            method: 'GET',
            headers: { 'X-Goog-Api-Key': apiKey },
            redirect: 'manual',
          });

          if (debugInfo.photoMediaStatus === null) {
            debugInfo.photoMediaStatus = mediaResponse.status;
          }

          if (mediaResponse.status === 302 || mediaResponse.status === 301) {
            const locationHeader = mediaResponse.headers.get('Location');
            if (debugInfo.photoMediaLocation === null) {
              debugInfo.photoMediaLocation = locationHeader;
            }
            return locationHeader;
          }

          if (mediaResponse.ok) {
            return mediaResponse.url;
          }

          console.warn('⚠️ Failed to fetch photo media:', mediaResponse.status);
          return null;
        } catch (error) {
          console.error('❌ Error fetching photo media:', error.message);
          return null;
        }
      },
      3,
    );

    const validPhotoUrls = photoUrls.filter((url) => url !== null);

    return new Response(JSON.stringify({
      success: true,
      photo_urls: validPhotoUrls,
      ...(debug && { debug: debugInfo }),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Error fetching place photos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Google Places API error',
      debug: {
        googleRequestUrl: debugInfo.placeDetailsUrl || 'N/A',
        httpMethod: 'GET',
        status: debugInfo.placeDetailsStatus || 'N/A',
        responseBodySnippet: debugInfo.placeDetailsBodySnippet || error.message,
        exceptionMessage: error.message,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
