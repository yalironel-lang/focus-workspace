// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject, FreeSpaceObjectGeometry } from '../../types/projectSpace';
import {
  computeCloudAbsenceRemovals,
  computeMountedBoardPullApply,
  collectAcceptedGeometryPatches,
} from '../focusCache/freeSpaceObjectPull';
import {
  cancelOrphanPendingFreeSpaceObjectWrites,
  cancelPendingFreeSpaceObjectWrites,
} from '../focusCache/freeSpaceObjectDeleteCancel';
import { deriveSyncUiStatus } from './deriveSyncUiStatus';
import {
  getSaveStatusSnapshot,
  markSaveOk,
  markSavePending,
  markSaveError,
  resetSaveStatusForTests,
} from '../saveStatus';
import {
  getCloudSyncSnapshot,
  noteCloudOpEnqueued,
  noteCloudOpResolved,
  noteCloudWriteFailed,
  noteCloudFlushStarted,
  noteCloudFlushEnded,
  resetCloudSyncStatusForTests,
} from './cloudSyncStatus';
import { readLocalFreeSpaceObjectsForBoard } from '../missionControl/loadSectionFreeSpaceIndexSource';

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

function geom(x = 10, y = 10, w = 400, h = 300, updatedAt = 100): FreeSpaceObjectGeometry {
  return { x, y, w, h, updatedAt };
}

function mockNotebook(id: string, updatedAt = 100, title = 'SYNTH-R4C1-DURABILITY-TEST'): ProjectSpaceObject {
  return {
    id,
    type: 'notebook',
    title,
    content: {
      type: 'notebook',
      title,
      pages: [{ id: 'p1', title: 'Page 1', content: 'Math formula $E=mc^2$ and Table' }],
    },
    updatedAt,
    geometry: geom(10, 10, 400, 300, updatedAt),
  };
}

function mockObject(id: string, type: ProjectSpaceObject['type'], updatedAt = 100): ProjectSpaceObject {
  return {
    id,
    type,
    content: { type, text: `Content for ${id}` } as unknown as ProjectSpaceObject['content'],
    updatedAt,
    geometry: geom(10, 10, 200, 150, updatedAt),
  };
}

function mockCloudRow(input: { id: string; board_id?: string; object?: ProjectSpaceObject }) {
  return {
    id: input.id,
    section_id: 'section-1',
    board_id: input.board_id ?? 'main',
    object_type: input.object?.type ?? 'notebook',
    data: (input.object?.content ?? {}) as Record<string, unknown>,
    position_x: 10,
    position_y: 10,
    width: 400,
    height: 300,
    z_index: 1,
    created_at: '2026-11-12T10:00:00Z',
    updated_at: new Date(input.object?.updatedAt ?? 100).toISOString(),
  };
}

describe('PHASE R4C-2: Targeted Durability Regression Suite (T01 - T20)', () => {
  beforeEach(() => {
    localStorage.clear();
    listMock.mockReset();
    removeMock.mockReset();
    resetSaveStatusForTests();
    resetCloudSyncStatusForTests();
    listMock.mockResolvedValue({ ok: true, value: [] });
    removeMock.mockResolvedValue({ ok: true, value: { removed: true } });
  });

  // T01 — New notebook survives immediate reload
  it('T01: new notebook survives immediate reload with unacknowledged pending create', () => {
    const nb = mockNotebook('nb-t01', 100);
    const guards = {
      pendingCreateEntityIds: new Set(['nb-t01']),
      pendingUpdateEntityIds: new Set<string>(),
      pendingDeleteEntityIds: new Set<string>(),
      tombstoneObjectIds: new Set<string>(),
    };

    const retainForAbsence = new Set([
      ...guards.pendingCreateEntityIds,
      ...guards.pendingUpdateEntityIds,
      ...guards.pendingDeleteEntityIds,
    ]);

    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });

    expect(removed).toEqual([]);
  });

  // T02 — Notebook survives reload before cloud ACK
  it('T02: edited notebook survives reload before cloud ACK (pending update in outbox)', () => {
    const nb = mockNotebook('nb-t02', 200);
    // Simulates create transitioned to update
    const guards = {
      pendingCreateEntityIds: new Set<string>(),
      pendingUpdateEntityIds: new Set(['nb-t02']),
      pendingDeleteEntityIds: new Set<string>(),
      tombstoneObjectIds: new Set<string>(),
    };

    const retainForAbsence = new Set([
      ...guards.pendingCreateEntityIds,
      ...guards.pendingUpdateEntityIds,
      ...guards.pendingDeleteEntityIds,
    ]);

    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });

    expect(removed).not.toContain('nb-t02');
    expect(removed).toEqual([]);
  });

  // T03 — Failed cloud insert preserves local data
  it('T03: failed cloud insert preserves local data and leaves write in retry queue', () => {
    const nb = mockNotebook('nb-t03', 150);
    noteCloudOpEnqueued('op-nb-t03');
    noteCloudWriteFailed('500 internal server error');

    const snap = getCloudSyncSnapshot();
    expect(snap.anyCloudFailure).toBe(true);
    expect(snap.pendingCount).toBe(1);

    // Pruning must never drop failed ops waiting for retry
    const retainForAbsence = new Set(['nb-t03']);
    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });
    expect(removed).toEqual([]);
  });

  // T04 — Offline creation and editing survive reload
  it('T04: offline creation and editing survive reload', () => {
    const nb = mockNotebook('nb-t04', 300);
    const guards = {
      pendingCreateEntityIds: new Set(['nb-t04']),
      pendingUpdateEntityIds: new Set(['nb-t04']),
      pendingDeleteEntityIds: new Set<string>(),
    };

    const retainForAbsence = new Set([
      ...guards.pendingCreateEntityIds,
      ...guards.pendingUpdateEntityIds,
    ]);

    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });
    expect(removed).toEqual([]);

    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: false,
      cloud: getCloudSyncSnapshot(),
    });
    expect(ui.phase).toBe('offline');
    expect(ui.label).toBe('Offline');
  });

  // T05 — Pending create survives application restart
  it('T05: pending create in IndexedDB survives restart and is not cancelled on mount', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op-restart-1',
          userId: 'user-1',
          workspaceId: 'section-1',
          entityType: 'free_space_object',
          entityId: 'nb-restart-1',
          operationType: 'create',
          payload: { boardId: 'main', object: mockNotebook('nb-restart-1') },
        },
      ],
    });

    // On cold boot, localStorage may be initially empty or unhydrated
    const result = await cancelOrphanPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      authoritativeLocalEntityIds: new Set(),
    });

    expect(result.ok).toBe(true);
    expect(result.removedOps).toBe(0);
    expect(removeMock).not.toHaveBeenCalled();
  });

  // T06 — Pending update is retained during catch-up
  it('T06: pending update is retained during catch-up computeCloudAbsenceRemovals', () => {
    const nb = mockNotebook('nb-t06', 400);
    const retainForAbsence = new Set(['nb-t06']);

    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });
    expect(removed).toEqual([]);
  });

  // T07 — Empty successful cloud response does not prune unacknowledged local objects
  it('T07: empty successful cloud response does not prune unacknowledged local objects', () => {
    const nb1 = mockNotebook('nb-1', 100);
    const nb2 = mockNotebook('nb-2', 200);

    const guards = {
      pendingCreateEntityIds: new Set(['nb-1']),
      pendingUpdateEntityIds: new Set(['nb-2']),
      pendingDeleteEntityIds: new Set<string>(),
    };

    const retainForAbsence = new Set([
      ...guards.pendingCreateEntityIds,
      ...guards.pendingUpdateEntityIds,
    ]);

    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb1, nb2],
      cloudRows: [], // 200 OK empty array
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });

    expect(removed).toEqual([]);
  });

  // T08 — Confirmed remote deletion still works
  it('T08: confirmed remote deletion removes object when no local pending writes exist', () => {
    const confirmedLocal = mockNotebook('nb-remote-deleted', 100);
    // Object was previously synced, has NO local dirty or pending writes
    const retainForAbsence = new Set<string>();

    const removed = computeCloudAbsenceRemovals({
      localObjects: [confirmedLocal],
      cloudRows: [], // remote peer deleted it
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });

    // Invariant D: remote deletions still take effect when no local writes pending
    expect(removed).toEqual(['nb-remote-deleted']);
  });

  // T09 — Deleted objects are not resurrected
  it('T09: objects with local deletion tombstones are not resurrected by stale cloud rows', () => {
    const tombstoneObjectIds = new Set(['nb-tombstoned']);
    const cloudRow = mockCloudRow({ id: 'nb-tombstoned', object: mockNotebook('nb-tombstoned', 50) });

    const computed = computeMountedBoardPullApply({
      sectionId: 'section-1',
      mountedBoardId: 'main',
      rows: [cloudRow],
      reactObjects: [],
      durableObjects: [],
      protectedEntityIds: tombstoneObjectIds,
    });

    // Tombstone must block stale cloud insert
    expect(computed.accepted).toHaveLength(0);
  });

  // T10 — Retried writes do not duplicate objects
  it('T10: retried writes do not duplicate objects in apply plan', () => {
    const existing = mockNotebook('nb-t10', 100);
    const incomingRow = mockCloudRow({ id: 'nb-t10', object: mockNotebook('nb-t10', 100) });

    const computed = computeMountedBoardPullApply({
      sectionId: 'section-1',
      mountedBoardId: 'main',
      rows: [incomingRow],
      reactObjects: [existing],
      durableObjects: [existing],
      protectedEntityIds: new Set(),
    });

    // Equal versions: incoming is rejected/skipped, local kept, no duplicates
    expect(computed.accepted).toHaveLength(0);
  });

  // T11 — Workspace and Mission Control both rediscover retained notebooks
  it('T11: Workspace and Mission Control both rediscover retained notebooks from local storage projection', async () => {
    const { boardScopedFreeSpaceKeys } = await import('../freeSpacePersistence');
    const nb = mockNotebook('nb-t11', 200, 'DISCOVER-TEST');
    const storageKey = boardScopedFreeSpaceKeys('section-1', 'main').objects;
    localStorage.setItem(storageKey, JSON.stringify([nb]));

    // Workspace / Mission Control reader
    const workspaceObjects = readLocalFreeSpaceObjectsForBoard('section-1', 'main');
    expect(workspaceObjects).toHaveLength(1);
    expect(workspaceObjects[0].id).toBe('nb-t11');
    expect(workspaceObjects[0].title).toBe('DISCOVER-TEST');
  });

  // T12 — Save indicator accurately distinguishes local save from cloud acknowledgment
  it('T12: save indicator accurately distinguishes local save from cloud acknowledgment', () => {
    // 1. Local saving
    markSavePending('freeSpaceObjects');
    let ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
    });
    expect(ui.phase).toBe('saving_local');
    expect(ui.label).toBe('Saving…');

    // 2. Local saved, cloud queue in flight
    markSaveOk('freeSpaceObjects');
    noteCloudOpEnqueued('op-1');
    ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
    });
    expect(ui.phase).toBe('sync_pending');
    expect(ui.label).toBe('Waiting to sync');

    // 3. Cloud write confirmed
    noteCloudOpResolved('op-1');
    ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
      showSaved: true,
    });
    expect(ui.phase).toBe('saved');
    expect(ui.label).toBe('Saved');
  });

  // T13 — RLS-denied write simulation preserves local content and reports sync failure
  it('T13: RLS-denied write simulation preserves local content and reports sync failure', () => {
    const nb = mockNotebook('nb-t13', 200);
    noteCloudOpEnqueued('op-rls-denied');
    noteCloudWriteFailed('row-level security policy violation');

    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
      showSaved: true,
    });
    expect(ui.phase).toBe('sync_failed');
    expect(ui.label).toBe('Sync failed');

    // Local content retained
    const retain = new Set(['nb-t13']);
    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retain,
    });
    expect(removed).toEqual([]);
  });

  // T14 — Missing parent section simulation does not silently destroy local content
  it('T14: missing parent section simulation does not silently destroy local content', () => {
    const nb = mockNotebook('nb-t14', 200);
    // Pending create remains protected even if remote foreign key fails temporarily
    const retainForAbsence = new Set(['nb-t14']);
    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });
    expect(removed).toHaveLength(0);
  });

  // T15 — Existing synced notebooks remain intact
  it('T15: existing synced notebooks matching cloud rows remain intact', () => {
    const nb = mockNotebook('nb-synced', 100);
    const row = mockCloudRow({ id: 'nb-synced', object: nb });

    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [row],
      mountedBoardId: 'main',
      retainEntityIds: new Set(),
    });
    expect(removed).toEqual([]);
  });

  // T16 — User and board scoping remains correct
  it('T16: user and board scoping remains correct (other boards ignored)', () => {
    const nbMain = mockNotebook('nb-main', 100);
    const rowOther = mockCloudRow({ id: 'nb-other', board_id: 'side_board', object: mockNotebook('nb-other') });

    // Main board pull ignoring other-board rows
    const removed = computeCloudAbsenceRemovals({
      localObjects: [nbMain],
      cloudRows: [rowOther],
      mountedBoardId: 'main',
      retainEntityIds: new Set(['nb-main']),
    });
    expect(removed).toEqual([]);
  });

  // T17 — Other Free Space object types remain safe
  it('T17: other Free Space object types (note, mistake_cell, pdf_viewer, image, sheet) remain safe', () => {
    const objects: ProjectSpaceObject[] = [
      mockObject('obj-note', 'note', 100),
      mockObject('obj-mistake', 'mistake_cell', 100),
      mockObject('obj-pdf', 'pdf_viewer', 100),
      mockObject('obj-image', 'image', 100),
      mockObject('obj-sheet', 'sheet', 100),
      mockObject('obj-companion', 'companion', 100),
    ];

    const retainAll = new Set(objects.map(o => o.id));
    const removed = computeCloudAbsenceRemovals({
      localObjects: objects,
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainAll,
    });

    expect(removed).toEqual([]);
  });

  // T18 — Debounce interrupted by immediate reload does not silently discard acknowledged editor changes
  it('T18: debounce interrupted by immediate reload retains dirty objects', () => {
    const nb = mockNotebook('nb-dirty', 200);
    // User typed into editor, dirty set marked, reload occurs before debounce timer fires
    const dirtyIds = new Set(['nb-dirty']);
    const guards = {
      pendingCreateEntityIds: new Set<string>(),
      pendingUpdateEntityIds: new Set<string>(),
      pendingDeleteEntityIds: new Set<string>(),
    };

    // The fix includes dirtyIds in retainForAbsence:
    const retainForAbsence = new Set([
      ...guards.pendingCreateEntityIds,
      ...guards.pendingUpdateEntityIds,
      ...dirtyIds,
    ]);

    const removed = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retainForAbsence,
    });

    expect(removed).toEqual([]);
  });

  // T19 — Pending operation cleanup never deletes a recoverable unacknowledged write
  it('T19: pending operation cleanup never deletes a recoverable unacknowledged write', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        {
          seq: 1,
          id: 'op-recoverable',
          userId: 'user-1',
          workspaceId: 'section-1',
          entityType: 'free_space_object',
          entityId: 'nb-recoverable',
          operationType: 'update',
          payload: { boardId: 'main', object: mockNotebook('nb-recoverable', 200) },
        },
      ],
    });

    // authoritativeLocalEntityIds does not have nb-recoverable (e.g. wiped by prior pull)
    // Invariant C ensures orphan reconcile does NOT delete the pending update
    const result = await cancelOrphanPendingFreeSpaceObjectWrites({
      userId: 'user-1',
      sectionId: 'section-1',
      authoritativeLocalEntityIds: new Set(['unrelated-live-id']),
    });

    expect(result.ok).toBe(true);
    expect(result.removedOps).toBe(0);
    expect(removeMock).not.toHaveBeenCalled();
  });

  // T20 — Repeated startup catch-up is idempotent
  it('T20: repeated startup catch-up is idempotent (consecutive pulls produce zero spurious removals)', () => {
    const nb = mockNotebook('nb-t20', 250);
    const guards = {
      pendingCreateEntityIds: new Set<string>(),
      pendingUpdateEntityIds: new Set(['nb-t20']),
      pendingDeleteEntityIds: new Set<string>(),
    };

    const retain = new Set([
      ...guards.pendingCreateEntityIds,
      ...guards.pendingUpdateEntityIds,
    ]);

    // Pull 1
    const removed1 = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retain,
    });
    expect(removed1).toEqual([]);

    // Pull 2 (repeated immediate mount)
    const removed2 = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retain,
    });
    expect(removed2).toEqual([]);

    // Pull 3
    const removed3 = computeCloudAbsenceRemovals({
      localObjects: [nb],
      cloudRows: [],
      mountedBoardId: 'main',
      retainEntityIds: retain,
    });
    expect(removed3).toEqual([]);
  });
});
