/**
 * Sync UI status types for PR 0.
 *
 * `sync_pending` and `sync_failed` are reserved for future cloud sync PRs.
 * PR 0 must never emit or render them.
 */

export type SyncUiPhase =
  | 'idle'
  | 'saving_local'
  | 'saved_local'
  | 'offline'
  | 'local_failed'
  /** Reserved — forward compatibility only; never emitted in PR 0. */
  | 'sync_pending'
  /** Reserved — forward compatibility only; never emitted in PR 0. */
  | 'sync_failed'
  /**
   * Internal / diagnostics only in PR 0.
   * User-facing indicator must not show conflict (multi-tab merge stays diagnostics-only).
   */
  | 'conflict';

export type UserFacingSyncPhase =
  | 'idle'
  | 'saving_local'
  | 'saved_local'
  | 'offline'
  | 'local_failed';

export interface SyncUiStatus {
  /** User-facing phase — never sync_* or conflict in PR 0. */
  phase: UserFacingSyncPhase;
  label: string;
  scope: { sectionId: string | null; boardId: string | null };
  online: boolean;
  anyLocalPending: boolean;
  anyLocalError: boolean;
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
