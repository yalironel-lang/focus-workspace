import { useState, useCallback } from 'react';
import { sectionBoardsListKey, sectionActiveBoardKey, fwPersistWarn } from '../lib/freeSpacePersistence';

export interface FreeSpaceBoard {
  id: string;
  name: string;
  createdAt: number;
}

const MAIN_BOARD: FreeSpaceBoard = { id: 'main', name: 'Main', createdAt: 0 };

function uid(): string {
  return `board-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadBoards(sectionId: string): FreeSpaceBoard[] {
  if (!sectionId) return [MAIN_BOARD];
  try {
    const raw = localStorage.getItem(sectionBoardsListKey(sectionId));
    if (!raw) return [MAIN_BOARD];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [MAIN_BOARD];
    const boards: FreeSpaceBoard[] = parsed.filter(
      (b): b is FreeSpaceBoard =>
        b && typeof b === 'object' &&
        typeof b.id === 'string' && b.id.trim() &&
        typeof b.name === 'string' &&
        typeof b.createdAt === 'number',
    );
    const hasMain = boards.some(b => b.id === 'main');
    return hasMain ? boards : [MAIN_BOARD, ...boards];
  } catch (e) {
    fwPersistWarn(`Failed to load boards for section "${sectionId}": ${String(e)}`);
    return [MAIN_BOARD];
  }
}

function saveBoards(sectionId: string, boards: FreeSpaceBoard[]): void {
  if (!sectionId) return;
  try {
    localStorage.setItem(sectionBoardsListKey(sectionId), JSON.stringify(boards));
  } catch { /* quota */ }
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
  } catch { /* quota */ }
}

export interface SectionFreeSpaceBoardsState {
  boards: FreeSpaceBoard[];
  activeBoardId: string;
  setActiveBoardId: (id: string) => void;
  createBoard: (name: string) => FreeSpaceBoard;
  renameBoard: (id: string, name: string) => void;
  deleteBoard: (id: string) => void;
}

export function useSectionFreeSpaceBoards(sectionId: string): SectionFreeSpaceBoardsState {
  const [boards, setBoards] = useState<FreeSpaceBoard[]>(() => loadBoards(sectionId));
  const [activeBoardId, setActiveBoardIdRaw] = useState<string>(() => {
    const loaded = loadBoards(sectionId);
    return loadActiveBoard(sectionId, loaded);
  });

  const setActiveBoardId = useCallback((id: string) => {
    setActiveBoardIdRaw(id);
    saveActiveBoard(sectionId, id);
  }, [sectionId]);

  const createBoard = useCallback((name: string): FreeSpaceBoard => {
    const board: FreeSpaceBoard = { id: uid(), name: name.trim() || 'Space', createdAt: Date.now() };
    setBoards(prev => {
      const next = [...prev, board];
      saveBoards(sectionId, next);
      return next;
    });
    setActiveBoardIdRaw(board.id);
    saveActiveBoard(sectionId, board.id);
    return board;
  }, [sectionId]);

  const renameBoard = useCallback((id: string, name: string) => {
    if (id === 'main') return;
    setBoards(prev => {
      const next = prev.map(b => b.id === id ? { ...b, name: name.trim() || b.name } : b);
      saveBoards(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const deleteBoard = useCallback((id: string) => {
    if (id === 'main') return;
    setBoards(prev => {
      const next = prev.filter(b => b.id !== id);
      saveBoards(sectionId, next);
      return next;
    });
    setActiveBoardIdRaw(prev => {
      if (prev === id) {
        saveActiveBoard(sectionId, 'main');
        return 'main';
      }
      return prev;
    });
  }, [sectionId]);

  return { boards, activeBoardId, setActiveBoardId, createBoard, renameBoard, deleteBoard };
}
