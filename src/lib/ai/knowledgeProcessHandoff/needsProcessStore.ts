/**
 * Persistent local markers: PDF still needs ai-knowledge-process handoff.
 * Metadata only — never PDF text, paths, hashes, vectors, or JWT.
 *
 * Dedicated IndexedDB (not pending_operations / not Supabase).
 */

const DB_NAME = 'fw_ai_knowledge_process_pending_v1';
const DB_VERSION = 1;
export const NEEDS_PROCESS_STORE = 'needs_process';

export type KnowledgeNeedsProcessMarker = {
  /** `${sectionId}::${sourceObjectId}` */
  id: string;
  sectionId: string;
  sourceObjectId: string;
  /** Monotonic client generation; bumped on each mark. */
  generation: number;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function markerId(sectionId: string, sourceObjectId: string): string {
  return `${sectionId}::${sourceObjectId}`;
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

async function idbGet(key: string): Promise<KnowledgeNeedsProcessMarker | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEEDS_PROCESS_STORE, 'readonly');
    const req = tx.objectStore(NEEDS_PROCESS_STORE).get(key);
    req.onsuccess = () =>
      resolve(req.result as KnowledgeNeedsProcessMarker | undefined);
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
    req.onsuccess = () => resolve((req.result ?? []) as KnowledgeNeedsProcessMarker[]);
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
  const id = markerId(sectionId, sourceObjectId);
  const existing = await idbGet(id);
  const now = Date.now();
  const next: KnowledgeNeedsProcessMarker = {
    id,
    sectionId,
    sourceObjectId,
    generation: (existing?.generation ?? 0) + 1,
    updatedAt: now,
  };
  await idbPut(next);
  return next;
}

export async function getNeedsKnowledgeProcessMarker(
  sectionId: string,
  sourceObjectId: string,
): Promise<KnowledgeNeedsProcessMarker | null> {
  const row = await idbGet(markerId(sectionId, sourceObjectId));
  return row ?? null;
}

export async function listNeedsKnowledgeProcessForSection(
  sectionId: string,
): Promise<KnowledgeNeedsProcessMarker[]> {
  return idbGetBySection(sectionId);
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
  const id = markerId(sectionId, sourceObjectId);
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
  const allowed = new Set(['id', 'sectionId', 'sourceObjectId', 'generation', 'updatedAt']);
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
