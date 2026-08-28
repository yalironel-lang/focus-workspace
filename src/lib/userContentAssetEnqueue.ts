/**
 * Enqueue user_content_asset upload/delete jobs into focus_cache_v1.
 * Does not upload bytes — only JSON descriptors.
 */

import { resolveCacheNamespace } from './focusCacheNamespace';
import {
  enqueuePendingOperation,
  listPendingOperations,
  removePendingOperation,
  replacePendingOperationPayload,
} from './focusCache/pendingOperations';
import type { PendingOperation, PendingQueueResult } from './focusCache/types';
import { notifyFreeSpacePendingEnqueue } from './focusCache/freeSpacePendingFlushTrigger';
import { noteCloudOpEnqueued, noteCloudOpResolved } from './sync/cloudSyncStatus';
import { fwPersistWarn } from './freeSpacePersistence';
import {
  USER_CONTENT_ASSET_ENTITY_TYPE,
  userContentAssetDescriptorToJson,
  userContentAssetEntityId,
  type UserContentAssetDescriptor,
  type UserContentLocalRef,
} from './userContentAssetDescriptor';
import {
  buildUserContentPath,
  type UserContentAssetType,
} from './userContentStorage';

export type EnqueueUserContentAssetInput = {
  userId: string;
  sectionId: string;
  objectId: string;
  assetType: UserContentAssetType;
  assetId: string;
  assetOp: 'upload' | 'delete';
  localRef: UserContentLocalRef;
  contentType?: string;
  contentHash?: string;
  byteLength?: number;
  updatedAt?: number;
};

function buildDescriptor(
  input: EnqueueUserContentAssetInput,
): UserContentAssetDescriptor | null {
  try {
    const storagePath = buildUserContentPath({
      userId: input.userId,
      sectionId: input.sectionId,
      objectId: input.objectId,
      assetType: input.assetType,
      assetId: input.assetId,
    });
    return {
      version: 1,
      assetOp: input.assetOp,
      userId: input.userId,
      sectionId: input.sectionId,
      objectId: input.objectId,
      assetType: input.assetType,
      assetId: input.assetId,
      storagePath,
      localRef: input.localRef,
      updatedAt: input.updatedAt ?? Date.now(),
      ...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
      ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : {}),
      ...(input.byteLength !== undefined ? { byteLength: input.byteLength } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Enqueue upload or delete.
 * - Upload: coalesce prior pending upload for same entityId (replace payload).
 * - Delete: drop pending uploads for same entityId, then enqueue delete
 *   (or reuse an existing pending delete).
 */
export async function enqueueUserContentAssetOp(
  input: EnqueueUserContentAssetInput,
): Promise<PendingQueueResult<PendingOperation>> {
  const ns = resolveCacheNamespace(input.userId, input.sectionId);
  if (!ns.ok) {
    fwPersistWarn(`user-content enqueue skipped: reason=${ns.reason}`);
    return { ok: false, reason: ns.reason };
  }

  const descriptor = buildDescriptor(input);
  if (!descriptor) {
    return { ok: false, reason: 'invalid_operation' };
  }

  const entityId = userContentAssetEntityId(descriptor);
  const payload = userContentAssetDescriptorToJson(descriptor);
  const operationType = input.assetOp === 'delete' ? 'delete' : 'create';

  if (input.assetOp === 'delete') {
    const listed = await listPendingOperations(ns.namespace);
    if (listed.ok) {
      let existingDelete: PendingOperation | undefined;
      for (const op of listed.value) {
        if (
          op.entityType !== USER_CONTENT_ASSET_ENTITY_TYPE ||
          op.entityId !== entityId
        ) {
          continue;
        }
        if (op.operationType === 'delete') {
          existingDelete = op;
          continue;
        }
        if (op.operationType === 'create' || op.operationType === 'update') {
          const removed = await removePendingOperation(ns.namespace, op.id);
          if (removed.ok && removed.value.removed) {
            noteCloudOpResolved(op.id);
          }
        }
      }
      if (existingDelete) {
        const replaced = await replacePendingOperationPayload(
          ns.namespace,
          existingDelete.id,
          payload,
        );
        if (replaced.ok && replaced.value.replaced && replaced.value.operation) {
          noteCloudOpEnqueued(existingDelete.id);
          notifyFreeSpacePendingEnqueue(ns.namespace);
          return { ok: true, value: replaced.value.operation };
        }
        noteCloudOpEnqueued(existingDelete.id);
        notifyFreeSpacePendingEnqueue(ns.namespace);
        return { ok: true, value: existingDelete };
      }
    }
  }

  // Coalesce: replace existing pending upload for same entity with newer payload.
  if (input.assetOp === 'upload') {
    const listed = await listPendingOperations(ns.namespace);
    if (listed.ok) {
      const existingDelete = listed.value.find(
        op =>
          op.entityType === USER_CONTENT_ASSET_ENTITY_TYPE &&
          op.entityId === entityId &&
          op.operationType === 'delete',
      );
      // Pending delete wins — do not re-queue upload for a deleted asset.
      if (existingDelete) {
        return { ok: true, value: existingDelete };
      }
      const existing = listed.value.find(
        op =>
          op.entityType === USER_CONTENT_ASSET_ENTITY_TYPE &&
          op.entityId === entityId &&
          (op.operationType === 'create' || op.operationType === 'update'),
      );
      if (existing) {
        const replaced = await replacePendingOperationPayload(
          ns.namespace,
          existing.id,
          payload,
        );
        if (replaced.ok && replaced.value.replaced && replaced.value.operation) {
          noteCloudOpEnqueued(existing.id);
          notifyFreeSpacePendingEnqueue(ns.namespace);
          return { ok: true, value: replaced.value.operation };
        }
      }
    }
  }

  const enqueued = await enqueuePendingOperation({
    namespace: ns.namespace,
    entityType: USER_CONTENT_ASSET_ENTITY_TYPE,
    entityId,
    operationType,
    payload,
  });

  if (!enqueued.ok) {
    fwPersistWarn(`user-content enqueue failed: reason=${enqueued.reason}`);
    return enqueued;
  }

  noteCloudOpEnqueued(enqueued.value.id);
  notifyFreeSpacePendingEnqueue(ns.namespace);
  return enqueued;
}
