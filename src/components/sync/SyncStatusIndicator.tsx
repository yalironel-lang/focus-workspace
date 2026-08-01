/**
 * Minimal local-save status indicator for authenticated workspace shell.
 * Copy is local-only — never claims cloud sync.
 */

import { useSyncUiStatus } from '../../lib/sync/useSyncUiStatus';
import { isSyncStatusUiEnabled } from '../../lib/sync/syncStatusTypes';

export function SyncStatusIndicator() {
  if (!isSyncStatusUiEnabled()) return null;

  return <SyncStatusIndicatorInner />;
}

function SyncStatusIndicatorInner() {
  const status = useSyncUiStatus();

  if (status.phase === 'idle' || !status.label) return null;

  const tone =
    status.phase === 'local_failed'
      ? { color: '#fecaca', border: 'rgba(248,113,113,0.35)', bg: 'rgba(127,29,29,0.88)' }
      : status.phase === 'offline'
        ? { color: '#e2e8f0', border: 'rgba(148,163,184,0.35)', bg: 'rgba(30,41,59,0.92)' }
        : { color: '#e2e8f0', border: 'rgba(255,255,255,0.14)', bg: 'rgba(15,23,42,0.88)' };

  return (
    <div
      role="status"
      aria-live="polite"
      data-sync-ui-phase={status.phase}
      style={{
        position: 'fixed',
        top: 52,
        right: 12,
        zIndex: 99990,
        pointerEvents: 'none',
        padding: '6px 10px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.01em',
        lineHeight: 1.2,
        color: tone.color,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
      }}
    >
      {status.label}
    </div>
  );
}
