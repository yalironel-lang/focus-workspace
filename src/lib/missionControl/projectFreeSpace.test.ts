import { describe, expect, it } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { projectFreeSpaceEntries, projectFreeSpaceEntry } from './projectFreeSpace';

function base(
  type: ProjectSpaceObject['type'],
  content: ProjectSpaceObject['content'],
  overrides: Partial<ProjectSpaceObject> = {},
): ProjectSpaceObject {
  return {
    id: `ps-${type}-1`,
    type,
    title: type,
    content,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

describe('projectFreeSpace', () => {
  it('C: category mapping for primary types', () => {
    const cases: Array<[ProjectSpaceObject, string]> = [
      [
        base('pdf', {
          type: 'pdf',
          fileName: 'a.pdf',
          fileType: 'application/pdf',
          fileSize: 1,
          lastOpenedAt: null,
          page: 1,
          zoom: 1,
        }),
        'pdf',
      ],
      [
        base('notebook', { type: 'notebook', body: '', paperStyle: 'ruled' }),
        'notebook',
      ],
      [
        base('sheet', {
          type: 'sheet',
          document: { schemaVersion: 1, engine: 'univer', workbook: {} },
        }),
        'sheet',
      ],
      [base('image', { type: 'image', url: '' }), 'image'],
      [base('link', { type: 'link', title: 'L', url: 'https://ex.com' }), 'link'],
      [base('note', { type: 'note', body: 'hi' }), 'other'],
      [
        base('mistake', {
          type: 'mistake',
          whatWrong: '',
          correction: '',
          whyConfused: '',
          tags: [],
          confidence: 'low',
          timesReviewed: 0,
          lastReviewedAt: null,
        }),
        'other',
      ],
      [
        base('checklist', {
          type: 'checklist',
          items: [],
        }),
        'other',
      ],
    ];
    for (const [obj, cat] of cases) {
      const item = projectFreeSpaceEntry('sec', { boardId: 'main', object: obj });
      expect(item?.category).toBe(cat);
    }
  });

  it('D: hidden tool types excluded', () => {
    for (const type of ['calculator', 'graph', 'companion'] as const) {
      const content =
        type === 'calculator'
          ? { type: 'calculator' as const, input: '', history: [] }
          : type === 'graph'
            ? {
                type: 'graph' as const,
                expression: 'x',
                xmin: -1,
                xmax: 1,
                ymin: -1,
                ymax: 1,
              }
            : {
                type: 'companion' as const,
                url: 'https://x.com',
                title: 'C',
                favicon: '',
                embedMode: 'external-only' as const,
                lastOpenedAt: null,
              };
      const item = projectFreeSpaceEntry('sec', {
        boardId: 'main',
        object: base(type, content),
      });
      expect(item).toBeNull();
    }
  });

  it('E: studyfile indexed but not openable/showable', () => {
    const item = projectFreeSpaceEntry('sec', {
      boardId: 'main',
      object: base('studyfile', {
        type: 'studyfile',
        fileName: 'x.pdf',
        fileType: 'application/pdf',
        fileSize: 1,
        fileKind: 'pdf',
        role: 'general',
        usageLabel: '',
        externalUrl: null,
        lastOpenedAt: 999,
        page: 1,
        zoom: 1,
      }),
    });
    expect(item).not.toBeNull();
    expect(item!.category).toBe('pdf');
    expect(item!.capabilities.open).toBe(false);
    expect(item!.capabilities.showInWorkspace).toBe(false);
    expect(item!.openAction).toEqual({ type: 'unavailable' });
    expect(item!.showInWorkspaceAction).toEqual({ type: 'unavailable' });
  });

  it('I/J: lastOpenedAt real only; updatedAt not substituted', () => {
    const withOpen = projectFreeSpaceEntry('sec', {
      boardId: 'main',
      object: base(
        'pdf',
        {
          type: 'pdf',
          fileName: 'a.pdf',
          fileType: 'application/pdf',
          fileSize: 1,
          lastOpenedAt: 5555,
          page: 1,
          zoom: 1,
        },
        { updatedAt: 9999 },
      ),
    });
    expect(withOpen!.lastOpenedAt).toBe(5555);
    expect(withOpen!.updatedAt).toBe(9999);

    const notebook = projectFreeSpaceEntry('sec', {
      boardId: 'main',
      object: base(
        'notebook',
        { type: 'notebook', body: 'x', paperStyle: 'ruled' },
        { updatedAt: 7777 },
      ),
    });
    expect(notebook!.lastOpenedAt).toBeNull();
    expect(notebook!.updatedAt).toBe(7777);
  });

  it('K: malformed skipped via missing id', () => {
    const bad = base('note', { type: 'note', body: '' }, { id: '' });
    expect(projectFreeSpaceEntry('sec', { boardId: 'main', object: bad })).toBeNull();
  });

  it('blob-backed availability content is unknown', () => {
    const item = projectFreeSpaceEntry('sec', {
      boardId: 'main',
      object: base('pdf', {
        type: 'pdf',
        fileName: 'a.pdf',
        fileType: 'application/pdf',
        fileSize: 1,
        lastOpenedAt: null,
        page: 1,
        zoom: 1,
      }),
    });
    expect(item!.availability).toEqual({
      metadata: 'available',
      content: 'unknown',
    });
  });

  it('projects batch and keeps boardId', () => {
    const items = projectFreeSpaceEntries('sec', [
      {
        boardId: 'board-2',
        object: base('note', { type: 'note', body: 'a' }, { id: 'ps-note-a' }),
      },
    ]);
    expect(items[0].boardId).toBe('board-2');
    expect(items[0].id).toBe('freespace:ps-note-a');
  });
});
