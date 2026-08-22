/**
 * Free Space board DELETE → focus_cache_v1 pending_operations.
 *
 * Precedence: cancel pending CREATE|UPDATE; enqueue durable DELETE.
 * CREATE canceled still enqueues DELETE (cloud row may exist from prior flush).
 */

import { resolveCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import { noteCloudOpEnqueued, noteCloudOpResolved } from '../sync/cloudSyncStatus';
import { FREE_SPACE_BOARD_ENTITY_TYPE } from './freeSpaceBoardCreateEnqueue';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import {
  enqueuePendingOperation,
  listPendingOperations,
  removePendingOperation,
} from './pendingOperations';
import type { JsonValue, PendingOperation, PendingQueueFailureReason } from './types';

export type FreeSpaceBoardDeleteEnqueueResult =
  | {
      ok: true;
      action: 'create_canceled_delete_enqueued' | 'delete_already_queued' | 'delete_enqueued' | 'writes_canceled_delete_enqueued';
      removedWriteOps: number;
    }
  | {
      ok: false;
      reason: PendingQueueFailureReason | 'unexpected_error' | 'main_immutable';
      removedWriteOps: number;
    };

export type EnqueueFreeSpaceBoardDeleteInput = {
  userId: string | null | undefined;
  sectionId: string;
  boardId: string;
};

function isBoardWriteOp(op: PendingOperation): boolean {
  return (
    op.entityType === FREE_SPACE_BOARD_ENTITY_TYPE &&
    (op.operationType === 'create' || op.operationType === 'update')
  );
}

function isBoardDeleteOp(op: PendingOperation, entityId: string): boolean {
  return (
    op.entityType === FREE_SPACE_BOARD_ENTITY_TYPE &&
    op.entityId === entityId &&
    op.operationType === 'delete'
  );
}

export function buildFreeSpaceBoardDeletePayload(): JsonValue {
  return {};
}

export async function enqueueFreeSpaceBoardDelete(
  input: EnqueueFreeSpaceBoardDeleteInput,
): Promise<FreeSpaceBoardDeleteEnqueueResult> {
  let removedWriteOps = 0;
  try {
    if (input.boardId === 'main') {
      return { ok: false, reason: 'main_immutable', removedWriteOps };
    }
    if (!input.boardId.trim()) {
      return { ok: false, reason: 'unexpected_error', removedWriteOps };
    }

    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      return { ok: false, reason: ns.reason, removedWriteOps };
    }

    const listed = await listPendingOperations(ns.namespace);
    if (!listed.ok) {
      return { ok: false, reason: listed.reason, removedWriteOps };
    }

    const writes = listed.value.filter(
      op => isBoardWriteOp(op) && op.entityId === input.boardId,
    );
    const creates = writes.filter(op => op.operationType === 'create');
    const hadPendingCreate = creates.length > 0;
    const existingDelete = listed.value.find(op => isBoardDeleteOp(op, input.boardId));

    for (const op of writes) {
      const removed = await removePendingOperation(ns.namespace, op.id);
      if (!removed.ok || !removed.value.removed) {
        return { ok: false, reason: 'transaction_failed', removedWriteOps };
      }
      noteCloudOpResolved(op.id);
      removedWriteOps += 1;
    }

    if (existingDelete) {
      return { ok: true, action: 'delete_already_queued', removedWriteOps };
    }

    const enqueued = await enqueuePendingOperation({
      namespace: ns.namespace,
      entityType: FREE_SPACE_BOARD_ENTITY_TYPE,
      entityId: input.boardId,
      operationType: 'delete',
      payload: buildFreeSpaceBoardDeletePayload(),
    });
    if (!enqueued.ok) {
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
    fwPersistWarn('pending board delete enqueue failed: reason=unexpected_error');
    return { ok: false, reason: 'unexpected_error', removedWriteOps };
  }
}
