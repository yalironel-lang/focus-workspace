/**
 * PR 5 bridge: Free Space object UPDATE → focus_cache_v1 pending_operations.
 *
 * Call only after durable local persist succeeds (commitPersist / tryPersistLocalStorage).
 * Never from editors / SectionPage / TipTap.
 *
 * Coalesce rules (enqueue-time, linear scan — OK for PR5):
 * 1. Pending CREATE for entityId → replace CREATE payload (no separate UPDATE).
 * 2. Else pending UPDATE → replace UPDATE payload (one UPDATE per entityId).
 * 3. Else enqueue operationType=update.
 *
 * Authoritative snapshot version: object.updatedAt (not queue seq / flush order).
 * Soft-delete (PR6) cancels pending create|update via freeSpaceObjectDeleteCancel
 * after durable local delete — does not enqueue cloud DELETE.
 * Future optimization (not implemented): entityId → pendingOperationId lookup map.
 *
 * Temporary mapping: workspaceId := sectionId. Queue failure is warn-only.
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { resolveCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import {
  FREE_SPACE_OBJECT_ENTITY_TYPE,
  buildFreeSpaceObjectWritePayload,
} from './freeSpaceObjectCreateEnqueue';
import {
  enqueuePendingOperation,
  listPendingOperations,
  removePendingOperation,
  replacePendingOperationPayload,
} from './pendingOperations';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import type { PendingOperation, PendingQueueFailureReason } from './types';

export type FreeSpaceObjectUpdateEnqueueResult =
  | { ok: true; action: 'create_payload_replaced' | 'update_payload_replaced' | 'update_enqueued' }
  | {
      ok: false;
      reason: PendingQueueFailureReason | 'unexpected_error' | 'missing_updated_at';
    };

export type EnqueueFreeSpaceObjectUpdateInput = {
  userId: string | null | undefined;
  sectionId: string;
  boardId: string;
  object: ProjectSpaceObject;
};

function hasAuthoritativeUpdatedAt(object: ProjectSpaceObject): boolean {
  return typeof object.updatedAt === 'number' && Number.isFinite(object.updatedAt);
}

function findMatchingWriteOp(
  ops: PendingOperation[],
  entityId: string,
  operationType: 'create' | 'update',
): PendingOperation | undefined {
  return ops.find(
    (op) =>
      op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE &&
      op.entityId === entityId &&
      op.operationType === operationType,
  );
}

function listMatchingWriteOps(
  ops: PendingOperation[],
  entityId: string,
  operationType: 'create' | 'update',
): PendingOperation[] {
  return ops.filter(
    (op) =>
      op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE &&
      op.entityId === entityId &&
      op.operationType === operationType,
  );
}

/**
 * Coalesce one UPDATE write for a Free Space object that already persisted locally.
 * Prefer refreshing a pending CREATE; else replace pending UPDATE; else enqueue UPDATE.
 * Keeps at most one pending write per entityId (drops sibling UPDATEs when refreshing CREATE
 * or when multiple UPDATEs exist).
 */
export async function enqueueFreeSpaceObjectUpdate(
  input: EnqueueFreeSpaceObjectUpdateInput,
): Promise<FreeSpaceObjectUpdateEnqueueResult> {
  try {
    if (!hasAuthoritativeUpdatedAt(input.object)) {
      fwPersistWarn('pending update enqueue skipped: reason=missing_updated_at');
      return { ok: false, reason: 'missing_updated_at' };
    }

    // workspaceId := sectionId (temporary compatibility mapping).
    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      fwPersistWarn(`pending update enqueue skipped: reason=${ns.reason}`);
      return { ok: false, reason: ns.reason };
    }

    const payload = buildFreeSpaceObjectWritePayload(input.boardId, input.object);
    if (payload == null) {
      fwPersistWarn('pending update enqueue skipped: reason=invalid_operation');
      return { ok: false, reason: 'invalid_operation' };
    }

    const listed = await listPendingOperations(ns.namespace);
    if (!listed.ok) {
      fwPersistWarn(`pending update enqueue list failed: reason=${listed.reason}`);
      return { ok: false, reason: listed.reason };
    }

    const entityId = input.object.id;
    const pendingCreate = findMatchingWriteOp(listed.value, entityId, 'create');
    if (pendingCreate) {
      const replaced = await replacePendingOperationPayload(
        ns.namespace,
        pendingCreate.id,
        payload,
      );
      if (!replaced.ok) {
        fwPersistWarn(`pending update coalesce failed: reason=${replaced.reason}`);
        return { ok: false, reason: replaced.reason };
      }
      if (!replaced.value.replaced) {
        fwPersistWarn('pending update coalesce failed: reason=transaction_failed');
        return { ok: false, reason: 'transaction_failed' };
      }
      // Drop sibling UPDATEs so a later flush cannot overwrite the refreshed CREATE.
      for (const sibling of listMatchingWriteOps(listed.value, entityId, 'update')) {
        await removePendingOperation(ns.namespace, sibling.id);
      }
      notifyFreeSpacePendingEnqueue(ns.namespace);
      return { ok: true, action: 'create_payload_replaced' };
    }

    const pendingUpdates = listMatchingWriteOps(listed.value, entityId, 'update');
    const pendingUpdate = pendingUpdates[0];
    if (pendingUpdate) {
      const replaced = await replacePendingOperationPayload(
        ns.namespace,
        pendingUpdate.id,
        payload,
      );
      if (!replaced.ok) {
        fwPersistWarn(`pending update coalesce failed: reason=${replaced.reason}`);
        return { ok: false, reason: replaced.reason };
      }
      if (!replaced.value.replaced) {
        fwPersistWarn('pending update coalesce failed: reason=transaction_failed');
        return { ok: false, reason: 'transaction_failed' };
      }
      for (const extra of pendingUpdates.slice(1)) {
        await removePendingOperation(ns.namespace, extra.id);
      }
      notifyFreeSpacePendingEnqueue(ns.namespace);
      return { ok: true, action: 'update_payload_replaced' };
    }

    const enqueued = await enqueuePendingOperation({
      namespace: ns.namespace,
      entityType: FREE_SPACE_OBJECT_ENTITY_TYPE,
      entityId,
      operationType: 'update',
      payload,
    });
    if (!enqueued.ok) {
      fwPersistWarn(`pending update enqueue failed: reason=${enqueued.reason}`);
      return { ok: false, reason: enqueued.reason };
    }
    notifyFreeSpacePendingEnqueue(ns.namespace);
    return { ok: true, action: 'update_enqueued' };
  } catch {
    fwPersistWarn('pending update enqueue failed: reason=unexpected_error');
    return { ok: false, reason: 'unexpected_error' };
  }
}

/**
 * Call only after durable local persist succeeds.
 * If `persisted` is false, does nothing.
 * Fire-and-observe: never awaits into the caller.
 * Optional onResult supports re-marking dirty ids when coalesce fails.
 */
export function enqueueFreeSpaceObjectUpdatesAfterLocalPersist(
  persisted: boolean,
  input: {
    userId: string | null | undefined;
    sectionId: string;
    boardId: string;
    objects: readonly ProjectSpaceObject[];
  },
  onResult?: (objectId: string, result: FreeSpaceObjectUpdateEnqueueResult) => void,
): void {
  if (!persisted || input.objects.length === 0) return;
  for (const object of input.objects) {
    void enqueueFreeSpaceObjectUpdate({
      userId: input.userId,
      sectionId: input.sectionId,
      boardId: input.boardId,
      object,
    }).then(result => {
      onResult?.(object.id, result);
    });
  }
}
