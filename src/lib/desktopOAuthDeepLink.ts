/**
 * Tauri desktop Google OAuth deep-link bridge.
 * WEB and Capacitor iOS paths are unchanged — this module is Tauri-only.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { supabase } from './supabase';
import { isTauriDesktop } from './desktopPlatform';

/** Distinct desktop callback — do not reuse Capacitor `com.zikuk.app://`. */
export const DESKTOP_OAUTH_REDIRECT_URI = 'zikuk://auth/callback';

const AUTH_CALLBACK_HOST = 'auth';
const AUTH_CALLBACK_PATH = '/callback';

let listenerReady: Promise<void> | null = null;

/** In-flight + completed fingerprints (hashes only — never logged/persisted). */
const inFlightByFingerprint = new Map<string, Promise<void>>();
const completedFingerprints = new Set<string>();

type CallbackShape = {
  schemeMatched: boolean;
  hostMatched: boolean;
  pathMatched: boolean;
  accepted: boolean;
  rejectReason:
    | 'wrong_scheme'
    | 'wrong_host'
    | 'wrong_path'
    | 'malformed_url'
    | 'none';
};

export function classifyDesktopOAuthCallbackUrl(url: string): CallbackShape {
  try {
    const parsed = new URL(url);
    const schemeMatched = parsed.protocol === 'zikuk:';
    const host = parsed.hostname || parsed.host;
    const hostMatched = host === AUTH_CALLBACK_HOST;
    const path = parsed.pathname || '';
    const pathMatched = path === AUTH_CALLBACK_PATH || path === 'callback';
    if (!schemeMatched) {
      return {
        schemeMatched,
        hostMatched: false,
        pathMatched: false,
        accepted: false,
        rejectReason: 'wrong_scheme',
      };
    }
    if (!hostMatched) {
      return {
        schemeMatched,
        hostMatched,
        pathMatched: false,
        accepted: false,
        rejectReason: 'wrong_host',
      };
    }
    if (!pathMatched) {
      return {
        schemeMatched,
        hostMatched,
        pathMatched,
        accepted: false,
        rejectReason: 'wrong_path',
      };
    }
    return {
      schemeMatched,
      hostMatched,
      pathMatched,
      accepted: true,
      rejectReason: 'none',
    };
  } catch {
    return {
      schemeMatched: false,
      hostMatched: false,
      pathMatched: false,
      accepted: false,
      rejectReason: 'malformed_url',
    };
  }
}

export function isDesktopOAuthCallbackUrl(url: string): boolean {
  return classifyDesktopOAuthCallbackUrl(url).accepted;
}

export function extractDesktopOAuthCode(url: string): string | null {
  if (!isDesktopOAuthCallbackUrl(url)) return null;
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    return code && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

function hasProviderError(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has('error');
  } catch {
    return false;
  }
}

/** SHA-256 hex fingerprint for in-memory dedupe only — never logged/persisted. */
export async function hashCallbackFingerprint(url: string): Promise<string> {
  const data = new TextEncoder().encode(url);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv_${(h >>> 0).toString(16)}`;
}

async function focusDesktopMainWindow(): Promise<void> {
  try {
    const win = getCurrentWindow();
    try {
      await win.unminimize();
    } catch {
      /* may already be restored */
    }
    try {
      await win.show();
    } catch {
      /* may already be visible */
    }
    await win.setFocus();
  } catch {
    /* focus is best-effort */
  }
}

async function handleDesktopOAuthCallbackUrl(url: string): Promise<void> {
  if (!isTauriDesktop()) return;

  const shape = classifyDesktopOAuthCallbackUrl(url);
  if (!shape.accepted) {
    console.warn('[ZIKUK desktop OAuth] ignored non-callback deep link');
    return;
  }

  const fingerprint = await hashCallbackFingerprint(url);
  if (completedFingerprints.has(fingerprint)) return;

  const existing = inFlightByFingerprint.get(fingerprint);
  if (existing) {
    await existing;
    return;
  }

  const run = (async () => {
    if (hasProviderError(url)) {
      console.error('[ZIKUK desktop OAuth] provider/supabase error in callback');
      return;
    }

    const code = extractDesktopOAuthCode(url);
    if (!code) {
      console.error('[ZIKUK desktop OAuth] callback missing code');
      return;
    }

    await focusDesktopMainWindow();

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[ZIKUK desktop OAuth] exchangeCodeForSession failed');
      return;
    }

    completedFingerprints.add(fingerprint);

    if (data.session?.user && typeof window !== 'undefined') {
      window.location.replace('/dashboard');
    }
  })();

  inFlightByFingerprint.set(fingerprint, run);
  try {
    await run;
  } finally {
    inFlightByFingerprint.delete(fingerprint);
  }
}

/** Open the authorize URL in the macOS system browser (not the WebView). */
export async function openDesktopOAuthAuthorizeUrl(url: string): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('openDesktopOAuthAuthorizeUrl is Tauri-desktop-only');
  }
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Desktop OAuth authorize URL must be https');
  }
  await openUrl(url);
}

/**
 * Register deep-link listeners once. Safe to call repeatedly.
 * Warm: onOpenUrl. Cold: getCurrent() on launch.
 */
export function initDesktopOAuthDeepLinkListener(): Promise<void> {
  if (!isTauriDesktop()) return Promise.resolve();
  if (listenerReady) return listenerReady;

  listenerReady = (async () => {
    await onOpenUrl((urls) => {
      for (const url of urls) {
        void handleDesktopOAuthCallbackUrl(url);
      }
    });

    try {
      const startUrls = await getCurrent();
      if (startUrls?.length) {
        for (const url of startUrls) {
          void handleDesktopOAuthCallbackUrl(url);
        }
      }
    } catch {
      /* getCurrent unavailable */
    }
  })();

  return listenerReady;
}

/** Test-only: reset in-memory dedupe maps. */
export function resetDesktopOAuthDedupeForTests(): void {
  inFlightByFingerprint.clear();
  completedFingerprints.clear();
  listenerReady = null;
}
