// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFocusCacheDbForTests } from './db';
import { FOCUS_CACHE_DB_NAME } from './types';

vi.mock('./freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import { enqueueFreeSpaceBoardCreate } from './freeSpaceBoardCreateEnqueue';
import { enqueueFreeSpaceBoardUpdate } from './freeSpaceBoardUpdateEnqueue';
import { enqueueFreeSpaceBoardDelete } from './freeSpaceBoardDeleteEnqueue';
import { listPendingOperations } from './pendingOperations';

const USER = 'user-board-1';
const SECTION = '11111111-1111-1111-1111-111111111111';
const BOARD = 'board-test-1';

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
  vi.mocked(notifyFreeSpacePendingEnqueue).mockReset();
});

describe('free_space_board queue coalescing', () => {
  it('A create enqueues durable op with stable board id', async () => {
    const result = await enqueueFreeSpaceBoardCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      name: 'Second',
      createdAt: 100,
      updatedAt: 100,
    });
    expect(result.ok).toBe(true);
    const listed = await listPendingOperations({ userId: USER, workspaceId: SECTION });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const ops = listed.value.filter(op => op.entityType === 'free_space_board');
    expect(ops).toHaveLength(1);
    expect(ops[0]?.operationType).toBe('create');
    expect(ops[0]?.entityId).toBe(BOARD);
  });

  it('I create + rename coalesces to latest name on pending CREATE', async () => {
    await enqueueFreeSpaceBoardCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      name: 'First',
      createdAt: 100,
      updatedAt: 100,
    });
    const upd = await enqueueFreeSpaceBoardUpdate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      name: 'Renamed',
      createdAt: 100,
      updatedAt: 200,
    });
    expect(upd.ok).toBe(true);
    expect(upd.ok && upd.action).toBe('create_payload_replaced');
    const listed = await listPendingOperations({ userId: USER, workspaceId: SECTION });
    if (!listed.ok) throw new Error('list failed');
    const writes = listed.value.filter(
      op => op.entityType === 'free_space_board' && op.operationType !== 'delete',
    );
    expect(writes).toHaveLength(1);
    expect((writes[0]?.payload as { name?: string }).name).toBe('Renamed');
  });

  it('J create + delete before flush yields no pending write ops', async () => {
    await enqueueFreeSpaceBoardCreate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      name: 'Ephemeral',
      createdAt: 100,
      updatedAt: 100,
    });
    const del = await enqueueFreeSpaceBoardDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
    });
    expect(del.ok).toBe(true);
    expect(del.ok && del.action).toBe('create_canceled_delete_enqueued');
    const listed = await listPendingOperations({ userId: USER, workspaceId: SECTION });
    if (!listed.ok) throw new Error('list failed');
    const boardOps = listed.value.filter(op => op.entityType === 'free_space_board');
    expect(boardOps).toHaveLength(1);
    expect(boardOps[0]?.operationType).toBe('delete');
  });

  it('K update + delete → DELETE wins', async () => {
    await enqueueFreeSpaceBoardUpdate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      name: 'Old',
      createdAt: 50,
      updatedAt: 150,
    });
    const del = await enqueueFreeSpaceBoardDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
    });
    expect(del.ok).toBe(true);
    const listed = await listPendingOperations({ userId: USER, workspaceId: SECTION });
    if (!listed.ok) throw new Error('list failed');
    const boardOps = listed.value.filter(op => op.entityType === 'free_space_board');
    expect(boardOps).toHaveLength(1);
    expect(boardOps[0]?.operationType).toBe('delete');
  });

  it('N main cannot delete', async () => {
    const del = await enqueueFreeSpaceBoardDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: 'main',
    });
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.reason).toBe('main_immutable');
  });

  it('DELETE queued blocks later UPDATE resurrection', async () => {
    await enqueueFreeSpaceBoardDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
    });
    const upd = await enqueueFreeSpaceBoardUpdate({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      name: 'Nope',
      createdAt: 1,
      updatedAt: 2,
    });
    expect(upd.ok).toBe(false);
  });
});
