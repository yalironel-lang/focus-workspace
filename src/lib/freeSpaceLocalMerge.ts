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

/** Union objects by id; prefer higher updatedAt; tie → incoming wins. */
export function mergeFreeSpaceObjects(
  base: ProjectSpaceObject[],
  incoming: ProjectSpaceObject[],
): { merged: ProjectSpaceObject[]; conflicts: string[] } {
  const byId = new Map<string, ProjectSpaceObject>();
  const conflicts: string[] = [];

  for (const o of base) {
    if (o?.id) byId.set(o.id, o);
  }
  for (const o of incoming) {
    if (!o?.id) continue;
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

/** Disk keys preserved; pending overlays dirty keys from this tab. */
export function mergePositionMaps(disk: PositionMap, pending: PositionMap): PositionMap {
  return { ...disk, ...pending };
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
