import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { clearPwaCachesAndReload } from '../lib/pwaRecovery';
import {
  clearAppConnectivityInset,
  setAppConnectivityInsetPx,
} from '../lib/appConnectivityInset';

export function AppConnectivityBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );
  const [resetting, setResetting] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const configMissing = !isSupabaseConfigured;
  const visible = offline || configMissing;

  // Publish measured height to :root so fixed/portaled chrome can offset.
  useLayoutEffect(() => {
    if (!visible) {
      clearAppConnectivityInset();
      return;
    }
    const el = bannerRef.current;
    if (!el) {
      clearAppConnectivityInset();
      return;
    }
    // Use viewport bottom (not height alone) so body safe-area padding is included.
    const publish = () => setAppConnectivityInsetPx(el.getBoundingClientRect().bottom);
    publish();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', publish);
      clearAppConnectivityInset();
    };
  }, [visible, offline, configMissing]);

  if (!visible) return null;

  const handleResetCache = () => {
    if (resetting) return;
    setResetting(true);
    void clearPwaCachesAndReload();
  };

  return (
    <div
      ref={bannerRef}
      role="status"
      data-app-connectivity-banner=""
      style={{
        // In-flow (not fixed/absolute): reserves vertical space in the app shell.
        position: 'relative',
        flexShrink: 0,
        zIndex: 1,
        // Body already applies env(safe-area-inset-*); keep content padding only.
        padding: '10px 16px',
        fontSize: 13,
        lineHeight: 1.45,
        background: configMissing ? 'rgba(127,29,29,0.95)' : 'rgba(30,41,59,0.96)',
        color: '#f8fafc',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      {configMissing ? (
        <span>
          Database is not configured for this deployment (missing Supabase environment variables).
        </span>
      ) : (
        <span>You&apos;re offline. Some data may not load until you reconnect.</span>
      )}
      {!configMissing && offline && (
        <button
          type="button"
          onClick={handleResetCache}
          disabled={resetting}
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'transparent',
            color: '#f8fafc',
            fontSize: 12,
            fontWeight: 600,
            cursor: resetting ? 'wait' : 'pointer',
          }}
        >
          {resetting ? 'Resetting…' : 'Reset app cache'}
        </button>
      )}
    </div>
  );
}
