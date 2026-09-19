import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  clearAccessCode,
  getAccessCode,
  joinWaitlist,
  redeemInviteCode,
  revalidateAccess,
  takeInviteParam,
} from '@/lib/accessGate';

beforeEach(() => {
  rpc.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('redeemInviteCode', () => {
  it('sets the flag on a valid code', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await redeemInviteCode(' abc ')).toBe(true);
    expect(getAccessCode()).toBe('abc');
  });

  it('does not set the flag on an invalid code or RPC error', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await redeemInviteCode('nope')).toBe(false);
    rpc.mockResolvedValue({ data: null, error: new Error('down') });
    expect(await redeemInviteCode('nope')).toBe(false);
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
