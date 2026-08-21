// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingOperation } from './types';

vi.mock('./pendingOperations', () => ({
  listPendingOperations: vi.fn(),
  removePendingOperation: vi.fn(),
  enqueuePendingOperation: vi.fn(),
}));

vi.mock('./freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

vi.mock('../freeSpacePersistence', async importOriginal => {
  const actual = await importOriginal<typeof import('../freeSpacePersistence')>();
  return { ...actual, fwPersistWarn: vi.fn() };
});

vi.mock('../sync/cloudSyncStatus', () => ({
  noteCloudOpEnqueued: vi.fn(),
  noteCloudOpResolved: vi.fn(),
}));

import { enqueuePendingOperation, listPendingOperations, removePendingOperation } from './pendingOperations';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import { noteCloudOpEnqueued, noteCloudOpResolved } from '../sync/cloudSyncStatus';
import { enqueueFreeSpaceObjectDelete } from './freeSpaceObjectDeleteEnqueue';

const listMock = vi.mocked(listPendingOperations);
const removeMock = vi.mocked(removePendingOperation);
const enqueueMock = vi.mocked(enqueuePendingOperation);
const notifyMock = vi.mocked(notifyFreeSpacePendingEnqueue);
const enqueuedNote = vi.mocked(noteCloudOpEnqueued);
const resolvedNote = vi.mocked(noteCloudOpResolved);

const USER = 'user-1';
const SECTION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOARD = 'main';

function op(partial: Partial<PendingOperation> & Pick<PendingOperation, 'id' | 'entityId' | 'operationType'>): PendingOperation {
  return {
    seq: 1,
    userId: USER,
    workspaceId: SECTION,
    entityType: 'free_space_object',
    payload: { boardId: BOARD },
    ...partial,
  };
}

beforeEach(() => {
  listMock.mockReset();
  removeMock.mockReset();
  enqueueMock.mockReset();
  notifyMock.mockReset();
  enqueuedNote.mockReset();
  resolvedNote.mockReset();
  removeMock.mockResolvedValue({ ok: true, value: { removed: true } });
  enqueueMock.mockResolvedValue({
    ok: true,
    value: op({ id: 'new-del', entityId: 'obj-1', operationType: 'delete', seq: 9 }),
  });
});

describe('enqueueFreeSpaceObjectDelete', () => {
  it('A: no pending writes → enqueues DELETE', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] });
    const result = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'obj-1',
    });
    expect(result).toEqual({
      ok: true,
      action: 'delete_enqueued',
      removedWriteOps: 0,
    });
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'obj-1',
        operationType: 'delete',
        payload: { boardId: BOARD },
      }),
    );
    expect(enqueuedNote).toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalled();
  });

  it('B: pending CREATE only → cancel CREATE, no DELETE', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'c1', entityId: 'obj-1', operationType: 'create' })],
    });
    const result = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'obj-1',
    });
    expect(result).toEqual({
      ok: true,
      action: 'create_canceled_no_delete',
      removedWriteOps: 1,
    });
    expect(removeMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER }),
      'c1',
    );
    expect(resolvedNote).toHaveBeenCalledWith('c1');
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('C: pending UPDATE → cancel UPDATE, enqueue DELETE', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'u1', entityId: 'obj-1', operationType: 'update' })],
    });
    const result = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'obj-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action).toBe('writes_canceled_delete_enqueued');
    expect(result.removedWriteOps).toBe(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ operationType: 'delete', entityId: 'obj-1' }),
    );
  });

  it('idempotent when DELETE already queued', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'd1', entityId: 'obj-1', operationType: 'delete' })],
    });
    const result = await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'obj-1',
    });
    expect(result).toEqual({
      ok: true,
      action: 'delete_already_queued',
      removedWriteOps: 0,
    });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('J: different entityId left untouched', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        op({ id: 'u-other', entityId: 'other', operationType: 'update' }),
      ],
    });
    await enqueueFreeSpaceObjectDelete({
      userId: USER,
      sectionId: SECTION,
      boardId: BOARD,
      entityId: 'obj-1',
    });
    expect(removeMock).not.toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'obj-1', operationType: 'delete' }),
    );
  });
});
