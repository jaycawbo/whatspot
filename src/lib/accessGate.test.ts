import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getSession = vi.fn();
let authListener: ((e: string) => void) | null = null;
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: (e: string) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => { authListener = null; } } } };
      },
    },
  },
}));

// Route RPC results by function name.
const mockRpc = (results: Record<string, unknown>) =>
  rpc.mockImplementation(async (fn: string) => {
    const r = results[fn];
    if (r instanceof Error) return { data: null, error: r };
    return { data: r, error: null };
  });
const signedIn = () => getSession.mockResolvedValue({ data: { session: { user: { email: 'a@b.co' } } } });

import {
  clearAccessCode,
  getAccessCode,
  enterWithCode,
  joinWaitlist,
  onAuthChange,
  restoreAccessFromAccount,
  revalidateAccess,
  syncClaim,
  takeInviteParam,
} from '@/lib/accessGate';

beforeEach(() => {
  rpc.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('enterWithCode', () => {
  it('sets the flag on a valid code when signed out (no claim)', async () => {
    mockRpc({ redeem_invite_code: true });
    expect(await enterWithCode(' abc ')).toBe('ok');
    expect(getAccessCode()).toBe('abc');
    expect(rpc).not.toHaveBeenCalledWith('claim_invite_code', expect.anything());
  });

  it('links the code to the signed-in account', async () => {
    signedIn();
    mockRpc({ redeem_invite_code: true, claim_invite_code: 'ok' });
    expect(await enterWithCode('abc')).toBe('ok');
    expect(rpc).toHaveBeenCalledWith('claim_invite_code', { p_code: 'abc' });
    expect(getAccessCode()).toBe('abc');
  });

  it('clears the flag when the code belongs to another account', async () => {
    signedIn();
    mockRpc({ redeem_invite_code: true, claim_invite_code: 'taken' });
    expect(await enterWithCode('abc')).toBe('taken');
    expect(getAccessCode()).toBeNull();
  });

  it('rejects invalid codes and RPC errors without a flag', async () => {
    mockRpc({ redeem_invite_code: false });
    expect(await enterWithCode('nope')).toBe('invalid');
    mockRpc({ redeem_invite_code: new Error('down') });
    expect(await enterWithCode('nope')).toBe('invalid');
    expect(getAccessCode()).toBeNull();
  });
});

describe('syncClaim', () => {
  it('claims a stored code once per session when signed in', async () => {
    signedIn();
    localStorage.setItem('whatspot_access', 'abc');
    mockRpc({ claim_invite_code: 'ok' });
    expect(await syncClaim()).toBe(true);
    await syncClaim();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does nothing when signed out or for the admin flag', async () => {
    localStorage.setItem('whatspot_access', 'abc');
    expect(await syncClaim()).toBe(true);
    localStorage.setItem('whatspot_access', 'admin');
    signedIn();
    expect(await syncClaim()).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('clears the flag when the code is taken by another account', async () => {
    signedIn();
    localStorage.setItem('whatspot_access', 'abc');
    mockRpc({ claim_invite_code: 'taken' });
    expect(await syncClaim()).toBe(false);
    expect(getAccessCode()).toBeNull();
  });
});

describe('restoreAccessFromAccount', () => {
  it('restores the flag from a linked code', async () => {
    signedIn();
    mockRpc({ get_my_access: 'abc' });
    expect(await restoreAccessFromAccount()).toBe(true);
    expect(getAccessCode()).toBe('abc');
  });

  it('restores the admin flag', async () => {
    signedIn();
    mockRpc({ get_my_access: 'admin' });
    expect(await restoreAccessFromAccount()).toBe(true);
    expect(getAccessCode()).toBe('admin');
  });

  it('denies signed-in accounts with no access, and signed-out visitors', async () => {
    signedIn();
    mockRpc({ get_my_access: null });
    expect(await restoreAccessFromAccount()).toBe(false);
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await restoreAccessFromAccount()).toBe(false);
    expect(getAccessCode()).toBeNull();
  });
});

describe('takeInviteParam', () => {
  it('returns the code and strips it from the URL', () => {
    window.history.replaceState({}, '', '/Spots?invite=xyz&ref=a#h');
    expect(takeInviteParam()).toBe('xyz');
    expect(window.location.search).toBe('?ref=a');
    expect(window.location.hash).toBe('#h');
  });

  it('returns null when absent', () => {
    expect(takeInviteParam()).toBeNull();
  });
});

describe('revalidateAccess', () => {
  it('clears the flag when the code was revoked', async () => {
    localStorage.setItem('whatspot_access', 'abc');
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await revalidateAccess()).toBe(false);
    expect(getAccessCode()).toBeNull();
  });

  it('fails open on network error', async () => {
    localStorage.setItem('whatspot_access', 'abc');
    rpc.mockRejectedValue(new Error('offline'));
    expect(await revalidateAccess()).toBe(true);
    expect(getAccessCode()).toBe('abc');
  });

  it('checks only once per session', async () => {
    localStorage.setItem('whatspot_access', 'abc');
    rpc.mockResolvedValue({ data: true, error: null });
    await revalidateAccess();
    await revalidateAccess();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('revalidates the admin flag via the account, not a code', async () => {
    localStorage.setItem('whatspot_access', 'admin');
    mockRpc({ get_my_access: 'admin' });
    expect(await revalidateAccess()).toBe(true);
    expect(rpc).toHaveBeenCalledWith('get_my_access');
    sessionStorage.clear();
    mockRpc({ get_my_access: null });
    expect(await revalidateAccess()).toBe(false);
    expect(getAccessCode()).toBeNull();
  });

  it('returns false with no flag', async () => {
    clearAccessCode();
    expect(await revalidateAccess()).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('joinWaitlist', () => {
  it('returns true when accepted, false on error', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await joinWaitlist('a@b.co', 'x')).toBe(true);
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await joinWaitlist('bad', null)).toBe(false);
  });
});

describe('onAuthChange', () => {
  it('routes sign-in and sign-out events and can unsubscribe', () => {
    const onSignedIn = vi.fn();
    const onSignedOut = vi.fn();
    const stop = onAuthChange({ onSignedIn, onSignedOut });
    authListener?.('SIGNED_IN');
    authListener?.('TOKEN_REFRESHED');
    authListener?.('SIGNED_OUT');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    stop();
    expect(authListener).toBeNull();
  });
});
