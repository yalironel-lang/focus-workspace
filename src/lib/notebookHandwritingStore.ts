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
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
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
  const db = await openDb();
  return new Promise((resolve, reject) => {
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
}

async function idbPut(storageKey: string, data: HandwritingBlockData): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE).put(data, storageKey);
  });
}

async function idbDelete(storageKey: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
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
}

async function listKeysForObject(objectId: string): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
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
  const sanitized = sanitizeHandwritingData(data);
  if (!sanitized) return false;
  try {
    await idbPut(storageKey, { ...sanitized, updatedAt: Date.now() });
    cache.set(storageKey, { ...sanitized, updatedAt: Date.now() });
    notify();
    return true;
  } catch (e) {
    fwPersistWarn(`Could not save handwriting ${storageKey}: ${String(e)}`);
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

export async function gcOrphanHandwriting(objectId: string, body: string): Promise<void> {
  if (!objectId) return;
  const referenced = new Set(referencedHandwritingKeys(body));
  const existing = await listKeysForObject(objectId);
  for (const storageKey of existing) {
    const blockKey = storageKey.slice(objectId.length + 1);
    if (!referenced.has(blockKey)) {
      cache.delete(storageKey);
      await idbDelete(storageKey).catch(() => undefined);
    }
  }
}
