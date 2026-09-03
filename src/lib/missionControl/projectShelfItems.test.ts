import { describe, expect, it } from 'vitest';
import type { GroupWithItems, Item } from '../../types';
import { projectShelfGroups, projectShelfItem } from './projectShelfItems';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'type' | 'title'>): Item {
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

describe('projectShelfItems', () => {
  it('F: tasks excluded', () => {
    expect(
      projectShelfItem(
        'sec',
        item({ id: 't1', type: 'task', title: 'Do it' }),
      ),
    ).toBeNull();
  });

  it('G: shelf resources projected correctly', () => {
    const file = projectShelfItem(
      'sec',
      item({
        id: 'f1',
        type: 'file',
        title: 'Slides',
        file_path: 'u/s/g/f1.pdf',
      }),
      'Slides',
    );
    expect(file?.category).toBe('pdf');
    expect(file?.capabilities.showInWorkspace).toBe(false);
    expect(file?.capabilities.duplicate).toBe(false);
    expect(file?.capabilities.move).toBe(false);
    expect(file?.openAction).toEqual({
      type: 'shelf-file',
      itemId: 'f1',
      filePath: 'u/s/g/f1.pdf',
    });
    expect(file?.updatedAt).toBeNull();
    expect(file?.lastOpenedAt).toBeNull();

    const link = projectShelfItem(
      'sec',
      item({
        id: 'l1',
        type: 'link',
        title: 'Moodle',
        content: 'https://moodle.example/course',
      }),
    );
    expect(link?.category).toBe('link');
    expect(link?.openAction).toEqual({
      type: 'external-url',
      url: 'https://moodle.example/course',
    });

    const note = projectShelfItem(
      'sec',
      item({ id: 'n1', type: 'note', title: 'N', content: 'body' }),
    );
    expect(note?.category).toBe('other');
    expect(note?.capabilities.open).toBe(false);
  });

  it('projects groups and skips tasks', () => {
    const groups: GroupWithItems[] = [
      {
        id: 'g1',
        section_id: 'sec',
        title: 'Exercises',
        order_index: 0,
        items: [
          item({ id: 't1', type: 'task', title: 'Task' }),
          item({ id: 'n1', type: 'note', title: 'Note' }),
        ],
      },
    ];
    const items = projectShelfGroups('sec', groups);
    expect(items).toHaveLength(1);
    expect(items[0].sourceId).toBe('n1');
  });

  it('section isolation: other section groups excluded', () => {
    const groups: GroupWithItems[] = [
      {
        id: 'g-other',
        section_id: 'other-sec',
        title: 'Slides',
        order_index: 0,
        items: [item({ id: 'f1', type: 'file', title: 'Leak', file_path: 'x.pdf' })],
      },
      {
        id: 'g-mine',
        section_id: 'sec',
        title: 'Slides',
        order_index: 0,
        items: [item({ id: 'f2', type: 'file', title: 'Mine', file_path: 'y.pdf' })],
      },
    ];
    const items = projectShelfGroups('sec', groups);
    expect(items).toHaveLength(1);
    expect(items[0].sourceId).toBe('f2');
  });
});
