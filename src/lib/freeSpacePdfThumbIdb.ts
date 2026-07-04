/**
 * PDF first-page thumbnails — IndexedDB (not localStorage object JSON).
 */

import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { getIndexedDB } from './indexedDbEnvironment';

const DB_NAME = 'fw_free_space_pdf_v1';
const STORE = 'thumbnails';
const DB_VERSION = 2;

function storeKey(sectionId: string, objectId: string): string {
  return `${sectionId}::${objectId}`;
}

function openDb(): Promise<IDBDatabase> {
  const idb = getIndexedDB();
  if (!idb) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs');
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function savePdfThumbnail(
  sectionId: string,
  objectId: string,
  dataUrl: string,
): Promise<void> {
  if (!sectionId || !objectId || !dataUrl.startsWith('data:')) return;
  const db = await openDb();
  const key = storeKey(sectionId, objectId);
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
    tx.objectStore(STORE).put(dataUrl, key);
  });
}

export async function loadPdfThumbnail(
  sectionId: string,
  objectId: string,
): Promise<string | undefined> {
  if (!sectionId || !objectId) return undefined;
  try {
    const db = await openDb();
    const key = storeKey(sectionId, objectId);
    return await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        db.close();
        const v = req.result;
        resolve(typeof v === 'string' && v.startsWith('data:') ? v : undefined);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return undefined;
  }
}

export async function copyPdfThumbnail(
  sectionId: string,
  fromObjectId: string,
  toObjectId: string,
): Promise<boolean> {
  const thumb = await loadPdfThumbnail(sectionId, fromObjectId);
  if (!thumb) return false;
  await savePdfThumbnail(sectionId, toObjectId, thumb);
  return true;
}

export async function deletePdfThumbnail(sectionId: string, objectId: string): Promise<void> {
  if (!sectionId || !objectId) return;
  try {
    const db = await openDb();
    const key = storeKey(sectionId, objectId);
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
      tx.objectStore(STORE).delete(key);
    });
  } catch {
    /* ignore */
  }
}

/** Strip inline thumbnail from pdf objects before localStorage write. */
export function stripPdfThumbnailsFromObjects(objects: ProjectSpaceObject[]): ProjectSpaceObject[] {
  let changed = false;
  const out = objects.map(o => {
    if (o.type !== 'pdf' || o.content.type !== 'pdf') return o;
    if (!('thumbnailDataUrl' in o.content) || !o.content.thumbnailDataUrl) return o;
    changed = true;
    const { thumbnailDataUrl: _removed, ...rest } = o.content;
    return { ...o, content: rest as typeof o.content };
  });
  return changed ? out : objects;
}

/** Migrate legacy inline thumbnail to IDB (fire-and-forget). */
export function migrateInlinePdfThumbnail(
  sectionId: string,
  object: ProjectSpaceObject,
): void {
  if (object.type !== 'pdf' || object.content.type !== 'pdf') return;
  const url = object.content.thumbnailDataUrl;
  if (!url || !sectionId) return;
  void savePdfThumbnail(sectionId, object.id, url);
}
