/**
 * Free Space object DELETE → focus_cache_v1 pending_operations.
 *
 * Call only after durable local soft-delete persist succeeds.
 *
 * Precedence (per entityId):
 * 1. Cancel pending CREATE|UPDATE for the entity.
 * 2. If DELETE already queued → no-op.
 * 3. Else enqueue operationType=delete.
 *
 * Pending CREATE does NOT skip cloud DELETE: upsert may already have reached
 * Supabase while the CREATE op is still queued (flush/remove race). Cloud
 * DELETE is idempotent when the row was never created.
 *
 * Tombstones remain a separate local resurrection guard (knowledge/tombstoneStore).
 * Temporary mapping: workspaceId := sectionId. Failures are warn-only.
 */

import { resolveCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import { noteCloudOpEnqueued, noteCloudOpResolved } from '../sync/cloudSyncStatus';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './freeSpaceObjectCreateEnqueue';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import {
  enqueuePendingOperation,
  listPendingOperations,
  removePendingOperation,
} from './pendingOperations';
import type { JsonValue, PendingOperation, PendingQueueFailureReason } from './types';

export type FreeSpaceObjectDeleteEnqueueResult =
  | {
      ok: true;
      action:
        | 'create_canceled_delete_enqueued'
        | 'delete_already_queued'
        | 'delete_enqueued'
        | 'writes_canceled_delete_enqueued';
      removedWriteOps: number;
    }
  | {
      ok: false;
      reason: PendingQueueFailureReason | 'unexpected_error' | 'empty_entity_id';
      removedWriteOps: number;
    };

export type EnqueueFreeSpaceObjectDeleteInput = {
  userId: string | null | undefined;
  sectionId: string;
  boardId: string;
  entityId: string;
};

function isFreeSpaceWriteOp(op: PendingOperation): boolean {
  return (
    op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE &&
    (op.operationType === 'create' || op.operationType === 'update')
  );
}

function isFreeSpaceDeleteOp(op: PendingOperation): boolean {
  return (
    op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE && op.operationType === 'delete'
  );
}

/** Minimal DELETE payload: board sub-scope for diagnostics / future filters. */
export function buildFreeSpaceObjectDeletePayload(boardId: string): JsonValue {
  return { boardId };
}

async function removeMatchingOps(
  namespace: { userId: string; workspaceId: string },
  ops: PendingOperation[],
): Promise<{ removed: number; failed: boolean }> {
  let removed = 0;
  for (const op of ops) {
    const result = await removePendingOperation(namespace, op.id);
    if (!result.ok || !result.value.removed) {
      fwPersistWarn(
        `pending delete-enqueue cancel failed: opId=${op.id}` +
          (result.ok ? '' : ` reason=${result.reason}`),
      );
      return { removed, failed: true };
    }
    noteCloudOpResolved(op.id);
    removed += 1;
  }
  return { removed, failed: false };
}

/**
 * Cancel create|update and enqueue durable DELETE when the object may exist in cloud.
 */
export async function enqueueFreeSpaceObjectDelete(
  input: EnqueueFreeSpaceObjectDeleteInput,
): Promise<FreeSpaceObjectDeleteEnqueueResult> {
  let removedWriteOps = 0;
  try {
    const entityId = input.entityId;
    if (typeof entityId !== 'string' || !entityId.trim() || entityId !== entityId.trim()) {
      return { ok: false, reason: 'empty_entity_id', removedWriteOps };
    }

    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      fwPersistWarn(`pending delete enqueue skipped: reason=${ns.reason}`);
      return { ok: false, reason: ns.reason, removedWriteOps };
    }

    const listed = await listPendingOperations(ns.namespace);
    if (!listed.ok) {
      fwPersistWarn(`pending delete enqueue list failed: reason=${listed.reason}`);
      return { ok: false, reason: listed.reason, removedWriteOps };
    }

    const writes = listed.value.filter(
      op => isFreeSpaceWriteOp(op) && op.entityId === entityId,
    );
    const creates = writes.filter(op => op.operationType === 'create');
    const existingDelete = listed.value.find(
      op => isFreeSpaceDeleteOp(op) && op.entityId === entityId,
    );

    const hadPendingCreate = creates.length > 0;

    const cancel = await removeMatchingOps(ns.namespace, writes);
    removedWriteOps = cancel.removed;
    if (cancel.failed) {
      return { ok: false, reason: 'transaction_failed', removedWriteOps };
    }

    if (existingDelete) {
      return {
        ok: true,
        action: 'delete_already_queued',
        removedWriteOps,
      };
    }

    const enqueued = await enqueuePendingOperation({
      namespace: ns.namespace,
      entityType: FREE_SPACE_OBJECT_ENTITY_TYPE,
      entityId,
      operationType: 'delete',
      payload: buildFreeSpaceObjectDeletePayload(input.boardId),
    });

    if (!enqueued.ok) {
      fwPersistWarn(`pending delete enqueue failed: reason=${enqueued.reason}`);
      return { ok: false, reason: enqueued.reason, removedWriteOps };
    }

    noteCloudOpEnqueued(enqueued.value.id);
    notifyFreeSpacePendingEnqueue(ns.namespace);

    return {
      ok: true,
      action: hadPendingCreate
        ? 'create_canceled_delete_enqueued'
        : removedWriteOps > 0
          ? 'writes_canceled_delete_enqueued'
          : 'delete_enqueued',
      removedWriteOps,
    };
  } catch {
    fwPersistWarn('pending delete enqueue failed: reason=unexpected_error');
    return { ok: false, reason: 'unexpected_error', removedWriteOps };
  }
}

/**
 * Fire-and-observe after durable local delete persist.
 * Retries stay with the hook's pendingCancelIds drain pattern.
 */
export function enqueueFreeSpaceObjectDeletesAfterLocalDelete(
  persisted: boolean,
  input: {
    userId: string | null | undefined;
    sectionId: string;
    boardId: string;
    entityIds: readonly string[];
  },
  onResult?: (
    entityId: string,
    result: FreeSpaceObjectDeleteEnqueueResult,
  ) => void,
): void {
  if (!persisted || input.entityIds.length === 0) return;
  for (const entityId of input.entityIds) {
    if (!entityId) continue;
    void enqueueFreeSpaceObjectDelete({
      userId: input.userId,
      sectionId: input.sectionId,
      boardId: input.boardId,
      entityId,
    }).then(result => {
      onResult?.(entityId, result);
    });
  }
}
