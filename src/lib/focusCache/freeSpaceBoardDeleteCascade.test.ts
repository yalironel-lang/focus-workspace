// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearBoardScopedFreeSpaceStorage,
  purgeFreeSpaceBoardLocally,
} from './freeSpaceBoardDeleteCascade';
import { boardScopedFreeSpaceKeys, sectionBoardsListKey } from '../freeSpacePersistence';

const SECTION = 'section-cascade-1';
const BOARD = 'board-cascade-1';

vi.mock('../knowledge/tombstoneStore', () => ({
  writeFreeSpaceObjectTombstone: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('freeSpaceBoardDeleteCascade', () => {
  it('S board delete purges local objects and returns entity ids for cloud enqueue', async () => {
    const key = boardScopedFreeSpaceKeys(SECTION, BOARD).objects;
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: 'ps-note-1',
          type: 'note',
          title: 't',
          content: { type: 'note', body: '' },
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );
    localStorage.setItem(boardScopedFreeSpaceKeys(SECTION, BOARD).positions, '{}');
    localStorage.setItem(sectionBoardsListKey(SECTION), JSON.stringify([]));

    const result = await purgeFreeSpaceBoardLocally({ sectionId: SECTION, boardId: BOARD });
    expect(result.objectEntityIds).toEqual(['ps-note-1']);
    expect(localStorage.getItem(key)).toBeNull();
    clearBoardScopedFreeSpaceStorage(SECTION, BOARD);
    expect(localStorage.getItem(boardScopedFreeSpaceKeys(SECTION, BOARD).positions)).toBeNull();
  });

  it('main purge is no-op', async () => {
    const result = await purgeFreeSpaceBoardLocally({ sectionId: SECTION, boardId: 'main' });
    expect(result.objectEntityIds).toEqual([]);
  });
});
