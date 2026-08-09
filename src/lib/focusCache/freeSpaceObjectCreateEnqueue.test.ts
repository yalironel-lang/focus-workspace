// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { fwPersistWarn } from '../freeSpacePersistence';

vi.mock('./pendingOperations', () => ({
  enqueuePendingOperation: vi.fn(),
}));

vi.mock('../freeSpacePersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../freeSpacePersistence')>();
  return {
    ...actual,
    fwPersistWarn: vi.fn(),
  };
});

import { enqueuePendingOperation } from './pendingOperations';
import type { JsonValue, PendingOperation } from './types';
import {
  FREE_SPACE_OBJECT_ENTITY_TYPE,
  enqueueFreeSpaceObjectCreate,
  enqueueFreeSpaceObjectCreatesAfterLocalPersist,
} from './freeSpaceObjectCreateEnqueue';

const enqueueMock = vi.mocked(enqueuePendingOperation);
const warnMock = vi.mocked(fwPersistWarn);

function sampleObject(id = 'ps-note-1'): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: 'Note',
    content: { type: 'note', body: 'hello' },
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  enqueueMock.mockReset();
  warnMock.mockReset();
  enqueueMock.mockResolvedValue({
    ok: true,
    value: {
      seq: 1,
      id: 'generated-uuid',
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
          content: { type: 'note', body: 'hello' },
          createdAt: 1,
          updatedAt: 1,
        },
      } as JsonValue,
    } satisfies PendingOperation,
  });
});

describe('enqueueFreeSpaceObjectCreate', () => {
  it('enqueues with correct namespace, entity fields, and payload', async () => {
    const object = sampleObject('obj-a');
    const result = await enqueueFreeSpaceObjectCreate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'board-x',
      object,
    });

    expect(result).toEqual({ ok: true });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const arg = enqueueMock.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      namespace: { userId: 'user-1', workspaceId: 'section-1' },
      entityType: 'free_space_object',
      entityId: 'obj-a',
      operationType: 'create',
      payload: {
        boardId: 'board-x',
        object: expect.objectContaining({ id: 'obj-a', type: 'note' }),
      },
    });
    expect(arg).not.toHaveProperty('id');
    expect(Object.prototype.hasOwnProperty.call(arg, 'id')).toBe(false);
  });

  it('maps workspaceId to sectionId (temporary compatibility)', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: 'user-1',
      sectionId: 'sec-99',
      boardId: '',
      object: sampleObject(),
    });
    expect(enqueueMock.mock.calls[0]?.[0]?.namespace.workspaceId).toBe('sec-99');
  });

  it('does not use boardId as workspaceId', async () => {
    await enqueueFreeSpaceObjectCreate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'board-should-not-be-workspace',
      object: sampleObject(),
    });
    const arg = enqueueMock.mock.calls[0]?.[0];
    expect(arg?.namespace.workspaceId).toBe('section-1');
    expect(arg?.payload).toMatchObject({
      boardId: 'board-should-not-be-workspace',
    });
  });

  it('skips enqueue when userId is missing without throwing', async () => {
    const result = await enqueueFreeSpaceObjectCreate({
      userId: null,
      sectionId: 'section-1',
      boardId: 'main',
      object: sampleObject(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('auth_missing');
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalled();
  });

  it('does not throw when enqueuePendingOperation fails', async () => {
    enqueueMock.mockResolvedValue({ ok: false, reason: 'transaction_failed' });
    const result = await enqueueFreeSpaceObjectCreate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object: sampleObject(),
    });
    expect(result).toEqual({ ok: false, reason: 'transaction_failed' });
    expect(warnMock).toHaveBeenCalled();
  });

  it('does not throw when enqueuePendingOperation rejects', async () => {
    enqueueMock.mockRejectedValue(new Error('boom'));
    const result = await enqueueFreeSpaceObjectCreate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object: sampleObject(),
    });
    expect(result).toEqual({ ok: false, reason: 'unexpected_error' });
  });

  it('strips pdf thumbnailDataUrl from payload object', async () => {
    const object: ProjectSpaceObject = {
      id: 'ps-pdf-1',
      type: 'pdf',
      title: 'PDF',
      content: {
        type: 'pdf',
        fileName: 'a.pdf',
        fileType: 'application/pdf',
        fileSize: 1,
        lastOpenedAt: null,
        page: 1,
        zoom: 1,
        thumbnailDataUrl: 'data:image/png;base64,AAA',
      },
      createdAt: 1,
      updatedAt: 1,
    };
    await enqueueFreeSpaceObjectCreate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object,
    });
    const payload = enqueueMock.mock.calls[0]?.[0]?.payload as {
      object: { content: Record<string, unknown> };
    };
    expect(payload.object.content).not.toHaveProperty('thumbnailDataUrl');
  });
});

describe('enqueueFreeSpaceObjectCreatesAfterLocalPersist', () => {
  it('does not enqueue when local persist failed', async () => {
    enqueueFreeSpaceObjectCreatesAfterLocalPersist(false, {
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      objects: [sampleObject('a'), sampleObject('b')],
    });
    await Promise.resolve();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('enqueues once per object when local persist succeeded', async () => {
    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      objects: [sampleObject('a'), sampleObject('b')],
    });
    await vi.waitFor(() => expect(enqueueMock).toHaveBeenCalledTimes(2));
    expect(enqueueMock.mock.calls[0]?.[0]?.entityId).toBe('a');
    expect(enqueueMock.mock.calls[1]?.[0]?.entityId).toBe('b');
  });
});
