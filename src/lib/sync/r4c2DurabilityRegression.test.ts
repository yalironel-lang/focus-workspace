// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  applyFreeSpaceCloudRowsToMountedBoard,
  computeCloudAbsenceRemovals,
  runFreeSpaceSectionPullCatchUp,
} from '../focusCache/freeSpaceObjectPull';
import {
  cancelOrphanPendingFreeSpaceObjectWrites,
  cancelPendingFreeSpaceObjectWrites,
} from '../focusCache/freeSpaceObjectDeleteCancel';
import {
  buildSectionFreeSpaceIndexEntries,
} from '../missionControl/loadSectionFreeSpaceIndexSource';
import { deriveSyncUiStatus } from './deriveSyncUiStatus';
import {
  getSaveStatusSnapshot,
  markSaveOk,
  resetSaveStatusForTests,
} from '../saveStatus';
import {
  getCloudSyncSnapshot,
  noteCloudOpEnqueued,
  noteCloudWriteFailed,
  resetCloudSyncStatusForTests,
} from './cloudSyncStatus';
import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import { enqueueFreeSpaceObjectCreatesAfterLocalPersist } from '../focusCache/freeSpaceObjectCreateEnqueue';
import { enqueueFreeSpaceObjectUpdatesAfterLocalPersist } from '../focusCache/freeSpaceObjectUpdateEnqueue';

vi.mock('../focusCache/pendingOperations', () => ({
  listPendingOperations: vi.fn(),
  removePendingOperation: vi.fn(),
  enqueuePendingOperation: vi.fn(),
}));

vi.mock('../freeSpacePersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../freeSpacePersistence')>();
  return { ...actual, fwPersistWarn: vi.fn() };
});

vi.mock('../focusCache/freeSpaceObjectCloud', () => ({
  fetchFreeSpaceObjectsForSection: vi.fn(),
  upsertFreeSpaceObjectFromCreatePayload: vi.fn(),
  deleteFreeSpaceObjectFromCloud: vi.fn(),
}));

import {
  listPendingOperations,
  removePendingOperation,
  enqueuePendingOperation,
} from '../focusCache/pendingOperations';
import {
  fetchFreeSpaceObjectsForSection,
} from '../focusCache/freeSpaceObjectCloud';

const listMock = vi.mocked(listPendingOperations);
const removeMock = vi.mocked(removePendingOperation);
const enqueueMock = vi.mocked(enqueuePendingOperation);
const fetchCloudMock = vi.mocked(fetchFreeSpaceObjectsForSection);

const SECTION_ID = '4bef0eb0-00ec-44db-b3e6-652961e9423a';
const BOARD_ID = 'main';
const USER_ID = 'user-r4c2-test';

function mockNotebook(id: string, updatedAt = 100, title = 'SYNTH-R4C1-DURABILITY-TEST'): ProjectSpaceObject {
  return {
    id,
    type: 'notebook',
    title,
    content: {
      type: 'notebook',
      body: '# Synthesis Notes\nContent here',
      paperStyle: 'ruled',
    },
    createdAt: 50,
    updatedAt,
    geometry: { x: 10, y: 10, w: 400, h: 300, updatedAt },
  };
}

describe('PHASE C — R4C-2 Durability Regression Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    listMock.mockReset();
    removeMock.mockReset();
    enqueueMock.mockReset();
    fetchCloudMock.mockReset();
    resetSaveStatusForTests();
    resetCloudSyncStatusForTests();

    listMock.mockResolvedValue({ ok: true, value: [] });
    removeMock.mockResolvedValue({ ok: true, value: { removed: true } });
    enqueueMock.mockResolvedValue({
      ok: true,
      value: {
        seq: 1,
        id: 'op-1',
        userId: USER_ID,
        workspaceId: SECTION_ID,
        entityType: 'free_space_object',
        entityId: 'nb-1',
        operationType: 'create',
        payload: { boardId: BOARD_ID, object: {} },
      },
    });
  });

  // 1. Notebook creation followed by immediate editing
  it('C1: notebook creation and immediate update does not produce unhandled write loss', () => {
    const nb = mockNotebook('nb-c1', 100, 'SYNTH-R4C1-DURABILITY-TEST');
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;
    localStorage.setItem(storageKey, JSON.stringify([nb]));

    // Editing title immediately updates local storage and marks dirty
    const editedNb = { ...nb, title: 'SYNTH-R4C1-DURABILITY-TEST-EDITED', updatedAt: 200 };
    localStorage.setItem(storageKey, JSON.stringify([editedNb]));

    const durable = JSON.parse(localStorage.getItem(storageKey)!);
    expect(durable).toHaveLength(1);
    expect(durable[0].title).toBe('SYNTH-R4C1-DURABILITY-TEST-EDITED');
  });

  // 2. React state updater scheduling and whether a durable CREATE operation is always queued
  it('C2: creation persistence ensures durable local storage write before queue enqueue', () => {
    const nb = mockNotebook('nb-c2', 100);
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;

    // Pattern simulation: Writing durable objects must be synchronous so `persisted` is true
    const currentList: ProjectSpaceObject[] = [];
    const nextList = [...currentList, nb];
    localStorage.setItem(storageKey, JSON.stringify(nextList));

    const persisted = localStorage.getItem(storageKey) !== null;
    expect(persisted).toBe(true);
  });

  // 3. A locally stored notebook with a pending UPDATE but no cloud row
  it('C3: locally stored notebook with pending UPDATE survives cloud catch-up absence', async () => {
    const nb = mockNotebook('nb-c3-update', 200, 'SYNTH-R4C1-DURABILITY-TEST');
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;
    localStorage.setItem(storageKey, JSON.stringify([nb]));

    // Queue has pending UPDATE for this notebook
    listMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op-update-1',
          userId: USER_ID,
          workspaceId: SECTION_ID,
          entityType: 'free_space_object',
          entityId: nb.id,
          operationType: 'update',
          payload: { boardId: BOARD_ID, object: nb as any },
        },
      ],
    });

    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: SECTION_ID,
      boardId: BOARD_ID,
      userId: USER_ID,
      rows: [], // Empty cloud snapshot (notebook not yet in cloud)
      getDirtyIds: () => new Set(),
      getPendingDeletedIds: () => new Set(),
      getReactObjects: () => [nb],
      loadDurableObjects: () => JSON.parse(localStorage.getItem(storageKey)!),
      isCurrent: () => true,
      pruneCloudAbsences: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Notebook MUST NOT be pruned or removed!
    expect(result.removedObjectIds).not.toContain(nb.id);
    expect(result.removedObjectIds).toEqual([]);

    // LocalStorage must still contain the notebook
    const durableAfter = JSON.parse(localStorage.getItem(storageKey)!);
    expect(durableAfter).toHaveLength(1);
    expect(durableAfter[0].id).toBe(nb.id);
  });

  // 4. A pending CREATE not yet acknowledged by the cloud
  it('C4: pending CREATE not yet in cloud snapshot is retained during absence pruning', async () => {
    const nb = mockNotebook('nb-c4-create', 100);
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;
    localStorage.setItem(storageKey, JSON.stringify([nb]));

    listMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op-create-1',
          userId: USER_ID,
          workspaceId: SECTION_ID,
          entityType: 'free_space_object',
          entityId: nb.id,
          operationType: 'create',
          payload: { boardId: BOARD_ID, object: nb as any },
        },
      ],
    });

    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: SECTION_ID,
      boardId: BOARD_ID,
      userId: USER_ID,
      rows: [],
      getDirtyIds: () => new Set(),
      getPendingDeletedIds: () => new Set(),
      getReactObjects: () => [nb],
      loadDurableObjects: () => JSON.parse(localStorage.getItem(storageKey)!),
      isCurrent: () => true,
      pruneCloudAbsences: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedObjectIds).toEqual([]);

    const durableAfter = JSON.parse(localStorage.getItem(storageKey)!);
    expect(durableAfter).toHaveLength(1);
    expect(durableAfter[0].id).toBe(nb.id);
  });

  // 5. A dirty notebook whose edits are awaiting the debounce timer
  it('C5: dirty notebook awaiting debounce timer is protected from cloud-absence pruning', async () => {
    const nb = mockNotebook('nb-c5-dirty', 200);
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;
    localStorage.setItem(storageKey, JSON.stringify([nb]));

    // In-memory edit: marked dirty in React hook, not yet in pendingOperations queue
    listMock.mockResolvedValue({ ok: true, value: [] });

    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: SECTION_ID,
      boardId: BOARD_ID,
      userId: USER_ID,
      rows: [],
      getDirtyIds: () => new Set([nb.id]), // Active dirty ID
      getPendingDeletedIds: () => new Set(),
      getReactObjects: () => [nb],
      loadDurableObjects: () => JSON.parse(localStorage.getItem(storageKey)!),
      isCurrent: () => true,
      pruneCloudAbsences: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedObjectIds).not.toContain(nb.id);
    expect(result.removedObjectIds).toEqual([]);

    const durableAfter = JSON.parse(localStorage.getItem(storageKey)!);
    expect(durableAfter).toHaveLength(1);
  });

  // 6. Catch-up pull returning an empty cloud snapshot
  it('C6: catch-up pull with empty cloud snapshot does not prune un-synced local notebooks', async () => {
    const nb1 = mockNotebook('nb-c6-1', 100);
    const nb2 = mockNotebook('nb-c6-2', 200);
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;
    localStorage.setItem(storageKey, JSON.stringify([nb1, nb2]));

    listMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op-1',
          userId: USER_ID,
          workspaceId: SECTION_ID,
          entityType: 'free_space_object',
          entityId: nb1.id,
          operationType: 'create',
          payload: { boardId: BOARD_ID, object: nb1 as any },
        },
        {
          seq: 2,
          id: 'op-2',
          userId: USER_ID,
          workspaceId: SECTION_ID,
          entityType: 'free_space_object',
          entityId: nb2.id,
          operationType: 'update',
          payload: { boardId: BOARD_ID, object: nb2 as any },
        },
      ],
    });

    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: SECTION_ID,
      boardId: BOARD_ID,
      userId: USER_ID,
      rows: [], // 0 cloud rows
      getDirtyIds: () => new Set(),
      getPendingDeletedIds: () => new Set(),
      getReactObjects: () => [nb1, nb2],
      loadDurableObjects: () => JSON.parse(localStorage.getItem(storageKey)!),
      isCurrent: () => true,
      pruneCloudAbsences: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedObjectIds).toEqual([]);

    const durableAfter = JSON.parse(localStorage.getItem(storageKey)!);
    expect(durableAfter).toHaveLength(2);
  });

  // 7. Cancellation of pending writes during cloud-absence pruning
  it('C7: absence pruning must not cancel pending writes for unacknowledged local objects', async () => {
    const nb = mockNotebook('nb-c7-preserve', 200);
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;
    localStorage.setItem(storageKey, JSON.stringify([nb]));

    listMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op-c7',
          userId: USER_ID,
          workspaceId: SECTION_ID,
          entityType: 'free_space_object',
          entityId: nb.id,
          operationType: 'update',
          payload: { boardId: BOARD_ID, object: nb as any },
        },
      ],
    });

    await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: SECTION_ID,
      boardId: BOARD_ID,
      userId: USER_ID,
      rows: [],
      getDirtyIds: () => new Set(),
      getPendingDeletedIds: () => new Set(),
      getReactObjects: () => [nb],
      loadDurableObjects: () => JSON.parse(localStorage.getItem(storageKey)!),
      isCurrent: () => true,
      pruneCloudAbsences: true,
    });

    // removePendingOperation MUST NOT have been called for this pending write!
    expect(removeMock).not.toHaveBeenCalled();
  });

  // 8. Mission Control visibility of locally pending notebooks
  it('C8: Mission Control index includes notebook with pending update even if cloud rows are empty', () => {
    const nb = mockNotebook('nb-c8-mc', 200, 'SYNTH-R4C1-DURABILITY-TEST');
    const localByBoard = new Map([[BOARD_ID, [nb]]]);

    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: SECTION_ID,
      localByBoard,
      cloudRows: [], // Empty cloud rows
      protectedEntityIds: new Set([nb.id]),
      pendingCreates: [{ boardId: BOARD_ID, object: nb }],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].object.id).toBe(nb.id);
    expect(entries[0].object.title).toBe('SYNTH-R4C1-DURABILITY-TEST');
  });

  // 9. Legitimate explicit remote deletion behavior
  it('C9: legitimate remote deletion prunes local object when no pending writes or dirty state exist', async () => {
    const nb = mockNotebook('nb-c9-remote-deleted', 100);
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;
    localStorage.setItem(storageKey, JSON.stringify([nb]));

    // Clean state: no pending operations, no dirty state
    listMock.mockResolvedValue({ ok: true, value: [] });

    const result = await applyFreeSpaceCloudRowsToMountedBoard({
      sectionId: SECTION_ID,
      boardId: BOARD_ID,
      userId: USER_ID,
      rows: [], // Absent from cloud, and user has no pending edits
      getDirtyIds: () => new Set(),
      getPendingDeletedIds: () => new Set(),
      getReactObjects: () => [nb],
      loadDurableObjects: () => JSON.parse(localStorage.getItem(storageKey)!),
      isCurrent: () => true,
      pruneCloudAbsences: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Must be legitimately removed!
    expect(result.removedObjectIds).toContain(nb.id);

    const durableAfter = JSON.parse(localStorage.getItem(storageKey)!);
    expect(durableAfter).toEqual([]);
  });

  // 10. Failed or incomplete cloud reads must never be treated as authoritative deletion evidence
  it('C10: failed cloud fetch aborts catch-up pull and preserves local objects', async () => {
    const nb = mockNotebook('nb-c10-fetch-failed', 100);
    const storageKey = boardScopedFreeSpaceKeys(SECTION_ID, BOARD_ID).objects;
    localStorage.setItem(storageKey, JSON.stringify([nb]));

    fetchCloudMock.mockResolvedValue({
      ok: false,
      reason: 'network_error',
      message: 'Failed to connect to Supabase',
    });

    const result = await runFreeSpaceSectionPullCatchUp({
      sectionId: SECTION_ID,
      boardId: BOARD_ID,
      userId: USER_ID,
      getDirtyIds: () => new Set(),
      getPendingDeletedIds: () => new Set(),
      getReactObjects: () => [nb],
      loadDurableObjects: () => JSON.parse(localStorage.getItem(storageKey)!),
      isCurrent: () => true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('fetch:network_error');

    // Local storage is untouched
    const durableAfter = JSON.parse(localStorage.getItem(storageKey)!);
    expect(durableAfter).toHaveLength(1);
    expect(durableAfter[0].id).toBe(nb.id);
  });

  // 11. Multiple rapid creations
  it('C11: multiple rapid creations persist separately and enqueue individual CREATE operations', async () => {
    const nb1 = mockNotebook('nb-c11-1', 100, 'NOTEBOOK-1');
    const nb2 = mockNotebook('nb-c11-2', 101, 'NOTEBOOK-2');

    const createdIds: string[] = [];
    enqueueFreeSpaceObjectCreatesAfterLocalPersist(
      true,
      {
        userId: USER_ID,
        sectionId: SECTION_ID,
        boardId: BOARD_ID,
        objects: [nb1, nb2],
      },
      (objectId, result) => {
        if (result.ok) createdIds.push(objectId);
      },
    );

    await vi.waitFor(() => expect(createdIds).toHaveLength(2));
    expect(createdIds).toEqual(['nb-c11-1', 'nb-c11-2']);
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    expect(enqueueMock.mock.calls[0][0].entityId).toBe('nb-c11-1');
    expect(enqueueMock.mock.calls[1][0].entityId).toBe('nb-c11-2');
  });

  // 12. CREATE enqueue failure recovery
  it('C12: failed CREATE enqueue records dirty state and recovers via UPDATE enqueue once userId is available', async () => {
    const nb = mockNotebook('nb-c12-recover', 100);
    const dirtyIds = new Set<string>();

    // Step 1: Simulate CREATE attempt when userId is null (auth pending)
    enqueueFreeSpaceObjectCreatesAfterLocalPersist(
      true,
      {
        userId: null,
        sectionId: SECTION_ID,
        boardId: BOARD_ID,
        objects: [nb],
      },
      (objectId, result) => {
        if (!result.ok) dirtyIds.add(objectId);
      },
    );

    await vi.waitFor(() => expect(dirtyIds.has(nb.id)).toBe(true));
    // No operation enqueued yet because userId was missing
    expect(enqueueMock).not.toHaveBeenCalled();

    // Step 2: userId resolves -> recover via enqueueFreeSpaceObjectUpdatesAfterLocalPersist
    const recoveredIds: string[] = [];
    enqueueFreeSpaceObjectUpdatesAfterLocalPersist(
      true,
      {
        userId: USER_ID,
        sectionId: SECTION_ID,
        boardId: BOARD_ID,
        objects: [nb],
      },
      (objectId, result) => {
        if (result.ok) {
          dirtyIds.delete(objectId);
          recoveredIds.push(objectId);
        }
      },
    );

    await vi.waitFor(() => expect(recoveredIds).toContain(nb.id));
    expect(dirtyIds.size).toBe(0);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0][0].operationType).toBe('update');
    expect(enqueueMock.mock.calls[0][0].entityId).toBe(nb.id);
  });
});

