/**
 * Post-OAuth redirect target for `signInWithOAuth({ options: { redirectTo } })`.
 *
 * Supabase only honors `redirectTo` if it matches an entry under
 * Authentication → URL Configuration → Redirect URLs. Otherwise it falls
 * back to the project "Site URL" (often production), which is why local
 * dev can bounce to Vercel even when code passes localhost.
 */

import { isNativePlatform, NATIVE_OAUTH_REDIRECT_URI } from './nativeOAuthDeepLink';

const DASHBOARD_PATH = '/dashboard';

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}

/**
 * Full URL Google/Supabase should send the user to after sign-in.
 * - Capacitor native: approved custom-scheme callback (not the WebView origin).
 * - Local dev: always current `window.location.origin` (any Vite port).
 * - Non-local web: optional `VITE_AUTH_REDIRECT_ORIGIN`; otherwise current origin.
 */
export function getOAuthRedirectTo(): string {
  if (typeof window === 'undefined') {
    return DASHBOARD_PATH;
  }
  if (isNativePlatform()) {
    return NATIVE_OAUTH_REDIRECT_URI;
  }
  const { hostname, origin } = window.location;
  if (isLocalDevHost(hostname)) {
    return `${origin}${DASHBOARD_PATH}`;
  }
  const envOrigin = (import.meta.env.VITE_AUTH_REDIRECT_ORIGIN as string | undefined)
    ?.trim()
    .replace(/\/$/, '');
  if (envOrigin && /^https?:\/\//i.test(envOrigin)) {
    return `${envOrigin}${DASHBOARD_PATH}`;
  }
  return `${origin}${DASHBOARD_PATH}`;
}
