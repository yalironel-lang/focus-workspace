/**
 * Persistent local markers: knowledge source still needs process handoff.
 * Metadata only — never Notebook/PDF text, hashes, vectors, or JWT.
 *
 * Dedicated IndexedDB (not pending_operations / not Supabase).
 *
 * Backward compatible with M0.7B PDF markers:
 * - missing sourceKind → free_space_pdf
 * - PDF id remains `${sectionId}::${sourceObjectId}`
 * - Notebook id: `${sectionId}::notebook_page::${notebookObjectId}::${pageId}`
 */

const DB_NAME = 'fw_ai_knowledge_process_pending_v1';
const DB_VERSION = 1;
export const NEEDS_PROCESS_STORE = 'needs_process';

export type KnowledgeSourceKind = 'free_space_pdf' | 'notebook_page';

export type KnowledgeNeedsProcessMarker = {
  id: string;
  sectionId: string;
  /** Defaults to free_space_pdf when absent (legacy PDF rows). */
  sourceKind: KnowledgeSourceKind;
  /** PDF FSO id, or NotebookPage.id for notebook_page. */
  sourceObjectId: string;
  /** Parent notebook FSO id — required for notebook_page. */
  notebookObjectId?: string;
  /** Monotonic client generation; bumped on each mark. */
  generation: number;
  updatedAt: number;
  /** Earliest wall time a drain may run (idle debounce). */
  notBefore?: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function pdfNeedsProcessMarkerId(sectionId: string, sourceObjectId: string): string {
  return `${sectionId}::${sourceObjectId}`;
}

export function notebookNeedsProcessMarkerId(
  sectionId: string,
  notebookObjectId: string,
  pageId: string,
): string {
  return `${sectionId}::notebook_page::${notebookObjectId}::${pageId}`;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () =>
      reject(req.error ?? new Error('Knowledge process pending IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NEEDS_PROCESS_STORE)) {
        const store = db.createObjectStore(NEEDS_PROCESS_STORE, { keyPath: 'id' });
        store.createIndex('sectionId', 'sectionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

/** Normalize legacy PDF rows that lack sourceKind. */
export function normalizeNeedsProcessMarker(
  raw: unknown,
): KnowledgeNeedsProcessMarker | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.sectionId !== 'string') return null;
  if (typeof o.sourceObjectId !== 'string') return null;
  if (typeof o.generation !== 'number' || typeof o.updatedAt !== 'number') return null;

  let sourceKind: KnowledgeSourceKind = 'free_space_pdf';
  if (o.sourceKind === 'notebook_page' || o.sourceKind === 'free_space_pdf') {
    sourceKind = o.sourceKind;
  } else if (o.id.includes('::notebook_page::')) {
    sourceKind = 'notebook_page';
  }

  const notebookObjectId =
    typeof o.notebookObjectId === 'string' && o.notebookObjectId.length > 0
      ? o.notebookObjectId
      : undefined;

  if (sourceKind === 'notebook_page' && !notebookObjectId) {
    // Incomplete notebook marker — treat as unusable.
    return null;
  }

  return {
    id: o.id,
    sectionId: o.sectionId,
    sourceKind,
    sourceObjectId: o.sourceObjectId,
    ...(notebookObjectId ? { notebookObjectId } : {}),
    generation: o.generation,
    updatedAt: o.updatedAt,
    ...(typeof o.notBefore === 'number' ? { notBefore: o.notBefore } : {}),
  };
}

async function idbGet(key: string): Promise<KnowledgeNeedsProcessMarker | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEEDS_PROCESS_STORE, 'readonly');
    const req = tx.objectStore(NEEDS_PROCESS_STORE).get(key);
    req.onsuccess = () => {
      const normalized = normalizeNeedsProcessMarker(req.result);
      resolve(normalized ?? undefined);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
  });
}

async function idbPut(value: KnowledgeNeedsProcessMarker): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEEDS_PROCESS_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
    tx.objectStore(NEEDS_PROCESS_STORE).put(value);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEEDS_PROCESS_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    tx.objectStore(NEEDS_PROCESS_STORE).delete(key);
  });
}

async function idbGetBySection(sectionId: string): Promise<KnowledgeNeedsProcessMarker[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEEDS_PROCESS_STORE, 'readonly');
    const req = tx.objectStore(NEEDS_PROCESS_STORE).index('sectionId').getAll(sectionId);
    req.onsuccess = () => {
      const rows = (req.result ?? [])
        .map(normalizeNeedsProcessMarker)
        .filter((m): m is KnowledgeNeedsProcessMarker => m !== null);
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB index read failed'));
  });
}

/**
 * Mark (or bump) that a PDF needs knowledge processing.
 * Coalesces to one row per sectionId+sourceObjectId; bumps generation.
 */
export async function markNeedsKnowledgeProcess(
  sectionId: string,
  sourceObjectId: string,
): Promise<KnowledgeNeedsProcessMarker> {
  const id = pdfNeedsProcessMarkerId(sectionId, sourceObjectId);
  const existing = await idbGet(id);
  const now = Date.now();
  const next: KnowledgeNeedsProcessMarker = {
    id,
    sectionId,
    sourceKind: 'free_space_pdf',
    sourceObjectId,
    generation: (existing?.generation ?? 0) + 1,
    updatedAt: now,
  };
  await idbPut(next);
  return next;
}

/** Mark Notebook page needs process (optional notBefore for idle debounce). */
export async function markNeedsNotebookKnowledgeProcess(input: {
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
  notBefore?: number;
}): Promise<KnowledgeNeedsProcessMarker> {
  const id = notebookNeedsProcessMarkerId(
    input.sectionId,
    input.notebookObjectId,
    input.pageId,
  );
  const existing = await idbGet(id);
  const now = Date.now();
  const next: KnowledgeNeedsProcessMarker = {
    id,
    sectionId: input.sectionId,
    sourceKind: 'notebook_page',
    sourceObjectId: input.pageId,
    notebookObjectId: input.notebookObjectId,
    generation: (existing?.generation ?? 0) + 1,
    updatedAt: now,
    ...(typeof input.notBefore === 'number' ? { notBefore: input.notBefore } : {}),
  };
  await idbPut(next);
  return next;
}

export async function getNeedsKnowledgeProcessMarker(
  sectionId: string,
  sourceObjectId: string,
): Promise<KnowledgeNeedsProcessMarker | null> {
  const row = await idbGet(pdfNeedsProcessMarkerId(sectionId, sourceObjectId));
  return row ?? null;
}

export async function getNeedsNotebookKnowledgeProcessMarker(
  sectionId: string,
  notebookObjectId: string,
  pageId: string,
): Promise<KnowledgeNeedsProcessMarker | null> {
  const row = await idbGet(
    notebookNeedsProcessMarkerId(sectionId, notebookObjectId, pageId),
  );
  return row ?? null;
}

export async function listNeedsKnowledgeProcessForSection(
  sectionId: string,
): Promise<KnowledgeNeedsProcessMarker[]> {
  return idbGetBySection(sectionId);
}

export async function listNeedsNotebookKnowledgeProcessForNotebook(
  sectionId: string,
  notebookObjectId: string,
): Promise<KnowledgeNeedsProcessMarker[]> {
  const all = await idbGetBySection(sectionId);
  return all.filter(
    m => m.sourceKind === 'notebook_page' && m.notebookObjectId === notebookObjectId,
  );
}

/**
 * Clear marker only when generation matches (stale success must not wipe newer work).
 * Pass `generation: null` to force-clear any generation (cancel/delete).
 */
export async function clearNeedsKnowledgeProcessMarker(
  sectionId: string,
  sourceObjectId: string,
  generation: number | null,
): Promise<boolean> {
  const id = pdfNeedsProcessMarkerId(sectionId, sourceObjectId);
  const existing = await idbGet(id);
  if (!existing) return false;
  if (generation != null && existing.generation !== generation) return false;
  await idbDelete(id);
  return true;
}

export async function clearNeedsNotebookKnowledgeProcessMarker(
  sectionId: string,
  notebookObjectId: string,
  pageId: string,
  generation: number | null,
): Promise<boolean> {
  const id = notebookNeedsProcessMarkerId(sectionId, notebookObjectId, pageId);
  const existing = await idbGet(id);
  if (!existing) return false;
  if (generation != null && existing.generation !== generation) return false;
  await idbDelete(id);
  return true;
}

/** Test helper: close DB so deleteDatabase works. */
export async function resetNeedsKnowledgeProcessDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // ignore
    }
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

/** Assert marker payload has no forbidden keys/content (privacy). */
export function assertSafeNeedsProcessMarker(marker: unknown): boolean {
  if (!marker || typeof marker !== 'object') return false;
  const o = marker as Record<string, unknown>;
  const allowed = new Set([
    'id',
    'sectionId',
    'sourceKind',
    'sourceObjectId',
    'notebookObjectId',
    'generation',
    'updatedAt',
    'notBefore',
  ]);
  for (const key of Object.keys(o)) {
    if (!allowed.has(key)) return false;
  }
  const forbidden = [
    'text',
    'chunks',
    'hash',
    'contentHash',
    'storagePath',
    'path',
    'embedding',
    'vector',
    'jwt',
    'authorization',
    'apiKey',
    'model',
    'userId',
    'documentBody',
    'body',
  ];
  const s = JSON.stringify(o).toLowerCase();
  for (const f of forbidden) {
    if (Object.keys(o).some(k => k.toLowerCase() === f)) return false;
  }
  if (/authorization:\s*bearer/i.test(s)) return false;
  return (
    typeof o.sectionId === 'string' &&
    typeof o.sourceObjectId === 'string' &&
    typeof o.generation === 'number' &&
    typeof o.updatedAt === 'number'
  );
}
