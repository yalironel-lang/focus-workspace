import { describe, expect, it } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { CourseLink, GroupWithItems, Item } from '../../types';
import { deriveMissionControlIndex } from './deriveMissionControlIndex';

function pdf(id: string, updatedAt: number): ProjectSpaceObject {
  return {
    id,
    type: 'pdf',
    title: id,
    content: {
      type: 'pdf',
      fileName: `${id}.pdf`,
      fileType: 'application/pdf',
      fileSize: 1,
      lastOpenedAt: null,
      page: 1,
      zoom: 1,
    },
    createdAt: updatedAt,
    updatedAt,
  };
}

function shelfItem(partial: Partial<Item> & Pick<Item, 'id' | 'type' | 'title'>): Item {
  return {
    group_id: 'g1',
    content: null,
    file_path: null,
    completed: false,
    order_index: 0,
    created_at: '2024-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('deriveMissionControlIndex', () => {
  it('L: duplicate-looking Shelf + Free Space PDF remain distinct', () => {
    const result = deriveMissionControlIndex({
      sectionId: 'sec',
      freeSpaceEntries: [{ boardId: 'main', object: pdf('ps-pdf-1', 100) }],
      groups: [
        {
          id: 'g1',
          section_id: 'sec',
          title: 'Slides',
          order_index: 0,
          items: [
            shelfItem({
              id: 'shelf-pdf',
              type: 'file',
              title: 'ps-pdf-1',
              file_path: 'u/s/g/x.pdf',
            }),
          ],
        },
      ],
      completeness: 'complete',
    });
    expect(result.items).toHaveLength(2);
    expect(result.items.map(i => i.id).sort()).toEqual([
      'freespace:ps-pdf-1',
      'shelf-item:shelf-pdf',
    ]);
  });

  it('R: empty section', () => {
    const result = deriveMissionControlIndex({
      sectionId: 'sec',
      freeSpaceEntries: [],
      groups: [],
      courseLinks: [],
      completeness: 'complete',
    });
    expect(result.items).toEqual([]);
  });

  it('P/Q: completeness passthrough', () => {
    expect(
      deriveMissionControlIndex({
        sectionId: 'sec',
        freeSpaceEntries: [],
        completeness: 'local-only',
      }).completeness,
    ).toBe('local-only');
    expect(
      deriveMissionControlIndex({
        sectionId: 'sec',
        freeSpaceEntries: [],
        completeness: 'loading',
      }).completeness,
    ).toBe('loading');
  });

  it('S: synthetic 500-item projection', () => {
    const freeSpaceEntries = Array.from({ length: 400 }, (_, i) => ({
      boardId: i % 2 === 0 ? 'main' : 'board-2',
      object: pdf(`ps-pdf-${i}`, i),
    }));
    const items: Item[] = Array.from({ length: 50 }, (_, i) =>
      shelfItem({
        id: `note-${i}`,
        type: 'note',
        title: `Note ${i}`,
      }),
    );
    const groups: GroupWithItems[] = [
      {
        id: 'g1',
        section_id: 'sec',
        title: 'Notes',
        order_index: 0,
        items,
      },
    ];
    const courseLinks: CourseLink[] = Array.from({ length: 50 }, (_, i) => ({
      id: `cl-${i}`,
      user_id: 'u',
      section_id: 'sec',
      label: `Link ${i}`,
      url: `https://example.com/${i}`,
      type: 'custom',
      scope: 'course',
      order_index: i,
      created_at: '2024-01-01T00:00:00.000Z',
    }));

    const result = deriveMissionControlIndex({
      sectionId: 'sec',
      freeSpaceEntries,
      groups,
      courseLinks,
      completeness: 'complete',
    });
    expect(result.items).toHaveLength(500);
    expect(new Set(result.items.map(i => i.id)).size).toBe(500);
  });

  it('hides calculator from unified index', () => {
    const result = deriveMissionControlIndex({
      sectionId: 'sec',
      freeSpaceEntries: [
        {
          boardId: 'main',
          object: {
            id: 'ps-calc-1',
            type: 'calculator',
            title: 'Calc',
            content: { type: 'calculator', input: '', history: [] },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
      completeness: 'complete',
    });
    expect(result.items).toHaveLength(0);
  });
});
