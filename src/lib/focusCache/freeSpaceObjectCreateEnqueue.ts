/**
 * PR 3 bridge: Free Space object CREATE → focus_cache_v1 pending_operations.
 *
 * Temporary compatibility mapping: workspaceId := sectionId.
 * There is no product workspace entity yet; boardId is payload sub-scope only
 * (never used as workspaceId). Local Free Space localStorage remains SOT.
 *
 * Never throws into the create/persist path. Queue failure is warn-only.
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { resolveCacheNamespace } from '../focusCacheNamespace';
import { stripPdfThumbnailsFromObjects } from '../freeSpacePdfThumbIdb';
import { fwPersistWarn } from '../freeSpacePersistence';
import { noteCloudOpEnqueued } from '../sync/cloudSyncStatus';
import { enqueuePendingOperation } from './pendingOperations';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import type { JsonValue, PendingQueueFailureReason } from './types';
import {
  fsObjectSyncDiagLog,
  fsObjectSyncDiagSummarizeObject,
} from '../freeSpaceObject.fsObjectSyncDiag';

export const FREE_SPACE_OBJECT_ENTITY_TYPE = 'free_space_object' as const;

export type FreeSpaceObjectCreateEnqueueResult =
  | { ok: true }
  | {
      ok: false;
      reason: PendingQueueFailureReason | 'unexpected_error';
    };

export type EnqueueFreeSpaceObjectCreateInput = {
  userId: string | null | undefined;
  sectionId: string;
  boardId: string;
  object: ProjectSpaceObject;
};

/** Shared CREATE/UPDATE queue payload: `{ boardId, object }` (thumbs stripped, JSON-safe). */
export function buildFreeSpaceObjectWritePayload(
  boardId: string,
  object: ProjectSpaceObject,
): JsonValue | null {
  const [stripped] = stripPdfThumbnailsFromObjects([object]);
  try {
    return JSON.parse(
      JSON.stringify({
        boardId,
        object: stripped,
      }),
    ) as JsonValue;
  } catch {
    return null;
  }
}

/**
 * Enqueue one create operation for a Free Space object that already persisted locally.
 * Does not pass a queue operation id (random UUID from enqueuePendingOperation).
 */
export async function enqueueFreeSpaceObjectCreate(
  input: EnqueueFreeSpaceObjectCreateInput,
): Promise<FreeSpaceObjectCreateEnqueueResult> {
  try {
    // workspaceId := sectionId (temporary compatibility mapping — see file header).
    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      fwPersistWarn(`pending queue enqueue skipped: reason=${ns.reason}`);
      return { ok: false, reason: ns.reason };
    }

    const payload = buildFreeSpaceObjectWritePayload(input.boardId, input.object);
    if (payload == null) {
      fwPersistWarn('pending queue enqueue skipped: reason=invalid_operation');
      return { ok: false, reason: 'invalid_operation' };
    }

    const result = await enqueuePendingOperation({
      namespace: ns.namespace,
      entityType: FREE_SPACE_OBJECT_ENTITY_TYPE,
      entityId: input.object.id,
      operationType: 'create',
      payload,
    });

    if (!result.ok) {
      fwPersistWarn(`pending queue enqueue failed: reason=${result.reason}`);
      return { ok: false, reason: result.reason };
    }

    if (input.object.type === 'image' || input.object.type === 'pdf') {
      fsObjectSyncDiagLog('C_structured_enqueue', {
        sectionId: input.sectionId,
        boardId: input.boardId,
        objectId: input.object.id,
      }, {
        operationType: 'create',
        operationId: result.value.id,
        object: fsObjectSyncDiagSummarizeObject(input.object),
      });
    }

    noteCloudOpEnqueued(result.value.id);
    notifyFreeSpacePendingEnqueue(ns.namespace);
    return { ok: true };
  } catch {
    fwPersistWarn('pending queue enqueue failed: reason=unexpected_error');
    return { ok: false, reason: 'unexpected_error' };
  }
}

/**
 * Call only after immediate local persist succeeds.
 * If `persisted` is false, does nothing (no enqueue on local failure).
 * Fire-and-observe: never awaits into the caller; failures stay inside enqueueFreeSpaceObjectCreate.
 */
export function enqueueFreeSpaceObjectCreatesAfterLocalPersist(
  persisted: boolean,
  input: {
    userId: string | null | undefined;
    sectionId: string;
    boardId: string;
    objects: readonly ProjectSpaceObject[];
  },
): void {
  if (!persisted || input.objects.length === 0) return;
  for (const object of input.objects) {
    void enqueueFreeSpaceObjectCreate({
      userId: input.userId,
      sectionId: input.sectionId,
      boardId: input.boardId,
      object,
    });
  }
}
