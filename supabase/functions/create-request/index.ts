import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthenticated', 401);

  let body: { venue_id?: string; party_size?: number; note?: string | null };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Malformed request body', 400);
  }

  const { venue_id, party_size, note } = body;
  if (!venue_id) return errorResponse('venue_id is required', 400);
  if (!party_size || !Number.isInteger(party_size) || party_size < 1 || party_size > 20) {
    return errorResponse('party_size must be an integer between 1 and 20', 400);
  }
  if (note && note.length > 140) {
    return errorResponse('note must be 140 characters or fewer', 400);
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return errorResponse('Unauthenticated', 401);

  try {
    const { data: venue, error: venueError } = await serviceClient
      .from('venues')
      .select('id, is_available, acceptance_window_sec, deposit_amount_cents, monthly_request_count')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) return errorResponse('Venue not found', 404);
    if (!venue.is_available) return errorResponse('This venue is not accepting walk-in requests right now', 409);

    const { data: limitOk, error: limitError } = await serviceClient.rpc('check_venue_request_limit', { p_venue_id: venue_id });
    if (limitError) throw limitError;
    if (!limitOk) return errorResponse('This venue has reached its monthly request limit', 429);

    const { data: existing } = await serviceClient
      .from('requests')
      .select('id')
      .eq('diner_id', user.id)
      .eq('venue_id', venue_id)
      .in('status', ['pending', 'accepted'])
      .maybeSingle();

    if (existing) return errorResponse('You already have an active request for this venue', 409);

    const acceptanceWindowSec = (venue.acceptance_window_sec as number | null) ?? 120;
    const expiresAt = new Date(Date.now() + acceptanceWindowSec * 1000).toISOString();
    const depositAmountCents: number = venue.deposit_amount_cents ?? 0;

    let stripe_payment_intent_id: string | null = null;
    let client_secret: string | null = null;

    if (depositAmountCents > 0) {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeKey) return errorResponse('Stripe is not configured', 503);

      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      const intent = await stripe.paymentIntents.create({
        amount: depositAmountCents,
        currency: 'cad',
        capture_method: 'manual',
        metadata: { venue_id, diner_id: user.id },
      });

      stripe_payment_intent_id = intent.id;
      client_secret = intent.client_secret;
    }

    const { data: request, error: insertError } = await serviceClient
      .from('requests')
      .insert({
        diner_id: user.id,
        venue_id,
        party_size,
        note: note?.trim() || null,
        status: 'pending',
        expires_at: expiresAt,
        stripe_payment_intent_id,
        deposit_status: depositAmountCents > 0 ? 'authorized' : null,
        deposit_amount_cents: depositAmountCents > 0 ? depositAmountCents : null,
      })
      .select('*')
      .single();

    if (insertError) throw insertError;

    await serviceClient
      .from('venues')
      .update({ monthly_request_count: (venue as any).monthly_request_count + 1 })
      .eq('id', venue_id);

    return jsonResponse({ request, client_secret });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('create-request error:', message);
    return errorResponse(message, 500);
  }
});
