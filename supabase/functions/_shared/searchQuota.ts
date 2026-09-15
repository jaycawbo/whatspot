import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Search now requires sign-in and is rate-limited via a token bucket: 5
// searches available up front (a burst), each refilling independently at
// 1 token / 4.8h (24h / 5) — see try_consume_search_slot() / issue #319.
// Admins (app_metadata.is_admin — see 20260912000000_add_admin_flag.sql)
// bypass the bucket entirely.
const SEARCH_BUCKET_CAPACITY = 5;
const SEARCH_REFILL_SECONDS = 17280; // 4h48m per token = 24h / 5

export type SearchGateReason = 'auth_required' | 'rate_limited';

export interface SearchGateResult {
  blocked: boolean;
  reason?: SearchGateReason;
  userId?: string;
  nextAllowedAt?: string; // ISO timestamp — only set when reason is 'rate_limited'
  tokensRemaining?: number; // searches left in the bucket after this call, when allowed
}

function serviceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Server-side gate for a billable, user-initiated search call. Rejects
 * anonymous callers outright, then spends one token from the per-user bucket
 * via try_consume_search_slot() (atomic, race-safe). Call this once per
 * logical search action — it consumes a token on every call that reaches it.
 *
 * Fails closed: if the bucket check itself errors, the call is blocked
 * rather than allowed through for free (unlike apiCallLog's old fail-open
 * behavior).
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

  const { data, error: rpcError } = await sb
    .rpc('try_consume_search_slot', {
      p_user_id: user.id,
      p_capacity: SEARCH_BUCKET_CAPACITY,
      p_refill_seconds: SEARCH_REFILL_SECONDS,
    })
    .single<{ allowed: boolean; next_allowed_at: string; tokens_remaining: number }>();

  if (rpcError) {
    console.error('[searchQuota] try_consume_search_slot failed — failing closed:', rpcError.message);
    return { blocked: true, reason: 'rate_limited', userId: user.id };
  }

  if (!data?.allowed) {
    return { blocked: true, reason: 'rate_limited', userId: user.id, nextAllowedAt: data?.next_allowed_at };
  }

  return { blocked: false, userId: user.id, tokensRemaining: data?.tokens_remaining };
}
