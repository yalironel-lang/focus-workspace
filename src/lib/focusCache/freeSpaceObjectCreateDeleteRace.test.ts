/**
 * CREATE→DELETE race: outbound delete must not orphan cloud rows.
 */
// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import { resetFocusCacheDbForTests } from './db';
import { flushPendingFreeSpaceCreates } from './flushPendingFreeSpaceCreates';
import { enqueueFreeSpaceObjectCreate } from './freeSpaceObjectCreateEnqueue';
import { enqueueFreeSpaceObjectDelete } from './freeSpaceObjectDeleteEnqueue';
import type { Json } from '../database.types';
import type { FreeSpaceObjectCloudRow } from './freeSpaceObjectCloud';
import { runFreeSpaceSectionPullCatchUp } from './freeSpaceObjectPull';
import {
  getCloudSyncSnapshot,
  resetCloudSyncStatusForTests,
} from '../sync/cloudSyncStatus';
import { deriveSyncUiStatus } from '../sync/deriveSyncUiStatus';
import { getSaveStatusSnapshot, resetSaveStatusForTests } from '../saveStatus';
import { FOCUS_CACHE_DB_NAME } from './types';

vi.mock('./freeSpaceObjectCloud', () => ({
  upsertFreeSpaceObjectFromCreatePayload: vi.fn(),
  deleteFreeSpaceObjectFromCloud: vi.fn(),
  fetchFreeSpaceObjectsForSection: vi.fn(),
}));

import {
  deleteFreeSpaceObjectFromCloud,
  fetchFreeSpaceObjectsForSection,
  upsertFreeSpaceObjectFromCreatePayload,
} from './freeSpaceObjectCloud';

const upsertMock = vi.mocked(upsertFreeSpaceObjectFromCreatePayload);
const deleteMock = vi.mocked(deleteFreeSpaceObjectFromCloud);
const fetchMock = vi.mocked(fetchFreeSpaceObjectsForSection);

const USER = 'user-race-1';
const SECTION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOARD = 'main';

function note(id: string, updatedAt = 100): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: 't',
    content: { type: 'note', body: '' },
    createdAt: 1,
    updatedAt,
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

beforeEach(async () => {
  await deleteFocusCacheDatabase();
  resetCloudSyncStatusForTests();
  resetSaveStatusForTests();
  upsertMock.mockReset();
  deleteMock.mockReset();
  fetchMock.mockReset();
  upsertMock.mockResolvedValue({ ok: true });
  deleteMock.mockResolvedValue({ ok: true });
  fetchMock.mockResolvedValue({ ok: true, rows: [] });
  localStorage.clear();
});

afterEach(async () => {
  await deleteFocusCacheDatabase();
  resetCloudSyncStatusForTests();
  resetSaveStatusForTests();
});

describe('CREATE→DELETE race (outbound)', () => {
  it('A: CREATE queued, never flushed, delete immediately → flush sends DELETE only', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: note('race-a'),
    });

    const del = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'race-a',
    });
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.action).toBe('create_canceled_delete_enqueued');

    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith({
      userId: USER,
      sectionId: SECTION,
      objectId: 'race-a',
    });
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
  });

  it('B: pending CREATE at delete time → DELETE queued even if upsert could have succeeded', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: note('race-b'),
    });

    const del = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'race-b',
    });
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.action).toBe('create_canceled_delete_enqueued');
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);

    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it('C: CREATE then DELETE in queue → flush DELETE wins, skips stale CREATE', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: note('race-c'),
    });
    await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'race-c',
    });

    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith({
      userId: USER,
      sectionId: SECTION,
      objectId: 'race-c',
    });
  });

  it('D: CREATE flushed then DELETE → standard delete path', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: note('race-d'),
    });
    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    upsertMock.mockClear();

    const del = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'race-d',
    });
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.action).toBe('delete_enqueued');

    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith({
      userId: USER,
      sectionId: SECTION,
      objectId: 'race-d',
    });
  });

  it('E: repeated delete enqueue is idempotent', async () => {
    await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'race-e',
    });
    const again = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'race-e',
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.action).toBe('delete_already_queued');
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);
  });

  it('G/H: failed DELETE stays queued; retry succeeds → Saved-ready', async () => {
    await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'race-h',
    });
    deleteMock.mockResolvedValueOnce({ ok: false, reason: 'cloud_write_failed' });
    const fail = await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(fail.stoppedReason).toBe('cloud_write_failed');
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
        showSaved: true,
      }).phase,
    ).toBe('sync_failed');

    deleteMock.mockResolvedValue({ ok: true });
    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
        showSaved: true,
      }).phase,
    ).toBe('saved');
  });

  it('J: peer hard-reload pull absence-prunes when cloud row absent', async () => {
    const key = boardScopedFreeSpaceKeys(SECTION, BOARD).objects;
    localStorage.setItem(key, JSON.stringify([note('peer-gone', 50)]));

    fetchMock.mockResolvedValue({ ok: true, rows: [] });

    const result = await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
      boardId: BOARD,
      userId: USER,
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [note('peer-gone', 50)],
      isCurrent: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedObjectIds).toContain('peer-gone');
    const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as ProjectSpaceObject[];
    expect(stored.find(o => o.id === 'peer-gone')).toBeUndefined();
  });

  it('J: peer hard-reload keeps object when cloud fetch still returns row', async () => {
    const key = boardScopedFreeSpaceKeys(SECTION, BOARD).objects;
    localStorage.setItem(key, JSON.stringify([note('still-there', 50)]));

    const row: FreeSpaceObjectCloudRow = {
      id: 'still-there',
      user_id: USER,
      section_id: SECTION,
      board_id: BOARD,
      object: note('still-there', 50) as unknown as Json,
      created_at: 't',
      updated_at: 't',
    };
    fetchMock.mockResolvedValue({ ok: true, rows: [row] });

    const result = await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
      boardId: BOARD,
      userId: USER,
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [note('still-there', 50)],
      isCurrent: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedObjectIds).not.toContain('still-there');
  });
});
