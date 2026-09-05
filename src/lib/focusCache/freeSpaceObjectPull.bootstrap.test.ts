// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boardScopedFreeSpaceKeys, sectionHasLocalFreeSpaceObjectSot, boardHasLocalFreeSpaceObjectSot } from '../freeSpacePersistence';
import { registerFreeSpaceObjectCatchUpLifecycle } from './freeSpaceObjectCatchUpLifecycle';
import {
  applyFreeSpaceCloudRowsToMountedBoard,
  collectFreeSpacePullGuardIds,
  runFreeSpaceSectionPullCatchUp,
} from './freeSpaceObjectPull';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { Json } from '../database.types';

const listPendingMock = vi.fn();
const idbGetByIndexMock = vi.fn();
const fetchSectionMock = vi.fn();

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

function note(id: string, updatedAt: number): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: 'Note',
    content: { type: 'note', body: 'x' },
    createdAt: 1,
    updatedAt,
  };
}

function installTestLocalStorage(): Storage {
  const mem = new Map<string, string>();
  const store: Storage = {
    getItem(key: string) {
      return mem.has(key) ? mem.get(key)! : null;
    },
    setItem(key: string, value: string) {
      mem.set(key, String(value));
    },
    removeItem(key: string) {
      mem.delete(key);
    },
    clear() {
      mem.clear();
    },
    key(i: number) {
      return [...mem.keys()][i] ?? null;
    },
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: store,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      enumerable: true,
      value: store,
      writable: true,
    });
  }
  return store;
}

beforeEach(() => {
  installTestLocalStorage().clear();
  listPendingMock.mockReset();
  idbGetByIndexMock.mockReset();
  fetchSectionMock.mockReset();
  listPendingMock.mockResolvedValue({ ok: true, value: [] });
  idbGetByIndexMock.mockResolvedValue([]);
});

describe('sectionHasLocalFreeSpaceObjectSot', () => {
  it('is false when only boards/prefs exist', () => {
    localStorage.setItem('fw_section_s1_boards_v1', '[]');
    localStorage.setItem('fw_section_s1_free_space_prefs_v1', '{}');
    expect(sectionHasLocalFreeSpaceObjectSot('s1')).toBe(false);
  });

  it('is true for main or board-scoped object keys', () => {
    localStorage.setItem(boardScopedFreeSpaceKeys('s1', 'main').objects, '[]');
    expect(sectionHasLocalFreeSpaceObjectSot('s1')).toBe(true);
    localStorage.clear();
    localStorage.setItem(boardScopedFreeSpaceKeys('s1', 'board-x').objects, '[]');
    expect(sectionHasLocalFreeSpaceObjectSot('s1')).toBe(true);
  });
});

describe('boardHasLocalFreeSpaceObjectSot', () => {
  it('is independent per board', () => {
    localStorage.setItem(boardScopedFreeSpaceKeys('s1', 'board-a').objects, '[]');
    expect(boardHasLocalFreeSpaceObjectSot('s1', 'board-a')).toBe(true);
    expect(boardHasLocalFreeSpaceObjectSot('s1', 'main')).toBe(false);
    expect(boardHasLocalFreeSpaceObjectSot('s1', 'board-b')).toBe(false);
  });
});

describe('registerFreeSpaceObjectCatchUpLifecycle', () => {
  it('mount triggers catch-up without SUBSCRIBED', () => {
    const runCatchUp = vi.fn();
    const life = registerFreeSpaceObjectCatchUpLifecycle({ runCatchUp });
    life.onMount();
    expect(runCatchUp).toHaveBeenCalledTimes(1);
  });

  it('SUBSCRIBED after mount queues another catch-up (serialized by caller)', () => {
    const runCatchUp = vi.fn();
    const life = registerFreeSpaceObjectCatchUpLifecycle({ runCatchUp });
    life.onMount();
    life.onRealtimeStatus('SUBSCRIBED');
    expect(runCatchUp).toHaveBeenCalledTimes(2);
  });

  it('CHANNEL_ERROR triggers at most one error catch-up', () => {
    const runCatchUp = vi.fn();
    const life = registerFreeSpaceObjectCatchUpLifecycle({ runCatchUp });
    life.onRealtimeStatus('CHANNEL_ERROR');
    life.onRealtimeStatus('TIMED_OUT');
    expect(runCatchUp).toHaveBeenCalledTimes(1);
  });
});

describe('collectFreeSpacePullGuardIds fresh-bootstrap', () => {
  it('preserves normal pending/tombstone behavior when guards succeed', async () => {
    listPendingMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op1',
          userId: 'user-1',
          workspaceId: 'section-1',
          entityType: 'free_space_object',
          entityId: 'pending-create',
          operationType: 'create',
          payload: null,
        },
      ],
    });
    idbGetByIndexMock.mockResolvedValue([
      {
        id: 't1',
        kind: 'free_space_object',
        sectionId: 'section-1',
        objectId: 'tomb-1',
        expiresAt: Date.now() + 60_000,
      },
    ]);
    const result = await collectFreeSpacePullGuardIds({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.pendingCreateEntityIds]).toEqual(['pending-create']);
    expect([...result.tombstoneObjectIds]).toEqual(['tomb-1']);
  });

  it('IDB unavailable + no local object SOT → fresh-bootstrap (empty guards ok)', async () => {
    listPendingMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    const result = await collectFreeSpacePullGuardIds({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pendingCreateEntityIds.size).toBe(0);
    expect(result.tombstoneObjectIds.size).toBe(0);
  });

  it('IDB unavailable + existing local object SOT → fail-closed', async () => {
    localStorage.setItem(
      boardScopedFreeSpaceKeys('section-1', 'main').objects,
      JSON.stringify([note('local-only', 100)]),
    );
    listPendingMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    const result = await collectFreeSpacePullGuardIds({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('pending_ops:idb_unavailable');
  });

  it('IDB unavailable: sibling board with SOT does not block empty board bootstrap', async () => {
    localStorage.setItem(
      boardScopedFreeSpaceKeys('section-1', 'board-study').objects,
      JSON.stringify([note('study-local', 100)]),
    );
    listPendingMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    const emptyBoard = await collectFreeSpacePullGuardIds({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'main',
    });
    const populatedBoard = await collectFreeSpacePullGuardIds({
      userId: 'user-1',
      sectionId: 'section-1',
      boardId: 'board-study',
    });
    expect(emptyBoard.ok).toBe(true);
    expect(populatedBoard.ok).toBe(false);
  });

  it('namespace failure (no user) remains fail-closed — not a bootstrap exception', async () => {
    const result = await collectFreeSpacePullGuardIds({
      userId: null,
      sectionId: 'section-1',
      boardId: 'main',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/pending_ops_namespace/);
  });
});

describe('fresh-bootstrap cloud → local SOT', () => {
  it('IDB unavailable + empty local: catch-up persists cloud rows into object SOT', async () => {
    listPendingMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 'cloud-a',
          user_id: 'user-1',
          section_id: 'section-1',
          board_id: 'main',
          object: note('cloud-a', 50) as unknown as Json,
          created_at: 't',
          updated_at: 't',
        },
      ],
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

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(true);
    const raw = localStorage.getItem(boardScopedFreeSpaceKeys('section-1', 'main').objects);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as ProjectSpaceObject[];
    expect(parsed.map(o => o.id)).toContain('cloud-a');
  });

  it('IDB unavailable + local SOT present: apply remains fail-closed (no overwrite)', async () => {
    const local = [note('local-a', 200)];
    localStorage.setItem(
      boardScopedFreeSpaceKeys('section-1', 'main').objects,
      JSON.stringify(local),
    );
    listPendingMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 'cloud-b',
          user_id: 'user-1',
          section_id: 'section-1',
          board_id: 'main',
          object: note('cloud-b', 999) as unknown as Json,
          created_at: 't',
          updated_at: 't',
        },
      ],
    });

    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: 'section-1',
      boardId: 'main',
      userId: 'user-1',
      rows: [
        {
          id: 'cloud-b',
          user_id: 'user-1',
          section_id: 'section-1',
          board_id: 'main',
          object: note('cloud-b', 999) as unknown as Json,
          created_at: 't',
          updated_at: 't',
        },
      ],
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => local,
      loadDurableObjects: () => local,
      isCurrent: () => true,
      pruneCloudAbsences: true,
    });

    expect(result.ok).toBe(false);
    const raw = localStorage.getItem(boardScopedFreeSpaceKeys('section-1', 'main').objects);
    expect(JSON.parse(raw!)[0].id).toBe('local-a');
  });
});
