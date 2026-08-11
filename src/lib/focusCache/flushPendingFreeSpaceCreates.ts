/**
 * Explicit consumer for pending Free Space object CREATE + UPDATE writes.
 *
 * - Manual invoke only for PR5 (temporary). No timers / background workers / auto-flush.
 * - Future automatic triggers (not implemented here): app startup, login/session restore,
 *   navigator.onLine, visibilitychange, explicit Sync button.
 * - Processes entityType=free_space_object + operationType=create|update.
 * - Drains in `seq` order for processing stability only — `seq` is NOT the version.
 *   Authoritative snapshot version is payload.object.updatedAt (never queue/flush order).
 * - Upserts by entityId; removes queue row only after confirmed cloud success.
 * - Leaves unknown / malformed / failed ops queued.
 * - Does not change local Free Space SOT or saveStatus UI.
 * - No server-side reject-if-older in PR5 (blind upsert; version carried in object jsonb).
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

type WritePayload = {
  boardId: string;
  object: JsonValue;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWritePayload(payload: JsonValue | null): WritePayload | null {
  if (!isPlainObject(payload)) return null;
  if (typeof payload.boardId !== 'string') return null;
  if (!isPlainObject(payload.object)) return null;
  return {
    boardId: payload.boardId,
    object: payload.object as JsonValue,
  };
}

/** Authoritative snapshot version from payload.object.updatedAt (not seq). */
function readObjectUpdatedAt(object: JsonValue): number | null {
  if (!isPlainObject(object)) return null;
  const value = object.updatedAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isSupportedWrite(op: PendingOperation): boolean {
  return (
    op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE &&
    (op.operationType === 'create' || op.operationType === 'update')
  );
}

/**
 * Drain create+update ops for one namespace in `seq` order (drain order only).
 * Newer snapshot is determined only by object.updatedAt — stale duplicate ops for the
 * same entityId are removed without cloud write once a newer version has been upserted
 * earlier in this flush pass.
 * Stops on cloud failure or remove failure (remaining ops stay queued).
 * Must be invoked manually in PR5.
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
    fwPersistWarn(`pending free-space flush skipped: reason=${ns.reason}`);
    return { ...result, stoppedReason: 'namespace_invalid' };
  }

  const listed = await listPendingOperations(ns.namespace);
  if (!listed.ok) {
    fwPersistWarn(`pending free-space flush list failed: reason=${listed.reason}`);
    return { ...result, stoppedReason: 'list_failed' };
  }

  /** Highest object.updatedAt successfully upserted this pass, per entityId. */
  const latestWrittenUpdatedAt = new Map<string, number>();

  for (const op of listed.value) {
    if (!isSupportedWrite(op)) {
      result.skippedUnsupported += 1;
      continue;
    }

    result.processed += 1;

    const parsed = parseWritePayload(op.payload);
    if (!parsed) {
      result.skippedMalformed += 1;
      fwPersistWarn(
        `pending free-space flush left malformed op queued: entityId=${op.entityId}`,
      );
      continue;
    }

    const version = readObjectUpdatedAt(parsed.object);
    const alreadyWritten = latestWrittenUpdatedAt.get(op.entityId);
    if (
      version != null &&
      alreadyWritten != null &&
      version < alreadyWritten
    ) {
      // Stale duplicate relative to a newer snapshot already flushed this pass.
      const removed = await removePendingOperation(ns.namespace, op.id);
      if (!removed.ok || !removed.value.removed) {
        fwPersistWarn(
          `pending free-space flush remove failed for superseded op: opId=${op.id}`,
        );
        return { ...result, stoppedReason: 'remove_failed' };
      }
      result.removed += 1;
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
        `pending free-space flush cloud write failed: reason=${cloud.reason}` +
          (cloud.message ? ` message=${cloud.message}` : ''),
      );
      return { ...result, stoppedReason: 'cloud_write_failed' };
    }

    const removed = await removePendingOperation(ns.namespace, op.id);
    if (!removed.ok || !removed.value.removed) {
      fwPersistWarn(
        `pending free-space flush remove failed after cloud success: opId=${op.id}`,
      );
      return { ...result, stoppedReason: 'remove_failed' };
    }

    result.removed += 1;
    if (version != null) {
      const prev = latestWrittenUpdatedAt.get(op.entityId);
      if (prev == null || version >= prev) {
        latestWrittenUpdatedAt.set(op.entityId, version);
      }
    }
  }

  return result;
}
