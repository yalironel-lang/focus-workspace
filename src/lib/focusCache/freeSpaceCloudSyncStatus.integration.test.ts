/**
 * Integration: Free Space enqueue / flush / soft-delete cancel → cloudSyncStatus.
 */
// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { resetFocusCacheDbForTests } from './db';
import { flushPendingFreeSpaceCreates } from './flushPendingFreeSpaceCreates';
import { enqueueFreeSpaceObjectCreate } from './freeSpaceObjectCreateEnqueue';
import { enqueueFreeSpaceObjectUpdate } from './freeSpaceObjectUpdateEnqueue';
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
}));

vi.mock('./freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

import { upsertFreeSpaceObjectFromCreatePayload, deleteFreeSpaceObjectFromCloud } from './freeSpaceObjectCloud';
import { enqueueFreeSpaceObjectDelete } from './freeSpaceObjectDeleteEnqueue';

const upsertMock = vi.mocked(upsertFreeSpaceObjectFromCreatePayload);
const deleteMock = vi.mocked(deleteFreeSpaceObjectFromCloud);

const USER = 'user-status-1';
const SECTION = 'section-status-1';
const BOARD = 'main';

function obj(id: string, updatedAt = Date.now()): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: 't',
    content: { type: 'note', body: '' },
    createdAt: updatedAt,
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
  upsertMock.mockResolvedValue({ ok: true });
  deleteMock.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await deleteFocusCacheDatabase();
  resetCloudSyncStatusForTests();
  resetSaveStatusForTests();
});

describe('Free Space cloud status integration', () => {
  it('M create path: enqueue → pending UI; flush drain → Saved-ready', async () => {
    const enq = await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: obj('c1'),
    });
    expect(enq.ok).toBe(true);
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
      }).phase,
    ).toBe('sync_pending');

    const flush = await flushPendingFreeSpaceCreates({
      userId: USER,
      workspaceId: SECTION,
    });
    expect(flush.removed).toBe(1);
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
    expect(getCloudSyncSnapshot().flushInFlight).toBe(false);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
        showSaved: true,
      }).phase,
    ).toBe('saved');
  });

  it('N update path: enqueue + flush drains', async () => {
    const enq = await enqueueFreeSpaceObjectUpdate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: obj('u1', 100),
    });
    expect(enq).toEqual({ ok: true, action: 'update_enqueued' });
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);

    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
  });

  it('O create-then-delete before cloud: CREATE canceled, no DELETE queued', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: obj('d1'),
    });
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);

    const del = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'd1',
    });
    expect(del.ok).toBe(true);
    if (del.ok) expect(del.action).toBe('create_canceled_no_delete');
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('O2 delete path: enqueue DELETE → pending UI; flush → Saved-ready', async () => {
    const del = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'cloud-obj',
    });
    expect(del.ok).toBe(true);
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
        showSaved: true,
      }).phase,
    ).toBe('sync_pending');

    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(deleteMock).toHaveBeenCalledWith({
      userId: USER,
      sectionId: SECTION,
      objectId: 'cloud-obj',
    });
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
        showSaved: true,
      }).phase,
    ).toBe('saved');
  });

  it('O3 delete failure: Sync failed, retry drains', async () => {
    await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'cloud-obj',
    });
    deleteMock.mockResolvedValueOnce({ ok: false, reason: 'cloud_write_failed' });
    const flush = await flushPendingFreeSpaceCreates({
      userId: USER,
      workspaceId: SECTION,
    });
    expect(flush.stoppedReason).toBe('cloud_write_failed');
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
  });

  it('D/E: first of two ops succeeding does not clear pending', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: obj('a', 1),
    });
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: obj('b', 2),
    });
    expect(getCloudSyncSnapshot().pendingCount).toBe(2);

    let calls = 0;
    upsertMock.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return { ok: true };
      return { ok: false, reason: 'cloud_write_failed' };
    });

    const flush = await flushPendingFreeSpaceCreates({
      userId: USER,
      workspaceId: SECTION,
    });
    expect(flush.removed).toBe(1);
    expect(flush.stoppedReason).toBe('cloud_write_failed');
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);
    expect(getCloudSyncSnapshot().anyCloudFailure).toBe(true);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
        showSaved: true,
      }).phase,
    ).toBe('sync_failed');
  });

  it('F/G: cloud failure leaves op queued and Sync failed', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: obj('fail-1'),
    });
    upsertMock.mockResolvedValue({ ok: false, reason: 'cloud_write_failed' });
    const flush = await flushPendingFreeSpaceCreates({
      userId: USER,
      workspaceId: SECTION,
    });
    expect(flush.stoppedReason).toBe('cloud_write_failed');
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);
    expect(getCloudSyncSnapshot().anyCloudFailure).toBe(true);
  });

  it('I: retry succeeds + queue drained → Saved-ready', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      object: obj('retry-1'),
    });
    upsertMock.mockResolvedValueOnce({ ok: false, reason: 'cloud_write_failed' });
    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(getCloudSyncSnapshot().anyCloudFailure).toBe(true);

    upsertMock.mockResolvedValue({ ok: true });
    await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
    expect(getCloudSyncSnapshot().anyCloudFailure).toBe(false);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
        showSaved: true,
      }).label,
    ).toBe('Saved');
  });

  it('L: equal/no-op flush with empty queue does not invent pending', async () => {
    const flush = await flushPendingFreeSpaceCreates({
      userId: USER,
      workspaceId: SECTION,
    });
    expect(flush.processed).toBe(0);
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
    expect(
      deriveSyncUiStatus(getSaveStatusSnapshot(), {
        online: true,
        cloud: getCloudSyncSnapshot(),
      }).phase,
    ).toBe('idle');
  });
});
