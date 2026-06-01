import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { clearPwaCachesAndReload } from '../lib/pwaRecovery';

export function AppConnectivityBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );
  const [resetting, setResetting] = useState(false);

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
  if (!offline && !configMissing) return null;

  const handleResetCache = () => {
    if (resetting) return;
    setResetting(true);
    void clearPwaCachesAndReload();
  };

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
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
