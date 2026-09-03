import { describe, expect, it } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { FreeSpaceObjectCloudRow } from '../focusCache/freeSpaceObjectCloud';
import { buildSectionFreeSpaceIndexEntries } from './loadSectionFreeSpaceIndexSource';

function pdfObj(
  id: string,
  updatedAt: number,
  extras: Partial<ProjectSpaceObject> = {},
): ProjectSpaceObject {
  return {
    id,
    type: 'pdf',
    title: id,
    content: {
      type: 'pdf',
      fileName: `${id}.pdf`,
      fileType: 'application/pdf',
      fileSize: 10,
      lastOpenedAt: null,
      page: 1,
      zoom: 1,
    },
    createdAt: updatedAt,
    updatedAt,
    ...extras,
  };
}

function cloudRow(
  object: ProjectSpaceObject,
  boardId: string,
  updatedAtIso?: string,
): FreeSpaceObjectCloudRow {
  return {
    id: object.id,
    user_id: 'u',
    section_id: 'section-1',
    board_id: boardId,
    object: object as unknown as FreeSpaceObjectCloudRow['object'],
    created_at: updatedAtIso ?? new Date(object.createdAt).toISOString(),
    updated_at: updatedAtIso ?? new Date(object.updatedAt).toISOString(),
  };
}

describe('buildSectionFreeSpaceIndexEntries', () => {
  it('O: includes all-board cloud objects', () => {
    const localByBoard = new Map<string, ProjectSpaceObject[]>([
      ['main', [pdfObj('a', 100)]],
    ]);
    const cloudRows = [
      cloudRow(pdfObj('a', 100), 'main'),
      cloudRow(pdfObj('b', 200), 'board-2'),
      cloudRow(pdfObj('c', 300), 'board-3'),
    ];
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: 'section-1',
      localByBoard,
      cloudRows,
      protectedEntityIds: new Set(),
    });
    expect(entries.map(e => e.object.id).sort()).toEqual(['a', 'b', 'c']);
    expect(entries.find(e => e.object.id === 'b')?.boardId).toBe('board-2');
  });

  it('M: cloud + local same id merges to one', () => {
    const local = pdfObj('x', 100, { title: 'Local' });
    const cloud = pdfObj('x', 200, { title: 'Cloud' });
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: 'section-1',
      localByBoard: new Map([['main', [local]]]),
      cloudRows: [cloudRow(cloud, 'main')],
      protectedEntityIds: new Set(),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].object.title).toBe('Cloud');
  });

  it('N: protected local wins over newer cloud', () => {
    const local = pdfObj('x', 100, { title: 'Local' });
    const cloud = pdfObj('x', 500, { title: 'Cloud' });
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: 'section-1',
      localByBoard: new Map([['main', [local]]]),
      cloudRows: [cloudRow(cloud, 'main')],
      protectedEntityIds: new Set(['x']),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].object.title).toBe('Local');
  });

  it('pending CREATE survives when absent from cloud', () => {
    const pending = pdfObj('pending-1', 50, { title: 'Pending' });
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: 'section-1',
      localByBoard: new Map(),
      cloudRows: [],
      protectedEntityIds: new Set(['pending-1']),
      pendingCreates: [{ boardId: 'main', object: pending }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].object.id).toBe('pending-1');
  });

  it('pending DELETE removes object from index', () => {
    const local = pdfObj('gone', 100);
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: 'section-1',
      localByBoard: new Map([['main', [local]]]),
      cloudRows: [cloudRow(local, 'main')],
      protectedEntityIds: new Set(['gone']),
      pendingDeleteIds: new Set(['gone']),
    });
    expect(entries).toHaveLength(0);
  });

  it('N: pending UPDATE overlay wins over newer cloud when protected', () => {
    const local = pdfObj('x', 100, { title: 'StaleLocal' });
    const updated = pdfObj('x', 150, { title: 'PendingUpdate' });
    const cloud = pdfObj('x', 500, { title: 'Cloud' });
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: 'section-1',
      localByBoard: new Map([['main', [local]]]),
      cloudRows: [cloudRow(cloud, 'main')],
      protectedEntityIds: new Set(['x']),
      pendingCreates: [{ boardId: 'main', object: updated }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].object.title).toBe('PendingUpdate');
  });

  it('pending DELETE hides cloud object', () => {
    const cloudOnly = pdfObj('cloud-only', 100);
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: 'section-1',
      localByBoard: new Map(),
      cloudRows: [cloudRow(cloudOnly, 'board-2')],
      protectedEntityIds: new Set(['cloud-only']),
      pendingDeleteIds: new Set(['cloud-only']),
    });
    expect(entries).toHaveLength(0);
  });

  it('cloud null keeps local-only entries', () => {
    const entries = buildSectionFreeSpaceIndexEntries({
      sectionId: 'section-1',
      localByBoard: new Map([['main', [pdfObj('only', 1)]]]),
      cloudRows: null,
      protectedEntityIds: new Set(),
    });
    expect(entries).toHaveLength(1);
  });
});
