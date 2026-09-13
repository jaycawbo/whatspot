import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Search now requires sign-in and is capped at 5/day/user (issue #319 — cost
// safeguard so an unbounded number of Gemini + Places calls can't fire per
// day). Admins (app_metadata.is_admin — see 20260912000000_add_admin_flag.sql)
// bypass the daily cap entirely.
const DAILY_SEARCH_LIMIT = 5;

export type SearchGateReason = 'auth_required' | 'daily_limit_reached';

export interface SearchGateResult {
  blocked: boolean;
  reason?: SearchGateReason;
  userId?: string;
  remaining?: number;
}

function serviceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Server-side gate for a billable, user-initiated search call. Rejects
 * anonymous callers outright, then enforces the per-user daily quota via
 * increment_search_quota() (atomic, race-safe). Call this once per logical
 * search action — it increments on every call, so call it exactly once per
 * request that should count against the daily cap.
 *
 * Fails closed: if quota tracking itself errors, the call is blocked rather
 * than allowed through for free (unlike apiCallLog's old fail-open behavior).
 */
export async function gateBillableSearch(req: Request): Promise<SearchGateResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return { blocked: true, reason: 'auth_required' };

  const sb = serviceClient();
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await sb.auth.getUser(token);
  if (userError || !user) return { blocked: true, reason: 'auth_required' };

  const isAdmin = user.app_metadata?.is_admin === true;
  if (isAdmin) return { blocked: false, userId: user.id };

  const { data: count, error: rpcError } = await sb.rpc('increment_search_quota', { p_user_id: user.id });
  if (rpcError) {
    console.error('[searchQuota] increment_search_quota failed — failing closed:', rpcError.message);
    return { blocked: true, reason: 'daily_limit_reached', userId: user.id };
  }

  if ((count ?? 0) > DAILY_SEARCH_LIMIT) {
    return { blocked: true, reason: 'daily_limit_reached', userId: user.id, remaining: 0 };
  }

  return { blocked: false, userId: user.id, remaining: DAILY_SEARCH_LIMIT - (count ?? 0) };
}
