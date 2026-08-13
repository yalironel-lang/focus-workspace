/**
 * Durable pending_operations queue for focus_cache_v1.
 * Namespace-scoped only — no sync, retry, or automatic enqueue.
 *
 * Payload replace supports Free Space UPDATE coalesce (one write per entityId).
 * PR5 uses a linear list scan for coalesce lookups (acceptable at current scale).
 * Future optimization (not implemented): entityId → pendingOperationId map
 * (scoped by namespace + entityType) for O(1) coalesce lookups.
 */

import {
  assertCacheNamespace,
  type CacheNamespace,
} from '../focusCacheNamespace';
import { openFocusCacheDb } from './db';
import type {
  EnqueuePendingOperationInput,
  JsonValue,
  PendingOperation,
  PendingOperationInsert,
  PendingOperationType,
  PendingQueueFailureReason,
  PendingQueueResult,
} from './types';
import {
  BY_ID_INDEX,
  BY_NAMESPACE_INDEX,
  PENDING_OPERATIONS_STORE,
} from './types';

function fail<T>(reason: PendingQueueFailureReason): PendingQueueResult<T> {
  return { ok: false, reason };
}

function ok<T>(value: T): PendingQueueResult<T> {
  return { ok: true, value };
}

/** Exact non-empty string with no leading/trailing whitespace (never silent trim). */
function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);

  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return false;
  }

  if (typeof value !== 'object') return false;

  if (
    value instanceof Date ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    return false;
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) return false;
  if (typeof File !== 'undefined' && value instanceof File) return false;

  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item, seen));
  }

  if (!isPlainObject(value)) return false;

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return false;
    if (!isJsonValue((value as Record<string, unknown>)[key], seen)) return false;
  }
  return true;
}

function isPendingOperationType(value: unknown): value is PendingOperationType {
  return value === 'create' || value === 'update' || value === 'delete';
}

function mapOpenError(err: unknown): PendingQueueFailureReason {
  if (err instanceof Error && err.message === 'idb_unavailable') return 'idb_unavailable';
  return 'db_open_failed';
}

function isConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { name?: string }).name === 'ConstraintError';
}

async function withDb<T>(
  run: (db: IDBDatabase) => Promise<PendingQueueResult<T>>,
): Promise<PendingQueueResult<T>> {
  let db: IDBDatabase;
  try {
    db = await openFocusCacheDb();
  } catch (err) {
    return fail(mapOpenError(err));
  }

  try {
    return await run(db);
  } catch {
    return fail('transaction_failed');
  }
}

export async function enqueuePendingOperation(
  input: EnqueuePendingOperationInput,
): Promise<PendingQueueResult<PendingOperation>> {
  const ns = assertCacheNamespace(input.namespace);
  if (!ns.ok) return fail(ns.reason);

  if (!isExactNonEmptyId(input.entityType) || !isExactNonEmptyId(input.entityId)) {
    return fail('invalid_operation');
  }
  if (!isPendingOperationType(input.operationType)) {
    return fail('invalid_operation');
  }
  if (input.id !== undefined && !isExactNonEmptyId(input.id)) {
    return fail('invalid_operation');
  }
  if (!isJsonValue(input.payload)) {
    return fail('invalid_operation');
  }

  const id = input.id ?? crypto.randomUUID();
  const record: PendingOperationInsert = {
    id,
    userId: ns.namespace.userId,
    workspaceId: ns.namespace.workspaceId,
    entityType: input.entityType,
    entityId: input.entityId,
    operationType: input.operationType,
    payload: input.payload,
  };

  return withDb((db) =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (result: PendingQueueResult<PendingOperation>) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let tx: IDBTransaction;
      try {
        tx = db.transaction(PENDING_OPERATIONS_STORE, 'readwrite');
      } catch {
        finish(fail('transaction_failed'));
        return;
      }

      let assignedSeq: number | undefined;
      let requestError: unknown = null;

      tx.oncomplete = () => {
        if (typeof assignedSeq !== 'number') {
          finish(fail('transaction_failed'));
          return;
        }
        finish(ok({ ...record, seq: assignedSeq }));
      };
      // fake-indexeddb often surfaces ConstraintError on abort with tx.error set then;
      // onerror may fire earlier with a null tx.error — prefer abort + requestError.
      tx.onerror = () => {
        const err = tx.error ?? requestError;
        if (err && isConstraintError(err)) {
          finish(fail('duplicate_id'));
          return;
        }
        if (err) finish(fail('transaction_failed'));
      };
      tx.onabort = () => {
        const err = tx.error ?? requestError;
        if (isConstraintError(err)) {
          finish(fail('duplicate_id'));
          return;
        }
        finish(fail('transaction_failed'));
      };

      try {
        const req = tx.objectStore(PENDING_OPERATIONS_STORE).add(record);
        req.onsuccess = () => {
          assignedSeq = req.result as number;
        };
        req.onerror = () => {
          requestError = req.error;
        };
      } catch (err) {
        if (isConstraintError(err)) {
          finish(fail('duplicate_id'));
          return;
        }
        try {
          tx.abort();
        } catch {
          // ignore
        }
        finish(fail('transaction_failed'));
      }
    }),
  );
}

export async function listPendingOperations(
  namespace: CacheNamespace,
): Promise<PendingQueueResult<PendingOperation[]>> {
  const ns = assertCacheNamespace(namespace);
  if (!ns.ok) return fail(ns.reason);

  return withDb((db) =>
    new Promise((resolve) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(PENDING_OPERATIONS_STORE, 'readonly');
      } catch {
        resolve(fail('transaction_failed'));
        return;
      }

      const index = tx.objectStore(PENDING_OPERATIONS_STORE).index(BY_NAMESPACE_INDEX);
      const req = index.getAll([ns.namespace.userId, ns.namespace.workspaceId]);

      req.onsuccess = () => {
        const rows = (req.result ?? []) as PendingOperation[];
        // Index ties break by primary key (seq); keep ascending seq explicit.
        rows.sort((a, b) => a.seq - b.seq);
        resolve(ok(rows));
      };
      req.onerror = () => resolve(fail('transaction_failed'));
      tx.onerror = () => resolve(fail('transaction_failed'));
    }),
  );
}

export async function removePendingOperation(
  namespace: CacheNamespace,
  operationId: string,
): Promise<PendingQueueResult<{ removed: boolean }>> {
  const ns = assertCacheNamespace(namespace);
  if (!ns.ok) return fail(ns.reason);
  if (!isExactNonEmptyId(operationId)) return fail('invalid_operation');

  return withDb((db) =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (result: PendingQueueResult<{ removed: boolean }>) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let tx: IDBTransaction;
      try {
        tx = db.transaction(PENDING_OPERATIONS_STORE, 'readwrite');
      } catch {
        finish(fail('transaction_failed'));
        return;
      }

      const store = tx.objectStore(PENDING_OPERATIONS_STORE);
      const getReq = store.index(BY_ID_INDEX).get(operationId);

      getReq.onsuccess = () => {
        const row = getReq.result as PendingOperation | undefined;
        if (
          !row ||
          row.userId !== ns.namespace.userId ||
          row.workspaceId !== ns.namespace.workspaceId
        ) {
          // Missing or cross-namespace: same opaque result; do not delete.
          finish(ok({ removed: false }));
          return;
        }

        const delReq = store.delete(row.seq);
        delReq.onerror = () => finish(fail('transaction_failed'));

        tx.oncomplete = () => finish(ok({ removed: true }));
        tx.onerror = () => finish(fail('transaction_failed'));
        tx.onabort = () => finish(fail('transaction_failed'));
      };

      getReq.onerror = () => finish(fail('transaction_failed'));
      tx.onerror = () => {
        if (!settled) finish(fail('transaction_failed'));
      };
    }),
  );
}

/**
 * Replace payload on an existing pending op (same id/seq/operationType).
 * Namespace-scoped: cross-namespace or missing id → { replaced: false }.
 */
export async function replacePendingOperationPayload(
  namespace: CacheNamespace,
  operationId: string,
  payload: JsonValue | null,
): Promise<PendingQueueResult<{ replaced: boolean; operation?: PendingOperation }>> {
  const ns = assertCacheNamespace(namespace);
  if (!ns.ok) return fail(ns.reason);
  if (!isExactNonEmptyId(operationId)) return fail('invalid_operation');
  if (!isJsonValue(payload)) return fail('invalid_operation');

  return withDb((db) =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (
        result: PendingQueueResult<{ replaced: boolean; operation?: PendingOperation }>,
      ) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let tx: IDBTransaction;
      try {
        tx = db.transaction(PENDING_OPERATIONS_STORE, 'readwrite');
      } catch {
        finish(fail('transaction_failed'));
        return;
      }

      const store = tx.objectStore(PENDING_OPERATIONS_STORE);
      const getReq = store.index(BY_ID_INDEX).get(operationId);
      let updated: PendingOperation | undefined;

      getReq.onsuccess = () => {
        const row = getReq.result as PendingOperation | undefined;
        if (
          !row ||
          row.userId !== ns.namespace.userId ||
          row.workspaceId !== ns.namespace.workspaceId
        ) {
          finish(ok({ replaced: false }));
          return;
        }

        updated = { ...row, payload };
        const putReq = store.put(updated);
        putReq.onerror = () => finish(fail('transaction_failed'));

        tx.oncomplete = () => finish(ok({ replaced: true, operation: updated }));
        tx.onerror = () => finish(fail('transaction_failed'));
        tx.onabort = () => finish(fail('transaction_failed'));
      };

      getReq.onerror = () => finish(fail('transaction_failed'));
      tx.onerror = () => {
        if (!settled) finish(fail('transaction_failed'));
      };
    }),
  );
}
