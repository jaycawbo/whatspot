/**
 * venue-refresh-health
 *
 * Admin-only. Reports what share of venues are past the weekly-refresh
 * staleness window (7 days, same definition as search-venues-db/
 * refresh-venue-weekly), so an in-app banner can surface a growing backlog
 * instead of it only being visible in edge function logs — this is a hobby
 * project and logs don't get checked regularly (issue #326).
 *
 * Request:  none (Authorization header required)
 * Response: { stalePct: number, staleCount: number, totalCount: number }
 *           | { error: 'auth_required' | 'admin_required' } (401)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STALE_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'auth_required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user || user.app_metadata?.is_admin !== true) {
      return new Response(JSON.stringify({ error: 'admin_required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const staleThreshold = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();

    const { count: totalCount, error: totalError } = await supabase
      .from('venues')
      .select('*', { count: 'exact', head: true })
      .eq('is_removed', false);
    if (totalError) throw totalError;

    const { count: staleCount, error: staleError } = await supabase
      .from('venues')
      .select('*', { count: 'exact', head: true })
      .eq('is_removed', false)
      .or(`rating_last_updated.is.null,rating_last_updated.lt.${staleThreshold}`);
    if (staleError) throw staleError;

    const stalePct = totalCount && totalCount > 0
      ? Math.round(((staleCount ?? 0) / totalCount) * 1000) / 10 // one decimal place
      : 0;

    return new Response(
      JSON.stringify({ stalePct, staleCount: staleCount ?? 0, totalCount: totalCount ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[venue-refresh-health] Fatal:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
