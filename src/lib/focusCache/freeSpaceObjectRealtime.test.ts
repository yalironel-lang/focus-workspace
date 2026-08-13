// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { Json } from '../database.types';
import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import type { FreeSpaceObjectCloudRow } from './freeSpaceObjectCloud';
import { normalizeFreeSpaceObjectCloudRow } from './freeSpaceObjectCloud';
import {
  applyCloudWinnersToReactState,
  applyFreeSpaceCloudRowsToMountedBoard,
  buildProtectedEntityIds,
  isFreeSpacePullScopeCurrent,
  runFreeSpaceSectionPullCatchUp,
} from './freeSpaceObjectPull';
import {
  normalizeFreeSpaceRealtimePayload,
  subscribeFreeSpaceObjectsRealtime,
} from './freeSpaceObjectRealtime';

const listPendingMock = vi.fn();
const idbGetByIndexMock = vi.fn();
const fetchSectionMock = vi.fn();
const removeChannelMock = vi.fn();
const subscribeStatusHandlers: Array<(status: string) => void> = [];
const channelOnMock = vi.fn();
const channelSubscribeMock = vi.fn();

vi.mock('./pendingOperations', () => ({
  listPendingOperations: (...args: unknown[]) => listPendingMock(...args),
}));

vi.mock('../knowledge/knowledgeJournalIdb', () => ({
  TOMBSTONES_STORE: 'tombstones',
  idbGetByIndex: (...args: unknown[]) => idbGetByIndexMock(...args),
}));

vi.mock('./freeSpaceObjectCloud', async importOriginal => {
  const actual = await importOriginal<typeof import('./freeSpaceObjectCloud')>();
  return {
    ...actual,
    fetchFreeSpaceObjectsForSection: (...args: unknown[]) => fetchSectionMock(...args),
  };
});

vi.mock('../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    channel: vi.fn(() => {
      const ch = {
        on: (...args: unknown[]) => {
          channelOnMock(...args);
          return ch;
        },
        subscribe: (cb: (status: string) => void) => {
          channelSubscribeMock(cb);
          subscribeStatusHandlers.push(cb);
          return ch;
        },
      };
      return ch;
    }),
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  },
}));

function note(id: string, updatedAt: number, body = 'x'): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: 'Note',
    content: { type: 'note', body },
    createdAt: 1,
    updatedAt,
  };
}

function row(partial: {
  id: string;
  board_id: string;
  object: unknown;
  user_id?: string;
  section_id?: string;
  created_at?: string;
  updated_at?: string;
}): FreeSpaceObjectCloudRow {
  return {
    id: partial.id,
    user_id: partial.user_id ?? 'user-1',
    section_id: partial.section_id ?? 'section-1',
    board_id: partial.board_id,
    object: partial.object as Json,
    created_at: partial.created_at ?? 't',
    updated_at: partial.updated_at ?? 't',
  };
}

beforeEach(() => {
  localStorage.clear();
  listPendingMock.mockReset();
  idbGetByIndexMock.mockReset();
  fetchSectionMock.mockReset();
  removeChannelMock.mockReset();
  channelOnMock.mockReset();
  channelSubscribeMock.mockReset();
  subscribeStatusHandlers.length = 0;
  listPendingMock.mockResolvedValue({ ok: true, value: [] });
  idbGetByIndexMock.mockResolvedValue([]);
});

describe('normalizeFreeSpaceRealtimePayload', () => {
  it('15. DELETE event ignored', () => {
    const n = normalizeFreeSpaceRealtimePayload({
      eventType: 'DELETE',
      new: {},
      old: { id: 'a' },
    });
    expect(n.ignored).toBe(true);
    expect(n.ignoreReason).toBe('delete_ignored_pr6');
    expect(n.row).toBeNull();
  });

  it('16. malformed payload ignored safely', () => {
    const n = normalizeFreeSpaceRealtimePayload({
      eventType: 'INSERT',
      new: { not: 'a-row' },
      old: {},
    });
    expect(n.ignored).toBe(true);
    expect(n.ignoreReason).toBe('malformed_payload');
  });

  it('1. INSERT newer cloud object normalizes', () => {
    const n = normalizeFreeSpaceRealtimePayload({
      eventType: 'INSERT',
      new: {
        id: 'a',
        user_id: 'u',
        section_id: 'section-1',
        board_id: 'main',
        object: note('a', 50),
      },
      old: {},
    });
    expect(n.ignored).toBe(false);
    expect(n.row?.id).toBe('a');
  });
});

describe('shared apply via realtime-shaped rows', () => {
  const sectionId = 'section-1';
  const userId = 'user-1';

  function makeApply(opts: {
    rows: FreeSpaceObjectCloudRow[];
    react: ProjectSpaceObject[];
    durable: ProjectSpaceObject[];
    dirty?: string[];
    pendingDeleted?: string[];
    generation?: number;
    boardId?: string;
  }) {
    const dirty = new Set(opts.dirty ?? []);
    const pendingDeleted = new Set(opts.pendingDeleted ?? []);
    let durable = [...opts.durable];
    const boardId = opts.boardId ?? 'main';
    return applyFreeSpaceCloudRowsToMountedBoard({
      sectionId,
      boardId,
      userId,
      rows: opts.rows,
      getDirtyIds: () => dirty,
      getPendingDeletedIds: () => pendingDeleted,
      getReactObjects: () => opts.react,
      loadDurableObjects: () => durable,
      isCurrent: () => true,
    }).then(async result => {
      // Mirror hook: persist already done inside apply; expose durable via LS
      return result;
    });
  }

  beforeEach(() => {
    listPendingMock.mockResolvedValue({ ok: true, value: [] });
    idbGetByIndexMock.mockResolvedValue([]);
  });

  it('1/2. INSERT/UPDATE newer accepted', async () => {
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 200, 'cloud') })],
      react: [note('a', 100)],
      durable: [note('a', 100)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(true);
    expect(result.reactWinners[0]?.updatedAt).toBe(200);
    const key = boardScopedFreeSpaceKeys(sectionId, 'main').objects;
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([
      expect.objectContaining({ id: 'a', updatedAt: 200 }),
    ]);
  });

  it('3. UPDATE older ignored', async () => {
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 50) })],
      react: [note('a', 100)],
      durable: [note('a', 100)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
    expect(result.acceptedCount).toBe(0);
  });

  it('4. UPDATE equal ignored', async () => {
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 100, 'cloud') })],
      react: [note('a', 100, 'local')],
      durable: [note('a', 100, 'local')],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
  });

  it('5. dirty id blocks realtime event', async () => {
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 150) })],
      react: [note('a', 200)],
      durable: [note('a', 100)],
      dirty: ['a'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
  });

  it('6. pendingDeleted blocks', async () => {
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 999) })],
      react: [],
      durable: [note('a', 1)],
      pendingDeleted: ['a'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
  });

  it('7. pending CREATE blocks', async () => {
    listPendingMock.mockResolvedValue({
      ok: true,
      value: [
        {
          entityType: 'free_space_object',
          entityId: 'a',
          operationType: 'create',
        },
      ],
    });
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 999) })],
      react: [note('a', 1)],
      durable: [note('a', 1)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
  });

  it('8. pending UPDATE blocks', async () => {
    listPendingMock.mockResolvedValue({
      ok: true,
      value: [
        {
          entityType: 'free_space_object',
          entityId: 'a',
          operationType: 'update',
        },
      ],
    });
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 999) })],
      react: [note('a', 1)],
      durable: [note('a', 1)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
  });

  it('9. tombstone blocks resurrection', async () => {
    idbGetByIndexMock.mockResolvedValue([
      {
        kind: 'free_space_object',
        objectId: 'a',
        expiresAt: Date.now() + 60_000,
      },
    ]);
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 999) })],
      react: [],
      durable: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
  });

  it('10. non-mounted board event causes zero LS writes', async () => {
    const otherKey = boardScopedFreeSpaceKeys(sectionId, 'board-b').objects;
    localStorage.setItem(otherKey, JSON.stringify([note('b', 100)]));
    const result = await makeApply({
      rows: [row({ id: 'b', board_id: 'board-b', object: note('b', 999, 'cloud') })],
      react: [],
      durable: [],
      boardId: 'main',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
    expect(localStorage.getItem(otherKey)).toBe(JSON.stringify([note('b', 100)]));
  });

  it('11/12. stale section/board scope → zero writes', async () => {
    const captured = { sectionId: 's1', boardId: 'main', generation: 1 };
    expect(
      isFreeSpacePullScopeCurrent(captured, { sectionId: 's2', boardId: 'main', generation: 1 }),
    ).toBe(false);
    expect(
      isFreeSpacePullScopeCurrent(captured, { sectionId: 's1', boardId: 'other', generation: 1 }),
    ).toBe(false);

    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId,
      boardId: 'main',
      userId,
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 200) })],
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [],
      isCurrent: () => false,
    });
    expect(result).toEqual({ ok: false, reason: 'stale_scope' });
    expect(localStorage.length).toBe(0);
  });

  it('13. duplicate event is idempotent', async () => {
    const cloud = row({ id: 'a', board_id: 'main', object: note('a', 200, 'cloud') });
    const first = await makeApply({
      rows: [cloud],
      react: [note('a', 100)],
      durable: [note('a', 100)],
    });
    expect(first.ok && first.persisted).toBe(true);
    const second = await makeApply({
      rows: [cloud],
      react: [note('a', 200, 'cloud')],
      durable: [note('a', 200, 'cloud')],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.persisted).toBe(false);
  });

  it('14. out-of-order older event ignored', async () => {
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 100) })],
      react: [note('a', 300)],
      durable: [note('a', 300)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(false);
  });

  it('17. guard failure → zero writes', async () => {
    listPendingMock.mockResolvedValue({ ok: false, reason: 'transaction_failed' });
    const result = await makeApply({
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 200) })],
      react: [],
      durable: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/guards/);
    expect(localStorage.length).toBe(0);
  });

  it('18. LS persist failure → no React winners', async () => {
    const persistWrite = await import('../freeSpacePersistWrite');
    const spy = vi.spyOn(persistWrite, 'tryPersistLocalStorage').mockReturnValue(false);
    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: 'section-1',
      boardId: 'main',
      userId: 'user-1',
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 200) })],
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [],
      isCurrent: () => true,
    });
    spy.mockRestore();
    // Bound import inside pull module may not see spy — assert either persist_failed or no winners.
    if (!result.ok) {
      expect(result.reason).toBe('persist_failed');
    } else {
      expect(result.persisted).toBe(false);
      expect(result.reactWinners).toEqual([]);
    }
  });
});

describe('applyCloudWinnersToReactState', () => {
  it('Case H: dirty React 200 blocks cloud 150 patch', () => {
    const next = applyCloudWinnersToReactState({
      prev: [note('a', 200, 'local')],
      candidates: [note('a', 150, 'cloud')],
      getDirtyIds: () => ['a'],
      getPendingDeletedIds: () => [],
      pendingCreateEntityIds: [],
      pendingUpdateEntityIds: [],
      tombstoneObjectIds: [],
    });
    expect(next[0]?.updatedAt).toBe(200);
    expect(next[0]?.content).toEqual({ type: 'note', body: 'local' });
  });
});

describe('subscribeFreeSpaceObjectsRealtime lifecycle', () => {
  it('19/20. SUBSCRIBED triggers status callback for catch-up pull', () => {
    const onStatus = vi.fn();
    const onEvent = vi.fn();
    const sub = subscribeFreeSpaceObjectsRealtime({
      sectionId: 'section-1',
      onEvent,
      onStatus,
    });
    expect(channelSubscribeMock).toHaveBeenCalled();
    subscribeStatusHandlers[0]?.('SUBSCRIBED');
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED');
    sub.unsubscribe();
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it('21. channel failure leaves local state untouched (status only)', () => {
    const onStatus = vi.fn();
    subscribeFreeSpaceObjectsRealtime({
      sectionId: 'section-1',
      onEvent: () => undefined,
      onStatus,
    });
    const before = localStorage.length;
    subscribeStatusHandlers[0]?.('CHANNEL_ERROR');
    expect(onStatus).toHaveBeenCalledWith('CHANNEL_ERROR');
    expect(localStorage.length).toBe(before);
  });

  it('22. cleanup unsubscribes old channel', () => {
    const sub = subscribeFreeSpaceObjectsRealtime({
      sectionId: 'section-1',
      onEvent: () => undefined,
      onStatus: () => undefined,
    });
    sub.unsubscribe();
    expect(removeChannelMock).toHaveBeenCalled();
  });
});

describe('runFreeSpaceSectionPullCatchUp', () => {
  it('wires fetch into shared apply', async () => {
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [row({ id: 'a', board_id: 'main', object: note('a', 50) })],
    });
    const result = await runFreeSpaceSectionPullCatchUp({
      sectionId: 'section-1',
      boardId: 'main',
      userId: 'user-1',
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [],
      isCurrent: () => true,
    });
    expect(fetchSectionMock).toHaveBeenCalledWith('section-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(true);
  });
});

describe('normalizeFreeSpaceObjectCloudRow', () => {
  it('rejects incomplete rows', () => {
    expect(normalizeFreeSpaceObjectCloudRow(null)).toBeNull();
    expect(normalizeFreeSpaceObjectCloudRow({ id: 'a' })).toBeNull();
  });
});

// silence unused import if tree-shake complains in some configs
void buildProtectedEntityIds;
