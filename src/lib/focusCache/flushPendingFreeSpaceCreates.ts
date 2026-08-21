/**
 * Drain consumer for pending Free Space object CREATE + UPDATE writes.
 *
 * - Production auto-flush is scheduled by freeSpaceObjectAutoFlush (enqueue /
 *   online / remount). This function remains the only cloud writer and the
 *   manual/diagnostic API.
 * - Processes entityType=free_space_object + operationType=create|update.
 * - Drains in `seq` order for processing stability only — `seq` is NOT the version.
 *   Authoritative snapshot version is payload.object.updatedAt (never queue/flush order).
 * - Upserts by entityId; removes queue row only after confirmed cloud success.
 * - Queue presence after upsert does not prove cloud absence if remove failed (crash window).
 * - Soft-delete (PR6) cancels pending create|update locally; does NOT cloud-delete rows
 *   (deferred until permanent purge). In-flight upsert after soft-delete is acceptable.
 * - Leaves unknown / malformed / failed ops queued.
 * - Does not change local Free Space SOT.
 * - Reports cloud queue/flush lifecycle to cloudSyncStatus (UI honesty).
 * - No server-side reject-if-older (blind upsert; version carried in object jsonb).
 */

import type { CacheNamespace } from '../focusCacheNamespace';
import { assertCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import {
  noteCloudFlushEnded,
  noteCloudFlushStarted,
  noteCloudOpResolved,
  noteCloudWriteFailed,
  reconcileCloudPendingOps,
} from '../sync/cloudSyncStatus';
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
 * Must be invoked via freeSpaceObjectAutoFlush or manually for diagnostics.
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

  const supported = listed.value.filter(isSupportedWrite);
  reconcileCloudPendingOps(supported.map(op => op.id));
  noteCloudFlushStarted();

  /** Highest object.updatedAt successfully upserted this pass, per entityId. */
  const latestWrittenUpdatedAt = new Map<string, number>();

  try {
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
          noteCloudWriteFailed('remove_failed');
          return { ...result, stoppedReason: 'remove_failed' };
        }
        noteCloudOpResolved(op.id);
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
        noteCloudWriteFailed(cloud.reason);
        return { ...result, stoppedReason: 'cloud_write_failed' };
      }

      const removed = await removePendingOperation(ns.namespace, op.id);
      if (!removed.ok || !removed.value.removed) {
        fwPersistWarn(
          `pending free-space flush remove failed after cloud success: opId=${op.id}`,
        );
        noteCloudWriteFailed('remove_failed');
        return { ...result, stoppedReason: 'remove_failed' };
      }

      noteCloudOpResolved(op.id);
      result.removed += 1;
      if (version != null) {
        const prev = latestWrittenUpdatedAt.get(op.entityId);
        if (prev == null || version >= prev) {
          latestWrittenUpdatedAt.set(op.entityId, version);
        }
      }
    }

    return result;
  } finally {
    noteCloudFlushEnded();
  }
}
