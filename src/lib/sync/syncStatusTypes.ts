/**
 * Sync UI status types.
 *
 * Local ledger (saveStatus) + cloud ledger (cloudSyncStatus) drive the indicator.
 * `conflict` remains diagnostics-only and must never be the user-facing phase.
 */

export type SyncUiPhase =
  | 'idle'
  | 'saving_local'
  | 'saved'
  | 'offline'
  | 'local_failed'
  | 'sync_pending'
  | 'sync_failed'
  /**
   * Internal / diagnostics only.
   * User-facing indicator must not show conflict (multi-tab merge stays diagnostics-only).
   */
  | 'conflict';

export type UserFacingSyncPhase =
  | 'idle'
  | 'saving_local'
  | 'saved'
  | 'offline'
  | 'local_failed'
  | 'sync_pending'
  | 'sync_failed';

export interface SyncUiStatus {
  phase: UserFacingSyncPhase;
  label: string;
  scope: { sectionId: string | null; boardId: string | null };
  online: boolean;
  anyLocalPending: boolean;
  anyLocalError: boolean;
  anyCloudPending: boolean;
  anyCloudFailure: boolean;
  /** Diagnostics-only count; not shown in the user indicator. */
  conflictCount: number;
  updatedAt: number;
}

export const SYNC_STATUS_UI_FLAG = 'fw_sync_status_ui';

export function isSyncStatusUiEnabled(storage?: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return true;
    return s.getItem(SYNC_STATUS_UI_FLAG) !== '0';
  } catch {
    return true;
  }
}
