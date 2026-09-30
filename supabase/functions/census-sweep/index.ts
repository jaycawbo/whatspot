/**
 * census-sweep — quarterly new-venue sweep (issue #382)
 *
 * Finds Toronto venues WhatSpot doesn't have yet, so the "New" tab (<= 100 reviews at first
 * sighting, first seen in the last 6 months) has something to show. Two phases per quarter:
 *
 *   discover (free):  Google Text Search with an IDs-only field mask ($0, unlimited) over each
 *                     square in venue_sweep_grid, for restaurant / bar / cafe. IDs not already in
 *                     venues are queued in venue_sweep_candidates.
 *   fetch (paid):     Place Details (~$0.02, Enterprise fields) for queued IDs only, upserted into
 *                     venues. Triggers flag chains (#386) and record review_count_at_ingestion.
 *
 * Runs in batches from pg_cron (see 20260929000000_new_venue_sweep.sql); progress lives in
 * venue_sweep_state, so each call picks up where the last stopped and finished quarters no-op.
 *
 * POST { dry_run?, quarter_key?, max_cells?, max_fetch? }
 *   dry_run:     no Google calls, no secret needed — returns grid size and the quarter's state.
 *   quarter_key: e.g. "2026-Q4"; defaults to the current quarter.
 * Live runs require the x-sweep-secret header to match the SWEEP_SECRET edge secret.
 *
 * Spend caps (api_call_log): new_venue_details 3,000/month; new_venue_ids 60,000/month (free
 * calls, capped only to stop a runaway loop).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAndLog } from '../_shared/apiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sweep-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const HALF_STEP = 0.0025;           // grid squares are 0.005° on a side, centred on each grid point
const SWEEP_TYPES = ['restaurant', 'bar', 'cafe'];
const MAX_PAGES = 3;                // Text Search returns up to 60 results (3 pages of 20)
const DEFAULT_MAX_CELLS = 30;       // ~4 ID calls + cap checks per square; keeps a batch inside the edge timeout
const DEFAULT_MAX_FETCH = 100;
const LOCK_MINUTES = 10;

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
// IDs only (+ the page token) keeps discovery on the free "Text Search Essentials (IDs Only)" SKU.
const IDS_ONLY_FIELD_MASK = 'places.id,nextPageToken';
const DETAILS_FIELD_MASK = 'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,types,businessStatus';

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function currentQuarterKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}

async function searchIds(apiKey: string, lat: number, lng: number, type: string, pageToken?: string) {
  const res = await fetch(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': IDS_ONLY_FIELD_MASK },
    body: JSON.stringify({
      textQuery: type,
      includedType: type,
      strictTypeFiltering: true,
      pageSize: 20,
      locationRestriction: {
        rectangle: {
          low: { latitude: lat - HALF_STEP, longitude: lng - HALF_STEP },
          high: { latitude: lat + HALF_STEP, longitude: lng + HALF_STEP },
        },
      },
      ...(pageToken ? { pageToken } : {}),
    }),
  });
  if (!res.ok) {
    console.warn(`[census-sweep] Text Search ${res.status} for ${type} at ${lat},${lng}:`, (await res.text()).slice(0, 200));
    return { ids: [] as string[], next: undefined };
  }
  const data = await res.json();
  return {
    ids: (data.places ?? []).map((p: any) => p.id).filter(Boolean) as string[],
    next: data.nextPageToken as string | undefined,
  };
}

async function fetchDetails(apiKey: string, placeId: string) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
  });
  if (!res.ok) return null;
  return await res.json();
}

function toRow(place: any): Record<string, any> {
  const priceRaw = place.priceLevel;
  const priceInt = priceRaw == null ? null : typeof priceRaw === 'number' ? priceRaw : (PRICE_LEVEL_MAP[priceRaw] ?? null);
  return {
    google_place_id: place.id,
    name:            place.displayName?.text ?? 'Unknown',
    address:         place.formattedAddress ?? '',
    lat:             place.location?.latitude ?? null,
    lng:             place.location?.longitude ?? null,
    rating:          place.rating ?? null,
    review_count:    place.userRatingCount ?? null,
    price_level:     priceInt,
    venue_types:     place.types ?? [],
    business_status: place.businessStatus ?? null,
    enriched:        false,
    photos_complete: false,
    photo_urls:      [],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: { dry_run?: boolean; quarter_key?: string; max_cells?: number; max_fetch?: number } = {};
  try { body = await req.json(); } catch { /* cron sends {} */ }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const quarterKey = body.quarter_key ?? currentQuarterKey();

  if (body.dry_run) {
    const { count: cells } = await sb.from('venue_sweep_grid').select('*', { count: 'exact', head: true });
    const { data: state } = await sb.from('venue_sweep_state').select('*').eq('quarter_key', quarterKey).maybeSingle();
    return json({ dry_run: true, quarter_key: quarterKey, grid_cells: cells, state, google_calls: 0 });
  }

  const secret = Deno.env.get('SWEEP_SECRET');
  if (!secret || req.headers.get('x-sweep-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) return json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, 500);

  // State row for this quarter, then a short lock so overlapping cron calls can't double-process.
  await sb.from('venue_sweep_state').upsert({ quarter_key: quarterKey }, { onConflict: 'quarter_key', ignoreDuplicates: true });
  const now = new Date();
  const { data: claimed } = await sb.from('venue_sweep_state')
    .update({ locked_until: new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() })
    .eq('quarter_key', quarterKey)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select()
    .maybeSingle();
  if (!claimed) return json({ quarter_key: quarterKey, message: 'another batch is running' });

  const release = (patch: Record<string, any> = {}) =>
    sb.from('venue_sweep_state').update({ ...patch, locked_until: null }).eq('quarter_key', quarterKey);

  try {
    if (claimed.phase === 'done') {
      await release();
      return json({ quarter_key: quarterKey, message: 'sweep already complete for this quarter' });
    }

    // ── Discover (free) ──────────────────────────────────────────────────────
    if (claimed.phase === 'discover') {
      const maxCells = Math.min(body.max_cells ?? DEFAULT_MAX_CELLS, 200);
      const { data: cells } = await sb.from('venue_sweep_grid')
        .select('idx, lat, lng').gte('idx', claimed.next_cell).order('idx').limit(maxCells);

      if (!cells?.length) {
        await release({ phase: 'fetch' });
        return json({ quarter_key: quarterKey, message: 'discovery complete', candidates: claimed.candidates });
      }

      const found = new Set<string>();
      let idCalls = 0;
      let blocked = false;
      for (const { lat, lng } of cells) {
        for (const type of SWEEP_TYPES) {
          let pageToken: string | undefined;
          for (let page = 0; page < MAX_PAGES; page++) {
            if (!(await checkAndLog(sb, 'new_venue_ids', `${lat},${lng}`))) { blocked = true; break; }
            idCalls++;
            const { ids, next } = await searchIds(apiKey, lat, lng, type, pageToken);
            ids.forEach((id) => found.add(id));
            if (!next) break;
            pageToken = next;
          }
          if (blocked) break;
        }
        if (blocked) break;
      }

      // Keep only IDs we don't already have (in venues, removed or not, or already queued).
      const ids = [...found];
      const known = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const [{ data: v }, { data: c }] = await Promise.all([
          sb.from('venues').select('google_place_id').in('google_place_id', chunk),
          sb.from('venue_sweep_candidates').select('google_place_id').in('google_place_id', chunk),
        ]);
        (v ?? []).forEach((r: any) => known.add(r.google_place_id));
        (c ?? []).forEach((r: any) => known.add(r.google_place_id));
      }
      const fresh = ids.filter((id) => !known.has(id));
      if (fresh.length) {
        await sb.from('venue_sweep_candidates')
          .upsert(fresh.map((id) => ({ google_place_id: id, quarter_key: quarterKey })), { onConflict: 'google_place_id', ignoreDuplicates: true });
      }

      const lastIdx = cells[cells.length - 1].idx;
      await release({
        next_cell: blocked ? claimed.next_cell : lastIdx + 1,
        ids_seen: claimed.ids_seen + ids.length,
        candidates: claimed.candidates + fresh.length,
      });
      return json({ quarter_key: quarterKey, phase: 'discover', cells: cells.length, id_calls: idCalls, ids_seen: ids.length, new_candidates: fresh.length, next_cell: blocked ? claimed.next_cell : lastIdx + 1, blocked });
    }

    // ── Fetch (paid) ─────────────────────────────────────────────────────────
    if (!claimed.fetch_approved) {
      await release();
      return json({ quarter_key: quarterKey, message: 'awaiting approval to fetch', candidates: claimed.candidates });
    }

    const maxFetch = Math.min(body.max_fetch ?? DEFAULT_MAX_FETCH, 300);
    const { data: pending } = await sb.from('venue_sweep_candidates')
      .select('google_place_id').eq('quarter_key', quarterKey).is('fetched_at', null).limit(maxFetch);

    if (!pending?.length) {
      await release({ phase: 'done', completed_at: new Date().toISOString() });
      return json({ quarter_key: quarterKey, message: 'sweep complete', fetched: claimed.fetched });
    }

    let fetched = 0;
    let added = 0;
    for (const { google_place_id: id } of pending) {
      if (!(await checkAndLog(sb, 'new_venue_details', id))) break;
      fetched++;
      const place = await fetchDetails(apiKey, id);
      let outcome = 'error';
      if (place?.id) {
        if (place.businessStatus === 'CLOSED_PERMANENTLY') {
          outcome = 'closed';
        } else {
          const { error } = await sb.from('venues').upsert([toRow(place)], { onConflict: 'google_place_id', ignoreDuplicates: true });
          outcome = error ? 'insert_error' : 'added';
          if (!error) added++;
        }
      }
      await sb.from('venue_sweep_candidates').update({ fetched_at: new Date().toISOString(), outcome }).eq('google_place_id', id);
    }

    await release({ fetched: claimed.fetched + fetched });
    return json({ quarter_key: quarterKey, phase: 'fetch', details_calls: fetched, venues_added: added, capped: fetched < pending.length });
  } catch (err: any) {
    await release();
    console.error('[census-sweep] error:', err?.message);
    return json({ error: err?.message ?? 'unknown error' }, 500);
  }
});
