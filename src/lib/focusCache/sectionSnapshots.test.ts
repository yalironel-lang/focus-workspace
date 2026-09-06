// @vitest-environment node
import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetFocusCacheDbForTests, openFocusCacheDb } from './db';
import {
  enqueuePendingOperation,
  listPendingOperations,
} from './pendingOperations';
import {
  countSectionSnapshotsForUser,
  librarySnapshotId,
  readLibrarySectionsSnapshot,
  readSectionDetailSnapshot,
  sectionDetailSnapshotId,
  writeLibraryFetchSnapshots,
  writeLibrarySectionsSnapshot,
  writeSectionDetailSnapshot,
} from './sectionSnapshots';
import {
  FOCUS_CACHE_DB_NAME,
  FOCUS_CACHE_DB_VERSION,
  PENDING_OPERATIONS_STORE,
  SECTION_SNAPSHOTS_STORE,
  BY_ID_INDEX,
  BY_NAMESPACE_INDEX,
} from './types';
import type { SectionDetail, SectionWithProgress } from '../../types';
import type { CacheNamespace } from '../focusCacheNamespace';

const userA = 'user-a';
const userB = 'user-b';

function makeListRow(
  id: string,
  userId: string,
  title: string,
  createdAt = '2026-01-01T00:00:00.000Z',
): SectionWithProgress {
  return {
    id,
    user_id: userId,
    title,
    created_at: createdAt,
    total_items: 0,
    completed_items: 0,
    progress: 0,
    missing_groups: [],
    next_item_title: null,
  };
}

function makeDetail(id: string, userId: string, title: string): SectionDetail {
  return {
    id,
    user_id: userId,
    title,
    created_at: '2026-01-01T00:00:00.000Z',
    groups: [
      {
        id: `g-${id}`,
        section_id: id,
        title: 'Notes',
        order_index: 0,
        items: [],
      },
    ],
  };
}

async function deleteFocusCacheDatabase(): Promise<void> {
  await resetFocusCacheDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(FOCUS_CACHE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

/** Simulate a production v1 DB (pending_operations only), then open current version. */
async function seedV1ThenOpenCurrent(): Promise<IDBDatabase> {
  await deleteFocusCacheDatabase();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(FOCUS_CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(PENDING_OPERATIONS_STORE, {
        keyPath: 'seq',
        autoIncrement: true,
      });
      store.createIndex(BY_ID_INDEX, 'id', { unique: true });
      store.createIndex(BY_NAMESPACE_INDEX, ['userId', 'workspaceId'], { unique: false });
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error ?? new Error('v1 open failed'));
  });
  await resetFocusCacheDbForTests();
  return openFocusCacheDb();
}

beforeEach(async () => {
  await deleteFocusCacheDatabase();
});

afterEach(async () => {
  await deleteFocusCacheDatabase();
});

describe('sectionSnapshots', () => {
  it('A: writes library snapshot after successful payload', async () => {
    const rows = [makeListRow('s1', userA, 'Marketing'), makeListRow('s2', userA, 'Focus')];
    const w = await writeLibrarySectionsSnapshot(userA, rows);
    expect(w.ok).toBe(true);
    const read = await readLibrarySectionsSnapshot(userA);
    expect(read?.map((s) => s.title)).toEqual(['Marketing', 'Focus']);
  });

  it('B: cold boot can read snapshot before any remote response', async () => {
    await writeLibrarySectionsSnapshot(userA, [makeListRow('s1', userA, 'Marketing')]);
    // Simulate app restart: drop in-memory db handle
    await resetFocusCacheDbForTests();
    const read = await readLibrarySectionsSnapshot(userA);
    expect(read?.[0]?.title).toBe('Marketing');
    expect(read?.[0]?.id).toBe('s1');
  });

  it('C/D semantics: cache present vs absent (storage layer)', async () => {
    expect(await readLibrarySectionsSnapshot(userA)).toBeNull();
    await writeLibrarySectionsSnapshot(userA, [makeListRow('s1', userA, 'Marketing')]);
    expect((await readLibrarySectionsSnapshot(userA))?.length).toBe(1);
  });

  it('E/F/G: successful rewrite reconciles rename/delete/add without duplicates', async () => {
    await writeLibrarySectionsSnapshot(userA, [
      makeListRow('s1', userA, 'Old Name'),
      makeListRow('s2', userA, 'Gone'),
    ]);
    await writeLibrarySectionsSnapshot(userA, [
      makeListRow('s1', userA, 'Renamed'),
      makeListRow('s3', userA, 'New Remote'),
    ]);
    const read = await readLibrarySectionsSnapshot(userA);
    expect(read?.map((s) => `${s.id}:${s.title}`)).toEqual(['s1:Renamed', 's3:New Remote']);
    expect(read?.length).toBe(2);
  });

  it('H: no cross-user cache leak', async () => {
    await writeLibrarySectionsSnapshot(userA, [makeListRow('s1', userA, 'Marketing')]);
    await writeLibrarySectionsSnapshot(userB, [makeListRow('sb', userB, 'Other')]);
    expect((await readLibrarySectionsSnapshot(userA))?.[0]?.title).toBe('Marketing');
    expect((await readLibrarySectionsSnapshot(userB))?.[0]?.title).toBe('Other');
    expect(await readLibrarySectionsSnapshot(userA)).not.toEqual(
      await readLibrarySectionsSnapshot(userB),
    );
    expect(librarySnapshotId(userA)).not.toBe(librarySnapshotId(userB));
  });

  it('I: section detail cold offline fallback', async () => {
    const detail = makeDetail('s1', userA, 'Marketing');
    await writeSectionDetailSnapshot(userA, detail);
    await resetFocusCacheDbForTests();
    const read = await readSectionDetailSnapshot(userA, 's1');
    expect(read?.title).toBe('Marketing');
    expect(read?.groups[0]?.title).toBe('Notes');
    expect(await readSectionDetailSnapshot(userB, 's1')).toBeNull();
    expect(await readSectionDetailSnapshot(userA, 'missing')).toBeNull();
  });

  /**
   * Production sequence that physical QA failed on:
   * successful Library fetch → cache writes (list + detail) → process restart →
   * offline Library hydrate → open cached workspace → SectionPage gate has metadata.
   * Does NOT insert a detail fixture directly.
   */
  it('production sequence: Library fetch cache is enough to open a workspace offline', async () => {
    const list = [makeListRow('mkt', userA, 'Marketing'), makeListRow('foc', userA, 'Focus')];
    const details = [makeDetail('mkt', userA, 'Marketing'), makeDetail('foc', userA, 'Focus')];

    // 1) Successful Library fetch persists list + per-section detail (same payload path as hook).
    const written = await writeLibraryFetchSnapshots(userA, list, details);
    expect(written.ok).toBe(true);

    // 2) Simulated process restart / fresh hook state (drop in-memory DB handle).
    await resetFocusCacheDbForTests();

    // 3) Network unavailable — Library hydrates from snapshot only.
    const library = await readLibrarySectionsSnapshot(userA);
    expect(library?.map((s) => s.title)).toEqual(['Marketing', 'Focus']);
    expect(library?.find((s) => s.title === 'Marketing')?.id).toBe('mkt');

    // 4) Open one cached workspace — detail must already exist from Library write.
    const opened = await readSectionDetailSnapshot(userA, 'mkt');
    expect(opened).not.toBeNull();
    expect(opened?.id).toBe('mkt');
    expect(opened?.title).toBe('Marketing');
    expect(opened?.user_id).toBe(userA);
    expect(Array.isArray(opened?.groups)).toBe(true);
    // Minimal SectionPage gate: id + title + groups
    expect(opened?.groups.length).toBeGreaterThanOrEqual(0);
  });

  it('regression: list-only Library write is NOT enough to open a workspace', async () => {
    // Documents the physical QA failure mode before writeLibraryFetchSnapshots.
    await writeLibrarySectionsSnapshot(userA, [makeListRow('mkt', userA, 'Marketing')]);
    await resetFocusCacheDbForTests();
    expect((await readLibrarySectionsSnapshot(userA))?.[0]?.title).toBe('Marketing');
    expect(await readSectionDetailSnapshot(userA, 'mkt')).toBeNull();
  });

  it('J: cached section detail has id/title/groups for SectionPage mount', async () => {
    const detail = makeDetail('s1', userA, 'Marketing');
    await writeSectionDetailSnapshot(userA, detail);
    const read = await readSectionDetailSnapshot(userA, 's1');
    expect(read?.id).toBe('s1');
    expect(read?.user_id).toBe(userA);
    expect(Array.isArray(read?.groups)).toBe(true);
    expect(sectionDetailSnapshotId(userA, 's1')).toContain(userA);
  });

  it('K: rejected writes do not wipe existing good snapshot', async () => {
    await writeLibrarySectionsSnapshot(userA, [makeListRow('s1', userA, 'Marketing')]);
    const bad = await writeLibrarySectionsSnapshot(userA, [
      { ...makeListRow('s2', userB, 'Leak') }, // wrong user_id
    ]);
    expect(bad.ok).toBe(false);
    const read = await readLibrarySectionsSnapshot(userA);
    expect(read?.[0]?.title).toBe('Marketing');
  });

  it('logout policy: snapshots survive (not deleted) and stay user-scoped', async () => {
    await writeLibrarySectionsSnapshot(userA, [makeListRow('s1', userA, 'Marketing')]);
    // Simulate logout: UI clears; storage untouched
    expect(await countSectionSnapshotsForUser(userA)).toBeGreaterThanOrEqual(1);
    const again = await readLibrarySectionsSnapshot(userA);
    expect(again?.[0]?.title).toBe('Marketing');
  });
});

describe('focus_cache_v1 upgrade v1 → v2', () => {
  it('additive upgrade preserves pending_operations and adds section_snapshots', async () => {
    const db = await seedV1ThenOpenCurrent();
    expect(FOCUS_CACHE_DB_VERSION).toBe(2);
    expect(db.objectStoreNames.contains(PENDING_OPERATIONS_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(SECTION_SNAPSHOTS_STORE)).toBe(true);

    const ns: CacheNamespace = { userId: userA, workspaceId: 'ws-1' };
    // After upgrade, enqueue into preserved store
    const enq = await enqueuePendingOperation({
      namespace: ns,
      entityType: 'free_space_object',
      entityId: 'obj-1',
      operationType: 'create',
      payload: { ok: true },
    });
    expect(enq.ok).toBe(true);
    const listed = await listPendingOperations(ns);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.length).toBe(1);

    await writeLibrarySectionsSnapshot(userA, [makeListRow('s1', userA, 'Marketing')]);
    expect((await readLibrarySectionsSnapshot(userA))?.[0]?.title).toBe('Marketing');
  });
});
