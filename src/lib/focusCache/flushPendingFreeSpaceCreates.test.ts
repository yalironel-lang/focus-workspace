// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheNamespace } from '../focusCacheNamespace';
import type { PendingOperation } from './types';

vi.mock('./pendingOperations', () => ({
  listPendingOperations: vi.fn(),
  removePendingOperation: vi.fn(),
}));

vi.mock('./freeSpaceObjectCloud', () => ({
  upsertFreeSpaceObjectFromCreatePayload: vi.fn(),
  deleteFreeSpaceObjectFromCloud: vi.fn(),
}));

vi.mock('./freeSpaceBoardCloud', () => ({
  upsertFreeSpaceBoardFromPayload: vi.fn(),
  deleteFreeSpaceBoardFromCloud: vi.fn(),
}));

vi.mock('../freeSpacePersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../freeSpacePersistence')>();
  return { ...actual, fwPersistWarn: vi.fn() };
});

import { upsertFreeSpaceObjectFromCreatePayload, deleteFreeSpaceObjectFromCloud } from './freeSpaceObjectCloud';
import {
  upsertFreeSpaceBoardFromPayload,
  deleteFreeSpaceBoardFromCloud,
} from './freeSpaceBoardCloud';
import { flushPendingFreeSpaceCreates } from './flushPendingFreeSpaceCreates';
import {
  listPendingOperations,
  removePendingOperation,
} from './pendingOperations';

const listMock = vi.mocked(listPendingOperations);
const removeMock = vi.mocked(removePendingOperation);
const upsertMock = vi.mocked(upsertFreeSpaceObjectFromCreatePayload);
const deleteMock = vi.mocked(deleteFreeSpaceObjectFromCloud);
const upsertBoardMock = vi.mocked(upsertFreeSpaceBoardFromPayload);
const deleteBoardMock = vi.mocked(deleteFreeSpaceBoardFromCloud);

const ns: CacheNamespace = {
  userId: 'user-1',
  workspaceId: '11111111-1111-1111-1111-111111111111',
};

function createOp(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    seq: 1,
    id: 'op-1',
    userId: ns.userId,
    workspaceId: ns.workspaceId,
    entityType: 'free_space_object',
    entityId: 'ps-note-1',
    operationType: 'create',
    payload: {
      boardId: 'main',
      object: {
        id: 'ps-note-1',
        type: 'note',
        title: 'Note',
        content: { type: 'note', body: 'hi' },
        createdAt: 1,
        updatedAt: 1,
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  listMock.mockReset();
  removeMock.mockReset();
  upsertMock.mockReset();
  deleteMock.mockReset();
  upsertBoardMock.mockReset();
  deleteBoardMock.mockReset();
  upsertMock.mockResolvedValue({ ok: true });
  deleteMock.mockResolvedValue({ ok: true });
  upsertBoardMock.mockResolvedValue({ ok: true });
  deleteBoardMock.mockResolvedValue({ ok: true });
  removeMock.mockResolvedValue({ ok: true, value: { removed: true } });
});

describe('flushPendingFreeSpaceCreates', () => {
  it('upserts create ops in seq order and removes only after cloud success', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        createOp({ seq: 1, id: 'op-a', entityId: 'a' }),
        createOp({
          seq: 2,
          id: 'op-b',
          entityId: 'b',
          payload: {
            boardId: 'board-2',
            object: { id: 'b', type: 'note', title: 'B', content: { type: 'note', body: '' }, createdAt: 1, updatedAt: 1 },
          },
        }),
      ],
    });

    const result = await flushPendingFreeSpaceCreates(ns);

    expect(result).toMatchObject({
      processed: 2,
      removed: 2,
      skippedUnsupported: 0,
      skippedMalformed: 0,
      failedCloud: 0,
    });
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[0]?.[0]?.objectId).toBe('a');
    expect(upsertMock.mock.calls[1]?.[0]?.objectId).toBe('b');
    expect(upsertMock.mock.calls[0]?.[0]?.sectionId).toBe(ns.workspaceId);
    expect(removeMock.mock.calls.map(c => c[1])).toEqual(['op-a', 'op-b']);
  });

  it('processes update ops the same as create (upsert + remove)', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        createOp({
          seq: 1,
          id: 'op-upd',
          operationType: 'update',
          entityId: 'ps-note-1',
          payload: {
            boardId: 'main',
            object: {
              id: 'ps-note-1',
              type: 'note',
              title: 'Note',
              content: { type: 'note', body: 'edited' },
              createdAt: 1,
              updatedAt: 99,
            },
          },
        }),
      ],
    });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result).toMatchObject({
      processed: 1,
      removed: 1,
      skippedUnsupported: 0,
      failedCloud: 0,
    });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: 'ps-note-1',
        object: expect.objectContaining({
          updatedAt: 99,
          content: { type: 'note', body: 'edited' },
        }),
      }),
    );
    expect(removeMock).toHaveBeenCalledWith(ns, 'op-upd');
  });

  it('leaves unsupported entity types queued without upsert or remove', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        createOp({
          seq: 1,
          id: 'op-other',
          entityType: 'other_thing',
        }),
      ],
    });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.processed).toBe(0);
    expect(result.skippedUnsupported).toBe(1);
    expect(result.removed).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('cloud DELETE succeeds and removes queue op', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        createOp({
          seq: 1,
          id: 'op-del',
          entityId: 'gone',
          operationType: 'delete',
          payload: { boardId: 'main' },
        }),
      ],
    });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.processed).toBe(1);
    expect(result.removed).toBe(1);
    expect(deleteMock).toHaveBeenCalledWith({
      userId: ns.userId,
      sectionId: ns.workspaceId,
      objectId: 'gone',
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalledWith(ns, 'op-del');
  });

  it('D: failed DELETE retains op and stops', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        createOp({
          seq: 1,
          id: 'op-del',
          entityId: 'gone',
          operationType: 'delete',
          payload: { boardId: 'main' },
        }),
      ],
    });
    deleteMock.mockResolvedValue({ ok: false, reason: 'cloud_write_failed' });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.removed).toBe(0);
    expect(result.failedCloud).toBe(1);
    expect(result.stoppedReason).toBe('cloud_write_failed');
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('processes create then update in seq drain order', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        createOp({ seq: 1, id: 'op-create', entityId: 'a', operationType: 'create' }),
        createOp({
          seq: 2,
          id: 'op-update',
          entityId: 'b',
          operationType: 'update',
          payload: {
            boardId: 'main',
            object: {
              id: 'b',
              type: 'note',
              title: 'B',
              content: { type: 'note', body: 'x' },
              createdAt: 1,
              updatedAt: 5,
            },
          },
        }),
      ],
    });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.processed).toBe(2);
    expect(result.removed).toBe(2);
    expect(upsertMock.mock.calls[0]?.[0]?.objectId).toBe('a');
    expect(upsertMock.mock.calls[1]?.[0]?.objectId).toBe('b');
    expect(removeMock.mock.calls.map(c => c[1])).toEqual(['op-create', 'op-update']);
  });

  it('drops stale duplicate ops by object.updatedAt without cloud write', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        createOp({
          seq: 1,
          id: 'op-newer',
          entityId: 'same',
          operationType: 'update',
          payload: {
            boardId: 'main',
            object: {
              id: 'same',
              type: 'note',
              title: 'Note',
              content: { type: 'note', body: 'new' },
              createdAt: 1,
              updatedAt: 200,
            },
          },
        }),
        createOp({
          seq: 2,
          id: 'op-older',
          entityId: 'same',
          operationType: 'update',
          payload: {
            boardId: 'main',
            object: {
              id: 'same',
              type: 'note',
              title: 'Note',
              content: { type: 'note', body: 'old' },
              createdAt: 1,
              updatedAt: 100,
            },
          },
        }),
      ],
    });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.processed).toBe(2);
    expect(result.removed).toBe(2);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]?.[0]?.object).toMatchObject({ updatedAt: 200, content: { type: 'note', body: 'new' } });
    expect(removeMock.mock.calls.map(c => c[1])).toEqual(['op-newer', 'op-older']);
  });

  it('leaves malformed create payloads queued', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [createOp({ payload: { boardId: 'main' } as never })],
    });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.skippedMalformed).toBe(1);
    expect(result.removed).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('stops on cloud failure and does not remove the failed op', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        createOp({ seq: 1, id: 'op-1', entityId: 'a' }),
        createOp({ seq: 2, id: 'op-2', entityId: 'b' }),
      ],
    });
    upsertMock.mockResolvedValueOnce({ ok: false, reason: 'cloud_write_failed' });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.failedCloud).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.stoppedReason).toBe('cloud_write_failed');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('does not remove when cloud succeeds but remove fails', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [createOp({ id: 'op-1' })],
    });
    removeMock.mockResolvedValue({ ok: true, value: { removed: false } });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.removed).toBe(0);
    expect(result.stoppedReason).toBe('remove_failed');
  });

  it('rejects invalid namespace without listing', async () => {
    const result = await flushPendingFreeSpaceCreates({
      userId: '',
      workspaceId: ns.workspaceId,
    });
    expect(result.stoppedReason).toBe('namespace_invalid');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('upserts free_space_board create ops and deletes board rows', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'board-op-create',
          userId: ns.userId,
          workspaceId: ns.workspaceId,
          entityType: 'free_space_board',
          entityId: 'board-x',
          operationType: 'create',
          payload: { name: 'Space X', createdAt: 1, updatedAt: 10 },
        } satisfies PendingOperation,
        {
          seq: 2,
          id: 'board-op-delete',
          userId: ns.userId,
          workspaceId: ns.workspaceId,
          entityType: 'free_space_board',
          entityId: 'board-y',
          operationType: 'delete',
          payload: {},
        } satisfies PendingOperation,
      ],
    });

    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.removed).toBe(2);
    expect(upsertBoardMock).toHaveBeenCalledWith({
      userId: ns.userId,
      sectionId: ns.workspaceId,
      boardId: 'board-x',
      name: 'Space X',
    });
    expect(deleteBoardMock).toHaveBeenCalledWith({
      userId: ns.userId,
      sectionId: ns.workspaceId,
      boardId: 'board-y',
    });
  });
});
