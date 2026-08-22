import { useState, useCallback, useEffect, useRef } from 'react';
import { resolveCacheNamespace } from '../lib/focusCacheNamespace';
import { enqueueFreeSpaceBoardCreate } from '../lib/focusCache/freeSpaceBoardCreateEnqueue';
import { enqueueFreeSpaceBoardDelete } from '../lib/focusCache/freeSpaceBoardDeleteEnqueue';
import {
  purgeFreeSpaceBoardLocally,
  purgeFreeSpaceBoardLocallySilent,
} from '../lib/focusCache/freeSpaceBoardDeleteCascade';
import {
  cloudRowToLocalBoard,
  ensureMainBoard,
  runFreeSpaceBoardSectionPullCatchUp,
  type FreeSpaceBoard,
} from '../lib/focusCache/freeSpaceBoardPull';
import { subscribeFreeSpaceBoardsRealtime } from '../lib/focusCache/freeSpaceBoardRealtime';
import { enqueueFreeSpaceBoardUpdate } from '../lib/focusCache/freeSpaceBoardUpdateEnqueue';
import {
  invalidateFreeSpaceAutoFlushScope,
  registerFreeSpaceAutoFlushScope,
  requestFreeSpacePendingFlushNow,
} from '../lib/focusCache/freeSpaceObjectAutoFlush';
import { enqueueFreeSpaceObjectDeletesAfterLocalDelete } from '../lib/focusCache/freeSpaceObjectDeleteEnqueue';
import { sectionBoardsListKey, sectionActiveBoardKey, fwPersistWarn } from '../lib/freeSpacePersistence';

export type { FreeSpaceBoard };

function uid(): string {
  return `board-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadBoards(sectionId: string): FreeSpaceBoard[] {
  if (!sectionId) return ensureMainBoard([]);
  try {
    const raw = localStorage.getItem(sectionBoardsListKey(sectionId));
    if (!raw) return ensureMainBoard([]);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ensureMainBoard([]);
    const boards: FreeSpaceBoard[] = parsed.filter(
      (b): b is FreeSpaceBoard =>
        b &&
        typeof b === 'object' &&
        typeof b.id === 'string' &&
        b.id.trim() &&
        typeof b.name === 'string' &&
        typeof b.createdAt === 'number',
    );
    return ensureMainBoard(boards);
  } catch (e) {
    fwPersistWarn(`Failed to load boards for section "${sectionId}": ${String(e)}`);
    return ensureMainBoard([]);
  }
}

function saveBoards(sectionId: string, boards: FreeSpaceBoard[]): void {
  if (!sectionId) return;
  try {
    localStorage.setItem(sectionBoardsListKey(sectionId), JSON.stringify(ensureMainBoard(boards)));
  } catch {
    /* quota */
  }
}

function loadActiveBoard(sectionId: string, boards: FreeSpaceBoard[]): string {
  if (!sectionId) return 'main';
  try {
    const raw = localStorage.getItem(sectionActiveBoardKey(sectionId));
    if (!raw) return 'main';
    const id = JSON.parse(raw);
    if (typeof id === 'string' && boards.some(b => b.id === id)) return id;
    return 'main';
  } catch {
    return 'main';
  }
}

function saveActiveBoard(sectionId: string, boardId: string): void {
  if (!sectionId) return;
  try {
    localStorage.setItem(sectionActiveBoardKey(sectionId), JSON.stringify(boardId));
  } catch {
    /* quota */
  }
}

export interface SectionFreeSpaceBoardsState {
  boards: FreeSpaceBoard[];
  activeBoardId: string;
  setActiveBoardId: (id: string) => void;
  createBoard: (name: string) => FreeSpaceBoard;
  renameBoard: (id: string, name: string) => void;
  deleteBoard: (id: string) => void;
}

export function useSectionFreeSpaceBoards(
  sectionId: string,
  userId: string | null = null,
): SectionFreeSpaceBoardsState {
  const [boards, setBoards] = useState<FreeSpaceBoard[]>(() => loadBoards(sectionId));
  const [activeBoardId, setActiveBoardIdRaw] = useState<string>(() => {
    const loaded = loadBoards(sectionId);
    return loadActiveBoard(sectionId, loaded);
  });
  const boardsRef = useRef(boards);
  boardsRef.current = boards;

  const [syncedSectionId, setSyncedSectionId] = useState(sectionId);
  if (sectionId !== syncedSectionId) {
    setSyncedSectionId(sectionId);
    const loaded = loadBoards(sectionId);
    setBoards(loaded);
    setActiveBoardIdRaw(loadActiveBoard(sectionId, loaded));
  }

  const persistAndSetBoards = useCallback(
    (next: FreeSpaceBoard[]) => {
      const normalized = ensureMainBoard(next);
      saveBoards(sectionId, normalized);
      setBoards(normalized);
      return normalized;
    },
    [sectionId],
  );

  const setActiveBoardId = useCallback(
    (id: string) => {
      setActiveBoardIdRaw(id);
      saveActiveBoard(sectionId, id);
    },
    [sectionId],
  );

  const createBoard = useCallback(
    (name: string): FreeSpaceBoard => {
      const now = Date.now();
      const board: FreeSpaceBoard = {
        id: uid(),
        name: name.trim() || 'Space',
        createdAt: now,
        updatedAt: now,
      };
      persistAndSetBoards([...boardsRef.current, board]);
      setActiveBoardIdRaw(board.id);
      saveActiveBoard(sectionId, board.id);
      void enqueueFreeSpaceBoardCreate({
        userId,
        sectionId,
        boardId: board.id,
        name: board.name,
        createdAt: board.createdAt,
        updatedAt: now,
      });
      return board;
    },
    [persistAndSetBoards, sectionId, userId],
  );

  const renameBoard = useCallback(
    (id: string, name: string) => {
      if (id === 'main') return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const now = Date.now();
      const existing = boardsRef.current.find(b => b.id === id);
      persistAndSetBoards(
        boardsRef.current.map(b =>
          b.id === id ? { ...b, name: trimmed, updatedAt: now } : b,
        ),
      );
      void enqueueFreeSpaceBoardUpdate({
        userId,
        sectionId,
        boardId: id,
        name: trimmed,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },
    [persistAndSetBoards, sectionId, userId],
  );

  const deleteBoard = useCallback(
    (id: string) => {
      if (id === 'main') return;
      void (async () => {
        const { objectEntityIds } = await purgeFreeSpaceBoardLocally({
          sectionId,
          boardId: id,
        });
        persistAndSetBoards(boardsRef.current.filter(b => b.id !== id));
        setActiveBoardIdRaw(prev => {
          if (prev === id) {
            saveActiveBoard(sectionId, 'main');
            return 'main';
          }
          return prev;
        });
        enqueueFreeSpaceObjectDeletesAfterLocalDelete(true, {
          userId,
          sectionId,
          boardId: id,
          entityIds: objectEntityIds,
        });
        void enqueueFreeSpaceBoardDelete({ userId, sectionId, boardId: id });
      })();
    },
    [persistAndSetBoards, sectionId, userId],
  );

  useEffect(() => {
    if (!sectionId || !userId) return;
    const ns = resolveCacheNamespace(userId, sectionId);
    if (!ns.ok) return;
    registerFreeSpaceAutoFlushScope(ns.namespace);
    requestFreeSpacePendingFlushNow(ns.namespace);
    const onOnline = () => requestFreeSpacePendingFlushNow(ns.namespace);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      invalidateFreeSpaceAutoFlushScope(ns.namespace);
    };
  }, [sectionId, userId]);

  useEffect(() => {
    if (!sectionId || !userId) return;
    let cancelled = false;

    const runCatchUp = async () => {
      const result = await runFreeSpaceBoardSectionPullCatchUp({
        userId,
        sectionId,
        localBoards: loadBoards(sectionId),
      });
      if (cancelled || !result.ok) return;
      persistAndSetBoards(result.boards);
      if (result.prunedBoardIds.length > 0) {
        setActiveBoardIdRaw(prev => {
          if (result.prunedBoardIds.includes(prev)) {
            saveActiveBoard(sectionId, 'main');
            return 'main';
          }
          return prev;
        });
      }
    };

    void runCatchUp();

    const subscription = subscribeFreeSpaceBoardsRealtime({
      sectionId,
      onEvent: event => {
        if (cancelled || event.ignored || !event.row) return;
        const row = event.row;
        if (event.eventType === 'DELETE') {
          if (row.id === 'main') return;
          purgeFreeSpaceBoardLocallySilent({ sectionId, boardId: row.id });
          persistAndSetBoards(boardsRef.current.filter(b => b.id !== row.id));
          setActiveBoardIdRaw(prev => {
            if (prev === row.id) {
              saveActiveBoard(sectionId, 'main');
              return 'main';
            }
            return prev;
          });
          return;
        }
        const incoming = cloudRowToLocalBoard(row);
        const existing = boardsRef.current.find(b => b.id === incoming.id);
        const merged = existing
          ? boardsRef.current.map(b => (b.id === incoming.id ? { ...b, ...incoming } : b))
          : [...boardsRef.current, incoming];
        persistAndSetBoards(merged);
      },
      onStatus: status => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          void runCatchUp();
        }
      },
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [sectionId, userId, persistAndSetBoards]);

  return { boards, activeBoardId, setActiveBoardId, createBoard, renameBoard, deleteBoard };
}
