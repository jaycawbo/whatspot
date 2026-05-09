/**
 * placesSearch.js
 *
 * Cost-guarded Google Places API service for the DIRECT venue search path only (issue #127).
 *
 * Scope: autocomplete → Supabase reconciliation → session close.
 * Out of scope: the existing intent-search fallback in searchOrchestrator (untouched).
 *
 * ─── COST GUARDS ─────────────────────────────────────────────────────────────
 *
 * 1. Field masks are module-level constants enforced in the places-autocomplete edge function.
 * 2. A dev-time assertion fires once at import to catch SESSION_CLOSE_FIELD_MASK drift.
 * 3. Session token is required on every autocomplete call — skipped with console.error if absent.
 * 4. Minimum 2-character query enforced at the call site.
 * 5. Abandoned session tokens (>3 min, no selection) are discarded without a closing API call.
 * 6. The existing Places fallback for intent queries (recommend edge fn) is NOT touched here.
 *
 * ⚠️  DO NOT call places/{id}/photos/{name} from this module or anywhere in the direct search
 *     path. The Photos endpoint triggers Atmosphere billing (~$0.007/photo). Photos run on the
 *     quarterly cron only (refresh-venue-photos edge function).
 */

import { supabase } from '@/integrations/supabase/client';
import { rowToVenue } from '@/services/venueDataRouter';

// Minimum field mask to properly close a Places billing session.
// Do NOT reduce to `id` alone — IDs-only termination reverts all autocomplete
// requests in the session to per-request billing.
const SESSION_CLOSE_FIELD_MASK = 'id,displayName,formattedAddress,location,businessStatus';

// ─── Enrichment field guard (runs once at import in dev) ──────────────────────

const FORBIDDEN_ENRICHMENT_FIELDS = new Set([
  'rating', 'userRatingCount', 'reviews', 'photos',
  'currentOpeningHours', 'regularOpeningHours',
  'nationalPhoneNumber', 'internationalPhoneNumber',
  'websiteUri', 'editorialSummary', 'priceLevel',
  'currentSecondaryOpeningHours', 'regularSecondaryOpeningHours',
  'parkingOptions', 'paymentOptions',
  'servesBeer', 'servesWine', 'servesCocktails',
  'servesBreakfast', 'servesLunch', 'servesDinner', 'servesBrunch',
  'outdoorSeating', 'liveMusic', 'allowsDogs',
  'goodForGroups', 'goodForChildren',
  'reservable', 'delivery', 'takeout', 'dineIn',
]);

if (import.meta.env.DEV) {
  for (const segment of SESSION_CLOSE_FIELD_MASK.split(',')) {
    const leaf = segment.trim().split('.').pop();
    if (FORBIDDEN_ENRICHMENT_FIELDS.has(leaf)) {
      throw new Error(
        `[placesSearch] Enrichment field in SESSION_CLOSE_FIELD_MASK: "${segment}". ` +
        'This triggers additional billing.'
      );
    }
  }
}

// ─── Edge function helpers ────────────────────────────────────────────────────

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/places-autocomplete`;
const FN_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};

async function callEdgeFn(body) {
  const resp = await fetch(FN_URL, { method: 'POST', headers: FN_HEADERS, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('[placesSearch] edge fn error:', resp.status, text);
    return null;
  }
  return resp.json();
}

// ─── In-memory place ID cache ─────────────────────────────────────────────────
// Avoids redundant Supabase lookups when the same venue is selected again.
// Cleared on page reload; Supabase is the authoritative source across reloads.

const placeIdCache = new Map();

// ─── Autocomplete ─────────────────────────────────────────────────────────────

/**
 * Call the Places Autocomplete API via the server-side proxy.
 * Billed per session (not per keystroke) when session token + closeSession are used correctly.
 */
export async function autocompleteVenues(query, sessionToken, lat, lng) {
  if (!sessionToken) {
    console.error('[placesSearch] autocompleteVenues called without session token — skipping');
    return [];
  }
  if (!query || query.length < 2) return [];

  const data = await callEdgeFn({ mode: 'autocomplete', query, sessionToken, lat, lng });
  return data?.suggestions ?? [];
}

// ─── Session close ────────────────────────────────────────────────────────────

// Required after every autocomplete selection — terminates the billing session so
// all autocomplete keystrokes are charged as one session event, not per-request.
async function closeSession(placeId, sessionToken) {
  return callEdgeFn({ mode: 'close_session', placeId, sessionToken });
}

// ─── Venue selection resolution ───────────────────────────────────────────────

/**
 * Resolve a selected autocomplete suggestion to a venue object.
 *
 * Resolution order:
 *   1. In-memory cache → skip DB, still close the billing session
 *   2. Supabase venues table → serve from DB; close session
 *   3. Place Details (session close) → transient venue; write to pending_venues for review
 */
export async function resolveVenueSelection(placeId, sessionToken) {
  if (!placeId) return null;

  if (placeIdCache.has(placeId)) {
    if (sessionToken) await closeSession(placeId, sessionToken);
    return { venue: placeIdCache.get(placeId) };
  }

  try {
    const { data } = await supabase
      .from('venues')
      .select('google_place_id,name,address,lat,lng,rating,review_count,price_level,photo_url,venue_types,neighbourhood,phone,website,ai_description,opening_hours,is_temporarily_closed')
      .eq('google_place_id', placeId)
      .maybeSingle();

    if (data) {
      const venue = rowToVenue(data);
      placeIdCache.set(placeId, venue);
      if (sessionToken) await closeSession(placeId, sessionToken);
      return { venue };
    }
  } catch { /* fall through to Place Details */ }

  // Not in Supabase — Place Details closes the session and provides transient display data.
  const details = sessionToken ? await closeSession(placeId, sessionToken) : null;

  const displayName =
    (typeof details?.displayName === 'object' ? details.displayName?.text : details?.displayName) ?? '';

  const transientVenue = {
    place_id: placeId,
    google_place_id: placeId,
    name: displayName,
    address: details?.formattedAddress ?? '',
    lat: details?.location?.latitude ?? null,
    lon: details?.location?.longitude ?? null,
    data_source: 'places_pending',
  };

  if (details) {
    supabase.from('pending_venues').upsert(
      {
        google_place_id: placeId,
        display_name: displayName,
        formatted_address: details.formattedAddress ?? '',
        lat: details.location?.latitude ?? null,
        lng: details.location?.longitude ?? null,
        business_status: details.businessStatus ?? null,
      },
      { onConflict: 'google_place_id' }
    ).catch(() => {});
  }

  return { venue: transientVenue };
}
