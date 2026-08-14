// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { fwPersistWarn } from '../freeSpacePersistence';

vi.mock('./pendingOperations', () => ({
  enqueuePendingOperation: vi.fn(),
  listPendingOperations: vi.fn(),
  replacePendingOperationPayload: vi.fn(),
  removePendingOperation: vi.fn(),
}));

vi.mock('./freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

vi.mock('../freeSpacePersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../freeSpacePersistence')>();
  return {
    ...actual,
    fwPersistWarn: vi.fn(),
  };
});

import {
  enqueuePendingOperation,
  listPendingOperations,
  removePendingOperation,
  replacePendingOperationPayload,
} from './pendingOperations';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';
import type { JsonValue, PendingOperation } from './types';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './freeSpaceObjectCreateEnqueue';
import {
  enqueueFreeSpaceObjectUpdate,
  enqueueFreeSpaceObjectUpdatesAfterLocalPersist,
} from './freeSpaceObjectUpdateEnqueue';

const enqueueMock = vi.mocked(enqueuePendingOperation);
const listMock = vi.mocked(listPendingOperations);
const replaceMock = vi.mocked(replacePendingOperationPayload);
const removeMock = vi.mocked(removePendingOperation);
const scheduleFlushMock = vi.mocked(notifyFreeSpacePendingEnqueue);
const warnMock = vi.mocked(fwPersistWarn);

function sampleObject(id = 'ps-note-1', updatedAt = 100): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: 'Note',
    content: { type: 'note', body: 'edited' },
    createdAt: 1,
    updatedAt,
  };
}

function pendingOp(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    seq: 1,
    id: 'op-1',
    userId: 'user-1',
    workspaceId: 'section-1',
    entityType: FREE_SPACE_OBJECT_ENTITY_TYPE,
    entityId: 'ps-note-1',
    operationType: 'create',
    payload: {
      boardId: 'main',
      object: {
        id: 'ps-note-1',
        type: 'note',
        title: 'Note',
        content: { type: 'note', body: '' },
        createdAt: 1,
        updatedAt: 1,
      },
    } as JsonValue,
    ...overrides,
  };
}

beforeEach(() => {
  enqueueMock.mockReset();
  listMock.mockReset();
  replaceMock.mockReset();
  removeMock.mockReset();
  scheduleFlushMock.mockReset();
  warnMock.mockReset();
  listMock.mockResolvedValue({ ok: true, value: [] });
  replaceMock.mockResolvedValue({
    ok: true,
    value: { replaced: true, operation: pendingOp() },
  });
  removeMock.mockResolvedValue({ ok: true, value: { removed: true } });
  enqueueMock.mockResolvedValue({
    ok: true,
    value: pendingOp({ operationType: 'update', id: 'new-upd' }),
  });
});

describe('enqueueFreeSpaceObjectUpdate', () => {
  it('enqueues update when no pending create/update exists', async () => {
    const object = sampleObject('obj-a', 50);
    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'board-x',
      object,
    });

    expect(result).toEqual({ ok: true, action: 'update_enqueued' });
    expect(replaceMock).not.toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(scheduleFlushMock).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'section-1',
    });
    const arg = enqueueMock.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      namespace: { userId: 'user-1', workspaceId: 'section-1' },
      entityType: 'free_space_object',
      entityId: 'obj-a',
      operationType: 'update',
      payload: {
        boardId: 'board-x',
        object: expect.objectContaining({
          id: 'obj-a',
          updatedAt: 50,
          content: { type: 'note', body: 'edited' },
        }),
      },
    });
  });

  it('replaces pending CREATE payload instead of enqueueing UPDATE', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [pendingOp({ id: 'create-op', entityId: 'obj-a', operationType: 'create' })],
    });

    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object: sampleObject('obj-a', 200),
    });

    expect(result).toEqual({ ok: true, action: 'create_payload_replaced' });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(scheduleFlushMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      { userId: 'user-1', workspaceId: 'section-1' },
      'create-op',
      expect.objectContaining({
        boardId: 'main',
        object: expect.objectContaining({ updatedAt: 200, content: { type: 'note', body: 'edited' } }),
      }),
    );
  });

  it('replaces pending UPDATE payload (coalesce)', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [pendingOp({ id: 'upd-op', entityId: 'obj-a', operationType: 'update' })],
    });

    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object: sampleObject('obj-a', 300),
    });

    expect(result).toEqual({ ok: true, action: 'update_payload_replaced' });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(scheduleFlushMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      { userId: 'user-1', workspaceId: 'section-1' },
      'upd-op',
      expect.objectContaining({
        object: expect.objectContaining({ updatedAt: 300 }),
      }),
    );
  });

  it('prefers CREATE refresh over UPDATE when both exist', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        pendingOp({ id: 'create-op', entityId: 'obj-a', operationType: 'create', seq: 1 }),
        pendingOp({ id: 'upd-op', entityId: 'obj-a', operationType: 'update', seq: 2 }),
      ],
    });

    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object: sampleObject('obj-a', 400),
    });

    expect(result).toEqual({ ok: true, action: 'create_payload_replaced' });
    expect(replaceMock).toHaveBeenCalledWith(
      expect.anything(),
      'create-op',
      expect.anything(),
    );
    expect(removeMock).toHaveBeenCalledWith(
      { userId: 'user-1', workspaceId: 'section-1' },
      'upd-op',
    );
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('skips when updatedAt is missing', async () => {
    const object = sampleObject();
    (object as { updatedAt: unknown }).updatedAt = NaN;
    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object,
    });
    expect(result).toEqual({ ok: false, reason: 'missing_updated_at' });
    expect(listMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(scheduleFlushMock).not.toHaveBeenCalled();
  });

  it('skips when userId is missing without throwing', async () => {
    const result = await enqueueFreeSpaceObjectUpdate({
      userId: null,
      sectionId: 'section-1',
      boardId: 'main',
      object: sampleObject(),
    });
    expect(result.ok).toBe(false);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(scheduleFlushMock).not.toHaveBeenCalled();
  });
});

describe('enqueueFreeSpaceObjectUpdatesAfterLocalPersist', () => {
  it('does nothing when persisted is false', () => {
    enqueueFreeSpaceObjectUpdatesAfterLocalPersist(false, {
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      objects: [sampleObject()],
    });
    expect(listMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(scheduleFlushMock).not.toHaveBeenCalled();
  });

  it('fires enqueue for each object when persisted is true', async () => {
    enqueueFreeSpaceObjectUpdatesAfterLocalPersist(true, {
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      objects: [sampleObject('a', 1), sampleObject('b', 2)],
    });
    await vi.waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });
});
