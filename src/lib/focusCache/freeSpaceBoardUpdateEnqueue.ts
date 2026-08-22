/**
 * Free Space board UPDATE (rename) → focus_cache_v1 pending_operations.
 *
 * Coalesce: pending CREATE → replace CREATE payload (latest name).
 * pending UPDATE → replace UPDATE payload.
 * pending DELETE → skip (DELETE wins).
 */

import { resolveCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import { noteCloudOpEnqueued, noteCloudOpResolved } from '../sync/cloudSyncStatus';
import {
  FREE_SPACE_BOARD_ENTITY_TYPE,
  buildFreeSpaceBoardWritePayload,
} from './freeSpaceBoardCreateEnqueue';
import {
  enqueuePendingOperation,
  listPendingOperations,
  removePendingOperation,
  replacePendingOperationPayload,
} from './pendingOperations';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import type { PendingOperation, PendingQueueFailureReason } from './types';

export type FreeSpaceBoardUpdateEnqueueResult =
  | { ok: true; action: 'create_payload_replaced' | 'update_payload_replaced' | 'update_enqueued' }
  | { ok: false; reason: PendingQueueFailureReason | 'unexpected_error' | 'delete_already_queued' };

export type EnqueueFreeSpaceBoardUpdateInput = {
  userId: string | null | undefined;
  sectionId: string;
  boardId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

function isBoardWriteOp(op: PendingOperation, entityId: string, type: 'create' | 'update'): boolean {
  return (
    op.entityType === FREE_SPACE_BOARD_ENTITY_TYPE &&
    op.entityId === entityId &&
    op.operationType === type
  );
}

export async function enqueueFreeSpaceBoardUpdate(
  input: EnqueueFreeSpaceBoardUpdateInput,
): Promise<FreeSpaceBoardUpdateEnqueueResult> {
  try {
    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      fwPersistWarn(`pending board update enqueue skipped: reason=${ns.reason}`);
      return { ok: false, reason: ns.reason };
    }

    if (!input.boardId.trim() || !input.name.trim()) {
      return { ok: false, reason: 'invalid_operation' };
    }

    const payload = buildFreeSpaceBoardWritePayload(input);
    const listed = await listPendingOperations(ns.namespace);
    if (!listed.ok) {
      return { ok: false, reason: listed.reason };
    }

    const pendingDelete = listed.value.find(
      op =>
        op.entityType === FREE_SPACE_BOARD_ENTITY_TYPE &&
        op.entityId === input.boardId &&
        op.operationType === 'delete',
    );
    if (pendingDelete) {
      return { ok: false, reason: 'delete_already_queued' };
    }

    const pendingCreate = listed.value.find(op => isBoardWriteOp(op, input.boardId, 'create'));
    if (pendingCreate) {
      const replaced = await replacePendingOperationPayload(ns.namespace, pendingCreate.id, payload);
      if (!replaced.ok || !replaced.value.replaced) {
        return { ok: false, reason: replaced.ok ? 'transaction_failed' : replaced.reason };
      }
      notifyFreeSpacePendingEnqueue(ns.namespace);
      return { ok: true, action: 'create_payload_replaced' };
    }

    const pendingUpdates = listed.value.filter(op => isBoardWriteOp(op, input.boardId, 'update'));
    const pendingUpdate = pendingUpdates[0];
    if (pendingUpdate) {
      const replaced = await replacePendingOperationPayload(ns.namespace, pendingUpdate.id, payload);
      if (!replaced.ok || !replaced.value.replaced) {
        return { ok: false, reason: replaced.ok ? 'transaction_failed' : replaced.reason };
      }
      for (const extra of pendingUpdates.slice(1)) {
        const removed = await removePendingOperation(ns.namespace, extra.id);
        if (removed.ok && removed.value.removed) noteCloudOpResolved(extra.id);
      }
      notifyFreeSpacePendingEnqueue(ns.namespace);
      return { ok: true, action: 'update_payload_replaced' };
    }

    const enqueued = await enqueuePendingOperation({
      namespace: ns.namespace,
      entityType: FREE_SPACE_BOARD_ENTITY_TYPE,
      entityId: input.boardId,
      operationType: 'update',
      payload,
    });
    if (!enqueued.ok) {
      return { ok: false, reason: enqueued.reason };
    }
    noteCloudOpEnqueued(enqueued.value.id);
    notifyFreeSpacePendingEnqueue(ns.namespace);
    return { ok: true, action: 'update_enqueued' };
  } catch {
    return { ok: false, reason: 'unexpected_error' };
  }
}
