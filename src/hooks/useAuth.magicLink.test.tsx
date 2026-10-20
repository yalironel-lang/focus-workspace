/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MagicLinkNotice, MagicLinkStatus } from '../lib/auth/stagingMagicLink';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth },
}));

import { AuthProvider, useAuth } from './useAuth';

function unsubscribe() {
  return { data: { subscription: { unsubscribe: vi.fn() } } };
}

describe('useAuth magic link', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    auth.onAuthStateChange.mockImplementation(() => unsubscribe());
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    auth.signInWithOtp.mockResolvedValue({ error: null });
    window.location.href = 'https://zikuk-staging.vercel.app/';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  function renderProbe(read: (api: ReturnType<typeof useAuth>) => void) {
    function Probe() {
      read(useAuth());
      return null;
    }
    act(() => {
      root?.render(createElement(AuthProvider, null, createElement(Probe)));
    });
  }

  it('requests a magic link for the current origin without creating a user', async () => {
    let request: ((email: string) => Promise<MagicLinkStatus>) | null = null;
    renderProbe(api => {
      request = api.signInWithMagicLink;
    });

    let status: MagicLinkStatus | null = null;
    await act(async () => {
      status = await request?.('person@example.com');
    });

    expect(status).toBe('sent');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: {
        emailRedirectTo: 'https://zikuk-staging.vercel.app/dashboard',
        shouldCreateUser: false,
      },
    });
  });

  it('keeps Google sign-in on the same redirect helper', async () => {
    let google: (() => Promise<void>) | null = null;
    renderProbe(api => {
      google = api.signInWithGoogle;
    });
    await act(async () => {
      await google?.();
    });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://zikuk-staging.vercel.app/dashboard' },
    });
  });

  it('does not call Supabase for an invalid address', async () => {
    let request: ((email: string) => Promise<MagicLinkStatus>) | null = null;
    renderProbe(api => {
      request = api.signInWithMagicLink;
    });
    let status: MagicLinkStatus | null = null;
    await act(async () => {
      status = await request?.('not-an-email');
    });
    expect(status).toBe('invalid_email');
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('reports a missing account the same way as a sent link', async () => {
    auth.signInWithOtp.mockResolvedValue({
      error: { code: 'user_not_found', message: 'User not found', status: 400 },
    });
    let request: ((email: string) => Promise<MagicLinkStatus>) | null = null;
    renderProbe(api => {
      request = api.signInWithMagicLink;
    });
    let status: MagicLinkStatus | null = null;
    await act(async () => {
      status = await request?.('missing@example.com');
    });
    expect(status).toBe('sent');
  });

  it('surfaces rate limits and other failures', async () => {
    auth.signInWithOtp.mockResolvedValueOnce({
      error: { status: 429, code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' },
    });
    let request: ((email: string) => Promise<MagicLinkStatus>) | null = null;
    renderProbe(api => {
      request = api.signInWithMagicLink;
    });
    let limited: MagicLinkStatus | null = null;
    await act(async () => {
      limited = await request?.('person@example.com');
    });
    expect(limited).toBe('rate_limited');

    auth.signInWithOtp.mockResolvedValueOnce({ error: { status: 500, message: 'unavailable' } });
    let failed: MagicLinkStatus | null = null;
    await act(async () => {
      failed = await request?.('person@example.com');
    });
    expect(failed).toBe('failed');
  });

  it('records an expired link without logging the callback secret', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.location.href =
      'https://zikuk-staging.vercel.app/dashboard?error=access_denied&error_code=otp_expired&error_description=expired#access_token=secret-token';
    auth.onAuthStateChange.mockImplementation(callback => {
      callback('INITIAL_SESSION', null);
      return unsubscribe();
    });

    let notice: MagicLinkNotice | null = null;
    function Probe() {
      notice = useAuth().magicLinkNotice;
      return null;
    }
    act(() => {
      root?.render(createElement(AuthProvider, null, createElement(Probe)));
    });
    expect(notice).toBe('expired');
    expect(window.location.href).not.toContain('access_token');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret-token');
    warn.mockRestore();
  });

  it('restores a persisted session', () => {
    auth.onAuthStateChange.mockImplementation(callback => {
      callback('INITIAL_SESSION', { user: { id: 'restored-user' } });
      return unsubscribe();
    });
    let userId = 'unset';
    function Probe() {
      userId = useAuth().user?.id ?? 'none';
      return null;
    }
    act(() => {
      root?.render(createElement(AuthProvider, null, createElement(Probe)));
    });
    expect(userId).toBe('restored-user');
  });
});
