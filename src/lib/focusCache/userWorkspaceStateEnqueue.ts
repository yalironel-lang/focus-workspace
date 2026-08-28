/**
 * Enqueue user_workspace_state updates into pending_operations.
 */

import { resolveCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import {
  enqueuePendingOperation,
  listPendingOperations,
  replacePendingOperationPayload,
} from './pendingOperations';
import type { JsonValue, PendingOperation, PendingQueueResult } from './types';
import { noteCloudOpEnqueued } from '../sync/cloudSyncStatus';
import {
  USER_WORKSPACE_STATE_ENTITY_TYPE,
  type UserWorkspaceStatePayload,
  type UserWorkspaceStateScope,
} from './userWorkspaceStateTypes';

const DEBOUNCE_MS = 1500;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(userId: string, workspaceId: string, entityId: string): string {
  return `${userId}/${workspaceId}/${entityId}`;
}

function payloadToJson(payload: UserWorkspaceStatePayload): JsonValue {
  return {
    scope: payload.scope,
    state: payload.state as JsonValue,
    updatedAt: payload.updatedAt,
  };
}

function findPendingUpdate(
  ops: PendingOperation[],
  entityId: string,
): PendingOperation | undefined {
  return ops.find(
    op =>
      op.entityType === USER_WORKSPACE_STATE_ENTITY_TYPE &&
      op.entityId === entityId &&
      (op.operationType === 'create' || op.operationType === 'update'),
  );
}

export async function enqueueWorkspaceStateUpdateNow(input: {
  userId: string;
  workspaceId: string;
  entityId: string;
  scope: UserWorkspaceStateScope;
  state: Record<string, unknown>;
  updatedAt: number;
}): Promise<PendingQueueResult<PendingOperation>> {
  const ns = resolveCacheNamespace(input.userId, input.workspaceId);
  if (!ns.ok) {
    fwPersistWarn(`workspace-state enqueue skipped: reason=${ns.reason}`);
    return { ok: false, reason: ns.reason };
  }

  const payload: UserWorkspaceStatePayload = {
    scope: input.scope,
    state: input.state,
    updatedAt: input.updatedAt,
  };
  const json = payloadToJson(payload);

  const listed = await listPendingOperations(ns.namespace);
  if (listed.ok) {
    const existing = findPendingUpdate(listed.value, input.entityId);
    if (existing) {
      const replaced = await replacePendingOperationPayload(ns.namespace, existing.id, json);
      if (replaced.ok && replaced.value.replaced && replaced.value.operation) {
        noteCloudOpEnqueued(existing.id);
        notifyFreeSpacePendingEnqueue(ns.namespace);
        return { ok: true, value: replaced.value.operation };
      }
    }
  }

  const enqueued = await enqueuePendingOperation({
    namespace: ns.namespace,
    entityType: USER_WORKSPACE_STATE_ENTITY_TYPE,
    entityId: input.entityId,
    operationType: 'update',
    payload: json,
  });

  if (!enqueued.ok) {
    fwPersistWarn(`workspace-state enqueue failed: reason=${enqueued.reason}`);
    return enqueued;
  }

  noteCloudOpEnqueued(enqueued.value.id);
  notifyFreeSpacePendingEnqueue(ns.namespace);
  return enqueued;
}

/** Debounced cloud enqueue — local cache is already written by caller. */
export function scheduleWorkspaceStateCloudSync(input: {
  userId: string;
  workspaceId: string;
  entityId: string;
  scope: UserWorkspaceStateScope;
  state: Record<string, unknown>;
  updatedAt: number;
}): void {
  const key = timerKey(input.userId, input.workspaceId, input.entityId);
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    key,
    setTimeout(() => {
      pendingTimers.delete(key);
      void enqueueWorkspaceStateUpdateNow(input);
    }, DEBOUNCE_MS),
  );
}

export function resetWorkspaceStateEnqueueForTests(): void {
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();
}
