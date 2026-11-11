/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  signInWithMagicLink: vi.fn(),
  magicLinkNotice: null as 'expired' | 'failed' | null,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => auth,
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
}));

import { Auth, StagingMagicLinkPanel } from './Auth';

describe('Auth staging email login', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_STAGING_EMAIL_AUTH', 'false');
    auth.magicLinkNotice = null;
    auth.signInWithMagicLink.mockResolvedValue('sent');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    vi.unstubAllEnvs();
  });

  it('keeps the production screen on Google sign-in', () => {
    act(() => {
      root?.render(createElement(Auth));
    });
    expect(host?.textContent).toContain('Continue with Google');
    expect(host?.querySelector('[data-testid="staging-magic-link-form"]')).toBeNull();
    const button = host?.querySelector('button');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('shows the staging email form on Auth when the flag is exactly true', () => {
    vi.stubEnv('VITE_STAGING_EMAIL_AUTH', 'true');
    act(() => {
      root?.render(createElement(Auth));
    });
    expect(host?.querySelector('[data-testid="staging-magic-link-form"]')).toBeTruthy();
    expect(host?.textContent).toContain('Email me a sign-in link');
    expect(host?.textContent).toContain('Continue with Google');
  });

  it('shows the email form, a sent confirmation, and failure copy', async () => {
    act(() => {
      root?.render(createElement(StagingMagicLinkPanel));
    });
    const input = host?.querySelector('input') as HTMLInputElement;
    const form = host?.querySelector('form') as HTMLFormElement;
    expect(input).toBeTruthy();
    expect(host?.textContent).toContain('Email me a sign-in link');

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(input, 'person@example.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(auth.signInWithMagicLink).toHaveBeenCalledWith('person@example.com');
    expect(host?.textContent).toContain('Check your inbox for a sign-in link');

    auth.signInWithMagicLink.mockResolvedValue('rate_limited');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(host?.textContent).toContain('Too many sign-in emails were requested');

    auth.signInWithMagicLink.mockResolvedValue('invalid_email');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(host?.textContent).toContain('Enter a valid email address.');

    auth.signInWithMagicLink.mockResolvedValue('failed');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(host?.textContent).toContain('Sign-in could not be completed');
  });

  it('shows an expired-link message from the restored callback', () => {
    auth.magicLinkNotice = 'expired';
    act(() => {
      root?.render(createElement(StagingMagicLinkPanel));
    });
    expect(host?.textContent).toContain('This sign-in link is no longer valid');
  });
});
