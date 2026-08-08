/**
 * focus_cache_v1 IndexedDB open/upgrade.
 * Queue infrastructure only — no entity stores, migrations beyond v1, or sync.
 */

import { getIndexedDB } from '../indexedDbEnvironment';
import {
  BY_ID_INDEX,
  BY_NAMESPACE_INDEX,
  FOCUS_CACHE_DB_NAME,
  FOCUS_CACHE_DB_VERSION,
  PENDING_OPERATIONS_STORE,
} from './types';

let dbPromise: Promise<IDBDatabase> | null = null;

function attachLifecycle(db: IDBDatabase): void {
  db.onversionchange = () => {
    db.close();
    dbPromise = null;
  };
}

/**
 * Open (and upgrade) focus_cache_v1.
 * Uses getIndexedDB() — never bare global indexedDB.
 */
export function openFocusCacheDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const factory = getIndexedDB();
    if (!factory) {
      dbPromise = null;
      reject(new Error('idb_unavailable'));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = factory.open(FOCUS_CACHE_DB_NAME, FOCUS_CACHE_DB_VERSION);
    } catch (err) {
      dbPromise = null;
      reject(err instanceof Error ? err : new Error('db_open_failed'));
      return;
    }

    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('db_open_failed'));
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('db_open_failed'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_OPERATIONS_STORE)) {
        const store = db.createObjectStore(PENDING_OPERATIONS_STORE, {
          keyPath: 'seq',
          autoIncrement: true,
        });
        store.createIndex(BY_ID_INDEX, 'id', { unique: true });
        store.createIndex(BY_NAMESPACE_INDEX, ['userId', 'workspaceId'], {
          unique: false,
        });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      attachLifecycle(db);
      resolve(db);
    };
  });

  return dbPromise;
}

/** Test-only: close connection and clear cache so reopen/deleteDatabase works. */
export async function resetFocusCacheDbForTests(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    const db = await pending;
    db.close();
  } catch {
    // Open may have failed; cache already cleared.
  }
}
