/**
 * Explicit create-only consumer for pending Free Space object creates.
 *
 * - Must be invoked manually (no timers / background workers / auto-flush).
 * - Processes only entityType=free_space_object + operationType=create.
 * - Upserts by entityId; removes queue row only after confirmed cloud success.
 * - Leaves unknown / malformed / failed ops queued.
 * - Does not change local Free Space SOT or saveStatus UI.
 */

import type { CacheNamespace } from '../focusCacheNamespace';
import { assertCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './freeSpaceObjectCreateEnqueue';
import { upsertFreeSpaceObjectFromCreatePayload } from './freeSpaceObjectCloud';
import {
  listPendingOperations,
  removePendingOperation,
} from './pendingOperations';
import type { JsonValue, PendingOperation } from './types';

export type FlushPendingFreeSpaceCreatesResult = {
  processed: number;
  removed: number;
  skippedUnsupported: number;
  skippedMalformed: number;
  failedCloud: number;
  stoppedReason?:
    | 'namespace_invalid'
    | 'list_failed'
    | 'cloud_write_failed'
    | 'remove_failed';
};

type CreatePayload = {
  boardId: string;
  object: JsonValue;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCreatePayload(payload: JsonValue | null): CreatePayload | null {
  if (!isPlainObject(payload)) return null;
  if (typeof payload.boardId !== 'string') return null;
  if (!isPlainObject(payload.object)) return null;
  return {
    boardId: payload.boardId,
    object: payload.object as JsonValue,
  };
}

function isSupportedCreate(op: PendingOperation): boolean {
  return (
    op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE && op.operationType === 'create'
  );
}

/**
 * Drain create ops for one namespace in `seq` order.
 * Stops on cloud failure or remove failure (remaining ops stay queued).
 */
export async function flushPendingFreeSpaceCreates(
  namespace: CacheNamespace,
): Promise<FlushPendingFreeSpaceCreatesResult> {
  const result: FlushPendingFreeSpaceCreatesResult = {
    processed: 0,
    removed: 0,
    skippedUnsupported: 0,
    skippedMalformed: 0,
    failedCloud: 0,
  };

  const ns = assertCacheNamespace(namespace);
  if (!ns.ok) {
    fwPersistWarn(`pending create flush skipped: reason=${ns.reason}`);
    return { ...result, stoppedReason: 'namespace_invalid' };
  }

  const listed = await listPendingOperations(ns.namespace);
  if (!listed.ok) {
    fwPersistWarn(`pending create flush list failed: reason=${listed.reason}`);
    return { ...result, stoppedReason: 'list_failed' };
  }

  for (const op of listed.value) {
    if (!isSupportedCreate(op)) {
      result.skippedUnsupported += 1;
      continue;
    }

    result.processed += 1;

    const parsed = parseCreatePayload(op.payload);
    if (!parsed) {
      result.skippedMalformed += 1;
      fwPersistWarn(
        `pending create flush left malformed op queued: entityId=${op.entityId}`,
      );
      continue;
    }

    const cloud = await upsertFreeSpaceObjectFromCreatePayload({
      userId: ns.namespace.userId,
      sectionId: ns.namespace.workspaceId,
      boardId: parsed.boardId,
      objectId: op.entityId,
      object: parsed.object,
    });

    if (!cloud.ok) {
      result.failedCloud += 1;
      fwPersistWarn(
        `pending create flush cloud write failed: reason=${cloud.reason}` +
          (cloud.message ? ` message=${cloud.message}` : ''),
      );
      return { ...result, stoppedReason: 'cloud_write_failed' };
    }

    const removed = await removePendingOperation(ns.namespace, op.id);
    if (!removed.ok || !removed.value.removed) {
      fwPersistWarn(
        `pending create flush remove failed after cloud success: opId=${op.id}`,
      );
      return { ...result, stoppedReason: 'remove_failed' };
    }

    result.removed += 1;
  }

  return result;
}
