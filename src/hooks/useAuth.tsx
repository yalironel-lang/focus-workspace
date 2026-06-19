import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { getOAuthRedirectTo } from '../lib/authRedirect';
import { hasAuthCallbackInUrl } from '../lib/authCallback';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Remove a stale OAuth callback (`?code` / `?error` / `#access_token`) from the
 * URL *without* a navigation or reload.
 *
 * Why this matters: a PKCE callback only resolves if the matching code-verifier
 * is in storage. If it isn't (reused/expired code, verifier lost across a
 * different storage context such as an installed PWA or a 127.0.0.1↔localhost
 * origin switch), supabase-js leaves `?code=` sitting in the URL. The route
 * guard treats any callback-in-URL as "auth pending" and would otherwise spin
 * forever — or bounce to login on a URL that re-poisons every retry. Stripping
 * the params leaves a clean URL the user can sign in from again.
 */
function stripAuthCallbackFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ['code', 'state', 'error', 'error_description', 'error_code']) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (url.hash && /(?:^|[#&])(?:access_token|error)=/.test(url.hash)) {
      url.hash = '';
      changed = true;
    }
    if (changed) {
      window.history.replaceState(window.history.state, '', url.toString());
    }
  } catch {
    /* malformed URL — nothing to clean */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    // supabase-js emits the first onAuthStateChange event (INITIAL_SESSION)
    // only AFTER it has finished initializing — including the PKCE code
    // exchange for an OAuth callback URL and recovering any persisted session.
    // So the first event already reflects the final auth state, and keeping
    // `loading` true until then is enough to stop the route guard redirecting
    // before the session is established (fresh login, refresh and reopen all
    // funnel through this single event).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      try {
        setUser(session?.user ?? null);

        // Auth has settled. If there's no session but a callback is still in
        // the URL, the exchange failed or was already consumed. Clear it so
        // login is reachable and the next attempt starts clean — never hang,
        // never loop the user back onto a poisoned redirect URL.
        if (!session?.user && hasAuthCallbackInUrl()) {
          console.warn(
            `[Focus Workspace] OAuth callback present but no session was established (event: ${event}). ` +
              'Clearing stale callback params so sign-in can be retried.',
          );
          stripAuthCallbackFromUrl();
        }
      } catch (err) {
        // A throw here must never take down the provider or strand the spinner.
        console.error('[Focus Workspace] Error handling auth state change', err);
      } finally {
        setLoading(false);
      }
    });

    // Safety net: if the auth library never emits (blocked third-party storage,
    // offline, etc.) don't trap the user on the spinner forever.
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setLoading((prev) => {
        if (prev) {
          console.warn('[Focus Workspace] Auth session check timed out — continuing un-authenticated.');
          if (hasAuthCallbackInUrl()) stripAuthCallbackFromUrl();
        }
        return false;
      });
    }, 12_000);

    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured for this deployment');
    }
    const redirectTo = getOAuthRedirectTo();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
