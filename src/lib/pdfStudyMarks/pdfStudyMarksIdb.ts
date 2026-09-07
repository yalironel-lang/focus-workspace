/**
 * Study marks + ink for PDF objects.
 * Key: {sectionId}::{objectId} — section-scoped like PDF blobs, not board-scoped.
 * Local IDB is authoritative for V1 (no cloud sync).
 */

import { markSaveError, markSaveOk, markSavePending } from '../saveStatus';
import {
  emptyPdfStudyMarksDoc,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_PAGE,
  PDF_INK_DEFAULT_COLOR,
  PDF_INK_DEFAULT_WIDTH,
  PDF_STUDY_MARKS_VERSION,
  type PdfInkPoint,
  type PdfInkStroke,
  type PdfStudyMarksDoc,
  type PdfStudyMarksPageLayer,
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

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizePoint(raw: unknown): PdfInkPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  const out: PdfInkPoint = { x: clamp01(p.x), y: clamp01(p.y) };
  if (typeof p.pressure === 'number' && Number.isFinite(p.pressure) && p.pressure > 0) {
    out.pressure = Math.max(0, Math.min(1, p.pressure));
  }
  return out;
}

function sanitizeStroke(raw: unknown): PdfInkStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== 'string' || !s.id) return null;
  const pointsRaw = Array.isArray(s.points) ? s.points : [];
  const points = pointsRaw
    .map(sanitizePoint)
    .filter((p): p is PdfInkPoint => p !== null)
    .slice(0, MAX_POINTS_PER_STROKE);
  if (points.length === 0) return null;
  return {
    id: s.id,
    color: typeof s.color === 'string' && s.color ? s.color : PDF_INK_DEFAULT_COLOR,
    width:
      typeof s.width === 'number' && s.width > 0 ? Math.min(24, s.width) : PDF_INK_DEFAULT_WIDTH,
    points,
  };
}

function sanitizeLayer(raw: unknown): PdfStudyMarksPageLayer | null {
  if (!raw || typeof raw !== 'object') return null;
  const layer = raw as { regions?: unknown; strokes?: unknown };
  const regions = Array.isArray(layer.regions)
    ? layer.regions
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
        .filter(r => r.id && r.w > 0.005 && r.h > 0.005)
    : [];
  const strokes = Array.isArray(layer.strokes)
    ? layer.strokes
        .map(sanitizeStroke)
        .filter((s): s is PdfInkStroke => s !== null)
        .slice(0, MAX_STROKES_PER_PAGE)
    : [];
  if (regions.length === 0 && strokes.length === 0) return null;
  const out: PdfStudyMarksPageLayer = { regions };
  if (strokes.length) out.strokes = strokes;
  return out;
}

export function sanitizeDoc(raw: unknown): PdfStudyMarksDoc {
  if (!raw || typeof raw !== 'object') return emptyPdfStudyMarksDoc();
  const o = raw as Partial<PdfStudyMarksDoc>;
  if (o.version !== PDF_STUDY_MARKS_VERSION) return emptyPdfStudyMarksDoc();
  const markedPages = Array.isArray(o.markedPages)
    ? [
        ...new Set(
          o.markedPages.filter(n => typeof n === 'number' && n >= 1).map(n => Math.floor(n)),
        ),
      ].sort((a, b) => a - b)
    : [];
  const pages: PdfStudyMarksDoc['pages'] = {};
  if (o.pages && typeof o.pages === 'object') {
    for (const [k, layer] of Object.entries(o.pages)) {
      const sanitized = sanitizeLayer(layer);
      if (sanitized) pages[k] = sanitized;
    }
  }
  return { version: PDF_STUDY_MARKS_VERSION, markedPages, pages };
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
  markSavePending('pdfStudyMarks');
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
      tx.objectStore(STORE).put(
        {
          version: PDF_STUDY_MARKS_VERSION,
          markedPages: doc.markedPages,
          pages: doc.pages,
        },
        storeKey(sectionId, objectId),
      );
    });
    markSaveOk('pdfStudyMarks');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markSaveError('pdfStudyMarks', msg || 'pdf_study_marks_save_failed');
    throw err;
  }
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
        resolve(
          (req.result ?? []).filter(
            (k): k is string => typeof k === 'string' && k.startsWith(prefix),
          ),
        );
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
