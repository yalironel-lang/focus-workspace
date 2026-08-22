// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFocusCacheDbForTests } from './db';
import { flushPendingFreeSpaceCreates } from './flushPendingFreeSpaceCreates';
import { enqueueFreeSpaceBoardCreate } from './freeSpaceBoardCreateEnqueue';
import { enqueueFreeSpaceBoardDelete } from './freeSpaceBoardDeleteEnqueue';
import {
  getCloudSyncSnapshot,
  resetCloudSyncStatusForTests,
} from '../sync/cloudSyncStatus';
import { FOCUS_CACHE_DB_NAME } from './types';

vi.mock('./freeSpaceBoardCloud', () => ({
  upsertFreeSpaceBoardFromPayload: vi.fn(),
  deleteFreeSpaceBoardFromCloud: vi.fn(),
}));

vi.mock('./freeSpaceObjectCloud', () => ({
  upsertFreeSpaceObjectFromCreatePayload: vi.fn(),
  deleteFreeSpaceObjectFromCloud: vi.fn(),
}));

vi.mock('./freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

import {
  upsertFreeSpaceBoardFromPayload,
  deleteFreeSpaceBoardFromCloud,
} from './freeSpaceBoardCloud';

const upsertBoardMock = vi.mocked(upsertFreeSpaceBoardFromPayload);
const deleteBoardMock = vi.mocked(deleteFreeSpaceBoardFromCloud);

const USER = 'user-int-1';
const SECTION = '11111111-1111-1111-1111-111111111111';
const BOARD = 'board-int-1';

async function resetDb(): Promise<void> {
  await resetFocusCacheDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(FOCUS_CACHE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await resetDb();
  resetCloudSyncStatusForTests();
  upsertBoardMock.mockReset();
  deleteBoardMock.mockReset();
  upsertBoardMock.mockResolvedValue({ ok: true });
  deleteBoardMock.mockResolvedValue({ ok: true });
});

describe('freeSpaceBoard sync integration', () => {
  it('B flush drains board CREATE and clears pending ledger', async () => {
    const enq = await enqueueFreeSpaceBoardCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      name: 'Space',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(enq.ok).toBe(true);
    expect(getCloudSyncSnapshot().pendingCount).toBeGreaterThan(0);

    const flush = await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(flush.removed).toBe(1);
    expect(upsertBoardMock).toHaveBeenCalledWith({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      name: 'Space',
    });
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
  });

  it('L delete failure retains durable queue for retry', async () => {
    await enqueueFreeSpaceBoardDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
    });
    deleteBoardMock.mockResolvedValueOnce({
      ok: false,
      reason: 'cloud_write_failed',
      message: 'network',
    });
    const fail = await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(fail.stoppedReason).toBe('cloud_write_failed');
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);

    deleteBoardMock.mockResolvedValueOnce({ ok: true });
    const retry = await flushPendingFreeSpaceCreates({ userId: USER, workspaceId: SECTION });
    expect(retry.removed).toBe(1);
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
  });
});
