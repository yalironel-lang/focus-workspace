/**
 * Section-wide Free Space source for Mission Control Phase 1.
 *
 * Reuses existing cloud fetch + LWW/protect helpers. Does NOT write every board
 * into localStorage and does NOT invent a new sync path.
 *
 * Workspace apply remains mounted-board-only; MC builds an in-memory index.
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { repairFreeSpaceObjectList } from '../../hooks/useSectionFreeSpaceObjects';
import { resolveCacheNamespace } from '../focusCacheNamespace';
import {
  fetchFreeSpaceBoardsForSection,
  type FreeSpaceBoardCloudRow,
} from '../focusCache/freeSpaceBoardCloud';
import {
  fetchFreeSpaceObjectsForSection,
  type FreeSpaceObjectCloudRow,
} from '../focusCache/freeSpaceObjectCloud';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from '../focusCache/freeSpaceObjectCreateEnqueue';
import {
  buildProtectedEntityIds,
  parseCloudObjectForPull,
} from '../focusCache/freeSpaceObjectPull';
import { mergeIncomingFreeSpaceObject } from '../focusCache/freeSpaceObjectGeometryLww';
import { listPendingOperations } from '../focusCache/pendingOperations';
import {
  boardScopedFreeSpaceKeys,
  sectionBoardsListKey,
} from '../freeSpacePersistence';
import type { MissionControlIndexCompleteness } from './types';

export type FreeSpaceIndexEntry = {
  boardId: string;
  object: ProjectSpaceObject;
};

export type SectionFreeSpaceIndexSource = {
  entries: FreeSpaceIndexEntry[];
  completeness: MissionControlIndexCompleteness;
  boardIds: string[];
};

function normalizeBoardId(boardId: string): string {
  return !boardId || boardId === 'main' ? 'main' : boardId;
}

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

/** Read board ids from localStorage board list (main always included). */
export function readLocalBoardIds(sectionId: string): string[] {
  const ids = new Set<string>(['main']);
  if (!sectionId) return [...ids];
  try {
    const raw = localStorage.getItem(sectionBoardsListKey(sectionId));
    if (!raw) return [...ids];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...ids];
    for (const b of parsed) {
      if (b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string') {
        const id = ((b as { id: string }).id).trim();
        if (id) ids.add(normalizeBoardId(id));
      }
    }
  } catch {
    /* ignore */
  }
  return [...ids];
}

/** Read durable Free Space objects for one board from localStorage (read-only). */
export function readLocalFreeSpaceObjectsForBoard(
  sectionId: string,
  boardId: string,
): ProjectSpaceObject[] {
  if (!sectionId) return [];
  const key = boardScopedFreeSpaceKeys(sectionId, boardId).objects;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return repairFreeSpaceObjectList(parsed, sectionId).objects;
  } catch {
    return [];
  }
}

export type PendingCreateOverlay = {
  boardId: string;
  object: ProjectSpaceObject;
};

/**
 * Pure section-wide merge for tests and loaders.
 * Same object id → one entry. Protected/pending local wins via existing LWW helpers.
 */
export function buildSectionFreeSpaceIndexEntries(input: {
  sectionId: string;
  localByBoard: ReadonlyMap<string, readonly ProjectSpaceObject[]>;
  cloudRows: readonly FreeSpaceObjectCloudRow[] | null;
  protectedEntityIds: ReadonlySet<string>;
  pendingCreates?: readonly PendingCreateOverlay[];
  pendingDeleteIds?: ReadonlySet<string>;
}): FreeSpaceIndexEntry[] {
  const sectionId = input.sectionId;
  const deleteIds = input.pendingDeleteIds ?? new Set<string>();
  const byId = new Map<string, FreeSpaceIndexEntry>();

  for (const [boardIdRaw, objects] of input.localByBoard) {
    const boardId = normalizeBoardId(boardIdRaw);
    for (const object of objects) {
      if (!object?.id || deleteIds.has(object.id)) continue;
      byId.set(object.id, { boardId, object });
    }
  }

  if (input.pendingCreates) {
    for (const pc of input.pendingCreates) {
      if (!pc.object?.id || deleteIds.has(pc.object.id)) continue;
      const boardId = normalizeBoardId(pc.boardId);
      const existing = byId.get(pc.object.id);
      if (!existing) {
        byId.set(pc.object.id, { boardId, object: pc.object });
        continue;
      }
      // Prefer newer pending payload when both present.
      if ((pc.object.updatedAt ?? 0) >= (existing.object.updatedAt ?? 0)) {
        byId.set(pc.object.id, { boardId, object: pc.object });
      }
    }
  }

  if (input.cloudRows) {
    for (const row of input.cloudRows) {
      const cloudBoardId = normalizeBoardId(
        typeof row.board_id === 'string' ? row.board_id : 'main',
      );
      const parsed = parseCloudObjectForPull(row.object, sectionId);
      if (!parsed) continue;
      const cloudObj =
        isExactNonEmptyId(row.id) && row.id !== parsed.id
          ? { ...parsed, id: row.id }
          : parsed;
      if (deleteIds.has(cloudObj.id)) continue;

      const localEntry = byId.get(cloudObj.id);
      const merged = mergeIncomingFreeSpaceObject({
        local: localEntry?.object,
        cloud: cloudObj,
        protectedEntityIds: input.protectedEntityIds,
      });
      const boardId = merged.contentAccepted
        ? cloudBoardId
        : (localEntry?.boardId ?? cloudBoardId);
      byId.set(cloudObj.id, { boardId, object: merged.nextObject });
    }
  }

  return [...byId.values()];
}

async function loadPendingOverlays(
  userId: string | null | undefined,
  sectionId: string,
): Promise<{
  protectedEntityIds: Set<string>;
  pendingCreates: PendingCreateOverlay[];
  pendingDeleteIds: Set<string>;
}> {
  const empty = {
    protectedEntityIds: new Set<string>(),
    pendingCreates: [] as PendingCreateOverlay[],
    pendingDeleteIds: new Set<string>(),
  };
  const ns = resolveCacheNamespace(userId, sectionId);
  if (!ns.ok) return empty;

  const listed = await listPendingOperations(ns.namespace);
  if (!listed.ok) return empty;

  const pendingCreateIds = new Set<string>();
  const pendingUpdateIds = new Set<string>();
  const pendingDeleteIds = new Set<string>();
  const pendingCreates: PendingCreateOverlay[] = [];

  for (const op of listed.value) {
    if (op.entityType !== FREE_SPACE_OBJECT_ENTITY_TYPE) continue;
    if (!isExactNonEmptyId(op.entityId)) continue;
    if (op.operationType === 'delete') {
      pendingDeleteIds.add(op.entityId);
      continue;
    }
    if (op.operationType === 'update') {
      pendingUpdateIds.add(op.entityId);
    }
    if (op.operationType === 'create') {
      pendingCreateIds.add(op.entityId);
    }
    const payload = op.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
    const boardId =
      typeof (payload as { boardId?: unknown }).boardId === 'string'
        ? normalizeBoardId((payload as { boardId: string }).boardId)
        : 'main';
    const rawObj = (payload as { object?: unknown }).object;
    const parsed = parseCloudObjectForPull(rawObj, sectionId);
    if (!parsed) continue;
    // CREATE must appear immediately; UPDATE payload overlays when protected.
    if (op.operationType === 'create' || op.operationType === 'update') {
      pendingCreates.push({ boardId, object: parsed });
    }
  }

  const protectedEntityIds = buildProtectedEntityIds({
    pendingCreateEntityIds: pendingCreateIds,
    pendingUpdateEntityIds: pendingUpdateIds,
    pendingDeletedIds: pendingDeleteIds,
  });

  return { protectedEntityIds, pendingCreates, pendingDeleteIds };
}

function collectLocalByBoard(
  sectionId: string,
  boardIds: string[],
): Map<string, ProjectSpaceObject[]> {
  const map = new Map<string, ProjectSpaceObject[]>();
  for (const boardId of boardIds) {
    const normalized = normalizeBoardId(boardId);
    map.set(normalized, readLocalFreeSpaceObjectsForBoard(sectionId, normalized));
  }
  return map;
}

/**
 * Build a local-only snapshot (sync). completeness is always `partial` or empty-ready
 * caller upgrades after cloud.
 */
export function buildLocalSectionFreeSpaceIndexSource(input: {
  sectionId: string;
  boardIds?: string[];
}): SectionFreeSpaceIndexSource {
  const boardIds = input.boardIds?.length
    ? [...new Set(input.boardIds.map(normalizeBoardId))]
    : readLocalBoardIds(input.sectionId);
  if (!boardIds.includes('main')) boardIds.unshift('main');

  const localByBoard = collectLocalByBoard(input.sectionId, boardIds);
  const entries = buildSectionFreeSpaceIndexEntries({
    sectionId: input.sectionId,
    localByBoard,
    cloudRows: null,
    protectedEntityIds: new Set(),
  });

  return {
    entries,
    completeness: 'partial',
    boardIds: [...new Set(boardIds.map(normalizeBoardId))],
  };
}

export type LoadSectionFreeSpaceIndexSourceInput = {
  sectionId: string;
  userId?: string | null;
  /** Prefer boards already known to the UI (after board catch-up). */
  boardIds?: string[];
  /** When true, skip cloud and return local-only. */
  offline?: boolean;
  /** Test seam: inject cloud rows instead of fetching. */
  cloudRowsOverride?: FreeSpaceObjectCloudRow[] | null;
  /** Test seam: inject board cloud rows. */
  boardRowsOverride?: FreeSpaceBoardCloudRow[] | null;
  /** Test seam: skip pending_operations. */
  skipPending?: boolean;
};

/**
 * Async Section-wide Free Space index source.
 * Local first, then cloud all-board fetch + pending overlay.
 */
export async function loadSectionFreeSpaceIndexSource(
  input: LoadSectionFreeSpaceIndexSourceInput,
): Promise<SectionFreeSpaceIndexSource> {
  const sectionId = input.sectionId;
  if (!sectionId) {
    return { entries: [], completeness: 'local-only', boardIds: ['main'] };
  }

  let boardIds = input.boardIds?.map(normalizeBoardId) ?? readLocalBoardIds(sectionId);
  boardIds = [...new Set(['main', ...boardIds])];

  if (!input.offline && input.boardRowsOverride === undefined) {
    const boards = await fetchFreeSpaceBoardsForSection(sectionId);
    if (boards.ok) {
      for (const row of boards.rows) {
        if (isExactNonEmptyId(row.id)) boardIds.push(normalizeBoardId(row.id));
      }
      boardIds = [...new Set(boardIds)];
    }
  } else if (input.boardRowsOverride) {
    for (const row of input.boardRowsOverride) {
      if (isExactNonEmptyId(row.id)) boardIds.push(normalizeBoardId(row.id));
    }
    boardIds = [...new Set(boardIds)];
  }

  const localByBoard = collectLocalByBoard(sectionId, boardIds);

  const pending = input.skipPending
    ? {
        protectedEntityIds: new Set<string>(),
        pendingCreates: [] as PendingCreateOverlay[],
        pendingDeleteIds: new Set<string>(),
      }
    : await loadPendingOverlays(input.userId ?? null, sectionId);

  if (input.offline) {
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId,
      localByBoard,
      cloudRows: null,
      protectedEntityIds: pending.protectedEntityIds,
      pendingCreates: pending.pendingCreates,
      pendingDeleteIds: pending.pendingDeleteIds,
    });
    return { entries, completeness: 'local-only', boardIds };
  }

  let cloudRows: FreeSpaceObjectCloudRow[] | null = null;
  let cloudOk = false;

  if (input.cloudRowsOverride !== undefined) {
    cloudRows = input.cloudRowsOverride;
    cloudOk = input.cloudRowsOverride !== null;
  } else {
    const fetched = await fetchFreeSpaceObjectsForSection(sectionId);
    if (fetched.ok) {
      cloudRows = fetched.rows;
      cloudOk = true;
      for (const row of fetched.rows) {
        boardIds.push(normalizeBoardId(row.board_id));
      }
      boardIds = [...new Set(boardIds)];
      // Re-read local for any newly discovered board ids (usually empty on new device).
      for (const id of boardIds) {
        if (!localByBoard.has(id)) {
          localByBoard.set(id, readLocalFreeSpaceObjectsForBoard(sectionId, id));
        }
      }
    }
  }

  const entries = buildSectionFreeSpaceIndexEntries({
    sectionId,
    localByBoard,
    cloudRows,
    protectedEntityIds: pending.protectedEntityIds,
    pendingCreates: pending.pendingCreates,
    pendingDeleteIds: pending.pendingDeleteIds,
  });

  return {
    entries,
    completeness: cloudOk ? 'complete' : 'local-only',
    boardIds,
  };
}
