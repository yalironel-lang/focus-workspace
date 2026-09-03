import { describe, expect, it } from 'vitest';
import {
  countMissionControlByCategory,
  filterMissionControlItems,
  normalizeMissionControlQuery,
} from './filterMissionControlItems';
import type { MissionControlItem } from './types';

function item(
  partial: Partial<MissionControlItem> & Pick<MissionControlItem, 'id' | 'title' | 'category'>,
): MissionControlItem {
  return {
    source: 'freespace',
    sourceId: partial.id,
    sectionId: 's1',
    sourceKind: { source: 'freespace', type: 'notebook' },
    subtitle: null,
    createdAt: null,
    updatedAt: null,
    lastOpenedAt: null,
    preview: { kind: 'none' },
    capabilities: {
      open: true,
      showInWorkspace: true,
      rename: true,
      delete: true,
      duplicate: true,
      move: false,
    },
    openAction: { type: 'freespace-focus', objectId: partial.id, boardId: 'main' },
    showInWorkspaceAction: { type: 'freespace-focus', objectId: partial.id, boardId: 'main' },
    availability: { metadata: 'available', content: 'unknown' },
    ...partial,
  };
}

describe('filterMissionControlItems', () => {
  const items = [
    item({ id: '1', title: 'Algebra PDF', category: 'pdf', subtitle: 'Chapter 1' }),
    item({
      id: '2',
      title: 'Lecture Notes',
      category: 'notebook',
      sourceKind: { source: 'freespace', type: 'notebook' },
    }),
    item({
      id: '3',
      title: 'Moodle',
      category: 'link',
      openAction: { type: 'external-url', url: 'https://moodle.example.edu/course' },
      showInWorkspaceAction: { type: 'unavailable' },
      capabilities: {
        open: true,
        showInWorkspace: false,
        rename: true,
        delete: true,
        duplicate: false,
        move: false,
      },
      sourceKind: { source: 'course-link', type: 'moodle' },
      source: 'course-link',
    }),
  ];

  it('normalizes query trim/case/whitespace', () => {
    expect(normalizeMissionControlQuery('  Foo   BAR  ')).toBe('foo bar');
  });

  it('empty query returns all (with category)', () => {
    expect(filterMissionControlItems(items, { query: '  ' })).toHaveLength(3);
  });

  it('searches title case-insensitively', () => {
    expect(filterMissionControlItems(items, { query: 'algebra' }).map(i => i.id)).toEqual(['1']);
  });

  it('searches subtitle and category', () => {
    expect(filterMissionControlItems(items, { query: 'chapter' }).map(i => i.id)).toEqual(['1']);
    expect(filterMissionControlItems(items, { query: 'pdf' }).map(i => i.id)).toEqual(['1']);
  });

  it('searches URL/domain metadata', () => {
    expect(filterMissionControlItems(items, { query: 'moodle.example' }).map(i => i.id)).toEqual([
      '3',
    ]);
  });

  it('ANDs category filter with search', () => {
    expect(
      filterMissionControlItems(items, { query: 'a', category: 'notebook' }).map(i => i.id),
    ).toEqual(['2']);
  });

  it('counts respond to search query', () => {
    const counts = countMissionControlByCategory(items, 'a');
    expect(counts.all).toBeGreaterThan(0);
    expect(counts.pdf + counts.notebook + counts.link).toBe(counts.all);
  });
});
