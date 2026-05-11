/**
 * Post-OAuth redirect target for `signInWithOAuth({ options: { redirectTo } })`.
 *
 * Supabase only honors `redirectTo` if it matches an entry under
 * Authentication → URL Configuration → Redirect URLs. Otherwise it falls
 * back to the project "Site URL" (often production), which is why local
 * dev can bounce to Vercel even when code passes localhost.
 */

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
 * - Local dev: always current `window.location.origin` (any Vite port).
 * - Non-local: optional `VITE_AUTH_REDIRECT_ORIGIN` for rare proxy/canonical
 *   host cases; otherwise current origin (Vercel prod or preview).
 */
export function getOAuthRedirectTo(): string {
  if (typeof window === 'undefined') {
    return DASHBOARD_PATH;
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
