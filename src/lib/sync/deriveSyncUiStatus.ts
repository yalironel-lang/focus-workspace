/**
 * Pure mapper: saveStatus snapshot + online → user-facing SyncUiStatus.
 * Never emits sync_pending / sync_failed / conflict as the UI phase.
 */

import type { getSaveStatusSnapshot } from '../saveStatus';
import type { SyncUiStatus, UserFacingSyncPhase } from './syncStatusTypes';

export type SaveStatusSnapshot = ReturnType<typeof getSaveStatusSnapshot>;

const LABELS: Record<UserFacingSyncPhase, string> = {
  idle: '',
  saving_local: 'Saving',
  saved_local: 'Saved locally',
  offline: 'Offline',
  local_failed: 'Save failed',
};

export interface DeriveSyncUiOptions {
  online: boolean;
  /** When true and nothing pending/errored/offline, show brief Saved locally. */
  showSavedLocal?: boolean;
  now?: number;
}

/**
 * Priority: local_failed → offline → saving_local → saved_local → idle.
 * Multi-tab conflicts are exposed only via conflictCount (diagnostics), not phase.
 */
export function deriveSyncUiStatus(
  snapshot: SaveStatusSnapshot,
  opts: DeriveSyncUiOptions,
): SyncUiStatus {
  const { online, showSavedLocal = false, now = Date.now() } = opts;
  const anyLocalError = snapshot.anyError;
  const anyLocalPending = snapshot.anyPending;
  const conflictCount = snapshot.storageConflicts.length;

  let phase: UserFacingSyncPhase = 'idle';
  if (anyLocalError) {
    phase = 'local_failed';
  } else if (!online) {
    phase = 'offline';
  } else if (anyLocalPending) {
    phase = 'saving_local';
  } else if (showSavedLocal) {
    phase = 'saved_local';
  }

  // Hard guard: reserved / non-user phases must never leave this function as phase.
  if (phase === ('sync_pending' as UserFacingSyncPhase) || phase === ('sync_failed' as UserFacingSyncPhase)) {
    phase = 'idle';
  }

  return {
    phase,
    label: LABELS[phase],
    scope: { ...snapshot.scope },
    online,
    anyLocalPending,
    anyLocalError,
    conflictCount,
    updatedAt: now,
  };
}
