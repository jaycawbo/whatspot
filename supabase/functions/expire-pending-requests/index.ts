import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';
import type { RequestRow } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: expired, error } = await supabase
      .from('requests')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id, diner_id, venue_id');

    if (error) throw error;

    const expiredRows: Pick<RequestRow, 'id' | 'diner_id' | 'venue_id'>[] = expired ?? [];

    if (expiredRows.length > 0) {
      const messages = expiredRows.map((r) => ({
        topic: `realtime:request:${r.id}`,
        event: 'request.expired',
        payload: { request_id: r.id },
      }));

      const broadcastRes = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          },
          body: JSON.stringify({ messages }),
        },
      );

      if (!broadcastRes.ok) {
        console.error('Realtime broadcast failed:', await broadcastRes.text());
      }
    }

    console.log(`expire-pending-requests: expired ${expiredRows.length} requests`);
    return jsonResponse({ expired: expiredRows.length });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('expire-pending-requests error:', message);
    return errorResponse(message, 500);
  }
});
