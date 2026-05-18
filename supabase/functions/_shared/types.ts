export interface RequestRow {
  id: string;
  diner_id: string;
  venue_id: string;
  party_size: number;
  note: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'redeemed' | 'cancelled';
  decline_comment: string | null;
  created_at: string;
  accepted_at: string | null;
  expires_at: string;
  holding_expires_at: string | null;
  stripe_payment_intent_id: string | null;
  deposit_status: 'authorized' | 'captured' | 'refunded' | 'forfeited' | null;
  deposit_amount_cents: number | null;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}
