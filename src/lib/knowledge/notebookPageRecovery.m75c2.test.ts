/**
 * M7.5C2 — Safe notebook_page tombstone + recovery foundation.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTestLocalStorage } from './testLocalStorage';
ensureTestLocalStorage();

import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { NotebookContentWithPages, NotebookPage } from '../notebookPages/types';
import { resetKnowledgeJournalDbForTests } from './knowledgeJournalIdb';
import { restoreFromTombstone } from './knowledgeRestore';
import {
  deleteTombstonePermanently,
  listTombstones,
  writeNotebookPageTombstone,
} from './tombstoneStore';
import {
  collectAssetKeysFromNotebookPageTombstones,
  isEquivalentNotebookPage,
  softDeleteNotebookPage,
} from './notebookPageRecovery';
import { collectNotebookReferencedImageKeys } from '../notebookAssetRefs';

const cascadeSpy = vi.hoisted(() => vi.fn(async () => ({ handwriting: 0, images: 0 })));

vi.mock('../notebookDeleteCascade', () => ({
  cascadeDeleteNotebookAssets: cascadeSpy,
}));

const SECTION = 'sec-m75c2';
const BOARD = 'main';
const OBJECT_ID = 'nb-m75c2-1';

function objectsKey() {
  return boardScopedFreeSpaceKeys(SECTION, BOARD).objects;
}

function docPage(id: string, body: string, title?: string, codec?: number): NotebookPage {
  return {
    id,
    sectionId: 'sec-notes',
    kind: 'document',
    title: title ?? id,
    documentBody: body,
    ...(codec !== undefined ? { documentBodyCodecVersion: codec } : {}),
  };
}

function writePage(id: string, ink: string): NotebookPage {
  return {
    id,
    sectionId: 'sec-notes',
    kind: 'write',
    title: id,
    inkPageKey: ink,
  };
}

function notebookContent(pages: NotebookPage[], activePageId: string): NotebookContentWithPages {
  return {
    type: 'notebook',
    body: pages.find(p => p.id === activePageId)?.documentBody ?? '',
    bodyCodecVersion: pages.find(p => p.id === activePageId)?.documentBodyCodecVersion,
    schemaVersion: 1,
    sections: [{ id: 'sec-notes', title: 'Notes', pageIds: pages.map(p => p.id) }],
    pages,
    activeSectionId: 'sec-notes',
    activePageId,
  };
}

function persistNotebook(content: NotebookContentWithPages, title = 'Multi Page NB') {
  const obj: ProjectSpaceObject = {
    id: OBJECT_ID,
    type: 'notebook',
    title,
    content,
    updatedAt: Date.now(),
  };
  localStorage.setItem(objectsKey(), JSON.stringify([obj]));
  return obj;
}

function loadNotebook(): NotebookContentWithPages {
  const raw = localStorage.getItem(objectsKey());
  const objs = JSON.parse(raw ?? '[]') as ProjectSpaceObject[];
  const nb = objs.find(o => o.id === OBJECT_ID);
  expect(nb?.content.type).toBe('notebook');
  return nb!.content as NotebookContentWithPages;
}

beforeEach(async () => {
  localStorage.clear();
  cascadeSpy.mockClear();
  await resetKnowledgeJournalDbForTests();
  indexedDB.deleteDatabase('fw_knowledge_journal_v1');
  await resetKnowledgeJournalDbForTests();
});

afterEach(async () => {
  await resetKnowledgeJournalDbForTests();
});

describe('M7.5C2 — softDeleteNotebookPage', () => {
  it('A. delete middle A/B/C → B tombstoned, C active', async () => {
    const content = notebookContent(
      [
        docPage('a', 'Page A body', 'Lecture 1', 1),
        docPage('b', '::img::img-b::"B"::\nPage B', 'Lecture 2', 1),
        docPage('c', 'Page C body', 'Lecture 3', 1),
      ],
      'b',
    );
    const result = await softDeleteNotebookPage({
      content,
      pageId: 'b',
      currentBody: content.body,
      currentCodecVersion: 1,
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'Multi Page NB',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.activePageId).toBe('c');
    expect(result.content.pages?.map(p => p.id)).toEqual(['a', 'c']);
    expect(result.tombstone.kind).toBe('notebook_page');
    expect(result.tombstone.page.documentBody).toContain('::img::img-b::');
    const listed = await listTombstones(SECTION);
    expect(listed.some(t => t.kind === 'notebook_page' && t.id === result.tombstone.id)).toBe(true);
  });

  it('B. delete active final-position → previous active', async () => {
    const content = notebookContent(
      [docPage('a', 'A'), docPage('b', 'B')],
      'b',
    );
    const result = await softDeleteNotebookPage({
      content,
      pageId: 'b',
      currentBody: 'B',
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.activePageId).toBe('a');
  });

  it('C. delete inactive page → active unchanged', async () => {
    const content = notebookContent(
      [docPage('a', 'A'), docPage('b', 'B'), docPage('c', 'C')],
      'a',
    );
    const result = await softDeleteNotebookPage({
      content,
      pageId: 'c',
      currentBody: 'A',
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.activePageId).toBe('a');
    expect(result.content.pages?.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('D. final remaining page refused — zero tombstone, zero mutation', async () => {
    const content = notebookContent([docPage('only', 'Solo')], 'only');
    const before = JSON.stringify(content);
    const result = await softDeleteNotebookPage({
      content,
      pageId: 'only',
      currentBody: 'Solo',
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LAST_PAGE');
    expect(result.reason).toMatch(/at least one page/i);
    expect(JSON.stringify(result.content.pages)).toBe(JSON.stringify(content.pages));
    expect(await listTombstones(SECTION)).toEqual([]);
    expect(before).toBe(JSON.stringify(content));
  });

  it('E. tombstone failure → page remains', async () => {
    const content = notebookContent([docPage('a', 'A'), docPage('b', 'B')], 'a');
    // Force incomplete identity so writeNotebookPageTombstone fails closed.
    const result = await softDeleteNotebookPage({
      content,
      pageId: 'b',
      currentBody: 'A',
      sectionId: '',
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID');
    expect(result.content.pages?.map(p => p.id)).toEqual(['a', 'b']);
    expect(await listTombstones()).toEqual([]);
  });
});

describe('M7.5C2 — restore notebook_page', () => {
  async function softDeleteAndPersist(
    pages: NotebookPage[],
    active: string,
    deleteId: string,
  ) {
    const content = notebookContent(pages, active);
    const activeBody = pages.find(p => p.id === active)?.documentBody ?? '';
    const result = await softDeleteNotebookPage({
      content,
      pageId: deleteId,
      currentBody: activeBody,
      currentCodecVersion: pages.find(p => p.id === active)?.documentBodyCodecVersion,
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'Multi Page NB',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('soft delete failed');
    persistNotebook(result.content);
    return result;
  }

  it('F+G. restore exact documentBody + codecVersion', async () => {
    const deleted = await softDeleteAndPersist(
      [
        docPage('a', 'A', 'A', 1),
        docPage('b', 'BODY_EXACT_MARKER\nline2', 'B', 1),
        docPage('c', 'C', 'C', 1),
      ],
      'a',
      'b',
    );
    const restore = await restoreFromTombstone(deleted.tombstone);
    expect(restore.ok).toBe(true);
    const nb = loadNotebook();
    const page = nb.pages?.find(p => p.id === 'b');
    expect(page?.documentBody).toBe('BODY_EXACT_MARKER\nline2');
    expect(page?.documentBodyCodecVersion).toBe(1);
    expect((await listTombstones(SECTION)).some(t => t.id === deleted.tombstone.id)).toBe(false);
  });

  it('H. restore image page keeps image key available to collectors', async () => {
    const deleted = await softDeleteAndPersist(
      [
        docPage('a', 'A'),
        docPage('b', '::img::img-only-b::"B"::\n'),
      ],
      'a',
      'b',
    );
    // While tombstoned, extras retain the image key.
    const extras = collectAssetKeysFromNotebookPageTombstones(
      [deleted.tombstone],
      OBJECT_ID,
    );
    expect(extras.imageKeys).toContain('img-only-b');
    expect(
      collectNotebookReferencedImageKeys({
        pages: loadNotebook().pages,
        liveBody: loadNotebook().body,
        extraImageKeys: extras.imageKeys,
      }),
    ).toContain('img-only-b');

    await restoreFromTombstone(deleted.tombstone);
    const nb = loadNotebook();
    expect(
      collectNotebookReferencedImageKeys({ pages: nb.pages, liveBody: nb.body }),
    ).toContain('img-only-b');
  });

  it('I. restore inline handwriting', async () => {
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A'), docPage('b', '::hw::hw-b-key::\n')],
      'a',
      'b',
    );
    expect(
      collectAssetKeysFromNotebookPageTombstones([deleted.tombstone], OBJECT_ID).handwritingKeys,
    ).toContain('hw-b-key');
    await restoreFromTombstone(deleted.tombstone);
    expect(loadNotebook().pages?.find(p => p.id === 'b')?.documentBody).toContain('::hw::hw-b-key::');
  });

  it('J. restore write-page ink', async () => {
    const pages = [docPage('a', 'A'), writePage('w', 'ink-w-key')];
    const content = notebookContent(pages, 'a');
    // write pages have empty documentBody projection for active doc page
    const result = await softDeleteNotebookPage({
      content: { ...content, pages, sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['a', 'w'] }] },
      pageId: 'w',
      currentBody: 'A',
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    persistNotebook(result.content);
    expect(
      collectAssetKeysFromNotebookPageTombstones([result.tombstone], OBJECT_ID).handwritingKeys,
    ).toContain('ink-w-key');
    await restoreFromTombstone(result.tombstone);
    const w = loadNotebook().pages?.find(p => p.id === 'w');
    expect(w?.kind).toBe('write');
    expect(w?.inkPageKey).toBe('ink-w-key');
  });

  it('K. same-ID equivalent restore is idempotent', async () => {
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A', 'A', 1), docPage('b', 'Bbody', 'B', 1)],
      'a',
      'b',
    );
    await restoreFromTombstone(deleted.tombstone);
    // Re-insert tombstone manually simulating leftover after prior restore success
    const again = await writeNotebookPageTombstone({
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'Multi Page NB',
      page: deleted.tombstone.page,
      indexInSection: deleted.tombstone.indexInSection,
      sectionIdOfPage: deleted.tombstone.sectionIdOfPage,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const second = await restoreFromTombstone(again.tombstone);
    expect(second.ok).toBe(true);
    expect(loadNotebook().pages?.filter(p => p.id === 'b')).toHaveLength(1);
  });

  it('L. same-ID divergent restore fails and keeps tombstone', async () => {
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A', 'A', 1), docPage('b', 'original-b', 'B', 1)],
      'a',
      'b',
    );
    // Divergent live page with same id
    const nb = loadNotebook();
    persistNotebook({
      ...nb,
      pages: [
        ...(nb.pages ?? []),
        docPage('b', 'DIFFERENT BODY', 'B', 1),
      ],
      sections: [
        {
          id: 'sec-notes',
          title: 'Notes',
          pageIds: [...(nb.sections?.[0]?.pageIds ?? []), 'b'],
        },
      ],
    });
    const result = await restoreFromTombstone(deleted.tombstone);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/does not match/i);
    expect((await listTombstones(SECTION)).some(t => t.id === deleted.tombstone.id)).toBe(true);
  });

  it('M. missing parent fails and keeps tombstone', async () => {
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A'), docPage('b', 'B')],
      'a',
      'b',
    );
    localStorage.setItem(objectsKey(), JSON.stringify([]));
    const result = await restoreFromTombstone(deleted.tombstone);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/parent notebook/i);
    expect((await listTombstones(SECTION)).some(t => t.id === deleted.tombstone.id)).toBe(true);
  });

  it('N. restore into original section/index', async () => {
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A'), docPage('b', 'B'), docPage('c', 'C')],
      'a',
      'b',
    );
    expect(deleted.tombstone.indexInSection).toBe(1);
    await restoreFromTombstone(deleted.tombstone);
    expect(loadNotebook().sections?.[0]?.pageIds).toEqual(['a', 'b', 'c']);
  });

  it('O. missing original section → first surviving section', async () => {
    const pages = [
      { ...docPage('a', 'A'), sectionId: 'sec-keep' },
      { ...docPage('b', 'B'), sectionId: 'sec-gone' },
    ];
    const content: NotebookContentWithPages = {
      type: 'notebook',
      body: 'A',
      schemaVersion: 1,
      sections: [
        { id: 'sec-keep', title: 'Keep', pageIds: ['a'] },
        { id: 'sec-gone', title: 'Gone', pageIds: ['b'] },
      ],
      pages,
      activeSectionId: 'sec-keep',
      activePageId: 'a',
    };
    const result = await softDeleteNotebookPage({
      content,
      pageId: 'b',
      currentBody: 'A',
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Drop the gone section from surviving notebook
    persistNotebook({
      ...result.content,
      sections: (result.content.sections ?? []).filter(s => s.id === 'sec-keep'),
    });
    await restoreFromTombstone(result.tombstone);
    const nb = loadNotebook();
    expect(nb.pages?.find(p => p.id === 'b')?.sectionId).toBe('sec-keep');
    expect(nb.sections?.find(s => s.id === 'sec-keep')?.pageIds).toContain('b');
  });

  it('P+Q. assets only on recoverable deleted page stay in extras', async () => {
    const deleted = await softDeleteAndPersist(
      [
        docPage('a', 'plain'),
        docPage('b', '::img::only-b::"x"::\n::hw::only-hw::\n'),
      ],
      'a',
      'b',
    );
    const livePages = loadNotebook().pages;
    expect(
      collectNotebookReferencedImageKeys({ pages: livePages, liveBody: 'plain' }),
    ).not.toContain('only-b');
    const extras = collectAssetKeysFromNotebookPageTombstones([deleted.tombstone], OBJECT_ID);
    expect(extras.imageKeys).toContain('only-b');
    expect(extras.handwritingKeys).toContain('only-hw');
    expect(
      collectNotebookReferencedImageKeys({
        pages: livePages,
        liveBody: 'plain',
        extraImageKeys: extras.imageKeys,
      }),
    ).toContain('only-b');
  });

  it('R. permanent tombstone delete never cascades whole notebook', async () => {
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A'), docPage('b', '::img::gone::"g"::\n')],
      'a',
      'b',
    );
    await deleteTombstonePermanently(deleted.tombstone, { userId: 'u1' });
    expect(cascadeSpy).not.toHaveBeenCalled();
    expect(await listTombstones(SECTION)).toEqual([]);
    // Exclusive asset no longer retained by extras
    expect(
      collectAssetKeysFromNotebookPageTombstones([], OBJECT_ID).imageKeys,
    ).not.toContain('gone');
  });

  it('S. expiry path uses permanent delete without notebook cascade', async () => {
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A'), docPage('b', 'B')],
      'a',
      'b',
    );
    const expired = { ...deleted.tombstone, expiresAt: Date.now() - 1 };
    await idbPutExpired(expired);
    const { purgeExpiredTombstones } = await import('./tombstoneStore');
    await purgeExpiredTombstones();
    expect(cascadeSpy).not.toHaveBeenCalled();
  });

  it('T. whole notebook already contains equivalent page → idempotent', async () => {
    const pageB = docPage('b', 'same', 'B', 1);
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A', 'A', 1), pageB],
      'a',
      'b',
    );
    await restoreFromTombstone(deleted.tombstone);
    const leftover = await writeNotebookPageTombstone({
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'Multi Page NB',
      page: pageB,
      indexInSection: 1,
      sectionIdOfPage: 'sec-notes',
    });
    expect(leftover.ok).toBe(true);
    if (!leftover.ok) return;
    expect((await restoreFromTombstone(leftover.tombstone)).ok).toBe(true);
    expect(loadNotebook().pages?.filter(p => p.id === 'b')).toHaveLength(1);
  });

  it('U. malformed versioned body preserved without normalization', async () => {
    const weird = '~nb1:["paragraph","KEEP_RAW",[],null]\n';
    const deleted = await softDeleteAndPersist(
      [docPage('a', 'A'), docPage('b', weird, 'B', 1)],
      'a',
      'b',
    );
    expect(deleted.tombstone.page.documentBody).toBe(weird);
    expect(deleted.tombstone.page.documentBodyCodecVersion).toBe(1);
    await restoreFromTombstone(deleted.tombstone);
    expect(loadNotebook().pages?.find(p => p.id === 'b')?.documentBody).toBe(weird);
  });

  it('equivalence rejects same id with different body', () => {
    expect(
      isEquivalentNotebookPage(docPage('x', 'one', 'X', 1), docPage('x', 'two', 'X', 1)),
    ).toBe(false);
  });
});

async function idbPutExpired(tombstone: import('./knowledgeTypes').NotebookPageTombstone) {
  const { idbPut, TOMBSTONES_STORE: store } = await import('./knowledgeJournalIdb');
  await idbPut(store, tombstone);
}
