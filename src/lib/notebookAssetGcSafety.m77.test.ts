/**
 * M7.7 — Soft-delete ↔ asset GC race: recoverable page assets must survive
 * immediate GC, including before a deferred tombstone list would finish.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTestLocalStorage } from './knowledge/testLocalStorage';
ensureTestLocalStorage();

const notebookImageMem = vi.hoisted(() => new Map<string, Blob>());

vi.mock('./notebookImageStore', async importOriginal => {
  const mod = await importOriginal<typeof import('./notebookImageStore')>();
  return {
    ...mod,
    nbImageLoadBlob: vi.fn(async (key: string) => notebookImageMem.get(key)),
    nbImageSaveBlob: vi.fn(async (key: string, blob: Blob) => {
      notebookImageMem.set(key, blob);
    }),
    nbImageDelete: vi.fn(async (key: string) => {
      notebookImageMem.delete(key);
    }),
  };
});

vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
}));

vi.mock('./focusCache/freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

const cascadeSpy = vi.hoisted(() => vi.fn(async () => ({ handwriting: 0, images: 0 })));
vi.mock('./notebookDeleteCascade', async importOriginal => {
  const mod = await importOriginal<typeof import('./notebookDeleteCascade')>();
  return {
    ...mod,
    cascadeDeleteNotebookAssets: (...args: Parameters<typeof cascadeSpy>) => cascadeSpy(...args),
  };
});

import { resetKnowledgeJournalDbForTests } from './knowledge/knowledgeJournalIdb';
import { listTombstones } from './knowledge/tombstoneStore';
import {
  softDeleteNotebookPage,
  collectAssetKeysFromNotebookPageTombstones,
} from './knowledge/notebookPageRecovery';
import { deleteTombstonePermanently } from './knowledge/tombstoneStore';
import { restoreFromTombstone } from './knowledge/knowledgeRestore';
import type { NotebookContentWithPages, NotebookPage } from './notebookPages/types';
import { resolveNotebookGcReferencedKeys } from './notebookAssetGcResolve';
import {
  gcOrphanNotebookImages,
  resetNotebookImageCloudForTests,
  setNotebookImageManifest,
} from './notebookImageCloud';
import { nbImageLoadBlob, nbImageSaveBlob } from './notebookImageStore';
import {
  gcOrphanHandwritingKeys,
  hwGet,
  hwSet,
  resetNotebookHandwritingStoreForTests,
} from './notebookHandwritingStore';
import { emptyHandwritingData } from './handwritingTypes';
import { cascadeDeleteNotebookAssets } from './notebookDeleteCascade';
import { collectNotebookReferencedImageKeys } from './notebookAssetRefs';

const OBJECT_ID = 'nb-m77-gc';
const USER = 'user-m77-gc';

function docPage(id: string, body: string): NotebookPage {
  return {
    id,
    sectionId: 'sec-notes',
    kind: 'document',
    title: id,
    documentBody: body,
    documentBodyCodecVersion: 1,
  };
}

function notebook(pages: NotebookPage[], activePageId: string): NotebookContentWithPages {
  return {
    type: 'notebook',
    body: pages.find(p => p.id === activePageId)?.documentBody ?? '',
    bodyCodecVersion: 1,
    schemaVersion: 1,
    sections: [{ id: 'sec-notes', title: 'Notes', pageIds: pages.map(p => p.id) }],
    pages,
    activeSectionId: 'sec-notes',
    activePageId,
  };
}

function pngBlob(): Blob {
  return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
}

let sectionSeq = 0;
function freshSection(): string {
  sectionSeq += 1;
  return `sec-m77-gc-${sectionSeq}-${Date.now()}`;
}

beforeEach(async () => {
  notebookImageMem.clear();
  await resetKnowledgeJournalDbForTests();
  resetNotebookImageCloudForTests();
  resetNotebookHandwritingStoreForTests();
  cascadeSpy.mockClear();
});

afterEach(async () => {
  notebookImageMem.clear();
  await resetKnowledgeJournalDbForTests();
  resetNotebookImageCloudForTests();
  resetNotebookHandwritingStoreForTests();
});

describe('M7.7 soft-delete ↔ asset GC safety', () => {
  it('A–G image: soft-delete unique image, immediate GC, restore hydrates', async () => {
    const SECTION = freshSection();
    const imageKey = 'img-only-b';
    await nbImageSaveBlob(imageKey, pngBlob());
    setNotebookImageManifest(OBJECT_ID, [imageKey]);
    expect(await nbImageLoadBlob(imageKey)).toBeTruthy();

    const content = notebook(
      [docPage('a', 'plain A\n'), docPage('b', `::img::${imageKey}::"B"::\n`)],
      'a',
    );
    const deleted = await softDeleteNotebookPage({
      content,
      pageId: 'b',
      currentBody: content.body ?? '',
      currentCodecVersion: 1,
      sectionId: SECTION,
      boardId: 'main',
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;

    expect(
      collectNotebookReferencedImageKeys({
        pages: deleted.content.pages,
        liveBody: deleted.content.body,
      }),
    ).not.toContain(imageKey);

    let releaseList!: () => void;
    const deferred = new Promise<void>(r => {
      releaseList = r;
    });
    const resolvePromise = resolveNotebookGcReferencedKeys({
      sectionId: SECTION,
      objectId: OBJECT_ID,
      pages: deleted.content.pages,
      liveBody: deleted.content.body,
      listTombstonesFn: async sectionId => {
        await deferred;
        return listTombstones(sectionId);
      },
    });

    releaseList();
    const resolved = await resolvePromise;
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.imageKeys).toContain(imageKey);

    const removed = await gcOrphanNotebookImages({
      userId: USER,
      sectionId: SECTION,
      objectId: OBJECT_ID,
      referencedKeys: resolved.imageKeys,
    });
    expect(removed).not.toContain(imageKey);
    expect(await nbImageLoadBlob(imageKey)).toBeTruthy();

    await restoreFromTombstone(deleted.tombstone);
    expect(await nbImageLoadBlob(imageKey)).toBeTruthy();
  });

  it('handwriting H: soft-delete unique hw, GC keeps, restore readable', async () => {
    const SECTION = freshSection();
    const hwKey = 'hw-only-b';
    await hwSet(OBJECT_ID, hwKey, {
      ...emptyHandwritingData(200, 120),
      strokes: [
        {
          id: 's1',
          tool: 'pen',
          color: '#000',
          width: 2,
          points: [{ x: 1, y: 1, t: 0, pressure: 0.5 }],
        },
      ],
      updatedAt: 1,
    });

    const content = notebook(
      [docPage('a', 'plain\n'), docPage('b', `::hw::${hwKey}::\n`)],
      'a',
    );
    const deleted = await softDeleteNotebookPage({
      content,
      pageId: 'b',
      currentBody: content.body ?? '',
      currentCodecVersion: 1,
      sectionId: SECTION,
      boardId: 'main',
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;

    let releaseList!: () => void;
    const deferred = new Promise<void>(r => {
      releaseList = r;
    });
    const resolvePromise = resolveNotebookGcReferencedKeys({
      sectionId: SECTION,
      objectId: OBJECT_ID,
      pages: deleted.content.pages,
      liveBody: deleted.content.body,
      includeAllPageInkKeys: true,
      listTombstonesFn: async sectionId => {
        await deferred;
        return listTombstones(sectionId);
      },
    });
    releaseList();
    const resolved = await resolvePromise;
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.handwritingKeys).toContain(hwKey);

    const removed = await gcOrphanHandwritingKeys(OBJECT_ID, resolved.handwritingKeys);
    expect(removed).not.toContain(hwKey);
    expect(await hwGet(OBJECT_ID, hwKey)).toBeTruthy();
  });

  it('genuinely orphaned image can still be collected after resolve', async () => {
    const SECTION = freshSection();
    const orphan = 'img-orphan';
    const kept = 'img-kept';
    await nbImageSaveBlob(orphan, pngBlob());
    await nbImageSaveBlob(kept, pngBlob());
    setNotebookImageManifest(OBJECT_ID, [orphan, kept]);

    const content = notebook([docPage('a', `::img::${kept}::"K"::\n`)], 'a');
    const resolved = await resolveNotebookGcReferencedKeys({
      sectionId: SECTION,
      objectId: OBJECT_ID,
      pages: content.pages,
      liveBody: content.body,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.imageKeys).toContain(kept);
    expect(resolved.imageKeys).not.toContain(orphan);

    const removed = await gcOrphanNotebookImages({
      userId: USER,
      sectionId: SECTION,
      objectId: OBJECT_ID,
      referencedKeys: resolved.imageKeys,
    });
    expect(removed).toContain(orphan);
    expect(await nbImageLoadBlob(orphan)).toBeUndefined();
    expect(await nbImageLoadBlob(kept)).toBeTruthy();
  });

  it('live inactive-page image remains protected', async () => {
    const SECTION = freshSection();
    const inactive = 'img-inactive';
    await nbImageSaveBlob(inactive, pngBlob());
    setNotebookImageManifest(OBJECT_ID, [inactive]);
    const content = notebook(
      [docPage('a', `::img::${inactive}::"A"::\n`), docPage('b', 'plain B\n')],
      'b',
    );
    const resolved = await resolveNotebookGcReferencedKeys({
      sectionId: SECTION,
      objectId: OBJECT_ID,
      pages: content.pages,
      liveBody: 'plain B\n',
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.imageKeys).toContain(inactive);
    const removed = await gcOrphanNotebookImages({
      userId: USER,
      sectionId: SECTION,
      objectId: OBJECT_ID,
      referencedKeys: resolved.imageKeys,
    });
    expect(removed).not.toContain(inactive);
    expect(await nbImageLoadBlob(inactive)).toBeTruthy();
  });

  it('unresolved tombstone list refuses GC roots (fail-safe keep)', async () => {
    const resolved = await resolveNotebookGcReferencedKeys({
      sectionId: freshSection(),
      objectId: OBJECT_ID,
      pages: [docPage('a', 'x')],
      listTombstonesFn: async () => {
        throw new Error('idb down');
      },
    });
    expect(resolved).toEqual({ ok: false, reason: 'unresolved' });
  });

  it('missing identity refuses GC', async () => {
    expect(
      await resolveNotebookGcReferencedKeys({
        sectionId: '',
        objectId: OBJECT_ID,
        pages: [],
      }),
    ).toEqual({ ok: false, reason: 'missing_identity' });
  });

  it('notebook_page permanent delete does not cascade whole-notebook assets', async () => {
    const SECTION = freshSection();
    const content = notebook(
      [docPage('a', 'A'), docPage('b', '::img::gone::"g"::\n')],
      'a',
    );
    const deleted = await softDeleteNotebookPage({
      content,
      pageId: 'b',
      currentBody: 'A',
      currentCodecVersion: 1,
      sectionId: SECTION,
      boardId: 'main',
      objectId: OBJECT_ID,
      objectTitle: 'NB',
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    await deleteTombstonePermanently(deleted.tombstone, { userId: USER });
    expect(cascadeSpy).not.toHaveBeenCalled();
    expect(await listTombstones(SECTION)).toEqual([]);
    expect(
      collectAssetKeysFromNotebookPageTombstones([], OBJECT_ID).imageKeys,
    ).not.toContain('gone');
  });

  it('whole-notebook cascade helper remains available (M7.0 unchanged export)', async () => {
    expect(typeof cascadeDeleteNotebookAssets).toBe('function');
    await cascadeDeleteNotebookAssets({
      userId: USER,
      sectionId: freshSection(),
      objectId: OBJECT_ID,
    });
    expect(cascadeSpy).toHaveBeenCalled();
  });
});
