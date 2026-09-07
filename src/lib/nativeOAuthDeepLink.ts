/**
 * Native-only Google OAuth deep-link bridge (Capacitor iOS).
 * Web OAuth is unchanged — this module must not run on the web product.
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';

/** Approved Phase 0 native redirect / deep-link callback. */
export const NATIVE_OAUTH_REDIRECT_URI = 'com.zikuk.app://auth/callback';

const AUTH_CALLBACK_HOST = 'auth';
const AUTH_CALLBACK_PATH = '/callback';

let listenerReady: Promise<void> | null = null;
let handlingUrl: string | null = null;

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isNativeOAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'com.zikuk.app:') return false;
    // com.zikuk.app://auth/callback → host=auth, pathname=/callback
    const host = parsed.hostname || parsed.host;
    if (host !== AUTH_CALLBACK_HOST) return false;
    const path = parsed.pathname || '';
    return path === AUTH_CALLBACK_PATH || path === 'callback';
  } catch {
    return false;
  }
}

function extractAuthCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    return code && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

function extractOAuthError(url: string): string | null {
  try {
    const parsed = new URL(url);
    const err = parsed.searchParams.get('error');
    if (!err) return null;
    const desc = parsed.searchParams.get('error_description');
    return desc ? `${err}: ${desc}` : err;
  } catch {
    return null;
  }
}

async function closeBrowserQuietly(): Promise<void> {
  try {
    await Browser.close();
  } catch {
    /* already closed */
  }
}

async function handleOAuthCallbackUrl(url: string): Promise<void> {
  if (!isNativeOAuthCallbackUrl(url)) return;
  if (handlingUrl === url) return;
  handlingUrl = url;

  try {
    const oauthError = extractOAuthError(url);
    if (oauthError) {
      console.error('[ZIKUK native OAuth] provider/supabase error in callback:', oauthError, url);
      await closeBrowserQuietly();
      return;
    }

    const code = extractAuthCode(url);
    if (!code) {
      console.error('[ZIKUK native OAuth] callback missing code:', url);
      await closeBrowserQuietly();
      return;
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[ZIKUK native OAuth] exchangeCodeForSession failed:', error.message, url);
      await closeBrowserQuietly();
      return;
    }

    await closeBrowserQuietly();

    if (data.session?.user && typeof window !== 'undefined') {
      // Internal SPA navigation — do not use the deep-link as window.location.
      window.location.replace('/dashboard');
    }
  } finally {
    handlingUrl = null;
  }
}

/**
 * Open the Google/Supabase authorize URL in the system in-app browser.
 * Caller must have used skipBrowserRedirect + NATIVE_OAUTH_REDIRECT_URI.
 */
export async function openNativeOAuthAuthorizeUrl(url: string): Promise<void> {
  if (!isNativePlatform()) {
    throw new Error('openNativeOAuthAuthorizeUrl is native-only');
  }
  await Browser.open({ url });
}

/**
 * Register appUrlOpen once. Safe to call repeatedly.
 */
export function initNativeOAuthDeepLinkListener(): Promise<void> {
  if (!isNativePlatform()) return Promise.resolve();
  if (listenerReady) return listenerReady;

  listenerReady = (async () => {
    await App.addListener('appUrlOpen', ({ url }) => {
      void handleOAuthCallbackUrl(url);
    });

    // Cold start via deep link.
    try {
      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        void handleOAuthCallbackUrl(launch.url);
      }
    } catch {
      /* getLaunchUrl unsupported / none */
    }
  })();

  return listenerReady;
}
