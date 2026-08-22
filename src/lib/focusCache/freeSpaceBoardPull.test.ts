// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ensureMainBoard,
  mergeBoardLww,
  MAIN_BOARD,
} from './freeSpaceBoardPull';
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

import { fetchFreeSpaceBoardsForSection } from './freeSpaceBoardCloud';
import { runFreeSpaceBoardSectionPullCatchUp } from './freeSpaceBoardPull';
import { enqueueFreeSpaceBoardCreate } from './freeSpaceBoardCreateEnqueue';

const fetchMock = vi.mocked(fetchFreeSpaceBoardsForSection);
const createMock = vi.mocked(enqueueFreeSpaceBoardCreate);

const USER = 'user-pull-1';
const SECTION = 'section-pull-1';

beforeEach(() => {
  fetchMock.mockReset();
  createMock.mockReset();
  createMock.mockResolvedValue({ ok: true });
});

describe('freeSpaceBoardPull', () => {
  it('M ensureMainBoard always exposes canonical Main', () => {
    const boards = ensureMainBoard([]);
    expect(boards[0]).toMatchObject({ id: 'main', name: 'Main' });
  });

  it('C second client pull hydrates cloud board', async () => {
    const cloudRow: FreeSpaceBoardCloudRow = {
      id: 'board-peer',
      user_id: USER,
      section_id: SECTION,
      name: 'Peer Space',
      created_at: new Date(1000).toISOString(),
      updated_at: new Date(2000).toISOString(),
    };
    fetchMock.mockResolvedValue({ ok: true, rows: [cloudRow] });
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: ensureMainBoard([]),
    });
    expect(result.ok).toBe(true);
    expect(result.boards.some(b => b.id === 'board-peer' && b.name === 'Peer Space')).toBe(true);
  });

  it('legacy local board uploads with stable id', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    const local = ensureMainBoard([
      { id: 'board-legacy', name: 'Legacy', createdAt: 500, updatedAt: 500 },
    ]);
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: local,
    });
    expect(result.legacyUploaded).toContain('board-legacy');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'board-legacy', name: 'Legacy' }),
    );
    expect(result.boards.some(b => b.id === 'board-legacy')).toBe(true);
  });

  it('O same-name boards remain distinct by id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 'board-a',
          user_id: USER,
          section_id: SECTION,
          name: 'Space',
          created_at: new Date(1).toISOString(),
          updated_at: new Date(1).toISOString(),
        },
        {
          id: 'board-b',
          user_id: USER,
          section_id: SECTION,
          name: 'Space',
          created_at: new Date(2).toISOString(),
          updated_at: new Date(2).toISOString(),
        },
      ],
    });
    const result = await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: ensureMainBoard([]),
    });
    const dupes = result.boards.filter(b => b.name === 'Space');
    expect(dupes).toHaveLength(2);
    expect(new Set(dupes.map(b => b.id)).size).toBe(2);
  });

  it('LWW merge prefers newer cloud updated_at', () => {
    const local = { id: 'board-x', name: 'Local', createdAt: 100, updatedAt: 100 };
    const cloud: FreeSpaceBoardCloudRow = {
      id: 'board-x',
      user_id: USER,
      section_id: SECTION,
      name: 'Cloud',
      created_at: new Date(100).toISOString(),
      updated_at: new Date(500).toISOString(),
    };
    expect(mergeBoardLww(local, cloud).name).toBe('Cloud');
  });

  it('ensures main cloud row when missing', async () => {
    fetchMock.mockResolvedValue({ ok: true, rows: [] });
    await runFreeSpaceBoardSectionPullCatchUp({
      userId: USER,
      sectionId: SECTION,
      localBoards: [MAIN_BOARD],
    });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'main', name: 'Main' }),
    );
  });
});
