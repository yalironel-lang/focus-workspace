import type { CacheNamespace, CacheNamespaceFailureReason } from '../focusCacheNamespace';
import type { SectionDetail, SectionWithProgress } from '../../types';

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
/** v1: pending_operations. v2: additive section_snapshots (Library/section last-known). */
export const FOCUS_CACHE_DB_VERSION = 2;
export const PENDING_OPERATIONS_STORE = 'pending_operations';
export const SECTION_SNAPSHOTS_STORE = 'section_snapshots';
export const BY_ID_INDEX = 'byId';
export const BY_NAMESPACE_INDEX = 'byNamespace';
export const BY_USER_ID_INDEX = 'byUserId';

/** Snapshot payload schema (independent of IDB DB version). */
export const SECTION_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SectionLibrarySnapshotRecord = {
  id: string;
  kind: 'library_list';
  schemaVersion: typeof SECTION_SNAPSHOT_SCHEMA_VERSION;
  userId: string;
  updatedAt: string;
  sections: SectionWithProgress[];
};

export type SectionDetailSnapshotRecord = {
  id: string;
  kind: 'section_detail';
  schemaVersion: typeof SECTION_SNAPSHOT_SCHEMA_VERSION;
  userId: string;
  sectionId: string;
  updatedAt: string;
  section: SectionDetail;
};

export type SectionSnapshotRecord =
  | SectionLibrarySnapshotRecord
  | SectionDetailSnapshotRecord;
