import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthenticated', 401);

  let body: { request_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Malformed request body', 400);
  }

  const { request_id } = body;
  if (!request_id) return errorResponse('request_id is required', 400);

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
    const { data: request, error: fetchError } = await serviceClient
      .from('requests')
      .select('id, status, expires_at, venue_id')
      .eq('id', request_id)
      .single();

    if (fetchError || !request) return errorResponse('Request not found', 404);

    const { data: ownership } = await serviceClient
      .from('venue_users')
      .select('venue_id')
      .eq('venue_id', request.venue_id)
      .eq('user_id', user.id)
      .single();

    if (!ownership) return errorResponse('Forbidden', 403);

    if (request.status !== 'pending') return errorResponse('Request is not pending', 409);
    if (new Date(request.expires_at) <= new Date()) return errorResponse('Request has expired', 409);

    const { error: updateError } = await serviceClient
      .from('requests')
      .update({ status: 'accepted' })
      .eq('id', request_id);

    if (updateError) throw updateError;

    // Fetch updated row — trigger sets accepted_at and holding_expires_at asynchronously
    const { data: updated, error: refetchError } = await serviceClient
      .from('requests')
      .select('id, holding_expires_at')
      .eq('id', request_id)
      .single();

    if (refetchError || !updated) throw new Error('Failed to fetch updated request');

    return jsonResponse({ request_id: updated.id, holding_expires_at: updated.holding_expires_at });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('accept-request error:', message);
    return errorResponse(message, 500);
  }
});
