/**
 * Notebook inline image blobs — IndexedDB (not localStorage).
 * Keys are referenced from notebook image-ref blocks. Legacy data in fw_nb_images_v1
 * is migrated on hydrate when still present.
 */

const LEGACY_STORE_KEY = 'fw_nb_images_v1';
const DB_NAME = 'fw_notebook_images_v1';
const STORE = 'blobs';
const DB_VERSION = 1;
const MAX_IMAGES = 40;
const MAX_BYTES_PER_IMAGE = 4 * 1024 * 1024;

const urlCache = new Map<string, string>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(fn => fn());
}

export function subscribeNotebookImages(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function revokeCachedUrl(key: string): void {
  const url = urlCache.get(key);
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  urlCache.delete(key);
}

function loadLegacyStore(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_STORE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveLegacyStore(store: Record<string, string>): void {
  try {
    localStorage.setItem(LEGACY_STORE_KEY, JSON.stringify(store));
  } catch {
    /* legacy cleanup best-effort */
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
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

async function listIdbKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as IDBValidKey[]).map(String));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function loadBlob(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      db.close();
      resolve(req.result instanceof Blob ? req.result : undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function saveBlob(key: string, blob: Blob): Promise<void> {
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
    tx.objectStore(STORE).put(blob, key);
  });
}

async function deleteBlob(key: string): Promise<void> {
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
    tx.objectStore(STORE).delete(key);
  });
}

async function evictOldestIfNeeded(): Promise<void> {
  const keys = (await listIdbKeys()).sort();
  while (keys.length >= MAX_IMAGES) {
    const oldest = keys.shift();
    if (!oldest) break;
    revokeCachedUrl(oldest);
    await deleteBlob(oldest).catch(() => undefined);
  }
}

async function migrateLegacyKey(key: string): Promise<Blob | null> {
  const legacy = loadLegacyStore();
  const dataUrl = legacy[key];
  if (!dataUrl) return null;
  try {
    const blob = dataUrlToBlob(dataUrl);
    await saveBlob(key, blob);
    delete legacy[key];
    saveLegacyStore(legacy);
    return blob;
  } catch {
    return null;
  }
}

function cacheBlob(key: string, blob: Blob): void {
  revokeCachedUrl(key);
  urlCache.set(key, URL.createObjectURL(blob));
}

/** Sync read from in-memory cache (populate via hydrateNotebookImages). */
export function nbImageGet(key: string): string | null {
  return urlCache.get(key) ?? null;
}

export async function nbImageSet(key: string, dataUrl: string): Promise<boolean> {
  if (dataUrl.length > MAX_BYTES_PER_IMAGE) {
    console.warn('[NB Images] Image too large, skipping');
    return false;
  }
  try {
    const blob = dataUrlToBlob(dataUrl);
    if (blob.size > MAX_BYTES_PER_IMAGE) {
      console.warn('[NB Images] Image too large, skipping');
      return false;
    }
    await evictOldestIfNeeded();
    await saveBlob(key, blob);
    cacheBlob(key, blob);
    notify();
    return true;
  } catch (e) {
    console.warn('[NB Images] Failed to persist image', e);
    return false;
  }
}

export async function nbImageDelete(key: string): Promise<void> {
  revokeCachedUrl(key);
  await deleteBlob(key).catch(() => undefined);
  notify();
}

/** Load image blobs for notebook image-ref keys (IDB + legacy localStorage migration). */
export async function hydrateNotebookImages(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;
  let changed = false;
  for (const key of unique) {
    if (urlCache.has(key)) continue;
    try {
      let blob = await loadBlob(key);
      if (!blob) blob = (await migrateLegacyKey(key)) ?? undefined;
      if (!blob) continue;
      cacheBlob(key, blob);
      changed = true;
    } catch {
      /* skip missing */
    }
  }
  if (changed) notify();
}
