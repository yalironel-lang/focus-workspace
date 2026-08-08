/**
 * Merge helpers for Free Space localStorage — multi-tab safe read-merge-write.
 */

import type { PositionMap } from '../hooks/useBlockPositions';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { boardScopedFreeSpaceKeys } from './freeSpacePersistence';

export type FreeSpaceStorageKind = 'objects' | 'positions' | 'viewport' | 'prefs';

export function parseFreeSpaceStorageKey(storageKey: string): {
  sectionId: string;
  boardId: string;
  kind: FreeSpaceStorageKind;
} | null {
  const main = storageKey.match(
    /^fw_section_([^_]+)_free_space_(objects|positions|viewport|prefs)_v1$/,
  );
  if (main) {
    return { sectionId: main[1], boardId: 'main', kind: main[2] as FreeSpaceStorageKind };
  }
  const board = storageKey.match(
    /^fw_section_([^_]+)_board_([^_]+)_(objects|positions|viewport|prefs)_v1$/,
  );
  if (board) {
    return { sectionId: board[1], boardId: board[2], kind: board[3] as FreeSpaceStorageKind };
  }
  return null;
}

export function freeSpaceStorageKey(
  sectionId: string,
  boardId: string,
  kind: FreeSpaceStorageKind,
): string {
  return boardScopedFreeSpaceKeys(sectionId, boardId)[kind];
}

/**
 * Union objects by id; prefer higher updatedAt; tie → incoming wins.
 * `deletedIds` (ids explicitly deleted in this tab, not yet committed) are
 * excluded from both sides so a stale disk copy cannot resurrect a delete.
 */
export function mergeFreeSpaceObjects(
  base: ProjectSpaceObject[],
  incoming: ProjectSpaceObject[],
  deletedIds?: ReadonlySet<string>,
): { merged: ProjectSpaceObject[]; conflicts: string[] } {
  const byId = new Map<string, ProjectSpaceObject>();
  const conflicts: string[] = [];

  for (const o of base) {
    if (o?.id && !deletedIds?.has(o.id)) byId.set(o.id, o);
  }
  for (const o of incoming) {
    if (!o?.id || deletedIds?.has(o.id)) continue;
    const prev = byId.get(o.id);
    if (!prev) {
      byId.set(o.id, o);
      continue;
    }
    const prevAt = prev.updatedAt ?? 0;
    const nextAt = o.updatedAt ?? 0;
    if (nextAt > prevAt) {
      byId.set(o.id, o);
    } else if (nextAt < prevAt) {
      conflicts.push(`object "${o.id}": kept older tab copy (updatedAt ${prevAt} > ${nextAt})`);
    } else if (JSON.stringify(prev) !== JSON.stringify(o)) {
      byId.set(o.id, o);
      conflicts.push(`object "${o.id}": same updatedAt — applied latest merge`);
    }
  }

  return { merged: [...byId.values()], conflicts };
}

/**
 * Disk keys preserved; pending overlays dirty keys from this tab.
 * `deletedIds` are removed from the result so stale disk entries for
 * objects deleted in this tab do not survive the merge.
 */
export function mergePositionMaps(
  disk: PositionMap,
  pending: PositionMap,
  deletedIds?: ReadonlySet<string>,
): PositionMap {
  const merged = { ...disk, ...pending };
  if (deletedIds) {
    for (const id of deletedIds) delete merged[id];
  }
  return merged;
}

/**
 * Run one persist attempt with the tab's pending-deleted ids.
 * A snapshot of the live set is passed to `attempt`; on a successful commit
 * the snapshotted ids are drained from the live set (delete is now durable
 * on disk). On failure the set is left intact so the next attempt retries.
 */
export function persistWithPendingDeletes(
  pendingDeletedIds: Set<string>,
  attempt: (deletedIds: ReadonlySet<string> | undefined) => boolean,
): boolean {
  const snapshot = pendingDeletedIds.size ? new Set(pendingDeletedIds) : undefined;
  if (!attempt(snapshot)) return false;
  if (snapshot) {
    for (const id of snapshot) pendingDeletedIds.delete(id);
  }
  return true;
}

export interface PersistedViewport {
  zoom: number;
  panX: number;
  panY: number;
}

/** Pending viewport wins when present. */
export function mergeViewport(disk: PersistedViewport, pending: PersistedViewport): PersistedViewport {
  return { ...disk, ...pending };
}
