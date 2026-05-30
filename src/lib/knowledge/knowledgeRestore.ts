import { boardScopedFreeSpaceKeys, fwPersistWarn, sanitizePositionMap } from '../freeSpacePersistence';
import type { BlockPos } from '../../hooks/useBlockPositions';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { serializeBlockSnapshot } from '../notebookBlockRichText';
import { deleteTombstone } from './tombstoneStore';
import type {
  FreeSpaceObjectTombstone,
  KnowledgeTombstone,
  NotebookBlockTombstone,
  NotebookSnapshot,
} from './knowledgeTypes';

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

function saveObjectsSync(sectionId: string, boardId: string, objects: ProjectSpaceObject[]): void {
  const keys = boardScopedFreeSpaceKeys(sectionId, boardId);
  try {
    localStorage.setItem(keys.objects, JSON.stringify(objects));
  } catch (e) {
    fwPersistWarn(`Could not save objects during restore: ${String(e)}`);
  }
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

function savePositionSync(
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

export async function restoreFromTombstone(tombstone: KnowledgeTombstone): Promise<RestoreResult> {
  if (tombstone.kind === 'free_space_object') {
    return restoreFreeSpaceObject(tombstone);
  }
  return restoreNotebookBlock(tombstone);
}

async function restoreFreeSpaceObject(tombstone: FreeSpaceObjectTombstone): Promise<RestoreResult> {
  const { sectionId, boardId, payload, position, objectId } = tombstone;
  const objects = loadObjectsSync(sectionId, boardId);
  if (objects.some(o => o.id === objectId)) {
    return { ok: false, reason: 'An object with this id already exists in the workspace.' };
  }
  objects.push({ ...payload, updatedAt: Date.now() });
  saveObjectsSync(sectionId, boardId, objects);
  if (position) {
    savePositionSync(sectionId, boardId, objectId, position);
  }
  await deleteTombstone(tombstone.id);
  return { ok: true };
}

async function restoreNotebookBlock(tombstone: NotebookBlockTombstone): Promise<RestoreResult> {
  const { sectionId, boardId, objectId, blockIndex, block } = tombstone;
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
  saveObjectsSync(sectionId, boardId, nextObjects);
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
    return {
      ...o,
      content: { ...notebook.content, body },
      updatedAt: Date.now(),
    };
  });
  saveObjectsSync(sectionId, boardId, nextObjects);
  return { ok: true };
}
