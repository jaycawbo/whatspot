// Scheduled: runs every 60 seconds (configure via pg_cron or Supabase dashboard).
// Handles two jobs:
//   1. Cancel accepted requests whose holding window has expired (no-shows).
//   2. Mark captured deposits as forfeited for those cancelled requests.
// The captured funds are already charged — no Stripe API call needed for forfeit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date().toISOString();

    // Cancel accepted requests where holding window has expired (no-shows)
    const { data: noShows, error: cancelError } = await supabase
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('status', 'accepted')
      .lt('holding_expires_at', now)
      .select('id, stripe_payment_intent_id, deposit_status');

    if (cancelError) throw cancelError;

    const noShowRows = noShows ?? [];

    // Mark deposits as forfeited for no-shows that had a captured deposit
    const toForfeit = noShowRows.filter((r) => r.deposit_status === 'captured');
    if (toForfeit.length > 0) {
      const ids = toForfeit.map((r) => r.id);
      const { error: forfeitError } = await supabase
        .from('requests')
        .update({ deposit_status: 'forfeited' })
        .in('id', ids);

      if (forfeitError) throw forfeitError;
    }

    // Also release authorizations on no-shows that were never captured
    // (e.g. the venue never accepted — accepted + expired holding = edge case)
    const toRelease = noShowRows.filter((r) => r.deposit_status === 'authorized' && r.stripe_payment_intent_id);
    for (const row of toRelease) {
      // Cancel the PaymentIntent to release the hold on the card
      try {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        if (stripeKey) {
          const res = await fetch(
            `https://api.stripe.com/v1/payment_intents/${row.stripe_payment_intent_id}/cancel`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${stripeKey}`,
              },
            },
          );
          if (!res.ok) {
            console.error(`Failed to cancel intent ${row.stripe_payment_intent_id}: ${await res.text()}`);
          }
        }
      } catch (e) {
        console.error(`stripe cancel error for ${row.id}:`, e);
      }
    }

    if (toRelease.length > 0) {
      const ids = toRelease.map((r) => r.id);
      await supabase.from('requests').update({ deposit_status: null }).in('id', ids);
    }

    console.log(
      `forfeit-deposit: cancelled=${noShowRows.length} forfeited=${toForfeit.length} released=${toRelease.length}`,
    );

    return jsonResponse({
      cancelled: noShowRows.length,
      forfeited: toForfeit.length,
      released: toRelease.length,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('forfeit-deposit error:', message);
    return errorResponse(message, 500);
  }
});
