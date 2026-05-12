/**
 * Local-only PDF blob storage for Free Space objects (IndexedDB).
 * Keys are scoped by section + object id. No network.
 */

const DB_NAME = 'fw_free_space_pdf_v1';
const STORE = 'blobs';
const DB_VERSION = 1;

function storeKey(sectionId: string, objectId: string): string {
  return `${sectionId}::${objectId}`;
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

export async function savePdfBlob(sectionId: string, objectId: string, blob: Blob): Promise<void> {
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
    tx.objectStore(STORE).put(blob, storeKey(sectionId, objectId));
  });
}

export async function loadPdfBlob(sectionId: string, objectId: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(storeKey(sectionId, objectId));
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

export async function deletePdfBlob(sectionId: string, objectId: string): Promise<void> {
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
    tx.objectStore(STORE).delete(storeKey(sectionId, objectId));
  });
}

export async function copyPdfBlob(sectionId: string, fromObjectId: string, toObjectId: string): Promise<boolean> {
  try {
    const blob = await loadPdfBlob(sectionId, fromObjectId);
    if (!blob) return false;
    await savePdfBlob(sectionId, toObjectId, blob);
    return true;
  } catch {
    return false;
  }
}

/** Phase 1: PDF only. Validates without reading bytes. */
export function isAcceptablePdfFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  if (!name.endsWith('.pdf')) return false;
  const t = file.type.toLowerCase();
  if (t.startsWith('image/') || t.startsWith('video/') || t.startsWith('audio/')) return false;
  if (t === 'application/pdf' || t === 'application/x-pdf') return true;
  if (t === '' || t === 'application/octet-stream') return true;
  return false;
}
