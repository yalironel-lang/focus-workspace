const DB_NAME = 'fw_knowledge_journal_v1';
const DB_VERSION = 1;
export const TOMBSTONES_STORE = 'tombstones';
export const SNAPSHOTS_STORE = 'snapshots';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Knowledge journal IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TOMBSTONES_STORE)) {
        const store = db.createObjectStore(TOMBSTONES_STORE, { keyPath: 'id' });
        store.createIndex('sectionId', 'sectionId', { unique: false });
        store.createIndex('deletedAt', 'deletedAt', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const store = db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
        store.createIndex('sectionObject', ['sectionId', 'objectId'], { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB getAll failed: ${storeName}`));
  });
}

export async function idbGetByIndex<T>(
  storeName: string,
  indexName: string,
  query: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).index(indexName).getAll(query);
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB index read failed: ${indexName}`));
  });
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`IndexedDB put failed: ${storeName}`));
    tx.objectStore(storeName).put(value);
  });
}

export async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`IndexedDB delete failed: ${storeName}`));
    tx.objectStore(storeName).delete(key);
  });
}
