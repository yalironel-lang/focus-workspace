// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fwPersistWarn } from '../freeSpacePersistence';

vi.mock('./pendingOperations', () => ({
  listPendingOperations: vi.fn(),
  removePendingOperation: vi.fn(),
  enqueuePendingOperation: vi.fn(),
}));

vi.mock('../freeSpacePersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../freeSpacePersistence')>();
  return { ...actual, fwPersistWarn: vi.fn() };
});

import {
  enqueuePendingOperation,
  listPendingOperations,
  removePendingOperation,
} from './pendingOperations';
import type { PendingOperation } from './types';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './freeSpaceObjectCreateEnqueue';
import {
  cancelOrphanPendingFreeSpaceObjectWrites,
  cancelPendingFreeSpaceObjectWrites,
  cancelPendingFreeSpaceObjectWritesAfterLocalDelete,
} from './freeSpaceObjectDeleteCancel';

const listMock = vi.mocked(listPendingOperations);
const removeMock = vi.mocked(removePendingOperation);
const enqueueMock = vi.mocked(enqueuePendingOperation);
const warnMock = vi.mocked(fwPersistWarn);

function op(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    seq: 1,
    id: 'op-1',
    userId: 'user-1',
    workspaceId: 'section-1',
    entityType: FREE_SPACE_OBJECT_ENTITY_TYPE,
    entityId: 'obj-a',
    operationType: 'create',
    payload: { boardId: 'main', object: { id: 'obj-a', updatedAt: 1 } },
    ...overrides,
  };
}

beforeEach(() => {
  listMock.mockReset();
  removeMock.mockReset();
  enqueueMock.mockReset();
  warnMock.mockReset();
  listMock.mockResolvedValue({ ok: true, value: [] });
  removeMock.mockResolvedValue({ ok: true, value: { removed: true } });
});

describe('cancelPendingFreeSpaceObjectWrites', () => {
  it('cancels pending CREATE for entityId', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'c1', entityId: 'obj-a', operationType: 'create' })],
    });
    const result = await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(result.ok).toBe(true);
    expect(result.succeededEntityIds).toEqual(['obj-a']);
    expect(result.removedOps).toBe(1);
    expect(removeMock).toHaveBeenCalledWith(
      { userId: 'user-1', workspaceId: 'section-1' },
      'c1',
    );
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('cancels pending UPDATE for entityId', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'u1', entityId: 'obj-a', operationType: 'update' })],
    });
    const result = await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(result.ok).toBe(true);
    expect(result.removedOps).toBe(1);
    expect(removeMock).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('cancels CREATE and UPDATE together', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        op({ id: 'c1', entityId: 'obj-a', operationType: 'create', seq: 1 }),
        op({ id: 'u1', entityId: 'obj-a', operationType: 'update', seq: 2 }),
      ],
    });
    const result = await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(result.ok).toBe(true);
    expect(result.removedOps).toBe(2);
    expect(removeMock.mock.calls.map((c) => c[1])).toEqual(['c1', 'u1']);
  });

  it('cancels duplicate UPDATEs', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        op({ id: 'u1', entityId: 'obj-a', operationType: 'update', seq: 1 }),
        op({ id: 'u2', entityId: 'obj-a', operationType: 'update', seq: 2 }),
      ],
    });
    const result = await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(result.ok).toBe(true);
    expect(result.removedOps).toBe(2);
  });

  it('leaves unrelated entity untouched', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        op({ id: 'c-a', entityId: 'obj-a', operationType: 'create' }),
        op({ id: 'c-b', entityId: 'obj-b', operationType: 'create' }),
      ],
    });
    await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(removeMock.mock.calls.map((c) => c[1])).toEqual(['c-a']);
  });

  it('is a no-op when nothing pending for the entity', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] });
    const result = await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(result).toEqual({
      ok: true,
      succeededEntityIds: ['obj-a'],
      failedEntityIds: [],
      removedOps: 0,
    });
    expect(removeMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('isolates namespaces via workspaceId := sectionId', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'c1', workspaceId: 'section-1' })],
    });
    await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(listMock).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'section-1',
    });
  });

  it('does not enqueue DELETE on cancel', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'c1', operationType: 'create' })],
    });
    await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('leaves entity in failedEntityIds when remove fails (retry intent)', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'c1', operationType: 'create' })],
    });
    removeMock.mockResolvedValueOnce({ ok: false, reason: 'transaction_failed' });
    const result = await cancelPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(result.ok).toBe(false);
    expect(result.failedEntityIds).toEqual(['obj-a']);
    expect(result.succeededEntityIds).toEqual([]);
  });

  it('skips when userId missing without throwing', async () => {
    const result = await cancelPendingFreeSpaceObjectWrites({
      userId: null,
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(result.ok).toBe(false);
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe('cancelPendingFreeSpaceObjectWritesAfterLocalDelete', () => {
  it('does nothing when persisted is false', () => {
    cancelPendingFreeSpaceObjectWritesAfterLocalDelete(false, {
      userId: 'user-1',
      sectionId: 'section-1',
      entityIds: ['obj-a'],
    });
    expect(listMock).not.toHaveBeenCalled();
  });

  it('fires cancel when persisted is true and reports result', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] });
    const onResult = vi.fn();
    cancelPendingFreeSpaceObjectWritesAfterLocalDelete(
      true,
      { userId: 'user-1', sectionId: 'section-1', entityIds: ['obj-a'] },
      onResult,
    );
    await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult.mock.calls[0]?.[0]?.ok).toBe(true);
    expect(onResult.mock.calls[0]?.[0]?.succeededEntityIds).toEqual(['obj-a']);
  });
});

describe('cancelOrphanPendingFreeSpaceObjectWrites', () => {
  it('cancels ops for entity absent from authoritative local SOT', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        op({ id: 'c-gone', entityId: 'gone', operationType: 'create' }),
        op({ id: 'c-live', entityId: 'live', operationType: 'update' }),
      ],
    });
    const result = await cancelOrphanPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      authoritativeLocalEntityIds: new Set(['live']),
    });
    expect(result.ok).toBe(true);
    expect(removeMock.mock.calls.map((c) => c[1])).toEqual(['c-gone']);
  });

  it('preserves entity present in authoritative local SOT', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'c-live', entityId: 'live', operationType: 'create' })],
    });
    const result = await cancelOrphanPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      authoritativeLocalEntityIds: new Set(['live']),
    });
    expect(result.ok).toBe(true);
    expect(result.removedOps).toBe(0);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('no-ops when authoritative set is empty and queue empty', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] });
    const result = await cancelOrphanPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      authoritativeLocalEntityIds: new Set(),
    });
    expect(result.ok).toBe(true);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('requires authoritativeLocalEntityIds — cancels all create|update when set is empty and ops exist', async () => {
    // Empty authoritative set means no active local objects after full hydrate.
    listMock.mockResolvedValue({
      ok: true,
      value: [op({ id: 'c1', entityId: 'only-queued', operationType: 'create' })],
    });
    const result = await cancelOrphanPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      authoritativeLocalEntityIds: new Set(),
    });
    expect(result.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledWith(expect.anything(), 'c1');
  });
});
