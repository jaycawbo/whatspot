import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';

const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 100000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: { amount_cents?: number; success_url?: string; cancel_url?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Malformed request body', 400);
  }

  const { amount_cents, success_url, cancel_url } = body;
  if (!Number.isInteger(amount_cents) || amount_cents! < MIN_AMOUNT_CENTS || amount_cents! > MAX_AMOUNT_CENTS) {
    return errorResponse(`amount_cents must be an integer between ${MIN_AMOUNT_CENTS} and ${MAX_AMOUNT_CENTS}`, 400);
  }
  if (!success_url || !cancel_url) return errorResponse('success_url and cancel_url are required', 400);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return errorResponse('Stripe is not configured', 503);

  let userId: string | null = null;
  let userEmail: string | undefined;

  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.email ?? undefined;
    }
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Support WhatSpot' },
          unit_amount: amount_cents,
        },
        quantity: 1,
      }],
      customer_email: userEmail,
      success_url,
      cancel_url,
      metadata: { type: 'donation', user_id: userId ?? '' },
    });

    return jsonResponse({ url: session.url });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('create-donation-checkout error:', message);
    return errorResponse(message, 500);
  }
});
