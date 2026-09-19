import { supabase } from '@/integrations/supabase/client';

// Client-side soft-launch gate. Clear localStorage (or use incognito) to see the visitor view.
// Flag value is the redeemed invite code, or 'admin' for admin accounts.
const ACCESS_KEY = 'whatspot_access';
const REVALIDATED_KEY = 'whatspot_access_checked';
const CLAIMED_KEY = 'whatspot_access_claimed';
export const ADMIN_FLAG = 'admin';

export function getAccessCode() {
  try { return localStorage.getItem(ACCESS_KEY); } catch { return null; }
}

export function setAccessCode(code) {
  try { localStorage.setItem(ACCESS_KEY, code); } catch {}
}

export function clearAccessCode() {
  try { localStorage.removeItem(ACCESS_KEY); } catch {}
  try { sessionStorage.removeItem(REVALIDATED_KEY); } catch {}
  try { sessionStorage.removeItem(CLAIMED_KEY); } catch {}
}

// Returns true if valid, false if rejected. Throws on network/RPC error.
async function checkCode(code, count) {
  const { data, error } = await supabase.rpc('redeem_invite_code', { p_code: code, p_count: count });
  if (error) throw error;
  return data === true;
}

export async function getSessionUser() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user ?? null;
  } catch {
    return null;
  }
}

// Returns 'ok' | 'invalid' | 'taken' | 'unauthenticated' | 'error'.
export async function claimInviteCode(code) {
  try {
    const { data, error } = await supabase.rpc('claim_invite_code', { p_code: code });
    if (error) return 'error';
    return data;
  } catch {
    return 'error';
  }
}

// The linked active code, 'admin', or null. Returns undefined on error.
export async function getMyAccess() {
  try {
    const { data, error } = await supabase.rpc('get_my_access');
    if (error) return undefined;
    return data ?? null;
  } catch {
    return undefined;
  }
}

// Validates a typed/URL code, sets the flag, and links it to the signed-in account (if any).
// Returns 'ok' | 'invalid' | 'taken'.
export async function enterWithCode(rawCode) {
  const code = (rawCode || '').trim();
  if (!code) return 'invalid';
  let ok = false;
  try { ok = await checkCode(code, true); } catch { return 'invalid'; }
  if (!ok) return 'invalid';
  setAccessCode(code);
  if (await getSessionUser()) {
    const result = await claimInviteCode(code);
    if (result === 'taken') {
      clearAccessCode();
      return 'taken';
    }
    try { sessionStorage.setItem(CLAIMED_KEY, '1'); } catch {}
  }
  return 'ok';
}

// Once per session, link the stored code to the signed-in account.
// Returns false if the code belongs to a different account (flag is cleared).
export async function syncClaim() {
  const code = getAccessCode();
  if (!code || code === ADMIN_FLAG) return true;
  try {
    if (sessionStorage.getItem(CLAIMED_KEY)) return true;
  } catch {}
  if (!(await getSessionUser())) return true;
  const result = await claimInviteCode(code);
  if (result === 'taken') {
    clearAccessCode();
    return false;
  }
  if (result === 'ok') {
    try { sessionStorage.setItem(CLAIMED_KEY, '1'); } catch {}
  }
  return true;
}

// No flag yet: a signed-in account with a linked code (or admin) gets in without a code.
export async function restoreAccessFromAccount() {
  if (!(await getSessionUser())) return false;
  const access = await getMyAccess();
  if (!access) return false;
  setAccessCode(access);
  return true;
}

// Consumes ?invite=CODE from the URL (always stripped). Returns the code or null.
export function takeInviteParam() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('invite');
    if (code === null) return null;
    url.searchParams.delete('invite');
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    return code;
  } catch {
    return null;
  }
}

// Once per browser session, confirm the stored flag is still valid.
// Fails open on network errors so testers are never locked out by a blip.
export async function revalidateAccess() {
  const code = getAccessCode();
  if (!code) return false;
  try {
    if (sessionStorage.getItem(REVALIDATED_KEY)) return true;
  } catch {}
  try {
    const ok = code === ADMIN_FLAG
      ? await checkAdmin()
      : await checkCode(code, false);
    if (!ok) {
      clearAccessCode();
      return false;
    }
    try { sessionStorage.setItem(REVALIDATED_KEY, '1'); } catch {}
    return true;
  } catch {
    return true;
  }
}

async function checkAdmin() {
  const access = await getMyAccess();
  if (access === undefined) throw new Error('access check failed');
  return access === ADMIN_FLAG;
}

export function getReferralSource() {
  try { return new URLSearchParams(window.location.search).get('ref'); } catch { return null; }
}

// Returns true if the email was accepted (duplicates count as accepted).
export async function joinWaitlist(email, source) {
  try {
    const { data, error } = await supabase.rpc('join_waitlist', {
      p_email: email,
      p_source: source || null,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

// Same call the in-app AuthModal makes; the gate sits above AuthProvider so it cannot reuse the modal.
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
  return error ? error.message || 'Failed to sign in' : null;
}

export async function signOutUser() {
  try { await supabase.auth.signOut(); } catch {}
}

export function onSignedIn(callback) {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') callback();
  });
  return () => data.subscription.unsubscribe();
}
