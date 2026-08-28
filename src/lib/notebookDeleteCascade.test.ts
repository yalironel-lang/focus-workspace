/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { cascadeDeleteNotebookAssets } from './notebookDeleteCascade';
import { nbImageSaveBlob, nbImageLoadBlob } from './notebookImageStore';
import { hwSet, hwGet, resetNotebookHandwritingStoreForTests } from './notebookHandwritingStore';
import { resetFocusCacheDbForTests } from './focusCache/db';
import { FOCUS_CACHE_DB_NAME } from './focusCache/types';
import { listPendingOperations } from './focusCache/pendingOperations';
import { emptyHandwritingData } from './handwritingTypes';
import { resetNotebookImageCloudForTests } from './notebookImageCloud';
import { resetNotebookHandwritingCloudForTests } from './notebookHandwritingCloud';

vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
}));

vi.mock('./focusCache/freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

const userId = 'user-cascade-1';
const sectionId = 'sec-cascade-1';
const objectId = 'nb-cascade-1';

async function resetDbs(): Promise<void> {
  resetNotebookHandwritingStoreForTests();
  resetNotebookImageCloudForTests();
  resetNotebookHandwritingCloudForTests();
  await resetFocusCacheDbForTests();
  for (const name of [FOCUS_CACHE_DB_NAME, 'fw_notebook_images_v1', 'fw_notebook_handwriting_v1']) {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error(`delete ${name} failed`));
      req.onblocked = () => resolve();
    });
  }
}

describe('notebook delete cascade', () => {
  beforeEach(async () => {
    notebookImageMem.clear();
    await resetDbs();
  });

  it('deletes handwriting blocks, page ink keys, and inline images for notebook object', async () => {
    const hwKey = 'hw-block-1';
    const imageKey = 'img-inline-1';
    await hwSet(objectId, hwKey, { ...emptyHandwritingData(), updatedAt: 1 });
    await nbImageSaveBlob(imageKey, new Blob([new Uint8Array([1])], { type: 'image/png' }));

    const result = await cascadeDeleteNotebookAssets({
      userId,
      sectionId,
      objectId,
      content: {
        type: 'notebook',
        body: `::hw::${hwKey}::\n::img::${imageKey}::alt::`,
        pages: [{ id: 'p1', title: 'P1', content: '', createdAt: 1, updatedAt: 1 }],
      },
    });

    expect(result.handwriting).toBeGreaterThanOrEqual(1);
    expect(result.images).toBe(1);
    expect(await hwGet(objectId, hwKey)).toBeNull();
    expect(await nbImageLoadBlob(imageKey)).toBeUndefined();

    const listed = await listPendingOperations({ userId, workspaceId: sectionId });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const deletes = listed.value.filter(op => op.operationType === 'delete');
    expect(deletes.length).toBeGreaterThanOrEqual(2);
  });

  it('does not delete assets belonging to another object', async () => {
    const otherObjectId = 'nb-other';
    const otherKey = 'img-other';
    await nbImageSaveBlob(otherKey, new Blob([new Uint8Array([2])], { type: 'image/png' }));

    await cascadeDeleteNotebookAssets({
      userId,
      sectionId,
      objectId,
      content: { type: 'notebook', body: '' },
    });

    expect(await nbImageLoadBlob(otherKey)).toBeDefined();
  });
});
