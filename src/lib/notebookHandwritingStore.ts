/**
 * Notebook handwriting stroke payloads — IndexedDB (not localStorage).
 * Keys are referenced from notebook ::hw::{blockKey}:: lines.
 * Storage key: {notebookObjectId}:{blockKey}
 */

import { fwPersistWarn } from './freeSpacePersistence';
import {
  referencedHandwritingKeys,
  sanitizeHandwritingData,
  type HandwritingBlockData,
} from './handwritingTypes';

const DB_NAME = 'fw_notebook_handwriting_v1';
const STORE = 'payloads';
const DB_VERSION = 1;

const cache = new Map<string, HandwritingBlockData>();
const listeners = new Set<() => void>();

/** Serialize all IDB ops — Safari/iPad fails on overlapping readwrite transactions. */
let idbChain: Promise<unknown> = Promise.resolve();

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

function hwDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  // #region agent log
  fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7fb648' },
    body: JSON.stringify({
      sessionId: '7fb648',
      location,
      message,
      data,
      timestamp: Date.now(),
      hypothesisId,
      runId: 'idb-investigate',
    }),
  }).catch(() => {});
  // #endregion
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

function openDb(): Promise<IDBDatabase> {
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

async function idbGet(storageKey: string): Promise<HandwritingBlockData | undefined> {
  return runSerializedIdb(async () => {
    const db = await openDb();
    return new Promise<HandwritingBlockData | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(storageKey);
      req.onsuccess = () => {
        db.close();
        const raw = req.result;
        resolve(sanitizeHandwritingData(raw) ?? undefined);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  });
}

async function idbPut(storageKey: string, data: HandwritingBlockData): Promise<void> {
  return runSerializedIdb(async () => {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('IndexedDB transaction error'));
      };
      tx.objectStore(STORE).put(data, storageKey);
    });
  });
}

async function idbDelete(storageKey: string): Promise<void> {
  return runSerializedIdb(async () => {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.objectStore(STORE).delete(storageKey);
    });
  });
}

async function listKeysForObject(objectId: string): Promise<string[]> {
  return runSerializedIdb(async () => {
    const db = await openDb();
    return new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => {
        db.close();
        const prefix = `${objectId}:`;
        resolve(
          (req.result as IDBValidKey[])
            .map(String)
            .filter(k => k.startsWith(prefix)),
        );
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
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
    return null;
  }
}

export async function hwSet(
  objectId: string,
  blockKey: string,
  data: HandwritingBlockData,
): Promise<boolean> {
  const storageKey = makeHandwritingStorageKey(objectId, blockKey);
  const payloadSummary = {
    objectId,
    blockKey,
    storageKey,
    dataType: data === null ? 'null' : typeof data,
    strokeCount: data && typeof data === 'object' && Array.isArray((data as HandwritingBlockData).strokes)
      ? (data as HandwritingBlockData).strokes.length
      : null,
    hasIndexedDb: typeof indexedDB !== 'undefined',
  };

  const sanitized = sanitizeHandwritingData(data);
  if (!sanitized) {
    hwDebugLog(
      'notebookHandwritingStore.ts:hwSet',
      'sanitize rejected payload',
      {
        ...payloadSummary,
        failureStage: 'sanitize',
        reachedIdb: false,
      },
      'H-sanitize',
    );
    fwPersistWarn(`Could not save handwriting ${storageKey}: sanitize rejected payload`);
    return false;
  }

  const toStore = { ...sanitized, updatedAt: Date.now() };
  let payloadBytes: number | null = null;
  try {
    payloadBytes = JSON.stringify(toStore).length;
  } catch (e) {
    hwDebugLog(
      'notebookHandwritingStore.ts:hwSet',
      'serialization probe failed',
      {
        ...payloadSummary,
        failureStage: 'serialization',
        reachedIdb: false,
        error: serializeIdbError(e),
      },
      'H-serialize',
    );
    fwPersistWarn(`Could not save handwriting ${storageKey}: serialization failed`);
    return false;
  }

  try {
    hwDebugLog(
      'notebookHandwritingStore.ts:hwSet',
      'idb put starting',
      {
        ...payloadSummary,
        payloadBytes,
        sanitizedStrokeCount: sanitized.strokes.length,
        canvas: sanitized.canvas,
      },
      'H-idb-start',
    );
    await idbPut(storageKey, toStore);
    hwDebugLog(
      'notebookHandwritingStore.ts:hwSet',
      'idb put complete',
      {
        ...payloadSummary,
        payloadBytes,
        reachedIdb: true,
      },
      'H-idb-ok',
    );
    cache.set(storageKey, toStore);
    notify();
    return true;
  } catch (e) {
    const err = serializeIdbError(e);
    hwDebugLog(
      'notebookHandwritingStore.ts:hwSet',
      'idb put failed',
      {
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
      },
      'H-idb-fail',
    );
    fwPersistWarn(`Could not save handwriting ${storageKey}: ${err.string}`);
    return false;
  }
}

export async function hwDelete(objectId: string, blockKey: string): Promise<void> {
  const storageKey = makeHandwritingStorageKey(objectId, blockKey);
  cache.delete(storageKey);
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
  for (const storageKey of existing) {
    const blockKey = storageKey.slice(objectId.length + 1);
    if (!referenced.has(blockKey)) {
      cache.delete(storageKey);
      await idbDelete(storageKey).catch(() => undefined);
    }
  }
}

export async function gcOrphanHandwriting(objectId: string, body: string): Promise<void> {
  return gcOrphanHandwritingKeys(objectId, referencedHandwritingKeys(body));
}
