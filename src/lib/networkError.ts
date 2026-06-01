/** User-facing copy for failed fetches (Supabase, fetch, offline). */
export function classifyNetworkFailure(
  err: unknown,
  fallback = 'Could not reach the server. Check your connection and try again.',
): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You appear to be offline. Reconnect to load your workspaces.';
  }

  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';

  if (/Missing Supabase|VITE_SUPABASE/i.test(message)) {
    return 'This deployment is missing database configuration. Contact the app owner.';
  }

  if (
    /ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError|Load failed|Network request failed|ECONNREFUSED|ETIMEDOUT/i.test(
      message,
    )
  ) {
    return 'Can’t reach the server. Check your internet connection and try again.';
  }

  return message.trim() || fallback;
}

/** Map Supabase PostgREST / auth error messages to clearer copy. */
export function classifySupabaseError(
  message: string | undefined,
  fallback = 'Could not load data',
): string {
  if (!message) return classifyNetworkFailure(null, fallback);
  return classifyNetworkFailure(new Error(message), fallback);
}
