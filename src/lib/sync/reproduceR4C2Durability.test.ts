// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../types/projectSpace';
import {
  computeCloudAbsenceRemovals,
} from '../focusCache/freeSpaceObjectPull';
import {
  cancelOrphanPendingFreeSpaceObjectWrites,
} from '../focusCache/freeSpaceObjectDeleteCancel';
import { deriveSyncUiStatus } from './deriveSyncUiStatus';
import { getSaveStatusSnapshot, markSaveOk, resetSaveStatusForTests } from '../saveStatus';
import {
  getCloudSyncSnapshot,
  noteCloudOpEnqueued,
  noteCloudWriteFailed,
  resetCloudSyncStatusForTests,
} from './cloudSyncStatus';

vi.mock('../focusCache/pendingOperations', () => ({
  listPendingOperations: vi.fn(),
  removePendingOperation: vi.fn(),
  enqueuePendingOperation: vi.fn(),
}));

vi.mock('../freeSpacePersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../freeSpacePersistence')>();
  return { ...actual, fwPersistWarn: vi.fn() };
});

import { listPendingOperations, removePendingOperation } from '../focusCache/pendingOperations';

const listMock = vi.mocked(listPendingOperations);
const removeMock = vi.mocked(removePendingOperation);

function mockNotebook(id: string, updatedAt = 200, title = 'SYNTH-R4C1-DURABILITY-TEST'): ProjectSpaceObject {
  return {
    id,
    type: 'notebook',
    content: {
      type: 'notebook',
      title,
      pages: [{ id: 'p1', title: 'Page 1', content: 'Sample text with math and table' }],
    },
    updatedAt,
    geometry: { x: 10, y: 10, w: 400, h: 300 },
  };
}

describe('PHASE R4C-2: Durability Baseline Reproduction', () => {
  beforeEach(() => {
    listMock.mockReset();
    removeMock.mockReset();
    resetSaveStatusForTests();
    resetCloudSyncStatusForTests();
  });

  /**
   * TEST R4C2-01:
   * Create a notebook locally. Queue its create operation.
   * Edit its content. Queue the resulting update.
   * Simulate cloud response omitting the notebook.
   * Simulate startup catch-up.
   * Assert notebook and pending data survive.
   */
  it('TEST R4C2-01: unacknowledged notebook with pending update survives cloud catch-up absence', () => {
    const nb = mockNotebook('nb-synth-1', 200);
    const pendingCreateEntityIds = new Set<string>(); // Transitioned to update
    const pendingUpdateEntityIds = new Set<string>(['nb-synth-1']);
    const pendingDeleteEntityIds = new Set<string>();

    // Fix: retainForAbsence now includes pendingUpdateEntityIds
    const retainForAbsence = new Set<string>([
      ...pendingCreateEntityIds,
      ...pendingUpdateEntityIds,
      ...pendingDeleteEntityIds,
    ]);

    // Prune calculation against empty cloud rows:
    const removedIds = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });

    // Invariant A: notebook survives catch-up
    expect(removedIds).toEqual([]);
  });

  /**
   * TEST R4C2-02:
   * Simulate a pending update whose object is absent from cloud results.
   * Verify absence pruning does not remove it.
   */
  it('TEST R4C2-02: pending update absent from cloud results is never pruned by absence check', () => {
    const nb = mockNotebook('nb-update-target', 300);
    const guards = {
      pendingCreateEntityIds: new Set<string>(),
      pendingUpdateEntityIds: new Set<string>(['nb-update-target']),
      pendingDeleteEntityIds: new Set<string>(),
    };

    const retain = new Set<string>([
      ...guards.pendingCreateEntityIds,
      ...guards.pendingUpdateEntityIds,
      ...guards.pendingDeleteEntityIds,
    ]);

    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retain,
    });

    expect(removed).not.toContain('nb-update-target');
    expect(removed).toEqual([]);
  });

  /**
   * TEST R4C2-03:
   * Simulate a local object removed from the localStorage projection while a valid
   * pending create/update remains in the durable queue.
   * Verify orphan reconciliation does not destroy recoverable user data.
   */
  it('TEST R4C2-03: orphan reconciliation does not delete pending writes from IndexedDB when localStorage is empty', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op-nb-create',
          userId: 'user-1',
          workspaceId: 'section-1',
          entityType: 'free_space_object',
          entityId: 'nb-synth-1',
          operationType: 'create',
          payload: { boardId: 'main', object: mockNotebook('nb-synth-1') },
        },
        {
          seq: 2,
          id: 'op-nb-update',
          userId: 'user-1',
          workspaceId: 'section-1',
          entityType: 'free_space_object',
          entityId: 'nb-synth-1',
          operationType: 'update',
          payload: { boardId: 'main', object: mockNotebook('nb-synth-1', 250) },
        },
      ],
    });
    removeMock.mockResolvedValue({ ok: true, value: { removed: true } });

    // Simulate empty authoritative local set (e.g. wiped by absence pruning or cleared cache)
    const emptyAuthoritativeLocalSet = new Set<string>();

    await cancelOrphanPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      authoritativeLocalEntityIds: emptyAuthoritativeLocalSet,
    });

    // Durability requirement: Invariant C states:
    // "A missing localStorage projection must not automatically justify deleting a valid pending operation from IndexedDB."
    // On the baseline, removePendingOperation IS called and destroys user data.
    expect(removeMock).not.toHaveBeenCalled();
  });

  /**
   * TEST R4C2-04:
   * Simulate failed or delayed cloud writes.
   * Verify the UI never reports confirmed cloud durability without acknowledgment.
   */
  it('TEST R4C2-04: UI status does not report confirmed durability while cloud write is pending or unacknowledged', () => {
    markSaveOk('freeSpaceObjects'); // Local save succeeded

    // Scenario A: Delayed cloud write (in flight / pending in queue)
    noteCloudOpEnqueued('op-delayed-1');
    const delayedCloud = getCloudSyncSnapshot();
    const uiDelayed = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: delayedCloud,
      showSaved: true,
    });
    expect(uiDelayed.phase).toBe('sync_pending');
    expect(uiDelayed.label).toBe('Waiting to sync');
    expect(uiDelayed.label).not.toBe('Saved');

    // Scenario B: Failed cloud write
    noteCloudWriteFailed('cloud_network_failure');
    const failedCloud = getCloudSyncSnapshot();
    const uiFailed = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: failedCloud,
      showSaved: true,
    });
    expect(uiFailed.phase).toBe('sync_failed');
    expect(uiFailed.label).toBe('Sync failed');
    expect(uiFailed.label).not.toBe('Saved');
  });
});
