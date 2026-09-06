/**
 * Post-OAuth redirect target for `signInWithOAuth({ options: { redirectTo } })`.
 *
 * Supabase only honors `redirectTo` if it matches an entry under
 * Authentication → URL Configuration → Redirect URLs.
 */

import { isNativePlatform, NATIVE_OAUTH_REDIRECT_URI } from './nativeOAuthDeepLink';
import { isTauriDesktop } from './desktopPlatform';
import { DESKTOP_OAUTH_REDIRECT_URI } from './desktopOAuthDeepLink';

const DASHBOARD_PATH = '/dashboard';

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}

export type OAuthRedirectPlatform = 'web' | 'capacitor_ios' | 'tauri_desktop';

/** Pure helper for tests / diagnostics — no side effects. */
export function resolveOAuthRedirectTo(input: {
  isTauriDesktop: boolean;
  isCapacitorNative: boolean;
  hostname: string;
  origin: string;
  envAuthRedirectOrigin?: string;
}): { platform: OAuthRedirectPlatform; redirectTo: string } {
  if (input.isTauriDesktop) {
    return { platform: 'tauri_desktop', redirectTo: DESKTOP_OAUTH_REDIRECT_URI };
  }
  if (input.isCapacitorNative) {
    return { platform: 'capacitor_ios', redirectTo: NATIVE_OAUTH_REDIRECT_URI };
  }
  if (isLocalDevHost(input.hostname)) {
    return { platform: 'web', redirectTo: `${input.origin}${DASHBOARD_PATH}` };
  }
  const envOrigin = input.envAuthRedirectOrigin?.trim().replace(/\/$/, '');
  if (envOrigin && /^https?:\/\//i.test(envOrigin)) {
    return { platform: 'web', redirectTo: `${envOrigin}${DASHBOARD_PATH}` };
  }
  return { platform: 'web', redirectTo: `${input.origin}${DASHBOARD_PATH}` };
}

/**
 * Full URL Google/Supabase should send the user to after sign-in.
 * - Tauri desktop: zikuk://auth/callback
 * - Capacitor native: com.zikuk.app://auth/callback
 * - Local web: current origin + /dashboard
 * - Deployed web: optional VITE_AUTH_REDIRECT_ORIGIN, else current origin
 */
export function getOAuthRedirectTo(): string {
  if (typeof window === 'undefined') {
    return DASHBOARD_PATH;
  }
  const { hostname, origin } = window.location;
  return resolveOAuthRedirectTo({
    isTauriDesktop: isTauriDesktop(),
    isCapacitorNative: isNativePlatform(),
    hostname,
    origin,
    envAuthRedirectOrigin: import.meta.env.VITE_AUTH_REDIRECT_ORIGIN as string | undefined,
  }).redirectTo;
}
