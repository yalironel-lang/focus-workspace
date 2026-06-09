/**
 * Study marks for PDF objects (marks + highlight regions).
 * Key: {sectionId}::{objectId} — section-scoped like PDF blobs, not board-scoped.
 */

import {
  emptyPdfStudyMarksDoc,
  PDF_STUDY_MARKS_VERSION,
  type PdfStudyMarksDoc,
} from './types';

const DB_NAME = 'fw_pdf_study_marks_v1';
const STORE = 'docs';
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

function sanitizeDoc(raw: unknown): PdfStudyMarksDoc {
  if (!raw || typeof raw !== 'object') return emptyPdfStudyMarksDoc();
  const o = raw as Partial<PdfStudyMarksDoc>;
  if (o.version !== PDF_STUDY_MARKS_VERSION) return emptyPdfStudyMarksDoc();
  const markedPages = Array.isArray(o.markedPages)
    ? [...new Set(o.markedPages.filter(n => typeof n === 'number' && n >= 1).map(n => Math.floor(n)))].sort(
        (a, b) => a - b,
      )
    : [];
  const pages: PdfStudyMarksDoc['pages'] = {};
  if (o.pages && typeof o.pages === 'object') {
    for (const [k, layer] of Object.entries(o.pages)) {
      if (!layer || typeof layer !== 'object' || !Array.isArray((layer as { regions?: unknown }).regions)) continue;
      const regions = (layer as { regions: unknown[] }).regions
        .filter(r => r && typeof r === 'object')
        .map(r => {
          const x = r as Record<string, unknown>;
          return {
            id: typeof x.id === 'string' ? x.id : '',
            x: clamp01(Number(x.x)),
            y: clamp01(Number(x.y)),
            w: clamp01(Number(x.w)),
            h: clamp01(Number(x.h)),
          };
        })
        .filter(r => r.id && r.w > 0.005 && r.h > 0.005);
      if (regions.length) pages[k] = { regions };
    }
  }
  return { version: PDF_STUDY_MARKS_VERSION, markedPages, pages };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export async function loadPdfStudyMarks(
  sectionId: string,
  objectId: string,
): Promise<PdfStudyMarksDoc> {
  if (!sectionId || !objectId) return emptyPdfStudyMarksDoc();
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(storeKey(sectionId, objectId));
      req.onsuccess = () => {
        db.close();
        resolve(sanitizeDoc(req.result));
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return emptyPdfStudyMarksDoc();
  }
}

export async function savePdfStudyMarks(
  sectionId: string,
  objectId: string,
  doc: PdfStudyMarksDoc,
): Promise<void> {
  if (!sectionId || !objectId) return;
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
    tx.objectStore(STORE).put(
      { version: PDF_STUDY_MARKS_VERSION, markedPages: doc.markedPages, pages: doc.pages },
      storeKey(sectionId, objectId),
    );
  });
}

export async function deletePdfStudyMarks(sectionId: string, objectId: string): Promise<void> {
  if (!sectionId || !objectId) return;
  try {
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
      tx.objectStore(STORE).delete(storeKey(sectionId, objectId));
    });
  } catch {
    /* ignore */
  }
}

export async function copyPdfStudyMarks(
  sectionId: string,
  fromObjectId: string,
  toObjectId: string,
): Promise<void> {
  const doc = await loadPdfStudyMarks(sectionId, fromObjectId);
  if (doc.markedPages.length === 0 && Object.keys(doc.pages).length === 0) return;
  await savePdfStudyMarks(sectionId, toObjectId, doc);
}

export async function deleteAllPdfStudyMarksForSection(sectionId: string): Promise<void> {
  if (!sectionId) return;
  const prefix = `${sectionId}::`;
  try {
    const db = await openDb();
    const keys = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => {
        db.close();
        resolve((req.result ?? []).filter((k): k is string => typeof k === 'string' && k.startsWith(prefix)));
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
    if (keys.length === 0) return;
    const db2 = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db2.transaction(STORE, 'readwrite');
      tx.oncomplete = () => {
        db2.close();
        resolve();
      };
      tx.onerror = () => {
        db2.close();
        reject(tx.error);
      };
      const store = tx.objectStore(STORE);
      for (const k of keys) store.delete(k);
    });
  } catch {
    /* ignore */
  }
}
