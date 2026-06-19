/**
 * Detect OAuth / magic-link callback params still present in the URL.
 * Used to keep auth guards in a loading state until Supabase finishes exchange.
 */
export function hasAuthCallbackInUrl(href?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(href ?? window.location.href);
    if (url.searchParams.has('code')) return true;
    if (url.searchParams.has('error') || url.searchParams.has('error_description')) return true;
    const hash = url.hash.replace(/^#/, '');
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    return params.has('access_token') || params.has('error');
  } catch {
    return false;
  }
}
