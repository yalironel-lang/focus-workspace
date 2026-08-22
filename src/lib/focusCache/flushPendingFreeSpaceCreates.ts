/**
 * Drain consumer for pending Free Space object CREATE / UPDATE / DELETE writes.
 *
 * - Production auto-flush is scheduled by freeSpaceObjectAutoFlush (enqueue /
 *   online / remount). This function remains the only cloud writer and the
 *   manual/diagnostic API.
 * - Processes entityType=free_space_object|free_space_board + create|update|delete.
 * - Drains in `seq` order for processing stability only — `seq` is NOT the version.
 *   Authoritative snapshot version is payload.object.updatedAt (never queue/flush order).
 * - CREATE/UPDATE upsert by entityId; DELETE removes the cloud row.
 * - Removes queue row only after confirmed cloud success.
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
import { FREE_SPACE_BOARD_ENTITY_TYPE } from './freeSpaceBoardCreateEnqueue';
import {
  deleteFreeSpaceBoardFromCloud,
  upsertFreeSpaceBoardFromPayload,
} from './freeSpaceBoardCloud';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './freeSpaceObjectCreateEnqueue';
import {
  deleteFreeSpaceObjectFromCloud,
  upsertFreeSpaceObjectFromCreatePayload,
} from './freeSpaceObjectCloud';
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

type BoardWritePayload = {
  name: string;
  updatedAt: number;
};

function parseBoardWritePayload(payload: JsonValue | null): BoardWritePayload | null {
  if (!isPlainObject(payload)) return null;
  if (typeof payload.name !== 'string' || !payload.name.trim()) return null;
  const updatedAt = payload.updatedAt;
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null;
  return { name: payload.name.trim(), updatedAt };
}

function isSupportedObjectWrite(op: PendingOperation): boolean {
  return (
    op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE &&
    (op.operationType === 'create' ||
      op.operationType === 'update' ||
      op.operationType === 'delete')
  );
}

function isSupportedBoardWrite(op: PendingOperation): boolean {
  return (
    op.entityType === FREE_SPACE_BOARD_ENTITY_TYPE &&
    (op.operationType === 'create' ||
      op.operationType === 'update' ||
      op.operationType === 'delete')
  );
}

function isSupportedWrite(op: PendingOperation): boolean {
  return isSupportedObjectWrite(op) || isSupportedBoardWrite(op);
}

async function removeFlushedOp(
  namespace: CacheNamespace,
  opId: string,
  result: FlushPendingFreeSpaceCreatesResult,
): Promise<'ok' | 'remove_failed'> {
  const removed = await removePendingOperation(namespace, opId);
  if (!removed.ok || !removed.value.removed) {
    fwPersistWarn(
      `pending free-space flush remove failed after cloud success: opId=${opId}`,
    );
    noteCloudWriteFailed('remove_failed');
    return 'remove_failed';
  }
  noteCloudOpResolved(opId);
  result.removed += 1;
  return 'ok';
}

/**
 * Drain create/update/delete ops for one namespace in `seq` order (drain order only).
 * Newer snapshot is determined only by object.updatedAt — stale duplicate create/update
 * ops for the same entityId are removed without cloud write once a newer version has been
 * upserted earlier in this flush pass.
 * DELETE ops always call cloud delete (idempotent).
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
  /** Highest board payload.updatedAt successfully upserted this pass. */
  const latestWrittenBoardUpdatedAt = new Map<string, number>();
  /** Entity ids successfully deleted in this pass (skip superseded upserts). */
  const deletedEntityIds = new Set<string>();
  const deletedBoardIds = new Set<string>();

  try {
    for (const op of listed.value) {
      if (!isSupportedWrite(op)) {
        result.skippedUnsupported += 1;
        continue;
      }

      result.processed += 1;

      if (op.entityType === FREE_SPACE_BOARD_ENTITY_TYPE) {
        if (op.operationType === 'delete') {
          if (deletedBoardIds.has(op.entityId)) {
            const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
            if (removeStatus === 'remove_failed') {
              return { ...result, stoppedReason: 'remove_failed' };
            }
            continue;
          }

          const cloud = await deleteFreeSpaceBoardFromCloud({
            userId: ns.namespace.userId,
            sectionId: ns.namespace.workspaceId,
            boardId: op.entityId,
          });

          if (!cloud.ok) {
            result.failedCloud += 1;
            fwPersistWarn(
              `pending board flush cloud delete failed: reason=${cloud.reason}` +
                (cloud.message ? ` message=${cloud.message}` : ''),
            );
            noteCloudWriteFailed(cloud.reason);
            return { ...result, stoppedReason: 'cloud_write_failed' };
          }

          const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
          if (removeStatus === 'remove_failed') {
            return { ...result, stoppedReason: 'remove_failed' };
          }
          deletedBoardIds.add(op.entityId);
          continue;
        }

        if (deletedBoardIds.has(op.entityId)) {
          const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
          if (removeStatus === 'remove_failed') {
            return { ...result, stoppedReason: 'remove_failed' };
          }
          continue;
        }

        const boardParsed = parseBoardWritePayload(op.payload);
        if (!boardParsed) {
          result.skippedMalformed += 1;
          fwPersistWarn(
            `pending board flush left malformed op queued: entityId=${op.entityId}`,
          );
          continue;
        }

        const boardAlreadyWritten = latestWrittenBoardUpdatedAt.get(op.entityId);
        if (
          boardAlreadyWritten != null &&
          boardParsed.updatedAt < boardAlreadyWritten
        ) {
          const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
          if (removeStatus === 'remove_failed') {
            return { ...result, stoppedReason: 'remove_failed' };
          }
          continue;
        }

        const boardCloud = await upsertFreeSpaceBoardFromPayload({
          userId: ns.namespace.userId,
          sectionId: ns.namespace.workspaceId,
          boardId: op.entityId,
          name: boardParsed.name,
        });

        if (!boardCloud.ok) {
          result.failedCloud += 1;
          fwPersistWarn(
            `pending board flush cloud write failed: reason=${boardCloud.reason}` +
              (boardCloud.message ? ` message=${boardCloud.message}` : ''),
          );
          noteCloudWriteFailed(boardCloud.reason);
          return { ...result, stoppedReason: 'cloud_write_failed' };
        }

        const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
        if (removeStatus === 'remove_failed') {
          return { ...result, stoppedReason: 'remove_failed' };
        }
        const prevBoard = latestWrittenBoardUpdatedAt.get(op.entityId);
        if (prevBoard == null || boardParsed.updatedAt >= prevBoard) {
          latestWrittenBoardUpdatedAt.set(op.entityId, boardParsed.updatedAt);
        }
        continue;
      }

      if (op.operationType === 'delete') {
        if (deletedEntityIds.has(op.entityId)) {
          const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
          if (removeStatus === 'remove_failed') {
            return { ...result, stoppedReason: 'remove_failed' };
          }
          continue;
        }

        const cloud = await deleteFreeSpaceObjectFromCloud({
          userId: ns.namespace.userId,
          sectionId: ns.namespace.workspaceId,
          objectId: op.entityId,
        });

        if (!cloud.ok) {
          result.failedCloud += 1;
          fwPersistWarn(
            `pending free-space flush cloud delete failed: reason=${cloud.reason}` +
              (cloud.message ? ` message=${cloud.message}` : ''),
          );
          noteCloudWriteFailed(cloud.reason);
          return { ...result, stoppedReason: 'cloud_write_failed' };
        }

        const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
        if (removeStatus === 'remove_failed') {
          return { ...result, stoppedReason: 'remove_failed' };
        }
        deletedEntityIds.add(op.entityId);
        continue;
      }

      // create | update
      if (deletedEntityIds.has(op.entityId)) {
        // DELETE earlier in this pass wins — drop stale upsert without cloud write.
        const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
        if (removeStatus === 'remove_failed') {
          return { ...result, stoppedReason: 'remove_failed' };
        }
        continue;
      }

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
        const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
        if (removeStatus === 'remove_failed') {
          return { ...result, stoppedReason: 'remove_failed' };
        }
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

      const removeStatus = await removeFlushedOp(ns.namespace, op.id, result);
      if (removeStatus === 'remove_failed') {
        return { ...result, stoppedReason: 'remove_failed' };
      }
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
