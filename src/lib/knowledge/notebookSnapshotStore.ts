import { fwPersistWarn } from '../freeSpacePersistence';
import {
  idbDelete,
  idbGetByIndex,
  idbPut,
  SNAPSHOTS_STORE,
} from './knowledgeJournalIdb';
import {
  SNAPSHOT_DEBOUNCE_MS,
  SNAPSHOT_EDIT_THRESHOLD,
  SNAPSHOT_MAX_PER_NOTEBOOK,
  type NotebookSnapshot,
} from './knowledgeTypes';

function newSnapshotId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `snap-${crypto.randomUUID()}`;
  }
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type PendingSnapshot = {
  timer: ReturnType<typeof setTimeout>;
  sectionId: string;
  boardId: string;
  objectId: string;
  objectTitle: string;
  body: string;
  editGeneration: number;
};

const pendingByObject = new Map<string, PendingSnapshot>();

export async function listNotebookSnapshots(
  sectionId: string,
  objectId?: string,
): Promise<NotebookSnapshot[]> {
  if (!sectionId) return [];
  try {
    const rows = objectId
      ? await idbGetByIndex<NotebookSnapshot>(SNAPSHOTS_STORE, 'sectionObject', IDBKeyRange.only([sectionId, objectId]))
      : await idbGetByIndex<NotebookSnapshot>(
          SNAPSHOTS_STORE,
          'sectionObject',
          IDBKeyRange.bound([sectionId, ''], [sectionId, '\uffff']),
        );
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    fwPersistWarn(`Could not list notebook snapshots: ${String(e)}`);
    return [];
  }
}

async function trimSnapshotsForObject(sectionId: string, objectId: string): Promise<void> {
  const rows = await listNotebookSnapshots(sectionId, objectId);
  if (rows.length <= SNAPSHOT_MAX_PER_NOTEBOOK) return;
  const excess = rows.slice(SNAPSHOT_MAX_PER_NOTEBOOK);
  for (const row of excess) {
    await idbDelete(SNAPSHOTS_STORE, row.id).catch(() => undefined);
  }
}

export async function writeNotebookSnapshot(input: {
  sectionId: string;
  boardId: string;
  objectId: string;
  objectTitle: string;
  body: string;
  editGeneration: number;
}): Promise<void> {
  const { sectionId, boardId, objectId, objectTitle, body, editGeneration } = input;
  if (!sectionId || !objectId || !body.trim()) return;
  const snapshot: NotebookSnapshot = {
    id: newSnapshotId(),
    sectionId,
    boardId: boardId || 'main',
    objectId,
    objectTitle: objectTitle || 'Notebook',
    body,
    createdAt: Date.now(),
    editGeneration,
  };
  try {
    await idbPut(SNAPSHOTS_STORE, snapshot);
    await trimSnapshotsForObject(sectionId, objectId);
  } catch (e) {
    fwPersistWarn(`Could not write notebook snapshot for "${objectId}": ${String(e)}`);
  }
}

/**
 * Debounced snapshot writer — fires after edit threshold or debounce interval.
 */
export function scheduleNotebookSnapshot(input: {
  sectionId: string;
  boardId: string;
  objectId: string;
  objectTitle: string;
  body: string;
  editGeneration: number;
}): void {
  const { objectId, editGeneration } = input;
  if (!input.sectionId || !objectId) return;

  const shouldFlushNow = editGeneration > 0 && editGeneration % SNAPSHOT_EDIT_THRESHOLD === 0;
  const existing = pendingByObject.get(objectId);
  if (existing) clearTimeout(existing.timer);

  const flush = () => {
    pendingByObject.delete(objectId);
    void writeNotebookSnapshot(input);
  };

  if (shouldFlushNow) {
    flush();
    return;
  }

  const timer = setTimeout(flush, SNAPSHOT_DEBOUNCE_MS);
  pendingByObject.set(objectId, { ...input, timer });
}

export async function deleteNotebookSnapshot(id: string): Promise<void> {
  if (!id) return;
  try {
    await idbDelete(SNAPSHOTS_STORE, id);
  } catch (e) {
    fwPersistWarn(`Could not delete notebook snapshot "${id}": ${String(e)}`);
  }
}
