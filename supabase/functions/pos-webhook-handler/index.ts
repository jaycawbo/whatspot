import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-requested-with, content-type',
};

// ── HMAC verification ────────────────────────────────────────────────────────

async function verifyHmac(secret: string, body: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const expected = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return expected === signature.replace(/^sha256=/, '');
  } catch {
    return false;
  }
}

const SIG_HEADERS: Record<string, string> = {
  toast: 'toast-webhook-hmac-sha-256',
  lightspeed: 'x-lightspeed-signature',
  square: 'x-square-hmacsha256-signature',
};

// ── Provider floor-state interpretation ─────────────────────────────────────
// Returns true (available), false (not available), or null (can't determine).

function interpretToast(payload: Record<string, unknown>): boolean | null {
  if (Array.isArray(payload.tables)) {
    return (payload.tables as any[]).some(
      (t) => t.status === 'AVAILABLE' || t.status === 'OPEN' || t.status === 'NEEDS_SERVER',
    );
  }
  if (Array.isArray(payload.floorSections)) {
    return (payload.floorSections as any[]).some((s) =>
      Array.isArray(s.tables) && (s.tables as any[]).some((t) => t.status === 'AVAILABLE'),
    );
  }
  if (typeof payload.availability === 'boolean') return payload.availability;
  return null;
}

function interpretLightspeed(payload: Record<string, unknown>): boolean | null {
  const type = payload.type as string | undefined;
  if (type === 'table.opened') return true;
  if (type === 'table.closed') return false;
  if (typeof payload.tablesAvailable === 'number') return payload.tablesAvailable > 0;
  if (Array.isArray(payload.tables)) {
    return (payload.tables as any[]).some((t) => t.status === 'available' || t.available === true);
  }
  return null;
}

function interpretSquare(payload: Record<string, unknown>): boolean | null {
  const type = payload.type as string | undefined;
  if (type === 'table.updated') {
    const status = (payload as any)?.data?.object?.table?.status;
    if (status === 'AVAILABLE') return true;
    if (status === 'OCCUPIED' || status === 'RESERVED') return false;
  }
  // Single order events don't convey full floor state — skip
  return null;
}

const INTERPRETERS: Record<string, (p: Record<string, unknown>) => boolean | null> = {
  toast: interpretToast,
  lightspeed: interpretLightspeed,
  square: interpretSquare,
};

const FIVE_MIN_MS = 5 * 60 * 1000;

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const venueId = url.searchParams.get('venueId');
  const provider = url.searchParams.get('provider');
  const validProviders = ['toast', 'lightspeed', 'square'];

  if (!venueId || !provider || !validProviders.includes(provider)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid venueId/provider param' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: integration, error: intErr } = await supabase
    .from('venue_integrations')
    .select('webhook_secret, is_active')
    .eq('venue_id', venueId)
    .eq('provider', provider)
    .single();

  if (intErr || !integration) {
    return new Response(JSON.stringify({ error: 'Integration not configured' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!integration.is_active) {
    return new Response(JSON.stringify({ ok: true, skipped: 'integration disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const bodyText = await req.text();
  const signature = req.headers.get(SIG_HEADERS[provider]) ?? '';

  if (signature) {
    const valid = await verifyHmac(integration.webhook_secret, bodyText, signature);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const isAvailable = INTERPRETERS[provider](payload);

  if (isAvailable === null) {
    return new Response(JSON.stringify({ ok: true, skipped: 'payload not interpretable' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Manual override: if is_available was set manually within the last 5 minutes, skip
  const { data: venue } = await supabase
    .from('venues')
    .select('manually_set_at')
    .eq('id', venueId)
    .single();

  if (venue?.manually_set_at) {
    const ageMs = Date.now() - new Date(venue.manually_set_at).getTime();
    if (ageMs < FIVE_MIN_MS) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'manual override active', remaining_sec: Math.ceil((FIVE_MIN_MS - ageMs) / 1000) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  const { error: updateErr } = await supabase
    .from('venues')
    .update({ is_available: isAvailable })
    .eq('id', venueId);

  if (updateErr) {
    return new Response(JSON.stringify({ error: 'DB update failed', detail: updateErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, is_available: isAvailable }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
