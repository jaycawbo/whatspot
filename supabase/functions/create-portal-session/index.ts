import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthenticated', 401);

  let body: { venue_id?: string; return_url?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Malformed request body', 400);
  }

  const { venue_id, return_url } = body;
  if (!venue_id) return errorResponse('venue_id is required', 400);
  if (!return_url) return errorResponse('return_url is required', 400);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return errorResponse('Stripe is not configured', 503);

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
    const { data: ownership } = await serviceClient
      .from('venue_users')
      .select('venue_id')
      .eq('venue_id', venue_id)
      .eq('user_id', user.id)
      .single();

    if (!ownership) return errorResponse('Forbidden', 403);

    const { data: venue, error: venueError } = await serviceClient
      .from('walkin_venues')
      .select('stripe_customer_id')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) return errorResponse('Venue not found', 404);
    if (!venue.stripe_customer_id) return errorResponse('No Stripe customer found for this venue', 404);

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const session = await stripe.billingPortal.sessions.create({
      customer: venue.stripe_customer_id,
      return_url,
    });

    return jsonResponse({ url: session.url });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('create-portal-session error:', message);
    return errorResponse(message, 500);
  }
});
