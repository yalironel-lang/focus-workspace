import { boardScopedFreeSpaceKeys, fwPersistWarn, sanitizePositionMap } from '../freeSpacePersistence';
import type { BlockPos } from '../../hooks/useBlockPositions';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  idbDelete,
  idbGetAll,
  idbGetByIndex,
  idbPut,
  TOMBSTONES_STORE,
} from './knowledgeJournalIdb';
import {
  TOMBSTONE_RETENTION_MS,
  type FreeSpaceObjectTombstone,
  type KnowledgeTombstone,
  type NotebookBlockSnapshot,
  type NotebookBlockTombstone,
  type NotebookPageTombstone,
} from './knowledgeTypes';
import type { NotebookPage } from '../notebookPages/types';

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function objectLabel(obj: ProjectSpaceObject): string {
  const title = obj.title?.trim();
  if (title) return title;
  switch (obj.type) {
    case 'notebook': return 'Notebook';
    case 'note': return 'Note';
    case 'mistake': return 'Mistake';
    case 'pdf': return 'PDF';
    case 'image': return 'Image';
    case 'checklist': return 'Checklist';
    case 'graph': return 'Graph';
    case 'link': return 'Link';
    case 'companion': return 'Companion';
    case 'studyfile': return 'Study file';
    case 'calculator': return 'Calculator';
    case 'sheet': return 'Sheet';
    default: return 'Object';
  }
}

export function readObjectPositionSync(
  sectionId: string,
  boardId: string,
  objectId: string,
): BlockPos | undefined {
  if (!sectionId || !objectId) return undefined;
  try {
    const keys = boardScopedFreeSpaceKeys(sectionId, boardId);
    const raw = localStorage.getItem(keys.positions);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    const { map } = sanitizePositionMap(parsed, sectionId);
    return map[objectId];
  } catch {
    return undefined;
  }
}

export async function writeFreeSpaceObjectTombstone(
  sectionId: string,
  boardId: string,
  object: ProjectSpaceObject,
): Promise<void> {
  if (!sectionId || !object.id) return;
  const now = Date.now();
  const tombstone: FreeSpaceObjectTombstone = {
    id: newId('ts'),
    kind: 'free_space_object',
    sectionId,
    boardId: boardId || 'main',
    deletedAt: now,
    expiresAt: now + TOMBSTONE_RETENTION_MS,
    label: objectLabel(object),
    objectId: object.id,
    objectType: object.type,
    payload: object,
    position: readObjectPositionSync(sectionId, boardId, object.id),
  };
  try {
    await idbPut(TOMBSTONES_STORE, tombstone);
  } catch (e) {
    fwPersistWarn(`Could not write object tombstone for "${object.id}": ${String(e)}`);
  }
}

export async function writeNotebookBlockTombstone(input: {
  sectionId: string;
  boardId: string;
  objectId: string;
  objectTitle: string;
  blockIndex: number;
  block: NotebookBlockSnapshot;
}): Promise<void> {
  const { sectionId, boardId, objectId, objectTitle, blockIndex, block } = input;
  if (!sectionId || !objectId || !block?.id) return;
  const now = Date.now();
  const kindLabel = typeof block.kind === 'string' ? block.kind : 'block';
  const preview =
    typeof block.text === 'string' && block.text.trim()
      ? block.text.trim().slice(0, 48)
      : kindLabel;
  const tombstone: NotebookBlockTombstone = {
    id: newId('ts'),
    kind: 'notebook_block',
    sectionId,
    boardId: boardId || 'main',
    deletedAt: now,
    expiresAt: now + TOMBSTONE_RETENTION_MS,
    label: `${objectTitle || 'Notebook'} · ${preview}`,
    objectId,
    objectTitle: objectTitle || 'Notebook',
    blockIndex,
    block,
  };
  try {
    await idbPut(TOMBSTONES_STORE, tombstone);
  } catch (e) {
    fwPersistWarn(`Could not write notebook block tombstone for "${block.id}": ${String(e)}`);
  }
}

/**
 * M7.5C2 — Persist a recoverable notebook_page tombstone and verify durability.
 * Fail-closed: callers must not mutate the Notebook if this returns ok:false.
 */
export async function writeNotebookPageTombstone(input: {
  sectionId: string;
  boardId: string;
  objectId: string;
  objectTitle: string;
  page: NotebookPage;
  indexInSection: number;
  sectionIdOfPage: string;
}): Promise<{ ok: true; tombstone: NotebookPageTombstone } | { ok: false; reason: string }> {
  const { sectionId, boardId, objectId, objectTitle, page, indexInSection, sectionIdOfPage } =
    input;
  if (!sectionId || !objectId || !page?.id || !sectionIdOfPage) {
    return { ok: false, reason: 'Incomplete page recovery payload.' };
  }
  const now = Date.now();
  const pageTitle = page.title?.trim() || 'Page';
  const tombstone: NotebookPageTombstone = {
    id: newId('ts'),
    kind: 'notebook_page',
    sectionId,
    boardId: boardId || 'main',
    deletedAt: now,
    expiresAt: now + TOMBSTONE_RETENTION_MS,
    label: `${objectTitle || 'Notebook'} · ${pageTitle}`,
    objectId,
    objectTitle: objectTitle || 'Notebook',
    page,
    indexInSection: Math.max(0, indexInSection),
    sectionIdOfPage,
  };
  try {
    await idbPut(TOMBSTONES_STORE, tombstone);
  } catch (e) {
    fwPersistWarn(`Could not write notebook page tombstone for "${page.id}": ${String(e)}`);
    return { ok: false, reason: 'Could not save the page for recovery. The page was not deleted.' };
  }
  const listed = await listTombstones(sectionId);
  const verified = listed.find(t => t.id === tombstone.id && t.kind === 'notebook_page');
  if (!verified) {
    return { ok: false, reason: 'Could not verify page recovery record. The page was not deleted.' };
  }
  return { ok: true, tombstone };
}

export async function listTombstones(sectionId?: string): Promise<KnowledgeTombstone[]> {
  try {
    const rows = sectionId
      ? await idbGetByIndex<KnowledgeTombstone>(TOMBSTONES_STORE, 'sectionId', sectionId)
      : await idbGetAll<KnowledgeTombstone>(TOMBSTONES_STORE);
    return rows.sort((a, b) => b.deletedAt - a.deletedAt);
  } catch (e) {
    fwPersistWarn(`Could not list tombstones: ${String(e)}`);
    return [];
  }
}

export async function deleteTombstone(id: string): Promise<void> {
  if (!id) return;
  try {
    await idbDelete(TOMBSTONES_STORE, id);
  } catch (e) {
    fwPersistWarn(`Could not delete tombstone "${id}": ${String(e)}`);
  }
}

export async function purgeExpiredTombstones(): Promise<number> {
  const now = Date.now();
  let purged = 0;
  try {
    const all = await idbGetAll<KnowledgeTombstone>(TOMBSTONES_STORE);
    for (const row of all) {
      if (row.expiresAt > now) continue;
      await deleteTombstonePermanently(row);
      purged += 1;
    }
  } catch (e) {
    fwPersistWarn(`Tombstone purge failed: ${String(e)}`);
  }
  return purged;
}

export type DeleteTombstonePermanentlyOptions = {
  /** Used for notebook asset cloud delete enqueue when cascading. */
  userId?: string | null;
};

/** Permanently remove tombstone and associated blobs (when applicable). */
export async function deleteTombstonePermanently(
  tombstone: KnowledgeTombstone,
  options?: DeleteTombstonePermanentlyOptions,
): Promise<void> {
  if (tombstone.kind === 'free_space_object') {
    const { sectionId, objectId, objectType, payload } = tombstone;
    if (objectType === 'pdf') {
      const { deletePdfBlob } = await import('../freeSpacePdfIdb');
      await deletePdfBlob(sectionId, objectId).catch(() => undefined);
      const { deletePdfStudyMarks } = await import('../pdfStudyMarks/pdfStudyMarksIdb');
      await deletePdfStudyMarks(sectionId, objectId).catch(() => undefined);
    } else if (objectType === 'image') {
      const { deleteImageBlob } = await import('../freeSpaceImageIdb');
      await deleteImageBlob(sectionId, objectId).catch(() => undefined);
    } else if (objectType === 'studyfile') {
      const { deleteStudyFileBlob } = await import('../freeSpaceStudyFileIdb');
      await deleteStudyFileBlob(sectionId, objectId).catch(() => undefined);
    } else if (objectType === 'notebook') {
      // M7.0: soft-delete keeps assets; permanent delete / expiry destroys them.
      // Cascade must succeed before tombstone removal so cleanup remains retryable.
      const { cascadeDeleteNotebookAssets } = await import('../notebookDeleteCascade');
      try {
        await cascadeDeleteNotebookAssets({
          userId: options?.userId,
          sectionId,
          objectId,
          content: payload?.content,
        });
      } catch (e) {
        fwPersistWarn(`Notebook asset cascade on permanent delete failed: ${String(e)}`);
        throw e instanceof Error ? e : new Error(String(e));
      }
    }
  }
  // M7.5C2 notebook_page: drop recovery only. NEVER cascadeDeleteNotebookAssets —
  // sibling pages may still own assets. Page-exclusive keys become GC-eligible
  // via normal live orphan GC once tombstone extras no longer retain them.
  await deleteTombstone(tombstone.id);
}
