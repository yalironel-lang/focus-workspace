/**
 * Authoritative cloud merge for section board definitions.
 *
 * V1-H1 fail-closed invariant:
 * Never silently purge a local board merely because CREATE enqueue failed,
 * pending-list lookup failed, IndexedDB is unavailable, or cloud absence
 * cannot be distinguished from a pending local creation.
 *
 * CONFIRMED SAFE TO PURGE (pull path only):
 * - cloud fetch succeeded
 * - pending queue lookup succeeded
 * - board absent from cloud
 * - no pending CREATE for board
 * - no pending DELETE for board
 * - this catch-up did not just fail a CREATE enqueue for the board
 *
 * Peer realtime DELETE remains a separate confirmed path.
 */

import { resolveCacheNamespace } from '../focusCacheNamespace';
import { fwPersistWarn } from '../freeSpacePersistence';
import {
  fetchFreeSpaceBoardsForSection,
  type FreeSpaceBoardCloudRow,
} from './freeSpaceBoardCloud';
import { FREE_SPACE_BOARD_ENTITY_TYPE } from './freeSpaceBoardCreateEnqueue';
import { enqueueFreeSpaceBoardCreate } from './freeSpaceBoardCreateEnqueue';
import {
  purgeFreeSpaceBoardLocallySilent,
} from './freeSpaceBoardDeleteCascade';
import { listPendingOperations } from './pendingOperations';
import type { PendingOperation } from './types';

export type FreeSpaceBoard = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
};

export const MAIN_BOARD: FreeSpaceBoard = {
  id: 'main',
  name: 'Main',
  createdAt: 0,
  updatedAt: 0,
};

export function ensureMainBoard(boards: FreeSpaceBoard[]): FreeSpaceBoard[] {
  const rest = boards.filter(b => b.id !== 'main');
  const existingMain = boards.find(b => b.id === 'main');
  const main: FreeSpaceBoard = existingMain
    ? { ...MAIN_BOARD, ...existingMain, id: 'main', name: 'Main', createdAt: 0 }
    : { ...MAIN_BOARD };
  return [main, ...rest];
}

export function boardMergeClock(board: FreeSpaceBoard): number {
  return typeof board.updatedAt === 'number' && Number.isFinite(board.updatedAt)
    ? board.updatedAt
    : board.createdAt;
}

export function cloudRowToLocalBoard(row: FreeSpaceBoardCloudRow): FreeSpaceBoard {
  const created = Date.parse(row.created_at);
  const updated = Date.parse(row.updated_at);
  return {
    id: row.id,
    name: row.name,
    createdAt: row.id === 'main' ? 0 : Number.isFinite(created) ? created : Date.now(),
    updatedAt: Number.isFinite(updated) ? updated : undefined,
  };
}

export function mergeBoardLww(
  local: FreeSpaceBoard,
  cloud: FreeSpaceBoardCloudRow,
): FreeSpaceBoard {
  const cloudBoard = cloudRowToLocalBoard(cloud);
  const localClock = boardMergeClock(local);
  const cloudClock = boardMergeClock(cloudBoard);
  if (cloudClock >= localClock) return cloudBoard;
  return local;
}

export type PendingBoardQueueIds = {
  pendingCreateIds: Set<string>;
  pendingDeleteIds: Set<string>;
};

export function derivePendingBoardQueueIds(ops: PendingOperation[]): PendingBoardQueueIds {
  const pendingCreateIds = new Set<string>();
  const pendingDeleteIds = new Set<string>();
  for (const op of ops) {
    if (op.entityType !== FREE_SPACE_BOARD_ENTITY_TYPE) continue;
    if (op.operationType === 'create') pendingCreateIds.add(op.entityId);
    if (op.operationType === 'delete') pendingDeleteIds.add(op.entityId);
  }
  return { pendingCreateIds, pendingDeleteIds };
}

export type ListPendingBoardQueueIdsResult =
  | ({ ok: true } & PendingBoardQueueIds)
  | { ok: false; reason: string };

/**
 * Pending board CREATE/DELETE ids for this section.
 * Fail-closed: callers must not prune when ok=false.
 */
export async function listPendingBoardQueueIds(
  userId: string,
  sectionId: string,
): Promise<ListPendingBoardQueueIdsResult> {
  const ns = resolveCacheNamespace(userId, sectionId);
  if (!ns.ok) {
    return { ok: false, reason: ns.reason };
  }
  const listed = await listPendingOperations(ns.namespace);
  if (!listed.ok) {
    return { ok: false, reason: listed.reason ?? 'list_failed' };
  }
  const derived = derivePendingBoardQueueIds(listed.value);
  return { ok: true, ...derived };
}

export type BoardPullCatchUpResult = {
  ok: boolean;
  boards: FreeSpaceBoard[];
  legacyUploaded: string[];
  prunedBoardIds: string[];
  /** True when prune was skipped because pending-queue state was uncertain. */
  pruneSkippedUncertain?: boolean;
};

/**
 * Authoritative cloud merge for section board definitions.
 * Local-only legacy boards (not pending delete) upload via enqueue CREATE.
 * Cloud-absent boards may be pruned only when pending state is known and safe.
 */
export async function runFreeSpaceBoardSectionPullCatchUp(input: {
  userId: string;
  sectionId: string;
  localBoards: FreeSpaceBoard[];
}): Promise<BoardPullCatchUpResult> {
  const { userId, sectionId } = input;
  const localBoards = ensureMainBoard(input.localBoards);
  const legacyUploaded: string[] = [];
  const prunedBoardIds: string[] = [];
  const failedCreateIds = new Set<string>();

  const fetch = await fetchFreeSpaceBoardsForSection(sectionId);
  if (!fetch.ok) {
    fwPersistWarn(`board pull failed: ${fetch.reason}`);
    return { ok: false, boards: localBoards, legacyUploaded, prunedBoardIds };
  }

  const pending = await listPendingBoardQueueIds(userId, sectionId);
  const pendingCreateIds = pending.ok ? pending.pendingCreateIds : new Set<string>();
  const pendingDeleteIds = pending.ok ? pending.pendingDeleteIds : new Set<string>();
  if (!pending.ok) {
    fwPersistWarn(
      `board pull pending lookup failed: ${pending.reason}; preserving local boards (fail-closed)`,
    );
  }

  const cloudById = new Map(fetch.rows.map(r => [r.id, r]));
  const localById = new Map(localBoards.map(b => [b.id, b]));
  const merged = new Map<string, FreeSpaceBoard>();

  const mainLocal = localById.get('main') ?? MAIN_BOARD;
  const mainCloud = cloudById.get('main');
  if (mainCloud) {
    merged.set('main', mergeBoardLww(mainLocal, mainCloud));
  } else {
    merged.set('main', mainLocal);
    void enqueueFreeSpaceBoardCreate({
      userId,
      sectionId,
      boardId: 'main',
      name: 'Main',
      createdAt: 0,
      updatedAt: 0,
    });
  }

  for (const row of fetch.rows) {
    if (row.id === 'main') continue;
    const local = localById.get(row.id);
    merged.set(row.id, local ? mergeBoardLww(local, row) : cloudRowToLocalBoard(row));
  }

  for (const board of localBoards) {
    if (board.id === 'main') continue;
    if (merged.has(board.id)) continue;
    if (pendingDeleteIds.has(board.id)) continue;
    if (pendingCreateIds.has(board.id)) {
      merged.set(board.id, board);
      continue;
    }
    // Legacy local board missing from cloud — upload with stable id.
    const enq = await enqueueFreeSpaceBoardCreate({
      userId,
      sectionId,
      boardId: board.id,
      name: board.name,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt ?? board.createdAt,
    });
    if (enq.ok) {
      legacyUploaded.push(board.id);
    } else {
      failedCreateIds.add(board.id);
      fwPersistWarn(
        `board pull CREATE enqueue failed for ${board.id}; preserving local board (fail-closed)`,
      );
    }
    merged.set(board.id, board);
  }

  // Preserve any local board we could not confidently classify when pending is unknown.
  if (!pending.ok) {
    for (const board of localBoards) {
      if (board.id === 'main') continue;
      if (!merged.has(board.id) && !pendingDeleteIds.has(board.id)) {
        merged.set(board.id, board);
      }
    }
    const next = ensureMainBoard([...merged.values()]);
    return {
      ok: true,
      boards: next,
      legacyUploaded,
      prunedBoardIds,
      pruneSkippedUncertain: true,
    };
  }

  for (const board of localBoards) {
    if (board.id === 'main') continue;
    if (cloudById.has(board.id)) continue;
    if (pendingCreateIds.has(board.id)) continue;
    if (pendingDeleteIds.has(board.id)) continue;
    if (legacyUploaded.includes(board.id)) continue;
    // CREATE enqueue failed this round — uncertain; never purge.
    if (failedCreateIds.has(board.id)) continue;
    prunedBoardIds.push(board.id);
    purgeFreeSpaceBoardLocallySilent({ sectionId, boardId: board.id });
    merged.delete(board.id);
  }

  const next = ensureMainBoard([...merged.values()]);
  return { ok: true, boards: next, legacyUploaded, prunedBoardIds };
}
