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
      .select('id, status, diner_id')
      .eq('id', request_id)
      .single();

    if (fetchError || !request) return errorResponse('Request not found', 404);

    if (request.diner_id !== user.id) return errorResponse('Forbidden', 403);

    if (request.status !== 'pending') return errorResponse('Only pending requests can be cancelled', 409);

    const { error: updateError } = await serviceClient
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('id', request_id);

    if (updateError) throw updateError;

    return jsonResponse({ request_id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('cancel-request error:', message);
    return errorResponse(message, 500);
  }
});
