import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAndLog } from '../_shared/apiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DINING_KEYS = [
  'dineIn', 'takeout', 'delivery', 'reservable',
  'servesBreakfast', 'servesLunch', 'servesDinner',
  'servesBeer', 'servesWine', 'servesVegetarianFood',
  'outdoorSeating', 'liveMusic', 'menuForChildren',
  'servesCocktails', 'servesDessert', 'servesCoffee',
  'goodForChildren', 'goodForGroups', 'goodForWatchingSports', 'allowsDogs',
];

const FIELD_MASK = [
  'displayName', 'formattedAddress', 'location',
  'rating', 'userRatingCount',
  'websiteUri', 'nationalPhoneNumber',
  'currentOpeningHours', 'regularOpeningHours',
  'priceLevel', 'editorialSummary', 'reviews', 'businessStatus',
  ...DINING_KEYS,
].join(',');

interface Period { day: number; open: string; close: string; }

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

function extractDiningAttrs(d: any): Record<string, boolean> | null {
  const attrs: Record<string, boolean> = {};
  for (const k of DINING_KEYS) {
    if (d[k] !== undefined) attrs[k] = Boolean(d[k]);
  }
  return Object.keys(attrs).length > 0 ? attrs : null;
}

function priceLevelToString(n: number | null | undefined): string | null {
  if (!n) return null;
  return '$'.repeat(Math.min(n, 4));
}

function triggerPhotosBackground(sb: SupabaseClient, googlePlaceId: string): void {
  sb.from('venues')
    .select('photos_complete')
    .eq('google_place_id', googlePlaceId)
    .maybeSingle()
    .then(({ data }: any) => {
      if (!data?.photos_complete) {
        sb.functions.invoke('get-place-photos', { body: { place_id: googlePlaceId } }).catch(() => {});
      }
    })
    .catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { place_id } = await req.json();
    if (!place_id) {
      return new Response(JSON.stringify({ error: 'place_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanId  = place_id.startsWith('places/') ? place_id.slice(7) : place_id;
    const placeRef = `places/${cleanId}`;

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. DB-first cache ──────────────────────────────────────────────────────
    const { data: row } = await sb
      .from('venues')
      .select('id, name, address, rating, review_count, website, phone, price_level, lat, lng, opening_hours, editorial_summary, dining_attributes, enriched')
      .eq('google_place_id', cleanId)
      .maybeSingle();

    if (row?.enriched) {
      const { data: reviewRows } = await sb
        .from('reviews')
        .select('author, rating, review_text, published_at')
        .eq('venue_id', row.id)
        .eq('source_platform', 'google')
        .order('published_at', { ascending: false })
        .limit(5);

      triggerPhotosBackground(sb, cleanId);

      return new Response(JSON.stringify({
        success: true,
        cached: true,
        data: {
          name:              row.name            || '',
          address:           row.address         || '',
          rating:            row.rating          || 0,
          review_count:      row.review_count    || 0,
          website:           row.website         || null,
          phone:             row.phone           || null,
          price_level:       priceLevelToString(row.price_level),
          business_status:   null,
          lat:               row.lat             || null,
          lon:               row.lng             || null,
          is_open_now:       null,
          opening_hours:     [],
          description:       row.editorial_summary || null,
          dining_attributes: row.dining_attributes || null,
          reviews: (reviewRows || []).map((r: any) => ({
            author: r.author,
            rating: r.rating,
            text:   r.review_text,
            time:   r.published_at,
          })),
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── 2. Spend guard ─────────────────────────────────────────────────────────
    const allowed = await checkAndLog(sb, 'enrich', cleanId);
    if (!allowed) {
      if (row) {
        return new Response(JSON.stringify({
          success: true,
          cached: true,
          data: {
            name:              row.name         || '',
            address:           row.address      || '',
            rating:            row.rating       || 0,
            review_count:      row.review_count || 0,
            website:           row.website      || null,
            phone:             row.phone        || null,
            price_level:       priceLevelToString(row.price_level),
            business_status:   null,
            lat:               row.lat          || null,
            lon:               row.lng          || null,
            is_open_now:       null,
            opening_hours:     [],
            description:       null,
            dining_attributes: null,
            reviews:           [],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'Monthly API cap reached' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Google Places API call ──────────────────────────────────────────────
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    const resp = await fetch(`https://places.googleapis.com/v1/${placeRef}`, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[google-places-details] API error:', resp.status, err);
      return new Response(
        JSON.stringify({ error: `Google Places API error: ${resp.status}`, details: err }),
        { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const d              = await resp.json();
    const now            = new Date().toISOString();
    const diningAttrs    = extractDiningAttrs(d);
    const regularPeriods = parsePeriods(d.regularOpeningHours?.periods || []);

    // ── 4. Write-back to venues ────────────────────────────────────────────────
    const venueUpdate: Record<string, any> = {
      phone:                d.nationalPhoneNumber     ?? null,
      website:              d.websiteUri              ?? null,
      price_level:          d.priceLevel              ?? null,
      editorial_summary:    d.editorialSummary?.text  ?? null,
      dining_attributes:    diningAttrs,
      enriched:             true,
      reviews_last_updated: now,
    };
    if (regularPeriods.length > 0) venueUpdate.regular_opening_hours = regularPeriods;

    await sb.from('venues').update(venueUpdate).eq('google_place_id', cleanId);

    // ── 5. Write reviews ───────────────────────────────────────────────────────
    if (row?.id && d.reviews?.length) {
      const inserts = (d.reviews as any[]).slice(0, 5).map((r) => ({
        venue_id:           row.id,
        source_platform:    'google',
        external_review_id: `google_${cleanId}_${r.publishTime ?? r.authorAttribution?.displayName ?? String(Math.random())}`,
        author:             r.authorAttribution?.displayName || 'Anonymous',
        rating:             r.rating                        ?? null,
        review_text:        r.text?.text                    ?? null,
        published_at:       r.publishTime                   ?? null,
      }));
      await sb.from('reviews').upsert(inserts, { onConflict: 'external_review_id', ignoreDuplicates: true });
    }

    // ── 6. Background photos ───────────────────────────────────────────────────
    triggerPhotosBackground(sb, cleanId);

    // ── 7. Response ────────────────────────────────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      data: {
        name:              d.displayName?.text     || '',
        address:           d.formattedAddress      || '',
        rating:            d.rating                || 0,
        review_count:      d.userRatingCount       || 0,
        website:           d.websiteUri            || null,
        phone:             d.nationalPhoneNumber   || null,
        price_level:       priceLevelToString(d.priceLevel),
        business_status:   d.businessStatus        || null,
        lat:               d.location?.latitude    || null,
        lon:               d.location?.longitude   || null,
        is_open_now:       d.currentOpeningHours?.openNow ?? null,
        opening_hours:     d.currentOpeningHours?.weekdayDescriptions || [],
        description:       d.editorialSummary?.text || null,
        dining_attributes: diningAttrs,
        reviews: ((d.reviews as any[]) || []).slice(0, 5).map((r) => ({
          author: r.authorAttribution?.displayName || 'Anonymous',
          rating: r.rating                         || 0,
          text:   r.text?.text                     || '',
          time:   r.publishTime                    || null,
        })),
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[google-places-details] Fatal:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
