/**
 * Local purge when a Free Space board is deleted (local-first).
 * Tombstones objects, clears board-scoped localStorage. Caller enqueues cloud deletes.
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { repairFreeSpaceObjectList } from '../../hooks/useSectionFreeSpaceObjects';
import { boardScopedFreeSpaceKeys, fwPersistWarn } from '../freeSpacePersistence';

function loadBoardObjects(sectionId: string, boardId: string): ProjectSpaceObject[] {
  if (!sectionId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(boardScopedFreeSpaceKeys(sectionId, boardId).objects);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return repairFreeSpaceObjectList(parsed, sectionId).objects;
  } catch (e) {
    fwPersistWarn(`board purge load objects failed: ${String(e)}`);
    return [];
  }
}

/** Remove objects/positions/viewport/prefs for one board (not the board list key). */
export function clearBoardScopedFreeSpaceStorage(sectionId: string, boardId: string): void {
  if (!sectionId || !boardId || typeof localStorage === 'undefined') return;
  const keys = boardScopedFreeSpaceKeys(sectionId, boardId);
  try {
    localStorage.removeItem(keys.objects);
    localStorage.removeItem(keys.positions);
    localStorage.removeItem(keys.viewport);
    localStorage.removeItem(keys.prefs);
  } catch (e) {
    fwPersistWarn(`board purge clear storage failed: ${String(e)}`);
  }
}

export type PurgeFreeSpaceBoardLocallyResult = {
  objectEntityIds: string[];
};

/**
 * Durable local delete for a board: tombstone each object, clear board storage.
 * Does not modify the board list or active board — caller handles that.
 */
export async function purgeFreeSpaceBoardLocally(input: {
  sectionId: string;
  boardId: string;
}): Promise<PurgeFreeSpaceBoardLocallyResult> {
  const { sectionId, boardId } = input;
  if (!sectionId || !boardId || boardId === 'main') {
    return { objectEntityIds: [] };
  }

  const objects = loadBoardObjects(sectionId, boardId);
  const objectEntityIds = objects.map(o => o.id).filter(Boolean);

  if (objects.length > 0) {
    const { writeFreeSpaceObjectTombstone } = await import('../knowledge/tombstoneStore');
    for (const obj of objects) {
      try {
        await writeFreeSpaceObjectTombstone(sectionId, boardId, obj);
      } catch (e) {
        fwPersistWarn(`board purge tombstone failed id=${obj.id}: ${String(e)}`);
      }
    }
  }

  clearBoardScopedFreeSpaceStorage(sectionId, boardId);
  return { objectEntityIds };
}

/** Silent purge when cloud board was deleted on a peer (no tombstones / no cloud enqueue). */
export function purgeFreeSpaceBoardLocallySilent(input: {
  sectionId: string;
  boardId: string;
}): void {
  if (!input.sectionId || !input.boardId || input.boardId === 'main') return;
  clearBoardScopedFreeSpaceStorage(input.sectionId, input.boardId);
}
