/**
 * Notebook handwriting stroke payloads — IndexedDB with localStorage fallback.
 * Keys are referenced from notebook ::hw::{blockKey}:: lines.
 * Storage key: {notebookObjectId}:{blockKey}
 */

import { hwDiagLog } from './handwritingDiagnostics';
import { getIndexedDB, probeIndexedDbEnvironment } from './indexedDbEnvironment';
import { fwPersistWarn } from './freeSpacePersistence';
import {
  recordPageInkDbState,
  recordPageInkHwGet,
  recordPageInkHwSet,
  recordPageInkIdbFailure,
  recordPageInkPersistBackend,
  recordPageInkPostSaveVerify,
} from './handwritingPageInkDebug';
import {
  PAGE_INK_BLOCK_KEY,
  referencedHandwritingKeys,
  sanitizeHandwritingData,
  type HandwritingBlockData,
} from './handwritingTypes';

const DB_NAME = 'fw_notebook_handwriting_v1';
const STORE = 'payloads';
const DB_VERSION = 1;
const LS_KEY_PREFIX = 'fw_notebook_handwriting_ls:';

export type HandwritingPersistBackend = 'idb' | 'localStorage' | 'none';

/** Skip GC deletes for keys written recently (avoids races with active drawing). */
const GC_WRITE_GRACE_MS = 120_000;

const cache = new Map<string, HandwritingBlockData>();
const listeners = new Set<() => void>();
const recentWrites = new Map<string, number>();

/** Serialize all IDB ops — Safari/iPad fails on overlapping readwrite transactions. */
let idbChain: Promise<unknown> = Promise.resolve();

let dbPromise: Promise<IDBDatabase> | null = null;
let activeDb: IDBDatabase | null = null;
let lastIdbFailureTxState: string | null = null;
let activePersistBackend: HandwritingPersistBackend = 'none';

export function getHandwritingPersistBackend(): HandwritingPersistBackend {
  return activePersistBackend;
}

function isLocalStorageAvailable(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const k = '__fw_hw_ls_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function resolvePersistBackend(): HandwritingPersistBackend {
  if (getIndexedDB()) return 'idb';
  if (isLocalStorageAvailable()) return 'localStorage';
  return 'none';
}

function lsFullKey(storageKey: string): string {
  return `${LS_KEY_PREFIX}${storageKey}`;
}

function lsGet(storageKey: string): HandwritingBlockData | undefined {
  try {
    const raw = localStorage.getItem(lsFullKey(storageKey));
    if (!raw) return undefined;
    return sanitizeHandwritingData(JSON.parse(raw)) ?? undefined;
  } catch {
    return undefined;
  }
}

function lsPut(storageKey: string, data: HandwritingBlockData): void {
  localStorage.setItem(lsFullKey(storageKey), JSON.stringify(data));
}

function lsDelete(storageKey: string): void {
  try {
    localStorage.removeItem(lsFullKey(storageKey));
  } catch {
    /* best-effort */
  }
}

function lsListKeysForObject(objectId: string): string[] {
  const prefix = lsFullKey(`${objectId}:`);
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (fullKey?.startsWith(prefix)) {
        keys.push(fullKey.slice(LS_KEY_PREFIX.length));
      }
    }
  } catch {
    /* ignore */
  }
  return keys;
}

function storageUnavailableError(): Error {
  return new Error(
    'Handwriting storage is not available in this browser session (IndexedDB and localStorage are both unavailable).',
  );
}

function probePageInkPersistOnce(isPageInk: boolean): void {
  if (!isPageInk) return;
  activePersistBackend = resolvePersistBackend();
  recordPageInkPersistBackend(activePersistBackend);
  recordPageInkDbState(getDbDebugState(), probeIndexedDbEnvironment());
}

function getDbDebugState(): string {
  if (!getIndexedDB()) return 'idb-unavailable';
  if (activeDb) return `open v${activeDb.version}`;
  if (dbPromise) return 'connecting';
  return 'no-connection';
}

function getTxDebugState(db: IDBDatabase, tx: IDBTransaction | null): string {
  const storeNames = Array.from(db.objectStoreNames).join(',') || 'none';
  if (!tx) return `db=v${db.version} stores=[${storeNames}] tx=null`;
  const txErr = tx.error;
  return `db=v${db.version} stores=[${storeNames}] tx.mode=${tx.mode} tx.error=${txErr ? `${txErr.name}:${txErr.message}` : 'none'}`;
}

function attachDbLifecycle(db: IDBDatabase): void {
  activeDb = db;
  db.onclose = () => {
    if (activeDb === db) activeDb = null;
    dbPromise = null;
  };
  db.onversionchange = () => {
    db.close();
  };
}

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
  const idb = getIndexedDB();
  if (!idb) {
    return Promise.reject(
      new Error(
        'IndexedDB is not available in this browser session (often Safari Private Browsing or restricted storage).',
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked (upgrade in progress)'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      attachDbLifecycle(db);
      resolve(db);
    };
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
  activeDb = null;
}

async function persistGet(storageKey: string): Promise<HandwritingBlockData | undefined> {
  const backend = resolvePersistBackend();
  activePersistBackend = backend;
  if (backend === 'idb') return idbGet(storageKey);
  if (backend === 'localStorage') return lsGet(storageKey);
  throw storageUnavailableError();
}

async function persistPut(storageKey: string, data: HandwritingBlockData): Promise<void> {
  const backend = resolvePersistBackend();
  activePersistBackend = backend;
  if (backend === 'idb') {
    await idbPut(storageKey, data);
    return;
  }
  if (backend === 'localStorage') {
    try {
      lsPut(storageKey, data);
      return;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
  throw storageUnavailableError();
}

async function persistDelete(storageKey: string): Promise<void> {
  const backend = resolvePersistBackend();
  activePersistBackend = backend;
  if (backend === 'idb') {
    await idbDelete(storageKey);
    return;
  }
  if (backend === 'localStorage') {
    lsDelete(storageKey);
    return;
  }
  throw storageUnavailableError();
}

async function persistListKeysForObject(objectId: string): Promise<string[]> {
  const backend = resolvePersistBackend();
  activePersistBackend = backend;
  if (backend === 'idb') return listKeysForObjectIdb(objectId);
  if (backend === 'localStorage') return lsListKeysForObject(objectId);
  throw storageUnavailableError();
}

async function idbGet(storageKey: string): Promise<HandwritingBlockData | undefined> {
  return runSerializedIdb(async () => {
    const db = await getDb();
    return new Promise<HandwritingBlockData | undefined>((resolve, reject) => {
      let tx: IDBTransaction | null = null;
      try {
        tx = db.transaction(STORE, 'readonly');
      } catch (e) {
        lastIdbFailureTxState = getTxDebugState(db, null);
        reject(e);
        return;
      }
      const req = tx.objectStore(STORE).get(storageKey);
      tx.oncomplete = () => {
        const raw = req.result;
        resolve(sanitizeHandwritingData(raw) ?? undefined);
      };
      tx.onerror = () => {
        const err = tx!.error ?? req.error;
        lastIdbFailureTxState = getTxDebugState(db, tx);
        reject(err ?? new Error('IndexedDB read failed'));
      };
      tx.onabort = () => {
        lastIdbFailureTxState = getTxDebugState(db, tx);
        reject(tx!.error ?? new Error('IndexedDB read aborted'));
      };
    });
  });
}

async function idbPutOnce(storageKey: string, data: HandwritingBlockData): Promise<void> {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction | null = null;
    try {
      tx = db.transaction(STORE, 'readwrite');
    } catch (e) {
      lastIdbFailureTxState = getTxDebugState(db, null);
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      const err = tx!.error ?? new Error('IndexedDB transaction error');
      lastIdbFailureTxState = getTxDebugState(db, tx);
      reject(err);
    };
    tx.onabort = () => {
      lastIdbFailureTxState = getTxDebugState(db, tx);
      reject(tx!.error ?? new Error('IndexedDB write aborted'));
    };
    try {
      tx.objectStore(STORE).put(data, storageKey);
    } catch (e) {
      lastIdbFailureTxState = getTxDebugState(db, tx);
      reject(e);
    }
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

export async function hwListKeysForObject(objectId: string): Promise<string[]> {
  try {
    return await persistListKeysForObject(objectId);
  } catch {
    return [];
  }
}

async function listKeysForObjectIdb(objectId: string): Promise<string[]> {
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
  const isPageInk = blockKey === PAGE_INK_BLOCK_KEY;
  probePageInkPersistOnce(isPageInk);
  if (cache.has(storageKey)) {
    const cached = cache.get(storageKey)!;
    if (isPageInk) {
      hwDiagLog('notebookHandwritingStore.ts:hwGet', 'page-ink cache hit', {
        objectId,
        blockKey,
        storageKey,
        strokeCount: cached.strokes.length,
        height: cached.canvas.height,
        source: 'cache',
      });
      recordPageInkHwGet(objectId, cached.strokes.length, 'cache');
    }
    return cached;
  }
  try {
    const data = await persistGet(storageKey);
    const backend = activePersistBackend;
    if (isPageInk) {
      const source = data
        ? backend === 'localStorage'
          ? 'localStorage'
          : 'idb'
        : 'miss';
      hwDiagLog('notebookHandwritingStore.ts:hwGet', data ? 'page-ink persist hit' : 'page-ink persist miss', {
        objectId,
        blockKey,
        storageKey,
        strokeCount: data?.strokes.length ?? 0,
        height: data?.canvas.height ?? null,
        source,
        backend,
      });
      recordPageInkHwGet(objectId, data?.strokes.length ?? 0, source);
      recordPageInkPersistBackend(backend);
    }
    if (data) cache.set(storageKey, data);
    return data ?? null;
  } catch (e) {
    const err = serializeIdbError(e);
    fwPersistWarn(`Could not load handwriting ${storageKey}: ${String(e)}`);
    hwDiagLog('notebookHandwritingStore.ts:hwGet', 'load failed', {
      storageKey,
      error: err,
    });
    if (isPageInk) {
      recordPageInkHwGet(objectId, 0, 'error');
      recordPageInkPersistBackend(activePersistBackend);
      recordPageInkIdbFailure('get', err, getDbDebugState(), lastIdbFailureTxState);
      lastIdbFailureTxState = null;
    }
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
  const isPageInk = blockKey === PAGE_INK_BLOCK_KEY;
  probePageInkPersistOnce(isPageInk);
  const payloadSummary = {
    objectId,
    blockKey,
    storageKey,
    strokeCount: Array.isArray(data.strokes) ? data.strokes.length : null,
    canvasHeight: data.canvas?.height ?? null,
    hasIndexedDb: getIndexedDB() !== null,
    hasLocalStorage: isLocalStorageAvailable(),
    persistBackend: resolvePersistBackend(),
    isPageInk,
  };

  const sanitized = sanitizeHandwritingData(data);
  if (!sanitized) {
    hwDiagLog('notebookHandwritingStore.ts:hwSet', 'sanitize rejected payload', {
      ...payloadSummary,
      failureStage: 'sanitize',
      reachedIdb: false,
    });
    fwPersistWarn(`Could not save handwriting ${storageKey}: sanitize rejected payload`);
    if (isPageInk) {
      recordPageInkHwSet(objectId, payloadSummary.strokeCount ?? 0, false, 'sanitize');
    }
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

  hwDiagLog('notebookHandwritingStore.ts:hwSet', 'persist put starting', {
    ...payloadSummary,
    payloadBytes,
    sanitizedStrokeCount: sanitized.strokes.length,
    canvas: sanitized.canvas,
  });

  try {
    await persistPut(storageKey, toStore);
    const backend = activePersistBackend;
    recentWrites.set(storageKey, Date.now());
    cache.set(storageKey, toStore);
    notify();
    hwDiagLog('notebookHandwritingStore.ts:hwSet', 'persist put complete', {
      ...payloadSummary,
      payloadBytes,
      reachedIdb: backend === 'idb',
      backend,
      success: true,
    });
    if (isPageInk) {
      recordPageInkPersistBackend(backend);
      recordPageInkHwSet(objectId, sanitized.strokes.length, true, backend);
      cache.delete(storageKey);
      try {
        const verify = await persistGet(storageKey);
        recordPageInkPostSaveVerify(verify?.strokes.length ?? 0, sanitized.strokes.length);
        if (verify) cache.set(storageKey, verify);
        else cache.set(storageKey, toStore);
      } catch {
        cache.set(storageKey, toStore);
      }
    }
    return { ok: true, reachedIdb: backend === 'idb' };
  } catch (e) {
    const err = serializeIdbError(e);
    const backend = activePersistBackend;
    hwDiagLog('notebookHandwritingStore.ts:hwSet', 'persist put failed', {
      ...payloadSummary,
      payloadBytes,
      failureStage: 'idb',
      backend,
      reachedIdb: false,
      error: err,
      errorName: err.name,
      isQuota: err.name === 'QuotaExceededError',
      isDataClone: err.name === 'DataCloneError',
      isInvalidState: err.name === 'InvalidStateError',
      isOpenBlocked: err.message.includes('blocked'),
    });
    fwPersistWarn(`Could not save handwriting ${storageKey}: ${err.string}`);
    if (isPageInk) {
      recordPageInkPersistBackend(backend);
      recordPageInkHwSet(objectId, sanitized.strokes.length, false, backend, err.name, err.message);
      recordPageInkIdbFailure('set', err, getDbDebugState(), lastIdbFailureTxState);
      lastIdbFailureTxState = null;
    }
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
    await persistDelete(storageKey);
    notify();
  } catch (e) {
    fwPersistWarn(`Could not delete handwriting ${storageKey}: ${String(e)}`);
  }
}

export async function hwDeleteAllForObject(objectId: string): Promise<void> {
  let keys: string[] = [];
  try {
    keys = await persistListKeysForObject(objectId);
  } catch {
    return;
  }
  for (const storageKey of keys) {
    cache.delete(storageKey);
    recentWrites.delete(storageKey);
    await persistDelete(storageKey).catch(() => undefined);
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
      const data = await persistGet(storageKey);
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
  let existing: string[] = [];
  try {
    existing = await persistListKeysForObject(objectId);
  } catch {
    return;
  }
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
    if (blockKey === PAGE_INK_BLOCK_KEY) {
      hwDiagLog('notebookHandwritingStore.ts:gc', 'deleting page-ink orphan', {
        storageKey,
        referencedKeys: [...referenced],
      });
    }
    cache.delete(storageKey);
    recentWrites.delete(storageKey);
    await persistDelete(storageKey).catch(() => undefined);
  }
}

export async function gcOrphanHandwriting(objectId: string, body: string): Promise<void> {
  const referenced = [...new Set([...referencedHandwritingKeys(body), PAGE_INK_BLOCK_KEY])];
  return gcOrphanHandwritingKeys(objectId, referenced);
}

declare global {
  interface Window {
    __fwHwGetPageInk?: (objectId: string) => Promise<{
      storageKey: string;
      strokeCount: number;
      height: number | null;
      updatedAt: number | null;
      data: HandwritingBlockData | null;
    }>;
    __fwHwListKeysForObject?: (objectId: string) => Promise<string[]>;
  }
}

if (typeof window !== 'undefined') {
  window.__fwHwGetPageInk = async (objectId: string) => {
    const storageKey = makeHandwritingStorageKey(objectId, PAGE_INK_BLOCK_KEY);
    const data = await hwGet(objectId, PAGE_INK_BLOCK_KEY);
    return {
      storageKey,
      strokeCount: data?.strokes.length ?? 0,
      height: data?.canvas.height ?? null,
      updatedAt: data?.updatedAt ?? null,
      data,
    };
  };
  window.__fwHwListKeysForObject = (objectId: string) => hwListKeysForObject(objectId);
}
