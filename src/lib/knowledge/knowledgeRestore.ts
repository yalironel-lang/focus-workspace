import { boardScopedFreeSpaceKeys, fwPersistWarn, sanitizePositionMap } from '../freeSpacePersistence';
import type { BlockPos } from '../../hooks/useBlockPositions';
import type { ProjectObjectContent, ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { serializeBlockSnapshot } from '../notebookBlockRichText';
import { deleteTombstone } from './tombstoneStore';
import type {
  FreeSpaceObjectTombstone,
  KnowledgeTombstone,
  NotebookBlockTombstone,
  NotebookSnapshot,
} from './knowledgeTypes';
import { resolvePageForBodyProjection } from '../notebookPages/hydrate';
import { replaceNotebookPageBody } from '../notebookPages/bodyCodec';
import type { NotebookPage } from '../notebookPages/types';
import { cancelPendingFreeSpaceObjectDeletes } from '../focusCache/freeSpaceObjectDeleteEnqueue';
import { enqueueFreeSpaceObjectCreate } from '../focusCache/freeSpaceObjectCreateEnqueue';

function loadObjectsSync(sectionId: string, boardId: string): ProjectSpaceObject[] {
  try {
    const keys = boardScopedFreeSpaceKeys(sectionId, boardId);
    const raw = localStorage.getItem(keys.objects);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is ProjectSpaceObject =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as ProjectSpaceObject).id === 'string' &&
        typeof (row as ProjectSpaceObject).type === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Restore-only durable write. Does not change other Free Space persist callers.
 * Returns failure on throw OR when the expected object is missing after write.
 */
function trySaveObjectsForRestore(
  sectionId: string,
  boardId: string,
  objects: ProjectSpaceObject[],
  expectedObjectId: string,
): { ok: true } | { ok: false; reason: string } {
  const keys = boardScopedFreeSpaceKeys(sectionId, boardId);
  try {
    localStorage.setItem(keys.objects, JSON.stringify(objects));
  } catch (e) {
    fwPersistWarn(`Could not save objects during restore: ${String(e)}`);
    return { ok: false, reason: 'Could not save the restored object. Try again.' };
  }
  const verified = loadObjectsSync(sectionId, boardId);
  if (!verified.some(o => o.id === expectedObjectId)) {
    fwPersistWarn(`Restore verify failed: object "${expectedObjectId}" missing after write`);
    return { ok: false, reason: 'Restore could not be verified. Try again.' };
  }
  return { ok: true };
}

function loadPositionsSync(sectionId: string, boardId: string): Record<string, BlockPos> {
  try {
    const keys = boardScopedFreeSpaceKeys(sectionId, boardId);
    const raw = localStorage.getItem(keys.positions);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const { map } = sanitizePositionMap(parsed, sectionId);
    return map;
  } catch {
    return {};
  }
}

/** Best-effort position write — must not gate restore success. */
function savePositionBestEffort(
  sectionId: string,
  boardId: string,
  objectId: string,
  position: BlockPos,
): void {
  const keys = boardScopedFreeSpaceKeys(sectionId, boardId);
  const map = loadPositionsSync(sectionId, boardId);
  map[objectId] = position;
  try {
    localStorage.setItem(keys.positions, JSON.stringify(map));
  } catch (e) {
    fwPersistWarn(`Could not save position during restore: ${String(e)}`);
  }
}

function insertBlockIntoBody(body: string, blockIndex: number, blockLine: string): string {
  const lines = body.length === 0 ? [] : body.split('\n');
  const idx = Math.max(0, Math.min(blockIndex, lines.length));
  lines.splice(idx, 0, blockLine);
  return lines.join('\n');
}

export type RestoreResult = { ok: true } | { ok: false; reason: string };

export type RestoreFromTombstoneOptions = {
  /** Used to cancel pending cloud DELETE and re-enqueue CREATE after local restore. */
  userId?: string | null;
};

async function finalizeCloudAfterLocalObjectRestore(input: {
  userId?: string | null;
  sectionId: string;
  boardId: string;
  object: ProjectSpaceObject;
}): Promise<void> {
  const { userId, sectionId, boardId, object } = input;
  if (!userId) return;
  try {
    await cancelPendingFreeSpaceObjectDeletes({
      userId,
      sectionId,
      entityIds: [object.id],
    });
  } catch (e) {
    fwPersistWarn(`Restore cancel pending delete failed for "${object.id}": ${String(e)}`);
  }
  try {
    await enqueueFreeSpaceObjectCreate({
      userId,
      sectionId,
      boardId,
      object,
    });
  } catch (e) {
    fwPersistWarn(`Restore re-enqueue create failed for "${object.id}": ${String(e)}`);
  }
}

export async function restoreFromTombstone(
  tombstone: KnowledgeTombstone,
  options?: RestoreFromTombstoneOptions,
): Promise<RestoreResult> {
  if (tombstone.kind === 'free_space_object') {
    return restoreFreeSpaceObject(tombstone, options);
  }
  return restoreNotebookBlock(tombstone);
}

/**
 * True only when the live object is the same recovery payload (ignore updatedAt).
 * Same-id alone is NOT enough — a stale/partial/conflicting object must not clear the tombstone.
 */
function isEquivalentRestoredObject(
  existing: ProjectSpaceObject,
  payload: ProjectSpaceObject,
): boolean {
  if (existing.id !== payload.id || existing.type !== payload.type) return false;
  try {
    const a = { ...existing, updatedAt: 0 };
    const b = { ...payload, updatedAt: 0 };
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

async function restoreFreeSpaceObject(
  tombstone: FreeSpaceObjectTombstone,
  options?: RestoreFromTombstoneOptions,
): Promise<RestoreResult> {
  const { sectionId, boardId, payload, position, objectId } = tombstone;
  if (!payload || typeof payload !== 'object' || payload.id !== objectId) {
    return { ok: false, reason: 'This recovery record is incomplete and cannot be restored safely.' };
  }
  if (typeof payload.type !== 'string' || !payload.type) {
    return { ok: false, reason: 'This recovery record is incomplete and cannot be restored safely.' };
  }

  const objects = loadObjectsSync(sectionId, boardId);
  const existing = objects.find(o => o.id === objectId);
  if (existing) {
    if (!isEquivalentRestoredObject(existing, payload)) {
      return {
        ok: false,
        reason: 'An object with this id already exists in the workspace and does not match the recovery copy.',
      };
    }
    // Idempotent: prior restore persisted, but tombstone cleanup failed.
    await finalizeCloudAfterLocalObjectRestore({
      userId: options?.userId,
      sectionId,
      boardId,
      object: existing,
    });
    await deleteTombstone(tombstone.id);
    return { ok: true };
  }

  const restored: ProjectSpaceObject = { ...payload, updatedAt: Date.now() };
  const nextObjects = [...objects, restored];
  const saved = trySaveObjectsForRestore(sectionId, boardId, nextObjects, objectId);
  if (!saved.ok) {
    return saved;
  }

  if (position) {
    savePositionBestEffort(sectionId, boardId, objectId, position);
  }

  await finalizeCloudAfterLocalObjectRestore({
    userId: options?.userId,
    sectionId,
    boardId,
    object: restored,
  });

  await deleteTombstone(tombstone.id);
  return { ok: true };
}

async function restoreNotebookBlock(tombstone: NotebookBlockTombstone): Promise<RestoreResult> {
  const { sectionId, boardId, objectId, blockIndex, block } = tombstone;
  if (!block || typeof block !== 'object' || typeof block.id !== 'string' || !block.id) {
    return { ok: false, reason: 'This recovery record is incomplete and cannot be restored safely.' };
  }

  const objects = loadObjectsSync(sectionId, boardId);
  const notebook = objects.find(o => o.id === objectId && o.content.type === 'notebook');
  if (!notebook || notebook.content.type !== 'notebook') {
    return { ok: false, reason: 'The parent notebook no longer exists in this workspace.' };
  }

  const line = serializeBlockSnapshot(block);
  const nextBody = insertBlockIntoBody(notebook.content.body ?? '', blockIndex, line);
  const nextObjects = objects.map(o => {
    if (o.id !== objectId) return o;
    return {
      ...o,
      content: { ...notebook.content, body: nextBody },
      updatedAt: Date.now(),
    };
  });

  const saved = trySaveObjectsForRestore(sectionId, boardId, nextObjects, objectId);
  if (!saved.ok) {
    return saved;
  }

  const verified = loadObjectsSync(sectionId, boardId).find(
    o => o.id === objectId && o.content.type === 'notebook',
  );
  if (!verified || verified.content.type !== 'notebook') {
    return { ok: false, reason: 'Restore could not be verified. Try again.' };
  }
  if (!(verified.content.body ?? '').includes(line)) {
    return { ok: false, reason: 'Restore could not be verified. Try again.' };
  }

  await deleteTombstone(tombstone.id);
  return { ok: true };
}

export async function restoreNotebookSnapshot(snapshot: NotebookSnapshot): Promise<RestoreResult> {
  const { sectionId, boardId, objectId, body } = snapshot;
  const objects = loadObjectsSync(sectionId, boardId);
  const notebook = objects.find(o => o.id === objectId && o.content.type === 'notebook');
  if (!notebook || notebook.content.type !== 'notebook') {
    return { ok: false, reason: 'The notebook no longer exists in this workspace.' };
  }
  const nextObjects = objects.map(o => {
    if (o.id !== objectId) return o;
    const notebookContent = notebook.content as Extract<ProjectObjectContent, { type: 'notebook' }>;
    const pages = Array.isArray(notebookContent.pages) ? (notebookContent.pages as NotebookPage[]) : undefined;
    let nextPages = pages;
    if (pages && pages.length > 0) {
      const activePage = resolvePageForBodyProjection(notebookContent);
      if (activePage && activePage.kind === 'document') {
        nextPages = pages.map(p =>
          p.id === activePage.id
            ? replaceNotebookPageBody(p, {
                body,
                ...(snapshot.bodyCodecVersion !== undefined
                  ? { codecVersion: snapshot.bodyCodecVersion }
                  : {}),
              })
            : p,
        );
      }
    }
    const { bodyCodecVersion: _oldCodec, ...restContent } = notebookContent;
    return {
      ...o,
      content: {
        ...restContent,
        ...(nextPages !== undefined ? { pages: nextPages } : {}),
        body,
        ...(snapshot.bodyCodecVersion !== undefined ? { bodyCodecVersion: snapshot.bodyCodecVersion } : {}),
      },
      updatedAt: Date.now(),
    };
  });
  const saved = trySaveObjectsForRestore(sectionId, boardId, nextObjects, objectId);
  if (!saved.ok) {
    return saved;
  }
  return { ok: true };
}
