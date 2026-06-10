/**
 * Notebook handwriting stroke payloads — IndexedDB (not localStorage).
 * Keys are referenced from notebook ::hw::{blockKey}:: lines.
 * Storage key: {notebookObjectId}:{blockKey}
 */

import { hwDiagLog } from './handwritingDiagnostics';
import { fwPersistWarn } from './freeSpacePersistence';
import {
  referencedHandwritingKeys,
  sanitizeHandwritingData,
  type HandwritingBlockData,
} from './handwritingTypes';

const DB_NAME = 'fw_notebook_handwriting_v1';
const STORE = 'payloads';
const DB_VERSION = 1;

/** Skip GC deletes for keys written recently (avoids races with active drawing). */
const GC_WRITE_GRACE_MS = 120_000;

const cache = new Map<string, HandwritingBlockData>();
const listeners = new Set<() => void>();
const recentWrites = new Map<string, number>();

/** Serialize all IDB ops — Safari/iPad fails on overlapping readwrite transactions. */
let idbChain: Promise<unknown> = Promise.resolve();

let dbPromise: Promise<IDBDatabase> | null = null;

export type HwSaveFailureStage =
  | 'missing_params'
  | 'sanitize'
  | 'serialization'
  | 'idb'
  | 'unknown';

export type HwSetResult = {
  ok: boolean;
  failureStage?: HwSaveFailureStage;
  reachedIdb?: boolean;
  errorName?: string;
  errorMessage?: string;
  isQuota?: boolean;
};

function runSerializedIdb<T>(op: () => Promise<T>): Promise<T> {
  const run = idbChain.then(op, op);
  idbChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function serializeIdbError(e: unknown): {
  name: string;
  message: string;
  stack?: string;
  code?: number;
  string: string;
} {
  if (e instanceof DOMException) {
    return {
      name: e.name,
      message: e.message,
      stack: e.stack,
      code: e.code,
      string: String(e),
    };
  }
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: e.stack,
      string: String(e),
    };
  }
  return { name: 'Unknown', message: String(e), string: String(e) };
}

function isTransientIdbError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return (
    e.name === 'InvalidStateError' ||
    e.name === 'AbortError' ||
    e.name === 'TransactionInactiveError'
  );
}

function notify(): void {
  listeners.forEach(fn => fn());
}

export function subscribeNotebookHandwriting(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function makeHandwritingStorageKey(objectId: string, blockKey: string): string {
  return `${objectId}:${blockKey}`;
}

function openDbFresh(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable (indexedDB is undefined)'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked (upgrade in progress)'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDbFresh().catch(err => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function resetDbConnection(): void {
  dbPromise = null;
}

async function idbGet(storageKey: string): Promise<HandwritingBlockData | undefined> {
  return runSerializedIdb(async () => {
    const db = await getDb();
    return new Promise<HandwritingBlockData | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(storageKey);
      tx.oncomplete = () => {
        const raw = req.result;
        resolve(sanitizeHandwritingData(raw) ?? undefined);
      };
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB read aborted'));
    });
  });
}

async function idbPutOnce(storageKey: string, data: HandwritingBlockData): Promise<void> {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction error'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    tx.objectStore(STORE).put(data, storageKey);
  });
}

async function idbPut(storageKey: string, data: HandwritingBlockData): Promise<void> {
  return runSerializedIdb(async () => {
    try {
      await idbPutOnce(storageKey, data);
    } catch (e) {
      if (!isTransientIdbError(e)) throw e;
      hwDiagLog('notebookHandwritingStore.ts:idbPut', 'transient IDB error, reconnecting', {
        storageKey,
        error: serializeIdbError(e),
      });
      resetDbConnection();
      await idbPutOnce(storageKey, data);
    }
  });
}

async function idbDelete(storageKey: string): Promise<void> {
  return runSerializedIdb(async () => {
    const db = await getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete error'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'));
      tx.objectStore(STORE).delete(storageKey);
    });
  });
}

async function listKeysForObject(objectId: string): Promise<string[]> {
  return runSerializedIdb(async () => {
    const db = await getDb();
    return new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      tx.oncomplete = () => {
        const prefix = `${objectId}:`;
        resolve(
          (req.result as IDBValidKey[])
            .map(String)
            .filter(k => k.startsWith(prefix)),
        );
      };
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB list aborted'));
    });
  });
}

/** Sync read from in-memory cache after hydrate. */
export function hwGetCached(objectId: string, blockKey: string): HandwritingBlockData | null {
  const key = makeHandwritingStorageKey(objectId, blockKey);
  return cache.get(key) ?? null;
}

export async function hwGet(objectId: string, blockKey: string): Promise<HandwritingBlockData | null> {
  const storageKey = makeHandwritingStorageKey(objectId, blockKey);
  if (cache.has(storageKey)) return cache.get(storageKey)!;
  try {
    const data = await idbGet(storageKey);
    if (data) cache.set(storageKey, data);
    return data ?? null;
  } catch (e) {
    fwPersistWarn(`Could not load handwriting ${storageKey}: ${String(e)}`);
    hwDiagLog('notebookHandwritingStore.ts:hwGet', 'load failed', {
      storageKey,
      error: serializeIdbError(e),
    });
    return null;
  }
}

export async function hwSet(
  objectId: string,
  blockKey: string,
  data: HandwritingBlockData,
): Promise<HwSetResult> {
  if (!objectId || !blockKey) {
    hwDiagLog('notebookHandwritingStore.ts:hwSet', 'missing objectId or blockKey', {
      objectId,
      blockKey,
      failureStage: 'missing_params',
    });
    return { ok: false, failureStage: 'missing_params', reachedIdb: false };
  }

  const storageKey = makeHandwritingStorageKey(objectId, blockKey);
  const payloadSummary = {
    objectId,
    blockKey,
    storageKey,
    strokeCount: Array.isArray(data.strokes) ? data.strokes.length : null,
    hasIndexedDb: typeof indexedDB !== 'undefined',
  };

  const sanitized = sanitizeHandwritingData(data);
  if (!sanitized) {
    hwDiagLog('notebookHandwritingStore.ts:hwSet', 'sanitize rejected payload', {
      ...payloadSummary,
      failureStage: 'sanitize',
      reachedIdb: false,
    });
    fwPersistWarn(`Could not save handwriting ${storageKey}: sanitize rejected payload`);
    return { ok: false, failureStage: 'sanitize', reachedIdb: false };
  }

  const toStore = { ...sanitized, updatedAt: Date.now() };
  let payloadBytes: number | null = null;
  try {
    payloadBytes = JSON.stringify(toStore).length;
  } catch (e) {
    const err = serializeIdbError(e);
    hwDiagLog('notebookHandwritingStore.ts:hwSet', 'serialization probe failed', {
      ...payloadSummary,
      failureStage: 'serialization',
      reachedIdb: false,
      error: err,
    });
    fwPersistWarn(`Could not save handwriting ${storageKey}: serialization failed`);
    return {
      ok: false,
      failureStage: 'serialization',
      reachedIdb: false,
      errorName: err.name,
      errorMessage: err.message,
    };
  }

  hwDiagLog('notebookHandwritingStore.ts:hwSet', 'idb put starting', {
    ...payloadSummary,
    payloadBytes,
    sanitizedStrokeCount: sanitized.strokes.length,
    canvas: sanitized.canvas,
  });

  try {
    await idbPut(storageKey, toStore);
    recentWrites.set(storageKey, Date.now());
    cache.set(storageKey, toStore);
    notify();
    hwDiagLog('notebookHandwritingStore.ts:hwSet', 'idb put complete', {
      ...payloadSummary,
      payloadBytes,
      reachedIdb: true,
    });
    return { ok: true, reachedIdb: true };
  } catch (e) {
    const err = serializeIdbError(e);
    hwDiagLog('notebookHandwritingStore.ts:hwSet', 'idb put failed', {
      ...payloadSummary,
      payloadBytes,
      failureStage: 'idb',
      reachedIdb: false,
      error: err,
      errorName: err.name,
      isQuota: err.name === 'QuotaExceededError',
      isDataClone: err.name === 'DataCloneError',
      isInvalidState: err.name === 'InvalidStateError',
      isOpenBlocked: err.message.includes('blocked'),
    });
    fwPersistWarn(`Could not save handwriting ${storageKey}: ${err.string}`);
    return {
      ok: false,
      failureStage: 'idb',
      reachedIdb: false,
      errorName: err.name,
      errorMessage: err.message,
      isQuota: err.name === 'QuotaExceededError',
    };
  }
}

/** Back-compat boolean wrapper for callers that only need ok/fail. */
export async function hwSetOk(
  objectId: string,
  blockKey: string,
  data: HandwritingBlockData,
): Promise<boolean> {
  const result = await hwSet(objectId, blockKey, data);
  return result.ok;
}

export async function hwDelete(objectId: string, blockKey: string): Promise<void> {
  const storageKey = makeHandwritingStorageKey(objectId, blockKey);
  cache.delete(storageKey);
  recentWrites.delete(storageKey);
  try {
    await idbDelete(storageKey);
    notify();
  } catch (e) {
    fwPersistWarn(`Could not delete handwriting ${storageKey}: ${String(e)}`);
  }
}

export async function hwDeleteAllForObject(objectId: string): Promise<void> {
  const keys = await listKeysForObject(objectId);
  for (const storageKey of keys) {
    cache.delete(storageKey);
    recentWrites.delete(storageKey);
    await idbDelete(storageKey).catch(() => undefined);
  }
  if (keys.length) notify();
}

export async function hydrateHandwritingBlocks(
  objectId: string,
  blockKeys: string[],
): Promise<void> {
  const unique = [...new Set(blockKeys.filter(Boolean))];
  if (!objectId || !unique.length) return;
  let changed = false;
  for (const blockKey of unique) {
    const storageKey = makeHandwritingStorageKey(objectId, blockKey);
    if (cache.has(storageKey)) continue;
    try {
      const data = await idbGet(storageKey);
      if (!data) continue;
      cache.set(storageKey, data);
      changed = true;
    } catch {
      /* skip */
    }
  }
  if (changed) notify();
}

export async function gcOrphanHandwritingKeys(
  objectId: string,
  referencedKeys: string[],
): Promise<void> {
  if (!objectId) return;
  const referenced = new Set(referencedKeys.filter(Boolean));
  const existing = await listKeysForObject(objectId);
  const now = Date.now();
  for (const storageKey of existing) {
    const blockKey = storageKey.slice(objectId.length + 1);
    if (referenced.has(blockKey)) continue;
    const lastWrite = recentWrites.get(storageKey);
    if (lastWrite !== undefined && now - lastWrite < GC_WRITE_GRACE_MS) {
      hwDiagLog('notebookHandwritingStore.ts:gc', 'skipped recent orphan', {
        storageKey,
        ageMs: now - lastWrite,
      });
      continue;
    }
    cache.delete(storageKey);
    recentWrites.delete(storageKey);
    await idbDelete(storageKey).catch(() => undefined);
  }
}

export async function gcOrphanHandwriting(objectId: string, body: string): Promise<void> {
  return gcOrphanHandwritingKeys(objectId, referencedHandwritingKeys(body));
}
