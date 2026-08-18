/**
 * PR7: Free Space initial pull — mounted-board-only apply.
 *
 * Fetch may be section-scoped; apply writes localStorage / React only for the
 * currently mounted board. Content/object fields are never overwritten when
 * protected (dirty, undurable delete, pending create/update, tombstones) or when
 * cloud.updatedAt is not strictly newer. Geometry is merged independently via
 * geometry.updatedAt (see freeSpaceObjectGeometryLww). Cloud absence never deletes
 * local objects. Does not change mergeFreeSpaceObjects tie semantics.
 *
 * C1/C2: provisional winners must be re-validated immediately before LS write and
 * again inside the React patch; LS write always merges into a freshly loaded
 * durable snapshot (never a stale full-array rewrite).
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { repairFreeSpaceObjectList } from '../../hooks/useSectionFreeSpaceObjects';
import { resolveCacheNamespace } from '../focusCacheNamespace';
import { stripPdfThumbnailsFromObjects } from '../freeSpacePdfThumbIdb';
import { boardScopedFreeSpaceKeys, fwPersistWarn } from '../freeSpacePersistence';
import { tryPersistLocalStorage } from '../freeSpacePersistWrite';
import { idbGetByIndex, TOMBSTONES_STORE } from '../knowledge/knowledgeJournalIdb';
import type { KnowledgeTombstone } from '../knowledge/knowledgeTypes';
import {
  fetchFreeSpaceObjectsForSection,
  type FreeSpaceObjectCloudRow,
} from './freeSpaceObjectCloud';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './freeSpaceObjectCreateEnqueue';
import {
  incomingHasAnyFieldWin,
  mergeIncomingFreeSpaceObject,
  overlayBestLocalGeometry,
} from './freeSpaceObjectGeometryLww';
import { getActiveFreeSpaceGeometryIds } from '../freeSpaceActiveGeometry';
import { listPendingOperations } from './pendingOperations';
export { shouldAcceptCloudObject } from './freeSpaceObjectGeometryLww';

export type FreeSpacePullScope = {
  sectionId: string;
  boardId: string;
  generation: number;
};

export type FreeSpacePullComputeResult = {
  accepted: ProjectSpaceObject[];
  skippedProtectedIds: string[];
  skippedLocalWinsIds: string[];
  skippedMalformed: number;
  ignoredOtherBoardRows: number;
  /**
   * Provisional durable merge from the compute-time durable snapshot.
   * Must NOT be used for the final LS write — rebuild from fresh durable (C2).
   */
  nextDurableObjects: ProjectSpaceObject[] | null;
};

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function normalizeBoardId(boardId: string): string {
  return !boardId || boardId === 'main' ? 'main' : boardId;
}

/** True when captured pull scope still matches the live hook scope. */
export function isFreeSpacePullScopeCurrent(
  captured: FreeSpacePullScope,
  current: FreeSpacePullScope,
): boolean {
  return (
    captured.generation === current.generation &&
    captured.sectionId === current.sectionId &&
    normalizeBoardId(captured.boardId) === normalizeBoardId(current.boardId)
  );
}

export function buildProtectedEntityIds(parts: {
  dirtyIds?: Iterable<string>;
  pendingDeletedIds?: Iterable<string>;
  pendingCreateEntityIds?: Iterable<string>;
  pendingUpdateEntityIds?: Iterable<string>;
  tombstoneObjectIds?: Iterable<string>;
}): Set<string> {
  const out = new Set<string>();
  const addAll = (ids?: Iterable<string>) => {
    if (!ids) return;
    for (const id of ids) {
      if (isExactNonEmptyId(id)) out.add(id);
    }
  };
  addAll(parts.dirtyIds);
  addAll(parts.pendingDeletedIds);
  addAll(parts.pendingCreateEntityIds);
  addAll(parts.pendingUpdateEntityIds);
  addAll(parts.tombstoneObjectIds);
  return out;
}

/**
 * Geometry apply is independent of content dirty / pending UPDATE.
 * Tombstones, pending deletes, pending CREATE, and active local geometry
 * (drag / resize / momentum) still block incoming geometry.
 */
export function buildGeometryBlockedIds(parts: {
  pendingDeletedIds?: Iterable<string>;
  pendingCreateEntityIds?: Iterable<string>;
  tombstoneObjectIds?: Iterable<string>;
  activeGeometryIds?: Iterable<string>;
}): Set<string> {
  const out = buildProtectedEntityIds({
    pendingDeletedIds: parts.pendingDeletedIds,
    pendingCreateEntityIds: parts.pendingCreateEntityIds,
    tombstoneObjectIds: parts.tombstoneObjectIds,
  });
  if (parts.activeGeometryIds) {
    for (const id of parts.activeGeometryIds) {
      if (isExactNonEmptyId(id)) out.add(id);
    }
  }
  return out;
}

/**
 * Local comparison source for the mounted board:
 * prefer the higher updatedAt between React and durable (covers Case H React-newer
 * and C2 concurrent durable-newer). Missing side falls back to the other.
 */
export function resolveLocalObjectForCompare(
  id: string,
  reactObjects: readonly ProjectSpaceObject[],
  durableObjects: readonly ProjectSpaceObject[],
): ProjectSpaceObject | undefined {
  const fromReact = reactObjects.find(o => o.id === id);
  const fromDurable = durableObjects.find(o => o.id === id);
  if (!fromReact) return fromDurable;
  if (!fromDurable) return fromReact;
  return (fromReact.updatedAt ?? 0) >= (fromDurable.updatedAt ?? 0) ? fromReact : fromDurable;
}

export function parseCloudObjectForPull(
  raw: unknown,
  sectionId: string,
): ProjectSpaceObject | null {
  if (!sectionId) return null;
  const { objects } = repairFreeSpaceObjectList(Array.isArray(raw) ? raw : [raw], sectionId);
  return objects[0] ?? null;
}

function localForIncomingCompare(
  id: string,
  reactObjects: readonly ProjectSpaceObject[],
  durableObjects: readonly ProjectSpaceObject[],
): ProjectSpaceObject | undefined {
  return overlayBestLocalGeometry(
    id,
    resolveLocalObjectForCompare(id, reactObjects, durableObjects),
    reactObjects,
    durableObjects,
  );
}

/** Upsert accepted winners into a local list without removing other locals. */
export function mergeAcceptedIntoObjectList(
  localObjects: readonly ProjectSpaceObject[],
  accepted: readonly ProjectSpaceObject[],
): ProjectSpaceObject[] {
  if (accepted.length === 0) return [...localObjects];
  const byId = new Map(localObjects.map(o => [o.id, o]));
  for (const obj of accepted) {
    if (!obj?.id) continue;
    byId.set(obj.id, obj);
  }
  return [...byId.values()];
}

/**
 * C1: drop provisional winners that are newly protected or no longer strictly newer
 * than React-first / durable local comparison sources.
 */
export function filterStillValidCloudWinners(input: {
  candidates: readonly ProjectSpaceObject[];
  reactObjects: readonly ProjectSpaceObject[];
  durableObjects: readonly ProjectSpaceObject[];
  protectedEntityIds: ReadonlySet<string>;
  geometryBlockedIds?: ReadonlySet<string>;
}): ProjectSpaceObject[] {
  const out: ProjectSpaceObject[] = [];
  for (const cloud of input.candidates) {
    if (!cloud?.id) continue;
    const local = localForIncomingCompare(
      cloud.id,
      input.reactObjects,
      input.durableObjects,
    );
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: input.protectedEntityIds,
      geometryBlockedIds: input.geometryBlockedIds,
    });
    if (incomingHasAnyFieldWin(merged)) out.push(merged.nextObject);
  }
  return out;
}

/**
 * C2: rebuild the LS write from FRESH durable + re-filtered winners.
 * Never persist a merge against a stale durable snapshot.
 */
export function buildFreshMountedBoardPersistPlan(input: {
  provisionalAccepted: readonly ProjectSpaceObject[];
  reactObjects: readonly ProjectSpaceObject[];
  freshDurableObjects: readonly ProjectSpaceObject[];
  protectedEntityIds: ReadonlySet<string>;
  geometryBlockedIds?: ReadonlySet<string>;
}): { finalAccepted: ProjectSpaceObject[]; nextDurableObjects: ProjectSpaceObject[] } | null {
  const finalAccepted = filterStillValidCloudWinners({
    candidates: input.provisionalAccepted,
    reactObjects: input.reactObjects,
    durableObjects: input.freshDurableObjects,
    protectedEntityIds: input.protectedEntityIds,
    geometryBlockedIds: input.geometryBlockedIds,
  });
  if (finalAccepted.length === 0) return null;
  return {
    finalAccepted,
    nextDurableObjects: mergeAcceptedIntoObjectList(input.freshDurableObjects, finalAccepted),
  };
}

/**
 * C1 React patch: never blindly apply precomputed winners.
 * Compare only against current React `prev` + live protected set.
 */
export function filterCloudWinnersForReactPatch(input: {
  candidates: readonly ProjectSpaceObject[];
  prevReactObjects: readonly ProjectSpaceObject[];
  protectedEntityIds: ReadonlySet<string>;
  geometryBlockedIds?: ReadonlySet<string>;
}): ProjectSpaceObject[] {
  const out: ProjectSpaceObject[] = [];
  for (const cloud of input.candidates) {
    if (!cloud?.id) continue;
    const local = input.prevReactObjects.find(o => o.id === cloud.id);
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: input.protectedEntityIds,
      geometryBlockedIds: input.geometryBlockedIds,
    });
    if (incomingHasAnyFieldWin(merged)) out.push(merged.nextObject);
  }
  return out;
}

/**
 * Pure mounted-board apply computation. Never writes storage.
 * Ignores rows for other boards. Never removes locals absent from cloud.
 * `nextDurableObjects` is provisional only — final persist must use
 * {@link buildFreshMountedBoardPersistPlan}.
 */
export function computeMountedBoardPullApply(input: {
  sectionId: string;
  mountedBoardId: string;
  rows: readonly FreeSpaceObjectCloudRow[];
  reactObjects: readonly ProjectSpaceObject[];
  durableObjects: readonly ProjectSpaceObject[];
  protectedEntityIds: ReadonlySet<string>;
  geometryBlockedIds?: ReadonlySet<string>;
}): FreeSpacePullComputeResult {
  const mounted = normalizeBoardId(input.mountedBoardId);
  const accepted: ProjectSpaceObject[] = [];
  const skippedProtectedIds: string[] = [];
  const skippedLocalWinsIds: string[] = [];
  let skippedMalformed = 0;
  let ignoredOtherBoardRows = 0;

  for (const row of input.rows) {
    const rowBoard = normalizeBoardId(typeof row.board_id === 'string' ? row.board_id : 'main');
    if (rowBoard !== mounted) {
      ignoredOtherBoardRows += 1;
      continue;
    }

    const parsed = parseCloudObjectForPull(row.object, input.sectionId);
    if (!parsed) {
      skippedMalformed += 1;
      fwPersistWarn(
        `Free Space pull skipped malformed cloud object for section "${input.sectionId}" id="${String(row.id ?? '')}"`,
      );
      continue;
    }

    // Prefer row id as authority when present; keep parsed body id if row id missing.
    const cloudObj =
      isExactNonEmptyId(row.id) && row.id !== parsed.id
        ? { ...parsed, id: row.id }
        : parsed;

    const local = localForIncomingCompare(
      cloudObj.id,
      input.reactObjects,
      input.durableObjects,
    );

    if (input.protectedEntityIds.has(cloudObj.id)) {
      skippedProtectedIds.push(cloudObj.id);
    }

    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud: cloudObj,
      protectedEntityIds: input.protectedEntityIds,
      geometryBlockedIds: input.geometryBlockedIds,
    });
    if (!incomingHasAnyFieldWin(merged)) {
      if (local) skippedLocalWinsIds.push(cloudObj.id);
      continue;
    }

    accepted.push(cloudObj);
  }

  if (accepted.length === 0) {
    return {
      accepted: [],
      skippedProtectedIds,
      skippedLocalWinsIds,
      skippedMalformed,
      ignoredOtherBoardRows,
      nextDurableObjects: null,
    };
  }

  const stripped = stripPdfThumbnailsFromObjects(accepted);
  return {
    accepted: stripped,
    skippedProtectedIds,
    skippedLocalWinsIds,
    skippedMalformed,
    ignoredOtherBoardRows,
    nextDurableObjects: mergeAcceptedIntoObjectList(input.durableObjects, stripped),
  };
}

/**
 * Persist accepted winners to the mounted board localStorage key only.
 * Returns false if write failed (caller must not patch React).
 */
export function persistMountedBoardPullWinners(input: {
  sectionId: string;
  boardId: string;
  nextDurableObjects: readonly ProjectSpaceObject[];
}): boolean {
  if (!isExactNonEmptyId(input.sectionId)) return false;
  const storageKey = boardScopedFreeSpaceKeys(input.sectionId, input.boardId).objects;
  return tryPersistLocalStorage(
    storageKey,
    JSON.stringify(input.nextDurableObjects),
    'freeSpaceObjects',
  );
}

export type CollectPullGuardsResult =
  | {
      ok: true;
      pendingCreateEntityIds: Set<string>;
      pendingUpdateEntityIds: Set<string>;
      tombstoneObjectIds: Set<string>;
    }
  | {
      ok: false;
      reason: string;
    };

/**
 * Load IDB pending create/update entity ids + non-expired free_space_object tombstones.
 * Fail-closed: any guard-read failure aborts the pull (caller must not apply cloud).
 */
export async function collectFreeSpacePullGuardIds(input: {
  userId: string | null | undefined;
  sectionId: string;
  now?: number;
}): Promise<CollectPullGuardsResult> {
  const pendingCreateEntityIds = new Set<string>();
  const pendingUpdateEntityIds = new Set<string>();
  const tombstoneObjectIds = new Set<string>();
  const now = input.now ?? Date.now();

  try {
    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      fwPersistWarn(`Free Space pull aborted: pending-ops guard unavailable reason=${ns.reason}`);
      return { ok: false, reason: `pending_ops_namespace:${ns.reason}` };
    }

    const listed = await listPendingOperations(ns.namespace);
    if (!listed.ok) {
      fwPersistWarn(`Free Space pull aborted: pending-ops guard failed reason=${listed.reason}`);
      return { ok: false, reason: `pending_ops:${listed.reason}` };
    }

    for (const op of listed.value) {
      if (op.entityType !== FREE_SPACE_OBJECT_ENTITY_TYPE) continue;
      if (!isExactNonEmptyId(op.entityId)) continue;
      if (op.operationType === 'create') pendingCreateEntityIds.add(op.entityId);
      else if (op.operationType === 'update') pendingUpdateEntityIds.add(op.entityId);
    }
  } catch (e) {
    fwPersistWarn(`Free Space pull aborted: pending-ops guard threw: ${String(e)}`);
    return { ok: false, reason: 'pending_ops_throw' };
  }

  try {
    // Read IDB directly so failures surface (listTombstones swallows errors → []).
    const tombs = await idbGetByIndex<KnowledgeTombstone>(
      TOMBSTONES_STORE,
      'sectionId',
      input.sectionId,
    );
    for (const t of tombs) {
      if (t.kind !== 'free_space_object') continue;
      if (typeof t.expiresAt === 'number' && t.expiresAt <= now) continue;
      if (isExactNonEmptyId(t.objectId)) tombstoneObjectIds.add(t.objectId);
    }
  } catch (e) {
    fwPersistWarn(`Free Space pull aborted: tombstone guard failed: ${String(e)}`);
    return { ok: false, reason: 'tombstone_guard_failed' };
  }

  return {
    ok: true,
    pendingCreateEntityIds,
    pendingUpdateEntityIds,
    tombstoneObjectIds,
  };
}

export type ApplyMountedBoardCloudRowsResult =
  | {
      ok: true;
      acceptedCount: number;
      persisted: boolean;
      /** Final LS winners; empty when nothing persisted. Re-validate again before React patch. */
      reactWinners: ProjectSpaceObject[];
      pendingCreateEntityIds: readonly string[];
      pendingUpdateEntityIds: readonly string[];
      tombstoneObjectIds: readonly string[];
      geometryBlockedIds: readonly string[];
    }
  | { ok: false; reason: string };

export type ApplyMountedBoardCloudRowsInput = {
  sectionId: string;
  boardId: string;
  userId: string | null | undefined;
  rows: readonly FreeSpaceObjectCloudRow[];
  getDirtyIds: () => Iterable<string>;
  getPendingDeletedIds: () => Iterable<string>;
  getReactObjects: () => readonly ProjectSpaceObject[];
  loadDurableObjects: () => ProjectSpaceObject[];
  /** False when cancelled or section/board generation is stale. */
  isCurrent: () => boolean;
};

/**
 * Shared PR7/PR7b mounted-board apply orchestration (guards + C1/C2).
 * Used by section pull catch-up and realtime INSERT/UPDATE.
 * Does not patch React — caller must call {@link applyCloudWinnersToReactState}.
 */
export async function applyFreeSpaceCloudRowsToMountedBoard(
  input: ApplyMountedBoardCloudRowsInput,
): Promise<ApplyMountedBoardCloudRowsResult> {
  if (!input.isCurrent()) return { ok: false, reason: 'stale_scope' };

  const guards = await collectFreeSpacePullGuardIds({
    userId: input.userId,
    sectionId: input.sectionId,
  });
  if (!input.isCurrent()) return { ok: false, reason: 'stale_scope' };
  if (!guards.ok) {
    fwPersistWarn(
      `Free Space cloud apply aborted (fail-closed guards): reason=${guards.reason}`,
    );
    return { ok: false, reason: `guards:${guards.reason}` };
  }

  const guardSnapshot = {
    pendingCreateEntityIds: [...guards.pendingCreateEntityIds],
    pendingUpdateEntityIds: [...guards.pendingUpdateEntityIds],
    tombstoneObjectIds: [...guards.tombstoneObjectIds],
  };

  const geometryBlockedIds = buildGeometryBlockedIds({
    pendingDeletedIds: input.getPendingDeletedIds(),
    pendingCreateEntityIds: guards.pendingCreateEntityIds,
    tombstoneObjectIds: guards.tombstoneObjectIds,
    activeGeometryIds: getActiveFreeSpaceGeometryIds(),
  });
  const geometryBlockedSnapshot = [...geometryBlockedIds];

  const protectedEntityIds = buildProtectedEntityIds({
    dirtyIds: input.getDirtyIds(),
    pendingDeletedIds: input.getPendingDeletedIds(),
    pendingCreateEntityIds: guards.pendingCreateEntityIds,
    pendingUpdateEntityIds: guards.pendingUpdateEntityIds,
    tombstoneObjectIds: guards.tombstoneObjectIds,
  });

  const durableObjects = input.loadDurableObjects();
  if (!input.isCurrent()) return { ok: false, reason: 'stale_scope' };

  const computed = computeMountedBoardPullApply({
    sectionId: input.sectionId,
    mountedBoardId: input.boardId,
    rows: input.rows,
    reactObjects: input.getReactObjects(),
    durableObjects,
    protectedEntityIds,
    geometryBlockedIds,
  });

  if (!input.isCurrent()) return { ok: false, reason: 'stale_scope' };
  if (computed.accepted.length === 0) {
    return {
      ok: true,
      acceptedCount: 0,
      persisted: false,
      reactWinners: [],
      geometryBlockedIds: geometryBlockedSnapshot,
      ...guardSnapshot,
    };
  }

  // --- C1 + C2: immediately before LS write ---
  const protectedAtPersist = buildProtectedEntityIds({
    dirtyIds: input.getDirtyIds(),
    pendingDeletedIds: input.getPendingDeletedIds(),
    pendingCreateEntityIds: guards.pendingCreateEntityIds,
    pendingUpdateEntityIds: guards.pendingUpdateEntityIds,
    tombstoneObjectIds: guards.tombstoneObjectIds,
  });
  const geometryBlockedAtPersist = buildGeometryBlockedIds({
    pendingDeletedIds: input.getPendingDeletedIds(),
    pendingCreateEntityIds: guards.pendingCreateEntityIds,
    tombstoneObjectIds: guards.tombstoneObjectIds,
    activeGeometryIds: getActiveFreeSpaceGeometryIds(),
  });
  const freshDurableObjects = input.loadDurableObjects();
  const persistPlan = buildFreshMountedBoardPersistPlan({
    provisionalAccepted: computed.accepted,
    reactObjects: input.getReactObjects(),
    freshDurableObjects,
    protectedEntityIds: protectedAtPersist,
    geometryBlockedIds: geometryBlockedAtPersist,
  });
  if (!persistPlan) {
    return {
      ok: true,
      acceptedCount: 0,
      persisted: false,
      reactWinners: [],
      geometryBlockedIds: [...geometryBlockedAtPersist],
      ...guardSnapshot,
    };
  }
  if (!input.isCurrent()) return { ok: false, reason: 'stale_scope' };

  const persisted = persistMountedBoardPullWinners({
    sectionId: input.sectionId,
    boardId: input.boardId,
    nextDurableObjects: persistPlan.nextDurableObjects,
  });
  if (!persisted) {
    fwPersistWarn(
      `Free Space cloud apply could not persist mounted board "${input.boardId}" for section "${input.sectionId}".`,
    );
    return { ok: false, reason: 'persist_failed' };
  }
  if (!input.isCurrent()) return { ok: false, reason: 'stale_scope_after_persist' };

  return {
    ok: true,
    acceptedCount: persistPlan.finalAccepted.length,
    persisted: true,
    reactWinners: persistPlan.finalAccepted,
    geometryBlockedIds: [...geometryBlockedAtPersist],
    ...guardSnapshot,
  };
}

/** C1 React patch helper — never blindly apply precomputed winners. */
export function applyCloudWinnersToReactState(input: {
  prev: readonly ProjectSpaceObject[];
  candidates: readonly ProjectSpaceObject[];
  getDirtyIds: () => Iterable<string>;
  getPendingDeletedIds: () => Iterable<string>;
  pendingCreateEntityIds: Iterable<string>;
  pendingUpdateEntityIds: Iterable<string>;
  tombstoneObjectIds: Iterable<string>;
  geometryBlockedIds?: Iterable<string>;
}): ProjectSpaceObject[] {
  const protectedAtReact = buildProtectedEntityIds({
    dirtyIds: input.getDirtyIds(),
    pendingDeletedIds: input.getPendingDeletedIds(),
    pendingCreateEntityIds: input.pendingCreateEntityIds,
    pendingUpdateEntityIds: input.pendingUpdateEntityIds,
    tombstoneObjectIds: input.tombstoneObjectIds,
  });
  const geometryBlockedAtReact = buildGeometryBlockedIds({
    pendingDeletedIds: input.getPendingDeletedIds(),
    pendingCreateEntityIds: input.pendingCreateEntityIds,
    tombstoneObjectIds: input.tombstoneObjectIds,
    activeGeometryIds: [
      ...(input.geometryBlockedIds ?? []),
      ...getActiveFreeSpaceGeometryIds(),
    ],
  });
  const stillValid = filterCloudWinnersForReactPatch({
    candidates: input.candidates,
    prevReactObjects: input.prev,
    protectedEntityIds: protectedAtReact,
    geometryBlockedIds: geometryBlockedAtReact,
  });
  if (stillValid.length === 0) return [...input.prev];
  return mergeAcceptedIntoObjectList(input.prev, stillValid);
}

/**
 * PR7 section SELECT + shared mounted-board apply (catch-up after Realtime SUBSCRIBED).
 */
export async function runFreeSpaceSectionPullCatchUp(
  input: Omit<ApplyMountedBoardCloudRowsInput, 'rows'>,
): Promise<ApplyMountedBoardCloudRowsResult> {
  if (!input.isCurrent()) return { ok: false, reason: 'stale_scope' };

  const fetched = await fetchFreeSpaceObjectsForSection(input.sectionId);
  if (!input.isCurrent()) return { ok: false, reason: 'stale_scope' };
  if (!fetched.ok) {
    fwPersistWarn(
      `Free Space cloud pull failed: reason=${fetched.reason}${fetched.message ? ` message=${fetched.message}` : ''}`,
    );
    return { ok: false, reason: `fetch:${fetched.reason}` };
  }

  return applyFreeSpaceCloudRowsToMountedBoard({
    ...input,
    rows: fetched.rows,
  });
}
