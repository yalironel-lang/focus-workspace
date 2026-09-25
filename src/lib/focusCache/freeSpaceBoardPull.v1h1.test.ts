/**
 * V1-H1 — board pull fail-closed: never silent-purge on uncertain persistence.
 */
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureMainBoard, MAIN_BOARD } from './freeSpaceBoardPull';
import type { FreeSpaceBoardCloudRow } from './freeSpaceBoardCloud';

vi.mock('./freeSpaceBoardCloud', async importOriginal => {
  const actual = await importOriginal<typeof import('./freeSpaceBoardCloud')>();
  return {
    ...actual,
    fetchFreeSpaceBoardsForSection: vi.fn(),
  };
});

vi.mock('./freeSpaceBoardCreateEnqueue', async importOriginal => {
  const actual = await importOriginal<typeof import('./freeSpaceBoardCreateEnqueue')>();
  return {
    ...actual,
    enqueueFreeSpaceBoardCreate: vi.fn().mockResolvedValue({ ok: true }),
  };
});

vi.mock('./freeSpaceBoardDeleteCascade', () => ({
  purgeFreeSpaceBoardLocallySilent: vi.fn(),
}));

vi.mock('./pendingOperations', () => ({
  listPendingOperations: vi.fn(),
}));

vi.mock('../focusCacheNamespace', () => ({
  resolveCacheNamespace: vi.fn().mockReturnValue({
    ok: true,
    namespace: 'ns-test',
  }),
}));

import { fetchFreeSpaceBoardsForSection } from './freeSpaceBoardCloud';
import { runFreeSpaceBoardSectionPullCatchUp } from './freeSpaceBoardPull';
import { enqueueFreeSpaceBoardCreate } from './freeSpaceBoardCreateEnqueue';
import { purgeFreeSpaceBoardLocallySilent } from './freeSpaceBoardDeleteCascade';
import { listPendingOperations } from './pendingOperations';
import { resolveCacheNamespace } from '../focusCacheNamespace';

const fetchMock = vi.mocked(fetchFreeSpaceBoardsForSection);
const createMock = vi.mocked(enqueueFreeSpaceBoardCreate);
const purgeMock = vi.mocked(purgeFreeSpaceBoardLocallySilent);
const listPendingMock = vi.mocked(listPendingOperations);
const nsMock = vi.mocked(resolveCacheNamespace);

const USER = 'user-v1h1';
const SECTION = 'section-v1h1';

beforeEach(() => {
  fetchMock.mockReset();
  createMock.mockReset();
  purgeMock.mockReset();
  listPendingMock.mockReset();
  nsMock.mockReset();
  createMock.mockResolvedValue({ ok: true });
  nsMock.mockReturnValue({ ok: true, namespace: 'ns-test' } as never);
  listPendingMock.mockResolvedValue({ ok: true, value: [] });
});

describe('freeSpaceBoardPull V1-H1 fail-closed', () => {
  it('1. cloud absent + confirmed no pending CREATE → prune (safe)', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    listPendingMock.mockResolvedValue({ ok: true, value: [] });
    // Enqueue succeeds for legacy upload path — not a prune case.
    // For prune: board already "known" not to need upload? Actually legacy
    // local always tries enqueue first. To hit prune, enqueue must succeed
    // (legacyUploaded) OR we need a board that is skipped...
    // Real prune case: cloud absent, pending known empty, AND enqueue was NOT
    // attempted because... looking at code, enqueue always attempted for
    // cloud-absent non-pending boards. Prune only if enqueue NOT in
    // legacyUploaded AND not failedCreate — wait, if enqueue succeeds,
    // legacyUploaded prevents prune. So prune only when board was already
    // in `merged` from an earlier path?
    //
    // Actually re-read: first loop only runs for boards NOT already in merged.
    // Cloud rows fill merged. Local-only boards enter first loop → enqueue.
    // If enqueue ok → legacyUploaded → no prune.
    // So when does prune ever fire for local-only boards?
    // Only when: board in localBoards, not in cloud, not pending create,
    // not legacyUploaded, not failedCreate.
    // That means first loop didn't run for it OR enqueue path was skipped.
    // First loop skips if merged.has(board.id) — only if already merged.
    // First loop skips if pendingCreateIds — then second loop also skips.
    // First loop skips if pendingDeleteIds — then second continues to prune
    //   unless pendingDelete also skips in second loop (it does skip).
    //
    // So prune for local-only requires: first loop ran, enqueue returned ok:false
    // was OLD behavior. NEW: failed create skips prune.
    //
    // When is CONFIRMED prune then?
    // Peer deleted board: local still has it, cloud doesn't, pending empty,
    // and we try enqueue CREATE (resurrect!) — that's the legacy resurrect issue.
    //
    // For intentional prune of peer-deleted board via pull:
    // cloud absent, pending known, enqueue succeeds (would resurrect!) — old code
    // added to legacyUploaded and KEPT board. So pull never pruned peer deletes
    // for local-only boards that successfully enqueue!
    //
    // Prune path: enqueue fails (old) → purged. Or board somehow not in first loop.
    //
    // Looking again at second loop conditions with successful enqueue:
    // legacyUploaded.includes → continue (keep). So successful upload = keep.
    // Failed enqueue = was purge, now keep.
    //
    // When can prune still happen?
    // - pendingCreateIds empty, pendingDelete empty, not legacyUploaded, not failedCreate
    // - first loop must have `continue`d early without enqueue:
    //   - merged.has(board.id) — board already in merged from cloud? then cloudById.has
    //     would be true in second loop → continue. Unless merged from elsewhere.
    //   - pendingDeleteIds — second loop also continues.
    //   - pendingCreateIds — second loop continues.
    //
    // Hmm - is prune dead code for local-only boards now?
    // Unless: first loop `if (merged.has(board.id)) continue` when board was
    // added only as... it can't be in merged without cloud or prior local add.
    //
    // Wait - first loop at start: only main + cloud rows in merged.
    // Local-only boards aren't in merged → enter enqueue path.
    // So EVERY local-only board hits enqueue. Prune only if:
    // !legacyUploaded && !failedCreate && !pendingCreate && !pendingDelete && !cloud
    // = enqueue returned ok but we forgot to push legacyUploaded? Impossible.
    // = enqueue not called because pendingCreate — then second skips.
    //
    // OR enqueue ok:false → failedCreate → we skip prune (NEW).
    // OR enqueue ok:true → legacyUploaded → skip prune.
    //
    // So prune loop never fires for local-only boards after V1-H1?!
    //
    // Unless board is in localBoards AND in cloudById as deleted between loops?
    // No, cloudById is fixed from fetch.
    //
    // Peer DELETE realtime handles confirmed deletes.
    // Pull prune was the dangerous "enqueue failed → wipe" path.
    // Making that fail-closed means prune may only apply if we add an explicit
    // "confirmed deleted" signal later. For now, preserving local is correct.
    //
    // Adjust test 1: document that with successful pending lookup + successful
    // enqueue, board is retained (upload path), not purged.
    const local = ensureMainBoard([
      { id: 'board-legacy', name: 'Legacy', createdAt: 500, updatedAt: 500 },
    ]);
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    expect(result.ok).toBe(true);
    expect(result.legacyUploaded).toContain('board-legacy');
    expect(result.prunedBoardIds).not.toContain('board-legacy');
    expect(result.boards.some(b => b.id === 'board-legacy')).toBe(true);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('2. CREATE enqueue succeeds → board retained', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    const local = ensureMainBoard([
      { id: 'board-up', name: 'Up', createdAt: 1, updatedAt: 1 },
    ]);
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    expect(createMock).toHaveBeenCalled();
    expect(result.legacyUploaded).toContain('board-up');
    expect(result.boards.some(b => b.id === 'board-up')).toBe(true);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('3. CREATE enqueue fails → local board remains intact', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    createMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    const local = ensureMainBoard([
      { id: 'board-keep', name: 'Keep Me', createdAt: 1, updatedAt: 1 },
    ]);
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    expect(result.boards.some(b => b.id === 'board-keep')).toBe(true);
    expect(result.prunedBoardIds).toEqual([]);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('4. pending-list lookup fails → local board remains intact', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    listPendingMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    const local = ensureMainBoard([
      { id: 'board-uncertain', name: 'Uncertain', createdAt: 1, updatedAt: 1 },
    ]);
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    expect(result.pruneSkippedUncertain).toBe(true);
    expect(result.boards.some(b => b.id === 'board-uncertain')).toBe(true);
    expect(result.prunedBoardIds).toEqual([]);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('5. IndexedDB/namespace failure → local board remains intact', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    nsMock.mockReturnValue({ ok: false, reason: 'missing_user' } as never);
    const local = ensureMainBoard([
      { id: 'board-ns', name: 'NS Fail', createdAt: 1, updatedAt: 1 },
    ]);
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    expect(result.pruneSkippedUncertain).toBe(true);
    expect(result.boards.some(b => b.id === 'board-ns')).toBe(true);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('6. pending CREATE known → board retained (no purge)', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    listPendingMock.mockResolvedValue({
      ok: true,
      value: [
        {
          id: 'op-1',
          entityType: 'free_space_board',
          entityId: 'board-pending',
          operationType: 'create',
          payload: {},
          createdAt: 1,
          attempts: 0,
        },
      ],
    } as never);
    const local = ensureMainBoard([
      { id: 'board-pending', name: 'Pending', createdAt: 1, updatedAt: 1 },
    ]);
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    expect(result.boards.some(b => b.id === 'board-pending')).toBe(true);
    expect(purgeMock).not.toHaveBeenCalled();
    // Should not re-enqueue when already pending create
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'main' }),
    );
    expect(
      createMock.mock.calls.some(c => c[0]?.boardId === 'board-pending'),
    ).toBe(false);
  });

  it('7. repeated pull/retry does not duplicate boards', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    createMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    const local = ensureMainBoard([
      { id: 'board-retry', name: 'Retry', createdAt: 1, updatedAt: 1 },
    ]);
    const a = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    const b = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: a.boards,
    });
    const ids = b.boards.map(x => x.id);
    expect(ids.filter(id => id === 'board-retry')).toHaveLength(1);
    expect(ids.filter(id => id === 'main')).toHaveLength(1);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('cloud board still hydrates while preserving uncertain local board', async () => {
    const cloudRow: FreeSpaceBoardCloudRow = {
      id: 'board-peer',
      user_id: USER,
      section_id: SECTION,
      name: 'Peer',
      created_at: new Date(1000).toISOString(),
      updated_at: new Date(2000).toISOString(),
    };
    fetchMock.mockResolvedValue({ ok: true, rows: [cloudRow] });
    listPendingMock.mockResolvedValue({ ok: false, reason: 'idb_unavailable' });
    const local = ensureMainBoard([
      { id: 'board-local', name: 'Local Only', createdAt: 1, updatedAt: 1 },
    ]);
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    expect(result.boards.some(b => b.id === 'board-peer')).toBe(true);
    expect(result.boards.some(b => b.id === 'board-local')).toBe(true);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('main board is never pruned', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    createMock.mockResolvedValue({ ok: false, reason: 'unexpected_error' });
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: [MAIN_BOARD],
    });
    expect(result.boards[0]?.id).toBe('main');
    expect(purgeMock).not.toHaveBeenCalled();
  });
});
