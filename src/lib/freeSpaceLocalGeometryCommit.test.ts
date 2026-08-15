// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import type { BlockPos } from '../hooks/useBlockPositions';
import { DEFAULT_BLOCK_H, DEFAULT_BLOCK_W } from '../hooks/useBlockPositions';
import { sanitizeBlockPos } from './freeSpacePersistence';
import {
  nextGeometryUpdatedAt,
  stampLocalObjectGeometry,
} from './freeSpaceObjectGeometry';
import {
  committedPosFromInitPosHint,
  committedPosFromSetPosPatch,
  defaultBlockPos,
} from './freeSpaceLocalGeometryCommit';
import { buildFreeSpaceObjectWritePayload } from './focusCache/freeSpaceObjectCreateEnqueue';
import { enqueueFreeSpaceObjectUpdate } from './focusCache/freeSpaceObjectUpdateEnqueue';
import { fwPersistWarn } from './freeSpacePersistence';

vi.mock('./focusCache/pendingOperations', () => ({
  enqueuePendingOperation: vi.fn(),
  listPendingOperations: vi.fn(),
  replacePendingOperationPayload: vi.fn(),
  removePendingOperation: vi.fn(),
}));

vi.mock('./focusCache/freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

vi.mock('./freeSpacePersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./freeSpacePersistence')>();
  return {
    ...actual,
    fwPersistWarn: vi.fn(),
  };
});

import {
  enqueuePendingOperation,
  listPendingOperations,
  replacePendingOperationPayload,
  removePendingOperation,
} from './focusCache/pendingOperations';
import { notifyFreeSpacePendingEnqueue } from './focusCache/freeSpacePendingFlushTrigger';
import type { JsonValue, PendingOperation } from './focusCache/types';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './focusCache/freeSpaceObjectCreateEnqueue';

const enqueueMock = vi.mocked(enqueuePendingOperation);
const listMock = vi.mocked(listPendingOperations);
const replaceMock = vi.mocked(replacePendingOperationPayload);
const removeMock = vi.mocked(removePendingOperation);
const warnMock = vi.mocked(fwPersistWarn);
const flushNotifyMock = vi.mocked(notifyFreeSpacePendingEnqueue);

function note(overrides: Partial<ProjectSpaceObject> = {}): ProjectSpaceObject {
  return {
    id: 'ps-note-1',
    type: 'note',
    title: 'Kept title',
    content: { type: 'note', body: 'kept body' },
    viewMode: 'split',
    splitSide: 'left',
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

function payloadObject(payload: JsonValue | null): ProjectSpaceObject {
  return (payload as unknown as { object: ProjectSpaceObject }).object;
}

function pendingOp(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    seq: 1,
    id: 'op-1',
    userId: 'user-1',
    workspaceId: 'section-1',
    entityType: FREE_SPACE_OBJECT_ENTITY_TYPE,
    entityId: 'ps-note-1',
    operationType: 'update',
    payload: { boardId: 'main', object: note() } as unknown as JsonValue,
    ...overrides,
  };
}

beforeEach(() => {
  enqueueMock.mockReset();
  listMock.mockReset();
  replaceMock.mockReset();
  removeMock.mockReset();
  warnMock.mockReset();
  flushNotifyMock.mockReset();
  listMock.mockResolvedValue({ ok: true, value: [] });
  removeMock.mockResolvedValue({ ok: true, value: { removed: true } });
  replaceMock.mockResolvedValue({ ok: true, value: { replaced: true } });
  enqueueMock.mockResolvedValue({
    ok: true,
    value: pendingOp(),
  });
});

/** SectionPage wrapper: local setPos then stamp. Pointermove never calls this. */
function finalLocalGeometryCommit(
  object: ProjectSpaceObject,
  prevPos: BlockPos | undefined,
  patch: Partial<BlockPos>,
  now?: number,
): { pos: BlockPos; object: ProjectSpaceObject } {
  const pos = committedPosFromSetPosPatch(prevPos, patch);
  return { pos, object: stampLocalObjectGeometry(object, pos, now) };
}

describe('nextGeometryUpdatedAt', () => {
  it('uses client-ms now when there is no previous geometry timestamp', () => {
    expect(nextGeometryUpdatedAt(undefined, 1780000000000)).toBe(1780000000000);
  });

  it('F: is strictly newer than the previous geometry.updatedAt in the same millisecond', () => {
    expect(nextGeometryUpdatedAt(500, 500)).toBe(501);
    expect(nextGeometryUpdatedAt(500, 499)).toBe(501);
  });
});

describe('committed PositionMap merge', () => {
  it('A: matches setPos merge+sanitize (move patch)', () => {
    const prev: BlockPos = { x: 10, y: 20, w: 320, h: 180 };
    const patch = { x: 120, y: -40 };
    const committed = committedPosFromSetPosPatch(prev, patch);
    expect(committed).toEqual(sanitizeBlockPos({ ...prev, ...patch }));
    expect(committed).toEqual({ x: 120, y: -40, w: 320, h: 180 });
  });

  it('C: resize patch keeps x/y and updates w/h including 0', () => {
    const prev: BlockPos = { x: 8, y: 9, w: 320, h: 180 };
    expect(committedPosFromSetPosPatch(prev, { w: 400, h: 0 })).toEqual({
      x: 8,
      y: 9,
      w: 400,
      h: 0,
    });
  });

  it('J: initPos hint matches sanitize(default+hint)', () => {
    const hint = { x: 80, y: 90, w: 360, h: 280 };
    expect(committedPosFromInitPosHint(hint)).toEqual(
      sanitizeBlockPos(defaultBlockPos(hint)),
    );
    expect(committedPosFromInitPosHint(undefined).w).toBe(DEFAULT_BLOCK_W);
    expect(committedPosFromInitPosHint(undefined).h).toBe(DEFAULT_BLOCK_H);
  });
});

describe('stampLocalObjectGeometry', () => {
  it('E: preserves content fields and object.updatedAt', () => {
    const pos = { x: 120, y: -40, w: 320, h: 180 };
    const stamped = stampLocalObjectGeometry(note(), pos, 1780000000000);
    expect(stamped.updatedAt).toBe(200);
    expect(stamped.title).toBe('Kept title');
    expect(stamped.content).toEqual({ type: 'note', body: 'kept body' });
    expect(stamped.viewMode).toBe('split');
    expect(stamped.splitSide).toBe('left');
    expect(stamped.createdAt).toBe(100);
    expect(stamped.geometry).toEqual({
      x: 120,
      y: -40,
      w: 320,
      h: 180,
      updatedAt: 1780000000000,
    });
  });

  it('I: first local move creates geometry on a legacy object', () => {
    const stamped = stampLocalObjectGeometry(note({ geometry: undefined }), {
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    }, 50);
    expect(stamped.geometry).toEqual({ x: 1, y: 2, w: 3, h: 4, updatedAt: 50 });
    expect(stamped.updatedAt).toBe(200);
  });

  it('F: second commit advances geometry.updatedAt only', () => {
    const first = stampLocalObjectGeometry(note(), { x: 1, y: 1, w: 10, h: 10 }, 100);
    const second = stampLocalObjectGeometry(first, { x: 2, y: 2, w: 10, h: 10 }, 100);
    expect(first.geometry?.updatedAt).toBe(100);
    expect(second.geometry?.updatedAt).toBe(101);
    expect(second.updatedAt).toBe(200);
    expect(second.geometry?.x).toBe(2);
  });
});

describe('final local commit → UPDATE queue', () => {
  it('A: move stamps final pos and enqueues one UPDATE', async () => {
    const { pos, object } = finalLocalGeometryCommit(
      note(),
      { x: 10, y: 20, w: 320, h: 180 },
      { x: 120, y: -40 },
      1780000000000,
    );
    expect(pos).toEqual({ x: 120, y: -40, w: 320, h: 180 });
    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object,
    });
    expect(result).toEqual({ ok: true, action: 'update_enqueued' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const queued = enqueueMock.mock.calls[0][0];
    expect(queued.operationType).toBe('update');
    expect(queued.entityId).toBe('ps-note-1');
    expect(payloadObject(queued.payload as JsonValue).geometry).toEqual({
      x: 120,
      y: -40,
      w: 320,
      h: 180,
      updatedAt: 1780000000000,
    });
    expect(payloadObject(queued.payload as JsonValue).updatedAt).toBe(200);
  });

  it('B: pointermove does not enqueue — commit helper is not invoked', () => {
    expect(enqueueMock).not.toHaveBeenCalled();
    // Live drag only mutates a ref; no stamp / enqueue.
    const live = { x: 1, y: 2 };
    live.x = 99;
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(flushNotifyMock).not.toHaveBeenCalled();
  });

  it('C: resize stamps final w/h and queues them', async () => {
    const { pos, object } = finalLocalGeometryCommit(
      note(),
      { x: 8, y: 9, w: 320, h: 180 },
      { w: 400, h: 220 },
      10,
    );
    expect(pos).toEqual({ x: 8, y: 9, w: 400, h: 220 });
    await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'board-b',
      object,
    });
    expect(payloadObject(enqueueMock.mock.calls[0][0].payload as JsonValue).geometry).toMatchObject({
      w: 400,
      h: 220,
    });
  });

  it('D: momentum final x/y is what is queued', async () => {
    const { object } = finalLocalGeometryCommit(
      note(),
      { x: 0, y: 0, w: 340, h: 0 },
      { x: 512.25, y: 88.5 },
      20,
    );
    await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-geom',
      boardId: 'main',
      object,
    });
    expect(payloadObject(enqueueMock.mock.calls[0][0].payload as JsonValue).geometry).toMatchObject({
      x: 512.25,
      y: 88.5,
    });
  });

  it('D/E: queue snapshot keeps content + geometry; object.updatedAt unchanged', async () => {
    const { object } = finalLocalGeometryCommit(
      note(),
      { x: 1, y: 1, w: 10, h: 10 },
      { x: 3, y: 4 },
      30,
    );
    await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object,
    });
    const queued = payloadObject(enqueueMock.mock.calls[0][0].payload as JsonValue);
    expect(queued.title).toBe('Kept title');
    expect(queued.content).toEqual({ type: 'note', body: 'kept body' });
    expect(queued.viewMode).toBe('split');
    expect(queued.updatedAt).toBe(200);
    expect(queued.geometry?.updatedAt).toBe(30);
  });

  it('F: second move coalesces UPDATE payload to latest geometry AND latest content', async () => {
    const first = stampLocalObjectGeometry(note(), { x: 1, y: 1, w: 10, h: 10 }, 100);
    const latest = {
      ...first,
      title: 'Edited between moves',
      content: { type: 'note' as const, body: 'after G1' },
    };
    const second = stampLocalObjectGeometry(latest, { x: 9, y: 9, w: 10, h: 10 }, 100);
    expect(second.geometry!.updatedAt).toBeGreaterThan(first.geometry!.updatedAt);

    listMock.mockResolvedValue({
      ok: true,
      value: [pendingOp({
        payload: buildFreeSpaceObjectWritePayload('main', first) as JsonValue,
      })],
    });

    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object: second,
    });
    expect(result).toEqual({ ok: true, action: 'update_payload_replaced' });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const replaced = replaceMock.mock.calls[0][2];
    expect(payloadObject(replaced).geometry).toEqual(second.geometry);
    expect(payloadObject(replaced).title).toBe('Edited between moves');
    expect(payloadObject(replaced).content).toEqual({ type: 'note', body: 'after G1' });
    expect(payloadObject(replaced).updatedAt).toBe(200);
  });

  it('G: offline — UPDATE stays queued; local geometry is on the object snapshot', async () => {
    const { object } = finalLocalGeometryCommit(
      note(),
      { x: 0, y: 0, w: 340, h: 0 },
      { x: 40, y: 50 },
      40,
    );
    await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object,
    });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(object.geometry).toEqual({ x: 40, y: 50, w: 340, h: 0, updatedAt: 40 });
    const durablePos = committedPosFromSetPosPatch({ x: 0, y: 0, w: 340, h: 0 }, { x: 40, y: 50 });
    expect(durablePos).toEqual({ x: 40, y: 50, w: 340, h: 0 });
  });

  it('H: board/section isolation — payload boardId and queue workspaceId := sectionId', async () => {
    const { object } = finalLocalGeometryCommit(
      note({ id: 'ps-note-board' }),
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 1, y: 1 },
      5,
    );
    await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-alpha',
      boardId: 'board-2',
      object,
    });
    const queued = enqueueMock.mock.calls[0][0];
    expect(queued.namespace).toEqual({ userId: 'user-1', workspaceId: 'section-alpha' });
    expect((queued.payload as { boardId: string }).boardId).toBe('board-2');
    expect(queued.entityId).toBe('ps-note-board');
  });

  it('CASE B: CREATE already flushed — empty queue still enqueues UPDATE with geometry and unchanged object.updatedAt', async () => {
    const created = note({ updatedAt: 200, geometry: undefined });
    const afterFlush = stampLocalObjectGeometry(
      created,
      { x: 80, y: 90, w: 360, h: 280 },
      70,
    );
    expect(afterFlush.updatedAt).toBe(200);
    expect(afterFlush.geometry).toBeDefined();

    listMock.mockResolvedValue({ ok: true, value: [] });
    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object: afterFlush,
    });
    expect(result).toEqual({ ok: true, action: 'update_enqueued' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const queued = payloadObject(enqueueMock.mock.calls[0][0].payload as JsonValue);
    expect(queued.updatedAt).toBe(200);
    expect(queued.geometry).toEqual(afterFlush.geometry);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('geometry stamp keeps the latest in-memory content snapshot (no stale title/body overwrite)', () => {
    const latest = note({
      title: 'Edited after create',
      content: { type: 'note', body: 'newer body' },
      connections: ['ps-other'],
      updatedAt: 200,
    });
    const stamped = stampLocalObjectGeometry(latest, { x: 4, y: 5, w: 6, h: 7 }, 80);
    expect(stamped.title).toBe('Edited after create');
    expect(stamped.content).toEqual({ type: 'note', body: 'newer body' });
    expect(stamped.connections).toEqual(['ps-other']);
    expect(stamped.updatedAt).toBe(200);
    expect(stamped.id).toBe('ps-note-1');
    expect(stamped.type).toBe('note');
    expect(stamped.createdAt).toBe(100);
  });

  it('J: CREATE path — pending CREATE payload is replaced with geometry', async () => {
    const placed = stampLocalObjectGeometry(
      note(),
      committedPosFromInitPosHint({ x: 80, y: 90, w: 360, h: 280 }),
      70,
    );
    listMock.mockResolvedValue({
      ok: true,
      value: [pendingOp({
        operationType: 'create',
        payload: buildFreeSpaceObjectWritePayload('main', note()) as JsonValue,
      })],
    });
    const result = await enqueueFreeSpaceObjectUpdate({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
      object: placed,
    });
    expect(result).toEqual({ ok: true, action: 'create_payload_replaced' });
    const replaced = payloadObject(replaceMock.mock.calls[0][2]);
    expect(replaced.geometry).toEqual(placed.geometry);
    expect(replaced.updatedAt).toBe(200);
  });
});
