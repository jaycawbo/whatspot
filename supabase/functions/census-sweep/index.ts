/**
 * census-sweep — new-venue sweep (issue #382)
 *
 * Finds Toronto venues WhatSpot doesn't have yet, so the "New" tab (<= 100 reviews at first
 * sighting, first seen in the last 6 months) has something to show. Designed to cost $0 by only
 * using Google allowances nothing else of ours consumes. Phases per quarter:
 *
 *   discover  Text Search, IDs-only field mask (free, unlimited) over each venue_sweep_grid square
 *             for restaurant / bar / cafe. IDs not already in venues go to venue_sweep_candidates.
 *   locate    Place Details Essentials (id, location, types; ~10,000 free/month) per candidate.
 *             Candidates that could never show in the feed (isFeedVenue) are dropped.
 *   fill      Text Search Enterprise (~1,000 free/month, up to 20 full venues per call) over the
 *             squares with the most pending candidates, downtown first. Returned venues are
 *             upserted with full data; triggers flag chains (#386) and set
 *             review_count_at_ingestion. Candidates not returned get one retry on a ~150 m
 *             rectangle around them, then are marked unreachable.
 *
 * Calls:
 *   POST {}                      quarterly cron: advance the current quarter's run one batch
 *   POST { mode: "drip" }        daily cron: one batch of locate/fill for the oldest unfinished run
 *   POST { dry_run: true }       no Google calls, no secret: grid size + run state
 *   Optional: quarter_key, max_cells, max_locate, max_calls
 * Live runs require the x-sweep-secret header to match the SWEEP_SECRET edge secret.
 *
 * Spend caps (api_call_log, per month): new_venue_ids 60,000 (free; loop guard),
 * new_venue_locate 9,000, new_venue_text 800 (leaves free headroom for the feed/search fallbacks).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAndLog } from '../_shared/apiCallLog.ts';
import { isFeedVenue } from '../_shared/venueTypes.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sweep-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const GRID_LAT_MIN = 43.580;
const GRID_LNG_MIN = -79.640;
const STEP = 0.005;
const HALF_STEP = STEP / 2;         // squares are 0.005° on a side, centred on each grid point
const NEAR = 0.0007;                // ~150 m retry rectangle around a single candidate
const SWEEP_TYPES = ['restaurant', 'bar', 'cafe'];
const MAX_PAGES = 3;                // Text Search returns up to 60 results (3 pages of 20)
const DEFAULT_MAX_CELLS = 30;
const DEFAULT_MAX_LOCATE = 150;
const DEFAULT_MAX_CALLS = 25;       // fill calls per batch; 25/day stays under the 800/month cap
const LOCK_MINUTES = 10;

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const IDS_ONLY_FIELD_MASK = 'places.id,nextPageToken';
const LOCATE_FIELD_MASK = 'id,location,types';
const FILL_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.businessStatus,nextPageToken';

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

type Rect = { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } };
const rectAround = (lat: number, lng: number, half: number): Rect => ({
  low: { latitude: lat - half, longitude: lng - half },
  high: { latitude: lat + half, longitude: lng + half },
});

function currentQuarterKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}

const gridKey = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;
function nearestGridPoint(lat: number, lng: number) {
  const gLat = GRID_LAT_MIN + Math.round((lat - GRID_LAT_MIN) / STEP) * STEP;
  const gLng = GRID_LNG_MIN + Math.round((lng - GRID_LNG_MIN) / STEP) * STEP;
  return gridKey(gLat, gLng);
}

async function textSearch(apiKey: string, fieldMask: string, type: string, rect: Rect, pageToken?: string) {
  const res = await fetch(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
    body: JSON.stringify({
      textQuery: type,
      includedType: type,
      strictTypeFiltering: true,
      pageSize: 20,
      locationRestriction: { rectangle: rect },
      ...(pageToken ? { pageToken } : {}),
    }),
  });
  if (!res.ok) {
    console.warn(`[census-sweep] Text Search ${res.status} (${type}):`, (await res.text()).slice(0, 200));
    return { places: [] as any[], next: undefined as string | undefined };
  }
  const data = await res.json();
  return { places: (data.places ?? []) as any[], next: data.nextPageToken as string | undefined };
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

  let body: { dry_run?: boolean; mode?: string; quarter_key?: string; max_cells?: number; max_locate?: number; max_calls?: number } = {};
  try { body = await req.json(); } catch { /* cron may send {} */ }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (body.dry_run) {
    const quarterKey = body.quarter_key ?? currentQuarterKey();
    const { count: cells } = await sb.from('venue_sweep_grid').select('*', { count: 'exact', head: true });
    const { data: state } = await sb.from('venue_sweep_state').select('*').eq('quarter_key', quarterKey).maybeSingle();
    return json({ dry_run: true, quarter_key: quarterKey, grid_cells: cells, state, google_calls: 0 });
  }

  const secret = Deno.env.get('SWEEP_SECRET');
  if (!secret || req.headers.get('x-sweep-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) return json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, 500);

  // Which run to work on: drip = the oldest run still locating/filling; otherwise this quarter's.
  let quarterKey = body.quarter_key ?? currentQuarterKey();
  if (body.mode === 'drip' && !body.quarter_key) {
    const { data: open } = await sb.from('venue_sweep_state')
      .select('quarter_key').in('phase', ['locate', 'fill']).order('started_at').limit(1).maybeSingle();
    if (!open) return json({ mode: 'drip', message: 'nothing to locate or fill' });
    quarterKey = open.quarter_key;
  } else {
    await sb.from('venue_sweep_state').upsert({ quarter_key: quarterKey }, { onConflict: 'quarter_key', ignoreDuplicates: true });
  }

  // Short lock so overlapping cron calls can't double-process a run.
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

    // ── Discover (free: IDs-only Text Search) ────────────────────────────────
    if (claimed.phase === 'discover') {
      const maxCells = Math.min(body.max_cells ?? DEFAULT_MAX_CELLS, 200);
      const { data: cells } = await sb.from('venue_sweep_grid')
        .select('idx, lat, lng').gte('idx', claimed.next_cell).order('idx').limit(maxCells);

      if (!cells?.length) {
        await release({ phase: 'locate' });
        return json({ quarter_key: quarterKey, message: 'discovery complete', candidates: claimed.candidates });
      }

      const found = new Set<string>();
      let idCalls = 0;
      let blocked = false;
      outer: for (const { lat, lng } of cells) {
        for (const type of SWEEP_TYPES) {
          let pageToken: string | undefined;
          for (let page = 0; page < MAX_PAGES; page++) {
            if (!(await checkAndLog(sb, 'new_venue_ids', `${lat},${lng}`))) { blocked = true; break outer; }
            idCalls++;
            const { places, next } = await textSearch(apiKey, IDS_ONLY_FIELD_MASK, type, rectAround(lat, lng, HALF_STEP), pageToken);
            places.forEach((p) => p.id && found.add(p.id));
            if (!next) break;
            pageToken = next;
          }
        }
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

      const nextCell = blocked ? claimed.next_cell : cells[cells.length - 1].idx + 1;
      await release({ next_cell: nextCell, ids_seen: claimed.ids_seen + ids.length, candidates: claimed.candidates + fresh.length });
      return json({ quarter_key: quarterKey, phase: 'discover', cells: cells.length, id_calls: idCalls, ids_seen: ids.length, new_candidates: fresh.length, next_cell: nextCell, blocked });
    }

    // ── Locate (free: Place Details Essentials) ──────────────────────────────
    if (claimed.phase === 'locate') {
      const maxLocate = Math.min(body.max_locate ?? DEFAULT_MAX_LOCATE, 400);
      const { data: pending } = await sb.from('venue_sweep_candidates')
        .select('google_place_id').eq('quarter_key', quarterKey).is('located_at', null).is('fetched_at', null).limit(maxLocate);

      if (!pending?.length) {
        await release({ phase: 'fill' });
        return json({ quarter_key: quarterKey, message: 'locate complete' });
      }

      const { data: grid } = await sb.from('venue_sweep_grid').select('idx, lat, lng');
      const cellByKey = new Map((grid ?? []).map((g: any) => [gridKey(g.lat, g.lng), g.idx]));

      let calls = 0;
      let kept = 0;
      let dropped = 0;
      for (const { google_place_id: id } of pending) {
        if (!(await checkAndLog(sb, 'new_venue_locate', id))) break;
        calls++;
        const res = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
          headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': LOCATE_FIELD_MASK },
        });
        const stamp = new Date().toISOString();
        if (!res.ok) {
          await sb.from('venue_sweep_candidates').update({ located_at: stamp, fetched_at: stamp, outcome: 'locate_error' }).eq('google_place_id', id);
          continue;
        }
        const place = await res.json();
        const types: string[] = place.types ?? [];
        const lat = place.location?.latitude;
        const lng = place.location?.longitude;
        if (!isFeedVenue(types) || lat == null || lng == null) {
          dropped++;
          await sb.from('venue_sweep_candidates').update({ located_at: stamp, fetched_at: stamp, types, outcome: 'not_feed' }).eq('google_place_id', id);
          continue;
        }
        kept++;
        await sb.from('venue_sweep_candidates')
          .update({ located_at: stamp, lat, lng, types, cell_idx: cellByKey.get(nearestGridPoint(lat, lng)) ?? null })
          .eq('google_place_id', id);
      }

      await release();
      return json({ quarter_key: quarterKey, phase: 'locate', locate_calls: calls, kept, dropped, capped: calls < pending.length });
    }

    // ── Fill (free: Text Search Enterprise, drip) ────────────────────────────
    const maxCalls = Math.min(body.max_calls ?? DEFAULT_MAX_CALLS, 100);
    const { data: pendingRows } = await sb.from('venue_sweep_candidates')
      .select('google_place_id, lat, lng, types, cell_idx, attempts')
      .eq('quarter_key', quarterKey).is('fetched_at', null).not('located_at', 'is', null);
    const pending = (pendingRows ?? []) as any[];

    if (!pending.length) {
      await release({ phase: 'done', completed_at: new Date().toISOString() });
      return json({ quarter_key: quarterKey, message: 'sweep complete' });
    }

    const { data: grid } = await sb.from('venue_sweep_grid').select('idx, lat, lng');
    const gridByIdx = new Map((grid ?? []).map((g: any) => [g.idx, g]));
    const open = new Map(pending.map((c) => [c.google_place_id, c]));

    let calls = 0;
    let filled = 0;
    let blocked = false;

    // Upserts every returned venue and closes out any pending candidates among them.
    const absorb = async (places: any[]) => {
      const rows = places.filter((p) => p.id && p.businessStatus !== 'CLOSED_PERMANENTLY').map(toRow);
      if (rows.length) await sb.from('venues').upsert(rows, { onConflict: 'google_place_id', ignoreDuplicates: true });
      const stamp = new Date().toISOString();
      for (const p of places) {
        if (!open.has(p.id)) continue;
        open.delete(p.id);
        filled++;
        await sb.from('venue_sweep_candidates')
          .update({ fetched_at: stamp, outcome: p.businessStatus === 'CLOSED_PERMANENTLY' ? 'closed' : 'filled' })
          .eq('google_place_id', p.id);
      }
    };

    const search = async (type: string, rect: Rect, pages: number, stillNeeded: () => boolean) => {
      let pageToken: string | undefined;
      for (let page = 0; page < pages && stillNeeded(); page++) {
        if (calls >= maxCalls) return;
        if (!(await checkAndLog(sb, 'new_venue_text', `${type}@${rect.low.latitude.toFixed(4)},${rect.low.longitude.toFixed(4)}`))) { blocked = true; return; }
        calls++;
        const { places, next } = await textSearch(apiKey, FILL_FIELD_MASK, type, rect, pageToken);
        await absorb(places);
        if (!next) return;
        pageToken = next;
      }
    };

    while (calls < maxCalls && !blocked && open.size) {
      // Busiest square first among first-attempt candidates; then single-candidate retries.
      const firstTry = [...open.values()].filter((c) => c.attempts === 0 && c.cell_idx != null);
      if (firstTry.length) {
        const counts = new Map<number, number>();
        firstTry.forEach((c) => counts.set(c.cell_idx, (counts.get(c.cell_idx) ?? 0) + 1));
        const cellIdx = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const cell = gridByIdx.get(cellIdx);
        const inCell = () => firstTry.filter((c) => c.cell_idx === cellIdx && open.has(c.google_place_id));
        const types = SWEEP_TYPES.filter((t) => inCell().some((c) => (c.types ?? []).includes(t)));
        for (const type of types.length ? types : SWEEP_TYPES) {
          await search(type, rectAround(cell.lat, cell.lng, HALF_STEP), MAX_PAGES, () => inCell().length > 0);
          if (calls >= maxCalls || blocked) break;
        }
        if (calls >= maxCalls || blocked) break;
        // Square fully searched: anything left in it moves to a targeted retry.
        for (const c of inCell()) {
          c.attempts = 1;
          await sb.from('venue_sweep_candidates').update({ attempts: 1 }).eq('google_place_id', c.google_place_id);
        }
        continue;
      }

      const retry = [...open.values()].find((c) => c.attempts >= 1 || c.cell_idx == null);
      if (!retry) break;
      const type = SWEEP_TYPES.find((t) => (retry.types ?? []).includes(t)) ?? 'restaurant';
      const before = calls;
      await search(type, rectAround(retry.lat, retry.lng, NEAR), 1, () => open.has(retry.google_place_id));
      if (blocked || calls === before) break; // budget ran out before this retry was searched
      if (open.has(retry.google_place_id)) {
        open.delete(retry.google_place_id);
        await sb.from('venue_sweep_candidates')
          .update({ attempts: 2, fetched_at: new Date().toISOString(), outcome: 'unreachable' })
          .eq('google_place_id', retry.google_place_id);
      }
    }

    await release({ fetched: claimed.fetched + filled });
    return json({ quarter_key: quarterKey, phase: 'fill', text_calls: calls, filled, remaining: open.size, blocked });
  } catch (err: any) {
    await release();
    console.error('[census-sweep] error:', err?.message);
    return json({ error: err?.message ?? 'unknown error' }, 500);
  }
});
