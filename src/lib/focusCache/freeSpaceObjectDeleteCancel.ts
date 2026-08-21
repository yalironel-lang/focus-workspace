/**
 * PR 6: cancel pending Free Space CREATE/UPDATE ops (orphan cleanup + peer delete apply).
 *
 * Local user delete uses freeSpaceObjectDeleteEnqueue (cancel writes + durable DELETE).
 * This module remains for orphan cancel and inbound cloud-delete apply.
 *
 * Temporary mapping: workspaceId := sectionId. Failures are warn-only; never throw into persist.
 */

import { resolveCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import { noteCloudOpResolved } from '../sync/cloudSyncStatus';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './freeSpaceObjectCreateEnqueue';
import {
  listPendingOperations,
  removePendingOperation,
} from './pendingOperations';
import type { PendingOperation, PendingQueueFailureReason } from './types';

export type FreeSpaceObjectDeleteCancelResult =
  | {
      ok: true;
      succeededEntityIds: string[];
      failedEntityIds: string[];
      removedOps: number;
    }
  | {
      ok: false;
      reason: PendingQueueFailureReason | 'unexpected_error' | 'empty_entity_ids';
      succeededEntityIds: string[];
      failedEntityIds: string[];
      removedOps: number;
    };

function isCancelableWrite(op: PendingOperation): boolean {
  return (
    op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE &&
    (op.operationType === 'create' || op.operationType === 'update')
  );
}

/**
 * Remove pending create|update ops for the given entityIds in one namespace.
 * Per-entity success = all matching ops removed (or none found).
 * Does not enqueue DELETE. Does not touch cloud.
 */
export async function cancelPendingFreeSpaceObjectWrites(
  input: {
    userId: string | null | undefined;
    sectionId: string;
    entityIds: readonly string[];
  },
): Promise<FreeSpaceObjectDeleteCancelResult> {
  const succeededEntityIds: string[] = [];
  const failedEntityIds: string[] = [];
  let removedOps = 0;

  try {
    const uniqueIds = [
      ...new Set(
        input.entityIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0 && id === id.trim(),
        ),
      ),
    ];
    if (uniqueIds.length === 0) {
      return {
        ok: false,
        reason: 'empty_entity_ids',
        succeededEntityIds,
        failedEntityIds,
        removedOps,
      };
    }

    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      fwPersistWarn(`pending delete-cancel skipped: reason=${ns.reason}`);
      return {
        ok: false,
        reason: ns.reason,
        succeededEntityIds,
        failedEntityIds: uniqueIds,
        removedOps,
      };
    }

    const listed = await listPendingOperations(ns.namespace);
    if (!listed.ok) {
      fwPersistWarn(`pending delete-cancel list failed: reason=${listed.reason}`);
      return {
        ok: false,
        reason: listed.reason,
        succeededEntityIds,
        failedEntityIds: uniqueIds,
        removedOps,
      };
    }

    for (const entityId of uniqueIds) {
      const matches = listed.value.filter(
        (op) => isCancelableWrite(op) && op.entityId === entityId,
      );
      let entityOk = true;
      for (const op of matches) {
        const removed = await removePendingOperation(ns.namespace, op.id);
        if (!removed.ok || !removed.value.removed) {
          entityOk = false;
          fwPersistWarn(
            `pending delete-cancel remove failed: entityId=${entityId} opId=${op.id}` +
              (removed.ok ? '' : ` reason=${removed.reason}`),
          );
          break;
        }
        noteCloudOpResolved(op.id);
        removedOps += 1;
      }
      // No matching ops (or all removed) counts as success for this entityId.
      if (entityOk) succeededEntityIds.push(entityId);
      else failedEntityIds.push(entityId);
    }

    if (failedEntityIds.length > 0) {
      return {
        ok: false,
        reason: 'transaction_failed',
        succeededEntityIds,
        failedEntityIds,
        removedOps,
      };
    }
    return { ok: true, succeededEntityIds, failedEntityIds, removedOps };
  } catch {
    fwPersistWarn('pending delete-cancel failed: reason=unexpected_error');
    return {
      ok: false,
      reason: 'unexpected_error',
      succeededEntityIds,
      failedEntityIds: [...input.entityIds.filter(Boolean)],
      removedOps,
    };
  }
}

export type CancelOrphanPendingWritesInput = {
  userId: string | null | undefined;
  sectionId: string;
  /**
   * Complete authoritative active local entity ids for the section namespace.
   * Must be fully hydrated from persisted SOT (all boards). Never pass partial React state.
   */
  authoritativeLocalEntityIds: ReadonlySet<string>;
};

/**
 * Cancel pending create|update ops whose entityId is absent from the authoritative local SOT.
 * Entities present locally are left untouched (restore-safe).
 */
export async function cancelOrphanPendingFreeSpaceObjectWrites(
  input: CancelOrphanPendingWritesInput,
): Promise<FreeSpaceObjectDeleteCancelResult> {
  try {
    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      fwPersistWarn(`pending orphan-cancel skipped: reason=${ns.reason}`);
      return {
        ok: false,
        reason: ns.reason,
        succeededEntityIds: [],
        failedEntityIds: [],
        removedOps: 0,
      };
    }

    const listed = await listPendingOperations(ns.namespace);
    if (!listed.ok) {
      fwPersistWarn(`pending orphan-cancel list failed: reason=${listed.reason}`);
      return {
        ok: false,
        reason: listed.reason,
        succeededEntityIds: [],
        failedEntityIds: [],
        removedOps: 0,
      };
    }

    const orphanIds = [
      ...new Set(
        listed.value
          .filter(isCancelableWrite)
          .map((op) => op.entityId)
          .filter(
            (entityId) =>
              typeof entityId === 'string' &&
              entityId.length > 0 &&
              !input.authoritativeLocalEntityIds.has(entityId),
          ),
      ),
    ];

    if (orphanIds.length === 0) {
      return { ok: true, succeededEntityIds: [], failedEntityIds: [], removedOps: 0 };
    }

    return cancelPendingFreeSpaceObjectWrites({
      userId: input.userId,
      sectionId: input.sectionId,
      entityIds: orphanIds,
    });
  } catch {
    fwPersistWarn('pending orphan-cancel failed: reason=unexpected_error');
    return {
      ok: false,
      reason: 'unexpected_error',
      succeededEntityIds: [],
      failedEntityIds: [],
      removedOps: 0,
    };
  }
}

/**
 * Fire-and-observe helper for durable soft-delete: never awaits into the persist caller.
 */
export function cancelPendingFreeSpaceObjectWritesAfterLocalDelete(
  persisted: boolean,
  input: {
    userId: string | null | undefined;
    sectionId: string;
    entityIds: readonly string[];
  },
  onResult?: (result: FreeSpaceObjectDeleteCancelResult) => void,
): void {
  if (!persisted || input.entityIds.length === 0) return;
  void cancelPendingFreeSpaceObjectWrites(input).then((result) => {
    onResult?.(result);
  });
}
