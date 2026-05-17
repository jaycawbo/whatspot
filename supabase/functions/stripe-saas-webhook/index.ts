import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeKey || !webhookSecret) return errorResponse('Stripe is not configured', 503);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return errorResponse('Missing stripe-signature header', 400);

  const body = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('stripe-saas-webhook signature error:', message);
    return errorResponse(`Webhook error: ${message}`, 400);
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const venueId = subscription.metadata?.venue_id;
      if (!venueId) return jsonResponse({ received: true });

      const isActive = subscription.status === 'active' || subscription.status === 'trialing';
      await serviceClient
        .from('walkin_venues')
        .update({
          subscription_tier: isActive ? 'pro' : 'free',
          subscription_status: subscription.status,
          stripe_subscription_id: subscription.id,
        })
        .eq('id', venueId);

    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const venueId = subscription.metadata?.venue_id;
      if (!venueId) return jsonResponse({ received: true });

      await serviceClient
        .from('walkin_venues')
        .update({
          subscription_tier: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
        })
        .eq('id', venueId);
    }

    return jsonResponse({ received: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('stripe-saas-webhook error:', message);
    return errorResponse(message, 500);
  }
});
