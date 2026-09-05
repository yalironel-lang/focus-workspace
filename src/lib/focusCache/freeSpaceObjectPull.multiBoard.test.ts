// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  boardScopedFreeSpaceKeys,
  sectionBoardsListKey,
} from '../freeSpacePersistence';
import { pendingNotebookFocusPhase } from '../missionControl/pendingNotebookFocusPhase';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { Json } from '../database.types';
import {
  applyFreeSpaceCloudRowsToMountedBoard,
  diagnoseUnknownCloudBoardIds,
  loadDurableFreeSpaceObjectsForBoard,
  runFreeSpaceSectionPullCatchUp,
} from './freeSpaceObjectPull';

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

function cloudRow(
  sectionId: string,
  boardId: string,
  obj: ProjectSpaceObject,
): {
  id: string;
  user_id: string;
  section_id: string;
  board_id: string;
  object: Json;
  created_at: string;
  updated_at: string;
} {
  return {
    id: obj.id,
    user_id: 'user-1',
    section_id: sectionId,
    board_id: boardId,
    object: obj as unknown as Json,
    created_at: 't',
    updated_at: 't',
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

function readBoardIds(sectionId: string, boardId: string): string[] {
  const raw = localStorage.getItem(boardScopedFreeSpaceKeys(sectionId, boardId).objects);
  if (!raw) return [];
  return (JSON.parse(raw) as ProjectSpaceObject[]).map(o => o.id);
}

const SECTION = 'section-mb';
const BOARDS = {
  main: 'main',
  pr: 'board-pr',
  need: 'board-need',
  study: 'board-study',
} as const;

beforeEach(() => {
  installTestLocalStorage().clear();
  listPendingMock.mockReset();
  idbGetByIndexMock.mockReset();
  fetchSectionMock.mockReset();
  listPendingMock.mockResolvedValue({ ok: true, value: [] });
  idbGetByIndexMock.mockResolvedValue([]);

  localStorage.setItem(
    sectionBoardsListKey(SECTION),
    JSON.stringify([
      { id: 'main', name: 'Main', createdAt: 0, updatedAt: 0 },
      { id: BOARDS.pr, name: 'PR', createdAt: 0, updatedAt: 0 },
      { id: BOARDS.need, name: 'Need', createdAt: 0, updatedAt: 0 },
      { id: BOARDS.study, name: 'Study', createdAt: 0, updatedAt: 0 },
    ]),
  );
});

describe('multi-board section catch-up hydration', () => {
  it('1. section pull with rows on 4 boards hydrates all 4 board SOT keys', async () => {
    const rows = [
      cloudRow(SECTION, BOARDS.main, note('main-a', 10)),
      cloudRow(SECTION, BOARDS.main, note('main-b', 11)),
      cloudRow(SECTION, BOARDS.pr, note('pr-a', 20)),
      cloudRow(SECTION, BOARDS.pr, note('pr-b', 21)),
      cloudRow(SECTION, BOARDS.need, note('need-a', 30)),
      cloudRow(SECTION, BOARDS.need, note('need-b', 31)),
      cloudRow(SECTION, BOARDS.study, note('study-a', 40)),
    ];
    fetchSectionMock.mockResolvedValue({ ok: true, rows });

    const result = await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
      boardId: BOARDS.main,
      userId: 'user-1',
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => loadDurableFreeSpaceObjectsForBoard(SECTION, BOARDS.main),
      isCurrent: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted).toBe(true);
    expect(readBoardIds(SECTION, BOARDS.main).sort()).toEqual(['main-a', 'main-b']);
    expect(readBoardIds(SECTION, BOARDS.pr).sort()).toEqual(['pr-a', 'pr-b']);
    expect(readBoardIds(SECTION, BOARDS.need).sort()).toEqual(['need-a', 'need-b']);
    expect(readBoardIds(SECTION, BOARDS.study)).toEqual(['study-a']);
    expect(result.boardHydrations?.filter(h => h.ok && h.persisted)).toHaveLength(4);
  });

  it('2+3. mounted board hydrates normally; non-mounted persist without mounting React', async () => {
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [
        cloudRow(SECTION, BOARDS.main, note('mounted-obj', 10)),
        cloudRow(SECTION, BOARDS.pr, note('other-obj', 20)),
      ],
    });

    let reactPatched = false;
    const result = await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
      boardId: BOARDS.main,
      userId: 'user-1',
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => {
        reactPatched = true;
        return [];
      },
      loadDurableObjects: () => loadDurableFreeSpaceObjectsForBoard(SECTION, BOARDS.main),
      isCurrent: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reactWinners.map(o => o.id)).toContain('mounted-obj');
    expect(result.reactWinners.map(o => o.id)).not.toContain('other-obj');
    expect(reactPatched).toBe(true);
    expect(readBoardIds(SECTION, BOARDS.pr)).toEqual(['other-obj']);
    // Non-mounted board SOT exists without needing a mount of that boardId.
    expect(localStorage.getItem(boardScopedFreeSpaceKeys(SECTION, BOARDS.pr).objects)).toBeTruthy();
  });

  it('4+5. board A local+IDB fail stays fail-closed; board B empty can bootstrap same pull', async () => {
    localStorage.setItem(
      boardScopedFreeSpaceKeys(SECTION, BOARDS.study).objects,
      JSON.stringify([note('study-local-only', 500)]),
    );
    listPendingMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [
        cloudRow(SECTION, BOARDS.study, note('study-cloud', 999)),
        cloudRow(SECTION, BOARDS.main, note('main-cloud', 10)),
        cloudRow(SECTION, BOARDS.pr, note('pr-cloud', 20)),
      ],
    });

    const result = await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
      boardId: BOARDS.main,
      userId: 'user-1',
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [],
      isCurrent: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readBoardIds(SECTION, BOARDS.study)).toEqual(['study-local-only']);
    expect(readBoardIds(SECTION, BOARDS.main)).toEqual(['main-cloud']);
    expect(readBoardIds(SECTION, BOARDS.pr)).toEqual(['pr-cloud']);
    const studyHydration = result.boardHydrations?.find(h => h.boardId === BOARDS.study);
    expect(studyHydration?.ok).toBe(false);
  });

  it('6. pending CREATE on a board keeps existing protection semantics', async () => {
    listPendingMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op1',
          userId: 'user-1',
          workspaceId: SECTION,
          entityType: 'free_space_object',
          entityId: 'pending-local',
          operationType: 'create',
          payload: null,
        },
      ],
    });
    localStorage.setItem(
      boardScopedFreeSpaceKeys(SECTION, BOARDS.pr).objects,
      JSON.stringify([note('pending-local', 100)]),
    );
    // Cloud absent for pending-local — prune must retain pending CREATE.
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [cloudRow(SECTION, BOARDS.pr, note('pr-cloud', 20))],
    });

    await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
      boardId: BOARDS.main,
      userId: 'user-1',
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [],
      isCurrent: () => true,
    });

    expect(readBoardIds(SECTION, BOARDS.pr).sort()).toEqual(['pending-local', 'pr-cloud']);
  });

  it('7. mount catch-up + second catch-up (SUBSCRIBED) does not duplicate objects', async () => {
    const rows = [
      cloudRow(SECTION, BOARDS.main, note('main-a', 10)),
      cloudRow(SECTION, BOARDS.pr, note('pr-a', 20)),
    ];
    fetchSectionMock.mockResolvedValue({ ok: true, rows });

    const runOnce = () =>
      runFreeSpaceSectionPullCatchUp({
        sectionId: SECTION,
        boardId: BOARDS.main,
        userId: 'user-1',
        getDirtyIds: () => [],
        getPendingDeletedIds: () => [],
        getReactObjects: () => loadDurableFreeSpaceObjectsForBoard(SECTION, BOARDS.main),
        loadDurableObjects: () => loadDurableFreeSpaceObjectsForBoard(SECTION, BOARDS.main),
        isCurrent: () => true,
      });

    const first = await runOnce();
    const second = await runOnce();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(readBoardIds(SECTION, BOARDS.main)).toEqual(['main-a']);
    expect(readBoardIds(SECTION, BOARDS.pr)).toEqual(['pr-a']);
  });

  it('8. after section hydration, switching board finds object locally (MC wait-object clears)', async () => {
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [
        cloudRow(SECTION, BOARDS.main, note('main-a', 10)),
        cloudRow(SECTION, BOARDS.pr, note('pr-target', 20)),
      ],
    });

    await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
      boardId: BOARDS.main,
      userId: 'user-1',
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [],
      isCurrent: () => true,
    });

    const prObjects = loadDurableFreeSpaceObjectsForBoard(SECTION, BOARDS.pr);
    expect(prObjects.map(o => o.id)).toContain('pr-target');

    // Simulate board switch: activeBoardId becomes PR; hasObject reads that board's SOT.
    const phase = pendingNotebookFocusPhase({
      pending: {
        sectionId: SECTION,
        boardId: BOARDS.pr,
        objectId: 'pr-target',
      },
      sectionId: SECTION,
      activeBoardId: BOARDS.pr,
      hasObject: id => prObjects.some(o => o.id === id),
      hasPosition: () => true,
      isFloatingOnCanvas: () => true,
    });
    expect(phase).toBe('ready-to-focus');
    expect(phase).not.toBe('wait-object');
  });

  it('9. single-board section behavior unchanged (only main)', async () => {
    localStorage.setItem(
      sectionBoardsListKey(SECTION),
      JSON.stringify([{ id: 'main', name: 'Main', createdAt: 0, updatedAt: 0 }]),
    );
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [cloudRow(SECTION, 'main', note('only-main', 10))],
    });

    const result = await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
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
    expect(readBoardIds(SECTION, 'main')).toEqual(['only-main']);
    expect(result.boardHydrations).toHaveLength(1);
    expect(result.boardHydrations?.[0]?.boardId).toBe('main');
  });

  it('unknown cloud board ids are diagnosed and skipped (no invented board SOT)', async () => {
    fetchSectionMock.mockResolvedValue({
      ok: true,
      rows: [
        cloudRow(SECTION, BOARDS.main, note('main-a', 10)),
        cloudRow(SECTION, 'board-ghost', note('ghost', 99)),
      ],
    });

    const unknown = diagnoseUnknownCloudBoardIds({
      sectionId: SECTION,
      knownBoardIds: ['main', BOARDS.pr, BOARDS.need, BOARDS.study],
      rows: [
        cloudRow(SECTION, BOARDS.main, note('main-a', 10)),
        cloudRow(SECTION, 'board-ghost', note('ghost', 99)),
      ],
    });
    expect(unknown).toEqual(['board-ghost']);

    await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION,
      boardId: BOARDS.main,
      userId: 'user-1',
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [],
      isCurrent: () => true,
    });

    expect(localStorage.getItem(boardScopedFreeSpaceKeys(SECTION, 'board-ghost').objects)).toBeNull();
    expect(readBoardIds(SECTION, BOARDS.main)).toEqual(['main-a']);
  });

  it('realtime single-board apply still ignores other-board rows', async () => {
    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: SECTION,
      boardId: BOARDS.main,
      userId: 'user-1',
      rows: [
        cloudRow(SECTION, BOARDS.pr, note('pr-only', 20)),
        cloudRow(SECTION, BOARDS.main, note('main-rt', 10)),
      ],
      getDirtyIds: () => [],
      getPendingDeletedIds: () => [],
      getReactObjects: () => [],
      loadDurableObjects: () => [],
      isCurrent: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reactWinners.map(o => o.id)).toEqual(['main-rt']);
    expect(localStorage.getItem(boardScopedFreeSpaceKeys(SECTION, BOARDS.pr).objects)).toBeNull();
  });
});
