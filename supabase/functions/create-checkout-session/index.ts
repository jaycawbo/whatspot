import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthenticated', 401);

  let body: { venue_id?: string; success_url?: string; cancel_url?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Malformed request body', 400);
  }

  const { venue_id, success_url, cancel_url } = body;
  if (!venue_id) return errorResponse('venue_id is required', 400);
  if (!success_url || !cancel_url) return errorResponse('success_url and cancel_url are required', 400);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return errorResponse('Stripe is not configured', 503);

  const proPriceId = Deno.env.get('STRIPE_PRO_PRICE_ID');
  if (!proPriceId) return errorResponse('Stripe Pro price is not configured', 503);

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
      .select('id, name, stripe_customer_id, subscription_tier')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) return errorResponse('Venue not found', 404);
    if (venue.subscription_tier === 'pro') return errorResponse('Venue is already on the Pro tier', 409);

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    let customerId: string = venue.stripe_customer_id ?? '';

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: venue.name,
        metadata: { venue_id, user_id: user.id },
      });
      customerId = customer.id;

      await serviceClient
        .from('walkin_venues')
        .update({ stripe_customer_id: customerId })
        .eq('id', venue_id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: proPriceId, quantity: 1 }],
      success_url,
      cancel_url,
      metadata: { venue_id },
    });

    return jsonResponse({ url: session.url });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('create-checkout-session error:', message);
    return errorResponse(message, 500);
  }
});
