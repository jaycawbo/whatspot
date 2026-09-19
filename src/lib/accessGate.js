import { supabase } from '@/integrations/supabase/client';

// Client-side soft-launch gate. Clear localStorage (or use incognito) to see the visitor view.
const ACCESS_KEY = 'whatspot_access';
const REVALIDATED_KEY = 'whatspot_access_checked';

export function getAccessCode() {
  try { return localStorage.getItem(ACCESS_KEY); } catch { return null; }
}

export function setAccessCode(code) {
  try { localStorage.setItem(ACCESS_KEY, code); } catch {}
}

export function clearAccessCode() {
  try { localStorage.removeItem(ACCESS_KEY); } catch {}
  try { sessionStorage.removeItem(REVALIDATED_KEY); } catch {}
}

// Returns true if valid, false if rejected. Throws on network/RPC error.
async function checkCode(code, count) {
  const { data, error } = await supabase.rpc('redeem_invite_code', { p_code: code, p_count: count });
  if (error) throw error;
  return data === true;
}

// Validates a typed/URL code and, on success, sets the flag.
export async function redeemInviteCode(rawCode) {
  const code = (rawCode || '').trim();
  if (!code) return false;
  try {
    const ok = await checkCode(code, true);
    if (ok) setAccessCode(code);
    return ok;
  } catch {
    return false;
  }
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

// Once per browser session, confirm the stored code is still active.
// Fails open on network errors so testers are never locked out by a blip.
export async function revalidateAccess() {
  const code = getAccessCode();
  if (!code) return false;
  try {
    if (sessionStorage.getItem(REVALIDATED_KEY)) return true;
  } catch {}
  try {
    const ok = await checkCode(code, false);
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
