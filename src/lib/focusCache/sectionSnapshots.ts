/**
 * Last-known Library / section-detail snapshots in focus_cache_v1.
 * Read-through cache only — Supabase remains source of truth.
 * Namespaced by userId; never used as pending_operations catalog.
 */

import type { SectionDetail, SectionWithProgress } from '../../types';
import { openFocusCacheDb } from './db';
import {
  BY_USER_ID_INDEX,
  SECTION_SNAPSHOT_SCHEMA_VERSION,
  SECTION_SNAPSHOTS_STORE,
  type SectionDetailSnapshotRecord,
  type SectionLibrarySnapshotRecord,
} from './types';

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function librarySnapshotId(userId: string): string {
  return `u:${userId}:library`;
}

export function sectionDetailSnapshotId(userId: string, sectionId: string): string {
  return `u:${userId}:section:${sectionId}`;
}

function isSectionWithProgress(value: unknown): value is SectionWithProgress {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    isExactNonEmptyId(s.id) &&
    isExactNonEmptyId(s.user_id) &&
    typeof s.title === 'string' &&
    typeof s.created_at === 'string'
  );
}

function isSectionDetail(value: unknown): value is SectionDetail {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    isExactNonEmptyId(s.id) &&
    isExactNonEmptyId(s.user_id) &&
    typeof s.title === 'string' &&
    typeof s.created_at === 'string' &&
    Array.isArray(s.groups)
  );
}

/** Persist Library list + per-section detail from one successful Library fetch (no extra round-trips). */
export async function writeLibraryFetchSnapshots(
  userId: string,
  list: SectionWithProgress[],
  details: SectionDetail[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const listWrite = await writeLibrarySectionsSnapshot(userId, list);
  if (!listWrite.ok) return listWrite;
  for (const detail of details) {
    const d = await writeSectionDetailSnapshot(userId, detail);
    if (!d.ok) return d;
  }
  return { ok: true };
}

/** Persist Library list after a successful complete online fetch. */
export async function writeLibrarySectionsSnapshot(
  userId: string,
  sections: SectionWithProgress[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isExactNonEmptyId(userId)) return { ok: false, reason: 'invalid_user_id' };
  if (!Array.isArray(sections)) return { ok: false, reason: 'invalid_sections' };
  for (const s of sections) {
    if (!isSectionWithProgress(s) || s.user_id !== userId) {
      return { ok: false, reason: 'invalid_section_row' };
    }
  }

  try {
    const db = await openFocusCacheDb();
    const record: SectionLibrarySnapshotRecord = {
      id: librarySnapshotId(userId),
      kind: 'library_list',
      schemaVersion: SECTION_SNAPSHOT_SCHEMA_VERSION,
      userId,
      updatedAt: new Date().toISOString(),
      sections,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SECTION_SNAPSHOTS_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('transaction_failed'));
      tx.objectStore(SECTION_SNAPSHOTS_STORE).put(record);
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'write_failed' };
  }
}

/** Read Library list for the authenticated user only. */
export async function readLibrarySectionsSnapshot(
  userId: string,
): Promise<SectionWithProgress[] | null> {
  if (!isExactNonEmptyId(userId)) return null;
  try {
    const db = await openFocusCacheDb();
    const row = await new Promise<SectionLibrarySnapshotRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(SECTION_SNAPSHOTS_STORE, 'readonly');
      const req = tx.objectStore(SECTION_SNAPSHOTS_STORE).get(librarySnapshotId(userId));
      req.onsuccess = () => resolve(req.result as SectionLibrarySnapshotRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error('read_failed'));
    });
    if (!row || row.kind !== 'library_list' || row.userId !== userId) return null;
    if (!Array.isArray(row.sections)) return null;
    const filtered = row.sections.filter(
      (s) => isSectionWithProgress(s) && s.user_id === userId,
    );
    return filtered;
  } catch {
    return null;
  }
}

/** Persist section detail after a successful complete online fetch. */
export async function writeSectionDetailSnapshot(
  userId: string,
  section: SectionDetail,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isExactNonEmptyId(userId)) return { ok: false, reason: 'invalid_user_id' };
  if (!isSectionDetail(section) || section.user_id !== userId) {
    return { ok: false, reason: 'invalid_section' };
  }

  try {
    const db = await openFocusCacheDb();
    const record: SectionDetailSnapshotRecord = {
      id: sectionDetailSnapshotId(userId, section.id),
      kind: 'section_detail',
      schemaVersion: SECTION_SNAPSHOT_SCHEMA_VERSION,
      userId,
      sectionId: section.id,
      updatedAt: new Date().toISOString(),
      section,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SECTION_SNAPSHOTS_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('transaction_failed'));
      tx.objectStore(SECTION_SNAPSHOTS_STORE).put(record);
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'write_failed' };
  }
}

/** Read section detail for the authenticated user + section id only. */
export async function readSectionDetailSnapshot(
  userId: string,
  sectionId: string,
): Promise<SectionDetail | null> {
  if (!isExactNonEmptyId(userId) || !isExactNonEmptyId(sectionId)) return null;
  try {
    const db = await openFocusCacheDb();
    const row = await new Promise<SectionDetailSnapshotRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(SECTION_SNAPSHOTS_STORE, 'readonly');
      const req = tx
        .objectStore(SECTION_SNAPSHOTS_STORE)
        .get(sectionDetailSnapshotId(userId, sectionId));
      req.onsuccess = () => resolve(req.result as SectionDetailSnapshotRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error('read_failed'));
    });
    if (!row || row.kind !== 'section_detail') return null;
    if (row.userId !== userId || row.sectionId !== sectionId) return null;
    if (!isSectionDetail(row.section) || row.section.user_id !== userId) return null;
    if (row.section.id !== sectionId) return null;
    return row.section;
  } catch {
    return null;
  }
}

/** Test helper: count snapshot rows for a user (via userId index). */
export async function countSectionSnapshotsForUser(userId: string): Promise<number> {
  if (!isExactNonEmptyId(userId)) return 0;
  const db = await openFocusCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SECTION_SNAPSHOTS_STORE, 'readonly');
    const idx = tx.objectStore(SECTION_SNAPSHOTS_STORE).index(BY_USER_ID_INDEX);
    const req = idx.count(IDBKeyRange.only(userId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('count_failed'));
  });
}
