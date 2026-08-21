/**
 * Pure mapper: local saveStatus + cloudSyncStatus + online → SyncUiStatus.
 */

import type { getSaveStatusSnapshot } from '../saveStatus';
import type { CloudSyncSnapshot } from './cloudSyncStatus';
import type { SyncUiStatus, UserFacingSyncPhase } from './syncStatusTypes';

export type SaveStatusSnapshot = ReturnType<typeof getSaveStatusSnapshot>;

const LABELS: Record<UserFacingSyncPhase, string> = {
  idle: '',
  saving_local: 'Saving…',
  saved: 'Saved',
  offline: 'Offline',
  local_failed: 'Save failed',
  sync_pending: 'Waiting to sync',
  sync_failed: 'Sync failed',
};

export interface DeriveSyncUiOptions {
  online: boolean;
  cloud: CloudSyncSnapshot;
  /** Brief dwell after cloud queue drain + confirmation. */
  showSaved?: boolean;
  now?: number;
}

/**
 * Priority:
 * local_failed → offline → saving_local → sync_failed → sync_pending → saved → idle
 */
export function deriveSyncUiStatus(
  snapshot: SaveStatusSnapshot,
  opts: DeriveSyncUiOptions,
): SyncUiStatus {
  const { online, cloud, showSaved = false, now = Date.now() } = opts;
  const anyLocalError = snapshot.anyError;
  const anyLocalPending = snapshot.anyPending;
  const conflictCount = snapshot.storageConflicts.length;
  const anyCloudPending = cloud.anyCloudPending;
  const anyCloudFailure = cloud.anyCloudFailure;

  let phase: UserFacingSyncPhase = 'idle';
  if (anyLocalError) {
    phase = 'local_failed';
  } else if (!online) {
    phase = 'offline';
  } else if (anyLocalPending) {
    phase = 'saving_local';
  } else if (anyCloudFailure) {
    phase = 'sync_failed';
  } else if (anyCloudPending) {
    phase = 'sync_pending';
  } else if (showSaved) {
    phase = 'saved';
  }

  return {
    phase,
    label: LABELS[phase],
    scope: { ...snapshot.scope },
    online,
    anyLocalPending,
    anyLocalError,
    anyCloudPending,
    anyCloudFailure,
    conflictCount,
    updatedAt: now,
  };
}
