/**
 * Designer Pages Phase 1 — page presentation model foundation.
 *
 * Zero-write hydrate, page-id isolation, TipTap/body/codec isolation,
 * tombstone/restore, cloud round-trip.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTestLocalStorage } from './knowledge/testLocalStorage';
ensureTestLocalStorage();

import {
  ensureProjectObjectContent,
  type ProjectObjectContent,
  type ProjectSpaceObject,
} from '../hooks/useSectionFreeSpaceObjects';
import {
  hydrateNotebookPages,
  prepareNotebookForCloudPersist,
  reorderNotebookPagesInSection,
  sanitizeNotebookPage,
  sanitizeNotebookPagePresentation,
  resolveNotebookPagePaperStyle,
  resolveNotebookPageLayoutTemplate,
  replaceNotebookPageBody,
  type NotebookContentWithPages,
  type NotebookPage,
} from './notebookPages';
import { serializeNotebookBlocks } from './notebookDialect';
import { boardScopedFreeSpaceKeys } from './freeSpacePersistence';
import { softDeleteNotebookPage, isEquivalentNotebookPage } from './knowledge/notebookPageRecovery';
import { restoreFromTombstone } from './knowledge/knowledgeRestore';
import { listTombstones } from './knowledge/tombstoneStore';
import { resetKnowledgeJournalDbForTests } from './knowledge/knowledgeJournalIdb';
import { resetNotebookHandwritingStoreForTests } from './notebookHandwritingStore';

vi.mock('./focusCache/freeSpaceObjectDeleteEnqueue', () => ({
  cancelPendingFreeSpaceObjectDeletes: vi.fn(async () => ({ ok: true, removed: 1 })),
  enqueueFreeSpaceObjectDeletesAfterLocalDelete: vi.fn(),
  enqueueFreeSpaceObjectDelete: vi.fn(),
}));

vi.mock('./focusCache/freeSpaceObjectCreateEnqueue', () => ({
  enqueueFreeSpaceObjectCreate: vi.fn(async () => ({ ok: true })),
  FREE_SPACE_OBJECT_ENTITY_TYPE: 'free_space_object',
  buildFreeSpaceObjectWritePayload: vi.fn(),
}));

vi.mock('./notebookDeleteCascade', () => ({
  cascadeDeleteNotebookAssets: vi.fn(async () => ({ handwriting: 0, images: 0 })),
}));

const SECTION = 'sec-nb-page-presentation';
const BOARD = 'main';
const OBJECT_ID = 'nb-page-presentation-1';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

function objectsKey() {
  return boardScopedFreeSpaceKeys(SECTION, BOARD).objects;
}

function v1Body(text: string): string {
  return serializeNotebookBlocks([{ kind: 'paragraph', text }], 1);
}

function baseNotebook(extra: Partial<NotebookContent> = {}): NotebookContent {
  return {
    type: 'notebook',
    body: 'Page 1 legacy notes',
    paperStyle: 'ruled',
    notebookMode: 'normal',
    notebookSurface: 'spatial',
    schemaVersion: 1,
    sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['page-a', 'page-b'] }],
    pages: [
      {
        id: 'page-a',
        sectionId: 'sec-notes',
        kind: 'document',
        title: 'Page A',
        documentBody: 'Page 1 legacy notes',
      },
      {
        id: 'page-b',
        sectionId: 'sec-notes',
        kind: 'document',
        title: 'Page B',
        documentBody: v1Body('Ipad test 123'),
        documentBodyCodecVersion: 1,
      },
    ],
    activeSectionId: 'sec-notes',
    activePageId: 'page-a',
    ...extra,
  };
}

function snapshotBodies(c: NotebookContent | NotebookContentWithPages) {
  return {
    body: c.body,
    bodyCodecVersion: (c as NotebookContentWithPages).bodyCodecVersion,
    pages: (c.pages ?? []).map(p =>
      p.kind === 'document'
        ? {
            id: p.id,
            documentBody: p.documentBody,
            documentBodyCodecVersion: p.documentBodyCodecVersion,
          }
        : { id: p.id, kind: p.kind },
    ),
  };
}

function persistNotebook(content: NotebookContentWithPages, title = 'Presentation NB') {
  const obj: ProjectSpaceObject = {
    id: OBJECT_ID,
    type: 'notebook',
    title,
    content,
    createdAt: 1,
    updatedAt: 1,
  };
  localStorage.setItem(objectsKey(), JSON.stringify([obj]));
  return obj;
}

function loadNotebook(): NotebookContentWithPages {
  const raw = JSON.parse(localStorage.getItem(objectsKey()) || '[]') as ProjectSpaceObject[];
  const nb = raw.find(o => o.id === OBJECT_ID);
  if (!nb || nb.content.type !== 'notebook') throw new Error('missing notebook');
  return nb.content as NotebookContentWithPages;
}

beforeEach(async () => {
  ensureTestLocalStorage();
  localStorage.clear();
  resetNotebookHandwritingStoreForTests();
  await resetKnowledgeJournalDbForTests();
  vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
});

afterEach(() => {
  ensureTestLocalStorage();
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('1–2 legacy + zero-write hydrate', () => {
  it('1: legacy page with no presentation remains valid', () => {
    const page = sanitizeNotebookPage({
      id: 'page-a',
      sectionId: 'sec-notes',
      kind: 'document',
      documentBody: 'hello',
    });
    expect(page).not.toBeNull();
    expect(page!.presentation).toBeUndefined();
    expect(page).not.toHaveProperty('presentation');
  });

  it('2: absent presentation causes zero-write hydration', () => {
    const raw = baseNotebook();
    const ensured = ensureProjectObjectContent('notebook', JSON.parse(JSON.stringify(raw))) as NotebookContent;
    const hydrated = hydrateNotebookPages(ensured);
    expect(ensured.pages?.[0]).not.toHaveProperty('presentation');
    expect(hydrated.pages?.[0]).not.toHaveProperty('presentation');
    expect(JSON.stringify(hydrated).includes('"presentation"')).toBe(false);
    expect(JSON.stringify(hydrated).includes('"layoutTemplate"')).toBe(false);
  });
});

describe('3–6 resolution', () => {
  it('3: notebook paperStyle used when page override absent', () => {
    const page = { id: 'p', sectionId: 's', kind: 'document' as const };
    expect(resolveNotebookPagePaperStyle({ page, notebookPaperStyle: 'grid' })).toBe('grid');
    expect(resolveNotebookPagePaperStyle({ page, notebookPaperStyle: 'blank' })).toBe('blank');
    expect(resolveNotebookPagePaperStyle({ page, notebookPaperStyle: undefined })).toBe('ruled');
  });

  it('4: page paperStyle override wins', () => {
    const page = {
      id: 'p',
      sectionId: 's',
      kind: 'document' as const,
      presentation: { paperStyle: 'blank' as const },
    };
    expect(resolveNotebookPagePaperStyle({ page, notebookPaperStyle: 'grid' })).toBe('blank');
  });

  it('5: override on Page A does not affect Page B', () => {
    const content = ensureProjectObjectContent(
      'notebook',
      baseNotebook({
        pages: [
          {
            id: 'page-a',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'Page A',
            documentBody: 'A',
            presentation: { paperStyle: 'blank' },
          },
          {
            id: 'page-b',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'Page B',
            documentBody: 'B',
          },
        ],
      }),
    ) as NotebookContent;
    const a = content.pages!.find(p => p.id === 'page-a')!;
    const b = content.pages!.find(p => p.id === 'page-b')!;
    expect(resolveNotebookPagePaperStyle({ page: a, notebookPaperStyle: content.paperStyle })).toBe(
      'blank',
    );
    expect(resolveNotebookPagePaperStyle({ page: b, notebookPaperStyle: content.paperStyle })).toBe(
      'ruled',
    );
    expect(b.presentation).toBeUndefined();
  });

  it('6: absent layout resolves to free', () => {
    expect(resolveNotebookPageLayoutTemplate({ page: { id: 'p' } })).toBe('free');
    expect(
      resolveNotebookPageLayoutTemplate({
        page: { presentation: { paperStyle: 'grid' } },
      }),
    ).toBe('free');
  });
});

describe('7–11 sanitize safety + body isolation', () => {
  it('7: unknown paperStyle is dropped safely', () => {
    expect(
      sanitizeNotebookPagePresentation({ paperStyle: 'dotted', layoutTemplate: 'free' }),
    ).toEqual({ layoutTemplate: 'free' });
    expect(sanitizeNotebookPagePresentation({ paperStyle: 'dotted' })).toBeUndefined();
  });

  it('8: unknown layoutTemplate is dropped safely', () => {
    expect(
      sanitizeNotebookPagePresentation({ layoutTemplate: 'cornell', paperStyle: 'grid' }),
    ).toEqual({ paperStyle: 'grid' });
    expect(sanitizeNotebookPagePresentation({ layoutTemplate: 'cornell' })).toBeUndefined();
  });

  it('9: malformed presentation does not throw', () => {
    expect(() => sanitizeNotebookPagePresentation(null)).not.toThrow();
    expect(() => sanitizeNotebookPagePresentation('x')).not.toThrow();
    expect(() => sanitizeNotebookPagePresentation([])).not.toThrow();
    expect(() => sanitizeNotebookPagePresentation(42)).not.toThrow();
    expect(() =>
      sanitizeNotebookPage({
        id: 'p',
        sectionId: 's',
        kind: 'document',
        presentation: 'bad',
      }),
    ).not.toThrow();
    expect(
      sanitizeNotebookPage({
        id: 'p',
        sectionId: 's',
        kind: 'document',
        presentation: 'bad',
      })?.presentation,
    ).toBeUndefined();
  });

  it('10: body/documentBody unchanged by presentation sanitize', () => {
    const raw = {
      id: 'page-b',
      sectionId: 'sec-notes',
      kind: 'document',
      documentBody: v1Body('keep-me'),
      documentBodyCodecVersion: 1,
      presentation: { paperStyle: 'grid', layoutTemplate: 'free', extra: true },
    };
    const page = sanitizeNotebookPage(raw)!;
    expect(page.documentBody).toBe(raw.documentBody);
    expect(page.documentBodyCodecVersion).toBe(1);
    expect(page.presentation).toEqual({ paperStyle: 'grid', layoutTemplate: 'free' });
    expect(page.presentation).not.toHaveProperty('extra');
  });

  it('11: body codec metadata unchanged', () => {
    const page: NotebookPage = {
      id: 'page-b',
      sectionId: 'sec-notes',
      kind: 'document',
      documentBody: v1Body('codec'),
      documentBodyCodecVersion: 1,
      presentation: { paperStyle: 'blank' },
    };
    const next = replaceNotebookPageBody(page, { body: page.documentBody!, codecVersion: 1 });
    expect(next.documentBody).toBe(page.documentBody);
    expect(next.documentBodyCodecVersion).toBe(1);
    expect(next.presentation).toEqual({ paperStyle: 'blank' });
  });
});

describe('12–14 cloud + tombstone + reorder by page id', () => {
  it('12: cloud round-trip preserves presentation', () => {
    const content = ensureProjectObjectContent(
      'notebook',
      baseNotebook({
        pages: [
          {
            id: 'page-a',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'Page A',
            documentBody: 'Page 1 legacy notes',
            presentation: { paperStyle: 'blank', layoutTemplate: 'free' },
          },
          {
            id: 'page-b',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'Page B',
            documentBody: v1Body('Ipad test 123'),
            documentBodyCodecVersion: 1,
          },
        ],
        activePageId: 'page-b',
      }),
    ) as NotebookContentWithPages;
    const bodiesBefore = snapshotBodies(content);
    const cloud = prepareNotebookForCloudPersist(content, 'page-b') as NotebookContent;
    expect(cloud.pages!.find(p => p.id === 'page-a')!.presentation).toEqual({
      paperStyle: 'blank',
      layoutTemplate: 'free',
    });
    expect(cloud.pages!.find(p => p.id === 'page-b')!.presentation).toBeUndefined();
    const pulled = ensureProjectObjectContent('notebook', cloud) as NotebookContent;
    expect(pulled.pages!.find(p => p.id === 'page-a')!.presentation).toEqual({
      paperStyle: 'blank',
      layoutTemplate: 'free',
    });
    expect(bodiesBefore.pages.find(p => p.id === 'page-b')).toEqual(
      snapshotBodies(pulled).pages.find(p => p.id === 'page-b'),
    );
    expect(bodiesBefore.pages.find(p => p.id === 'page-a')).toEqual(
      snapshotBodies(pulled).pages.find(p => p.id === 'page-a'),
    );
  });

  it('13: page tombstone/delete/restore preserves presentation', async () => {
    const content = ensureProjectObjectContent(
      'notebook',
      baseNotebook({
        pages: [
          {
            id: 'page-a',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'Page A',
            documentBody: 'keep-a',
          },
          {
            id: 'page-b',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'Page B',
            documentBody: v1Body('present-me'),
            documentBodyCodecVersion: 1,
            presentation: { paperStyle: 'grid', layoutTemplate: 'free' },
          },
        ],
        activePageId: 'page-a',
      }),
    ) as NotebookContentWithPages;
    persistNotebook(content);

    const deleted = await softDeleteNotebookPage({
      content,
      pageId: 'page-b',
      currentBody: content.body,
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'Presentation NB',
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.tombstone.page.presentation).toEqual({
      paperStyle: 'grid',
      layoutTemplate: 'free',
    });

    persistNotebook(deleted.content);
    const restore = await restoreFromTombstone(deleted.tombstone);
    expect(restore.ok).toBe(true);

    const restored = loadNotebook().pages!.find(p => p.id === 'page-b')!;
    expect(restored.presentation).toEqual({ paperStyle: 'grid', layoutTemplate: 'free' });
    expect(restored.documentBody).toBe(v1Body('present-me'));
    expect(restored.documentBodyCodecVersion).toBe(1);
    expect(
      isEquivalentNotebookPage(restored, {
        ...deleted.tombstone.page,
        sectionId: restored.sectionId,
      }),
    ).toBe(true);
    expect((await listTombstones(SECTION, BOARD)).some(t => t.id === deleted.tombstone.id)).toBe(
      false,
    );
  });

  it('14: page reorder preserves presentation by page ID', () => {
    const content = ensureProjectObjectContent(
      'notebook',
      baseNotebook({
        pages: [
          {
            id: 'page-a',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'A',
            documentBody: 'A',
            presentation: { paperStyle: 'blank' },
          },
          {
            id: 'page-b',
            sectionId: 'sec-notes',
            kind: 'document',
            title: 'B',
            documentBody: 'B',
            presentation: { layoutTemplate: 'free' },
          },
        ],
      }),
    ) as NotebookContentWithPages;
    const reordered = reorderNotebookPagesInSection(content, 'sec-notes', ['page-b', 'page-a']);
    expect(reordered.sections?.[0]?.pageIds).toEqual(['page-b', 'page-a']);
    expect(reordered.pages!.find(p => p.id === 'page-a')!.presentation).toEqual({
      paperStyle: 'blank',
    });
    expect(reordered.pages!.find(p => p.id === 'page-b')!.presentation).toEqual({
      layoutTemplate: 'free',
    });
  });
});

describe('16 presentation-only ops do not write notebook body', () => {
  it('16: sanitize/resolve/hydrate leave body + codecs untouched', () => {
    const raw = baseNotebook({
      body: 'legacy-a',
      pages: [
        {
          id: 'page-a',
          sectionId: 'sec-notes',
          kind: 'document',
          title: 'Page A',
          documentBody: 'legacy-a',
          presentation: { paperStyle: 'grid', unknown: 1 } as unknown as NotebookPage['presentation'],
        },
        {
          id: 'page-b',
          sectionId: 'sec-notes',
          kind: 'document',
          title: 'Page B',
          documentBody: v1Body('v1-b'),
          documentBodyCodecVersion: 1,
        },
      ],
    });
    const before = snapshotBodies(raw);
    const ensured = ensureProjectObjectContent('notebook', JSON.parse(JSON.stringify(raw))) as NotebookContent;
    const hydrated = hydrateNotebookPages(ensured);
    resolveNotebookPagePaperStyle({
      page: ensured.pages![0],
      notebookPaperStyle: ensured.paperStyle,
    });
    resolveNotebookPageLayoutTemplate({ page: ensured.pages![1] });
    expect(snapshotBodies(ensured)).toEqual(before);
    expect(snapshotBodies(hydrated)).toEqual(before);
    expect(ensured.pages![0].presentation).toEqual({ paperStyle: 'grid' });
    expect(ensured.pages![0].presentation).not.toHaveProperty('unknown');
  });
});
