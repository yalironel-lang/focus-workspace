/**
 * Free Space board CREATE → focus_cache_v1 pending_operations.
 */

import { resolveCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import { noteCloudOpEnqueued } from '../sync/cloudSyncStatus';
import { enqueuePendingOperation } from './pendingOperations';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import type { JsonValue, PendingQueueFailureReason } from './types';

export const FREE_SPACE_BOARD_ENTITY_TYPE = 'free_space_board' as const;

export type FreeSpaceBoardWritePayload = {
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type FreeSpaceBoardCreateEnqueueResult =
  | { ok: true }
  | { ok: false; reason: PendingQueueFailureReason | 'unexpected_error' };

export type EnqueueFreeSpaceBoardCreateInput = {
  userId: string | null | undefined;
  sectionId: string;
  boardId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export function buildFreeSpaceBoardWritePayload(
  input: Pick<EnqueueFreeSpaceBoardCreateInput, 'name' | 'createdAt' | 'updatedAt'>,
): JsonValue {
  return {
    name: input.name.trim(),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export async function enqueueFreeSpaceBoardCreate(
  input: EnqueueFreeSpaceBoardCreateInput,
): Promise<FreeSpaceBoardCreateEnqueueResult> {
  try {
    const ns = resolveCacheNamespace(input.userId, input.sectionId);
    if (!ns.ok) {
      fwPersistWarn(`pending board create enqueue skipped: reason=${ns.reason}`);
      return { ok: false, reason: ns.reason };
    }

    if (!input.boardId.trim() || !input.name.trim()) {
      return { ok: false, reason: 'invalid_operation' };
    }

    const payload = buildFreeSpaceBoardWritePayload(input);
    const result = await enqueuePendingOperation({
      namespace: ns.namespace,
      entityType: FREE_SPACE_BOARD_ENTITY_TYPE,
      entityId: input.boardId,
      operationType: 'create',
      payload,
    });

    if (!result.ok) {
      fwPersistWarn(`pending board create enqueue failed: reason=${result.reason}`);
      return { ok: false, reason: result.reason };
    }

    noteCloudOpEnqueued(result.value.id);
    notifyFreeSpacePendingEnqueue(ns.namespace);
    return { ok: true };
  } catch {
    fwPersistWarn('pending board create enqueue failed: reason=unexpected_error');
    return { ok: false, reason: 'unexpected_error' };
  }
}
