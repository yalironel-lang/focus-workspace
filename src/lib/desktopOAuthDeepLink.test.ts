import { describe, expect, it, beforeEach } from 'vitest';
import {
  DESKTOP_OAUTH_REDIRECT_URI,
  classifyDesktopOAuthCallbackUrl,
  extractDesktopOAuthCode,
  hashCallbackFingerprint,
  isDesktopOAuthCallbackUrl,
  resetDesktopOAuthDedupeForTests,
} from './desktopOAuthDeepLink';
import { NATIVE_OAUTH_REDIRECT_URI } from './nativeOAuthDeepLink';
import { resolveOAuthRedirectTo } from './authRedirect';

/** Test-only helpers (formerly desktopOAuthCallbackDiag) — no product runtime use. */
type DesktopOAuthExchangeErrorCategory =
  | 'none'
  | 'pkce_or_verifier'
  | 'network'
  | 'auth_api'
  | 'unknown';

type DesktopOAuthFinalExchangeStatus = 'none' | 'success' | 'failure';

type DesktopOAuthCallbackDiag = {
  at: string;
  deepLinkListenerRegistered: boolean;
  getCurrentPresent: boolean;
  onOpenUrlFired: boolean;
  receivedUrlCount: number;
  exchangeAttempted: boolean;
  exchangeSucceeded: boolean;
  exchangeFailed: boolean;
  exchangeErrorCategory: DesktopOAuthExchangeErrorCategory;
  exchangeAttemptCount: number;
  exchangeFailureCount: number;
  finalExchangeStatus: DesktopOAuthFinalExchangeStatus;
  navigationCompleted: boolean;
  appFocusSucceeded: boolean;
  callbackSource: 'warm' | 'cold' | 'unknown';
};

function initialDesktopOAuthCallbackDiag(): DesktopOAuthCallbackDiag {
  return {
    at: new Date().toISOString(),
    deepLinkListenerRegistered: false,
    getCurrentPresent: false,
    onOpenUrlFired: false,
    receivedUrlCount: 0,
    exchangeAttempted: false,
    exchangeSucceeded: false,
    exchangeFailed: false,
    exchangeErrorCategory: 'none',
    exchangeAttemptCount: 0,
    exchangeFailureCount: 0,
    finalExchangeStatus: 'none',
    navigationCompleted: false,
    appFocusSucceeded: false,
    callbackSource: 'unknown',
  };
}

function mergeDesktopOAuthCallbackDiag(
  prev: Partial<DesktopOAuthCallbackDiag> | null | undefined,
  next: DesktopOAuthCallbackDiag,
): DesktopOAuthCallbackDiag {
  if (!prev) return { ...next };

  const exchangeAttemptCount = Math.max(prev.exchangeAttemptCount ?? 0, next.exchangeAttemptCount);
  const exchangeFailureCount = Math.max(prev.exchangeFailureCount ?? 0, next.exchangeFailureCount);

  let finalExchangeStatus: DesktopOAuthFinalExchangeStatus = next.finalExchangeStatus;
  let exchangeSucceeded = next.exchangeSucceeded;
  let exchangeFailed = next.exchangeFailed;
  let exchangeErrorCategory = next.exchangeErrorCategory;

  if (next.finalExchangeStatus === 'none' && prev.finalExchangeStatus && prev.finalExchangeStatus !== 'none') {
    finalExchangeStatus = prev.finalExchangeStatus;
    exchangeSucceeded = !!prev.exchangeSucceeded;
    exchangeFailed = !!prev.exchangeFailed;
    exchangeErrorCategory = prev.exchangeErrorCategory ?? 'none';
  }

  if (finalExchangeStatus === 'success') {
    exchangeSucceeded = true;
    exchangeFailed = false;
    exchangeErrorCategory = 'none';
  } else if (finalExchangeStatus === 'failure') {
    exchangeSucceeded = false;
    exchangeFailed = true;
  } else {
    exchangeSucceeded = false;
    exchangeFailed = false;
    exchangeErrorCategory = 'none';
  }

  return {
    ...next,
    deepLinkListenerRegistered: !!(prev.deepLinkListenerRegistered || next.deepLinkListenerRegistered),
    getCurrentPresent: !!(prev.getCurrentPresent || next.getCurrentPresent),
    onOpenUrlFired: !!(prev.onOpenUrlFired || next.onOpenUrlFired),
    receivedUrlCount: Math.max(prev.receivedUrlCount ?? 0, next.receivedUrlCount),
    exchangeAttempted: !!(prev.exchangeAttempted || next.exchangeAttempted || exchangeAttemptCount > 0),
    exchangeSucceeded,
    exchangeFailed,
    exchangeErrorCategory,
    exchangeAttemptCount,
    exchangeFailureCount,
    finalExchangeStatus,
    navigationCompleted: !!(prev.navigationCompleted || next.navigationCompleted),
    appFocusSucceeded: !!(prev.appFocusSucceeded || next.appFocusSucceeded),
    callbackSource:
      next.callbackSource !== 'unknown' ? next.callbackSource : prev.callbackSource ?? 'unknown',
  };
}

function categorizeExchangeError(message: string | undefined | null): DesktopOAuthExchangeErrorCategory {
  const m = (message || '').toLowerCase();
  if (!m) return 'unknown';
  if (
    m.includes('code verifier') ||
    m.includes('code_verifier') ||
    m.includes('pkce') ||
    m.includes('verifier') ||
    m.includes('code challenge') ||
    m.includes('invalid request') ||
    m.includes('invalid grant')
  ) {
    return 'pkce_or_verifier';
  }
  if (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('offline') ||
    m.includes('failed to fetch') ||
    m.includes('timeout')
  ) {
    return 'network';
  }
  if (m.includes('auth') || m.includes('oauth') || m.includes('token') || m.includes('session')) {
    return 'auth_api';
  }
  return 'unknown';
}

describe('desktop OAuth callback parsing', () => {
  beforeEach(() => {
    resetDesktopOAuthDedupeForTests();
  });

  it('accepts zikuk://auth/callback with code', () => {
    const url = 'zikuk://auth/callback?code=abc123&state=xyz';
    expect(isDesktopOAuthCallbackUrl(url)).toBe(true);
    expect(extractDesktopOAuthCode(url)).toBe('abc123');
    const c = classifyDesktopOAuthCallbackUrl(url);
    expect(c.accepted).toBe(true);
    expect(c.schemeMatched).toBe(true);
    expect(c.hostMatched).toBe(true);
    expect(c.pathMatched).toBe(true);
  });

  it('rejects capacitor scheme', () => {
    expect(isDesktopOAuthCallbackUrl('com.zikuk.app://auth/callback?code=abc')).toBe(false);
    expect(classifyDesktopOAuthCallbackUrl('com.zikuk.app://auth/callback?code=abc').rejectReason).toBe(
      'wrong_scheme',
    );
  });

  it('rejects wrong host/path and http(s)', () => {
    expect(classifyDesktopOAuthCallbackUrl('zikuk://oauth/callback?code=abc').rejectReason).toBe(
      'wrong_host',
    );
    expect(classifyDesktopOAuthCallbackUrl('zikuk://auth/other?code=abc').rejectReason).toBe(
      'wrong_path',
    );
    expect(isDesktopOAuthCallbackUrl('https://example.com/auth/callback?code=abc')).toBe(false);
  });

  it('rejects missing code', () => {
    expect(extractDesktopOAuthCode('zikuk://auth/callback')).toBeNull();
    expect(extractDesktopOAuthCode('zikuk://auth/callback?error=access_denied')).toBeNull();
  });

  it('handles malformed URLs safely', () => {
    expect(isDesktopOAuthCallbackUrl('not a url')).toBe(false);
    expect(classifyDesktopOAuthCallbackUrl(':::').rejectReason).toBe('malformed_url');
    expect(extractDesktopOAuthCode(':::')).toBeNull();
  });
});

describe('safe callback telemetry helpers (test-only)', () => {
  it('categorizes exchange errors without exposing secrets', () => {
    expect(categorizeExchangeError('invalid code verifier')).toBe('pkce_or_verifier');
    expect(categorizeExchangeError('Failed to fetch')).toBe('network');
    expect(categorizeExchangeError('Auth session missing')).toBe('auth_api');
    expect(categorizeExchangeError('something else')).toBe('unknown');
  });

  it('fingerprints without exposing the URL', async () => {
    const a = await hashCallbackFingerprint('zikuk://auth/callback?code=abc123');
    const b = await hashCallbackFingerprint('zikuk://auth/callback?code=abc123');
    const c = await hashCallbackFingerprint('zikuk://auth/callback?code=other');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain('abc123');
    expect(a).not.toContain('zikuk://');
  });

  it('merge keeps delivery sticky but final exchange success clears failed', () => {
    const failed = {
      ...initialDesktopOAuthCallbackDiag(),
      exchangeAttempted: true,
      exchangeSucceeded: false,
      exchangeFailed: true,
      exchangeErrorCategory: 'pkce_or_verifier' as const,
      exchangeAttemptCount: 1,
      exchangeFailureCount: 1,
      finalExchangeStatus: 'failure' as const,
      onOpenUrlFired: true,
    };
    const success = {
      ...initialDesktopOAuthCallbackDiag(),
      exchangeAttempted: true,
      exchangeSucceeded: true,
      exchangeFailed: false,
      exchangeErrorCategory: 'none' as const,
      exchangeAttemptCount: 2,
      exchangeFailureCount: 1,
      finalExchangeStatus: 'success' as const,
      navigationCompleted: true,
    };
    const merged = mergeDesktopOAuthCallbackDiag(failed, success);
    expect(merged.exchangeSucceeded).toBe(true);
    expect(merged.exchangeFailed).toBe(false);
    expect(merged.exchangeErrorCategory).toBe('none');
    expect(merged.finalExchangeStatus).toBe('success');
    expect(merged.exchangeAttemptCount).toBe(2);
    expect(merged.exchangeFailureCount).toBe(1);
    expect(merged.onOpenUrlFired).toBe(true);
    expect(merged.navigationCompleted).toBe(true);
  });

  it('merge preserves prior success across a fresh listener reload write', () => {
    const priorSuccess = {
      ...initialDesktopOAuthCallbackDiag(),
      exchangeAttempted: true,
      exchangeSucceeded: true,
      exchangeFailed: false,
      finalExchangeStatus: 'success' as const,
      exchangeAttemptCount: 1,
      navigationCompleted: true,
      appFocusSucceeded: true,
    };
    const freshListener = {
      ...initialDesktopOAuthCallbackDiag(),
      deepLinkListenerRegistered: true,
    };
    const merged = mergeDesktopOAuthCallbackDiag(priorSuccess, freshListener);
    expect(merged.finalExchangeStatus).toBe('success');
    expect(merged.exchangeSucceeded).toBe(true);
    expect(merged.exchangeFailed).toBe(false);
    expect(merged.deepLinkListenerRegistered).toBe(true);
    expect(merged.navigationCompleted).toBe(true);
  });
});

describe('OAuth redirect platform selection', () => {
  it('selects desktop scheme only for Tauri', () => {
    const r = resolveOAuthRedirectTo({
      isTauriDesktop: true,
      isCapacitorNative: false,
      hostname: 'tauri.localhost',
      origin: 'tauri://localhost',
    });
    expect(r.platform).toBe('tauri_desktop');
    expect(r.redirectTo).toBe(DESKTOP_OAUTH_REDIRECT_URI);
    expect(r.redirectTo).toBe('zikuk://auth/callback');
  });

  it('keeps Capacitor scheme when Cap native', () => {
    const r = resolveOAuthRedirectTo({
      isTauriDesktop: false,
      isCapacitorNative: true,
      hostname: 'localhost',
      origin: 'capacitor://localhost',
    });
    expect(r.platform).toBe('capacitor_ios');
    expect(r.redirectTo).toBe(NATIVE_OAUTH_REDIRECT_URI);
  });

  it('keeps web dashboard redirect for browser', () => {
    const local = resolveOAuthRedirectTo({
      isTauriDesktop: false,
      isCapacitorNative: false,
      hostname: 'localhost',
      origin: 'http://localhost:5173',
    });
    expect(local.platform).toBe('web');
    expect(local.redirectTo).toBe('http://localhost:5173/dashboard');

    const prod = resolveOAuthRedirectTo({
      isTauriDesktop: false,
      isCapacitorNative: false,
      hostname: 'focus-workspace-one.vercel.app',
      origin: 'https://focus-workspace-one.vercel.app',
    });
    expect(prod.platform).toBe('web');
    expect(prod.redirectTo).toBe('https://focus-workspace-one.vercel.app/dashboard');
  });

  it('never returns Cap scheme for Tauri', () => {
    const r = resolveOAuthRedirectTo({
      isTauriDesktop: true,
      isCapacitorNative: true,
      hostname: 'x',
      origin: 'y',
    });
    expect(r.redirectTo).toBe(DESKTOP_OAUTH_REDIRECT_URI);
    expect(r.redirectTo).not.toBe(NATIVE_OAUTH_REDIRECT_URI);
  });
});
