import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
      .select('id, is_available, acceptance_window_sec')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) return errorResponse('Venue not found', 404);
    if (!venue.is_available) return errorResponse('This venue is not accepting walk-in requests right now', 409);

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

    const { data: request, error: insertError } = await serviceClient
      .from('requests')
      .insert({
        diner_id: user.id,
        venue_id,
        party_size,
        note: note?.trim() || null,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (insertError) throw insertError;

    return jsonResponse({ request });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('create-request error:', message);
    return errorResponse(message, 500);
  }
});
