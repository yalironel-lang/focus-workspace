import type { CacheNamespace, CacheNamespaceFailureReason } from '../focusCacheNamespace';

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PendingOperationType = 'create' | 'update' | 'delete';

/** Stored queue record after IndexedDB assigns `seq`. */
export type PendingOperation = {
  seq: number;
  id: string;
  userId: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  operationType: PendingOperationType;
  payload: JsonValue | null;
};

/** Record written to IDB before autoIncrement assigns `seq`. */
export type PendingOperationInsert = Omit<PendingOperation, 'seq'>;

export type PendingQueueFailureReason =
  | CacheNamespaceFailureReason
  | 'invalid_operation'
  | 'idb_unavailable'
  | 'db_open_failed'
  | 'transaction_failed'
  | 'duplicate_id';

export type PendingQueueResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: PendingQueueFailureReason };

export type EnqueuePendingOperationInput = {
  namespace: CacheNamespace;
  entityType: string;
  entityId: string;
  operationType: PendingOperationType;
  payload: JsonValue | null;
  /** Optional; default crypto.randomUUID() */
  id?: string;
};

export const FOCUS_CACHE_DB_NAME = 'focus_cache_v1';
export const FOCUS_CACHE_DB_VERSION = 1;
export const PENDING_OPERATIONS_STORE = 'pending_operations';
export const BY_ID_INDEX = 'byId';
export const BY_NAMESPACE_INDEX = 'byNamespace';
