/**
 * Local-only PDF blob storage for Free Space objects (IndexedDB).
 * Keys are scoped by section + object id. No network.
 */

import { pdfUploadDiag } from './pdfUploadDiag';

const DB_NAME = 'fw_free_space_pdf_v1';
const STORE = 'blobs';
const DB_VERSION = 1;

function storeKey(sectionId: string, objectId: string): string {
  return `${sectionId}::${objectId}`;
}

/**
 * iOS Safari can invalidate File handles from <input type="file"> after the first await.
 * Read bytes immediately into a plain Blob before IndexedDB work.
 */
export async function fileToPersistedPdfBlob(file: File): Promise<Blob> {
  const reportedSize = file.size;
  const buf = await file.arrayBuffer();
  pdfUploadDiag('fileToPersistedPdfBlob', {
    fileName: file.name,
    fileType: file.type,
    reportedSize,
    byteLength: buf.byteLength,
    sizeMismatch: reportedSize !== buf.byteLength,
  });
  if (buf.byteLength === 0) {
    if (reportedSize > 0) {
      throw new Error('Could not read PDF bytes from the file picker');
    }
    throw new Error('PDF file is empty');
  }
  return new Blob([buf], { type: file.type || 'application/pdf' });
}

/** Save then immediately read back with the same storage key (catches iOS IDB / key issues). */
export async function savePdfBlobFromFile(
  sectionId: string,
  objectId: string,
  file: File,
): Promise<{ key: string; blobSize: number }> {
  if (!sectionId?.trim()) {
    throw new Error('Missing section id for PDF storage');
  }
  if (!objectId?.trim()) {
    throw new Error('Missing object id for PDF storage');
  }
  const blob = await fileToPersistedPdfBlob(file);
  const key = storeKey(sectionId, objectId);
  pdfUploadDiag('savePdfBlobFromFile:start', { sectionId, objectId, key, blobSize: blob.size });
  try {
    await savePdfBlob(sectionId, objectId, blob);
    pdfUploadDiag('savePdfBlobFromFile:putComplete', { key, blobSize: blob.size });
  } catch (err) {
    pdfUploadDiag('savePdfBlobFromFile:putFailed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  const loaded = await loadPdfBlob(sectionId, objectId);
  if (!loaded || loaded.size <= 0) {
    pdfUploadDiag('savePdfBlobFromFile:verifyFailed', {
      key,
      wrote: blob.size,
      read: loaded?.size ?? 0,
    });
    throw new Error(
      `PDF storage verification failed (key=${key}, wrote=${blob.size}, read=${loaded?.size ?? 0})`,
    );
  }
  pdfUploadDiag('savePdfBlobFromFile:verifyOk', { key, blobSize: loaded.size });
  return { key, blobSize: loaded.size };
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
  const key = storeKey(sectionId, objectId);
  let db: IDBDatabase;
  try {
    db = await openDb();
    pdfUploadDiag('savePdfBlob:dbOpen', { key });
  } catch (err) {
    pdfUploadDiag('savePdfBlob:dbOpenFailed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      pdfUploadDiag('savePdfBlob:txComplete', { key, blobSize: blob.size });
      resolve();
    };
    tx.onerror = () => {
      db.close();
      pdfUploadDiag('savePdfBlob:txError', {
        key,
        error: tx.error?.message ?? 'transaction error',
      });
      reject(tx.error);
    };
    tx.objectStore(STORE).put(blob, key);
  });
}

export async function loadPdfBlob(sectionId: string, objectId: string): Promise<Blob | undefined> {
  const key = storeKey(sectionId, objectId);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      db.close();
      const result = req.result instanceof Blob ? req.result : undefined;
      const ok = result && result.size > 0 ? result : undefined;
      pdfUploadDiag('loadPdfBlob', {
        sectionId,
        objectId,
        key,
        found: !!ok,
        size: ok?.size ?? 0,
      });
      resolve(ok);
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

export async function listPdfBlobKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => {
      db.close();
      const keys = req.result;
      resolve(keys.filter((k): k is string => typeof k === 'string'));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Removes every PDF blob whose store key starts with `${sectionId}::`. */
export async function deleteAllPdfBlobsForSection(sectionId: string): Promise<void> {
  if (!sectionId) return;
  const prefix = `${sectionId}::`;
  const keys = await listPdfBlobKeys();
  const targets = keys.filter(k => k.startsWith(prefix));
  if (targets.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    const store = tx.objectStore(STORE);
    for (const k of targets) store.delete(k);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = fr.result;
      if (typeof s !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

export async function pdfBlobToBase64(blob: Blob): Promise<string> {
  return blobToBase64(blob);
}

export function base64ToPdfBlob(base64: string, mime = 'application/pdf'): Blob {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
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
