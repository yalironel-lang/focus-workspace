/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { resetFocusCacheDbForTests } from './focusCache/db';
import { FOCUS_CACHE_DB_NAME } from './focusCache/types';
import { listPendingOperations } from './focusCache/pendingOperations';
import {
  getCloudSyncSnapshot,
  resetCloudSyncStatusForTests,
} from './sync/cloudSyncStatus';
import { parseUserContentAssetDescriptor } from './userContentAssetDescriptor';
import { clearUserContentAssetResolversForTests } from './userContentAssetResolver';
import * as userContentStorage from './userContentStorage';
import {
  nbImageDelete,
  nbImageLoadBlob,
  nbImageSaveBlob,
} from './notebookImageStore';
import {
  buildNotebookImageCloudPath,
  deleteNotebookImageAsset,
  flushAllPendingNotebookImageCloudEnqueues,
  flushNotebookImageCloudEnqueueNow,
  gcOrphanNotebookImages,
  hydrateNotebookImageFromCloud,
  hydrateNotebookImagesWithCloud,
  reconcileNotebookImageWithCloud,
  resetNotebookImageCloudForTests,
  scheduleNotebookImageCloudUpload,
  setNotebookImageManifest,
} from './notebookImageCloud';
import {
  isUserContentAssetDeleted,
  resetUserContentAssetAuthorityForTests,
  userContentAssetEntityKey,
} from './userContentAssetAuthority';

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(),
        download: vi.fn(),
        remove: vi.fn(),
      }),
    },
  },
}));

vi.mock('./focusCache/freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

const ids = {
  userId: 'user-1',
  sectionId: 'sec-1',
  objectId: 'obj-nb-1',
  imageKey: 'img-test-1',
};

function pngBlob(bytes: number[] = [137, 80, 78, 71]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}

async function deleteDbs(): Promise<void> {
  await resetFocusCacheDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(FOCUS_CACHE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('delete focus cache db failed'));
    req.onblocked = () => resolve();
  });
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('fw_notebook_images_v1');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('delete nb images db failed'));
    req.onblocked = () => resolve();
  });
}

async function listUploads() {
  const listed = await listPendingOperations({
    userId: ids.userId,
    workspaceId: ids.sectionId,
  });
  if (!listed.ok) return [];
  return listed.value.filter(
    op => op.entityType === 'user_content_asset' && op.operationType === 'create',
  );
}

describe('notebook inline image cloud', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    notebookImageMem.clear();
    await deleteDbs();
    resetCloudSyncStatusForTests();
    clearUserContentAssetResolversForTests();
    resetNotebookImageCloudForTests();
    resetUserContentAssetAuthorityForTests();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    resetNotebookImageCloudForTests();
    resetUserContentAssetAuthorityForTests();
  });

  it('maps stable storage path from object + image key', () => {
    expect(buildNotebookImageCloudPath(ids)).toBe(
      'user-1/sec-1/obj-nb-1/notebook-image/img-test-1',
    );
  });

  it('A upload → B local miss → cloud hydrate → render-ready blob', async () => {
    const blobA = pngBlob([1, 2, 3, 4]);
    await nbImageSaveBlob(ids.imageKey, blobA);
    setNotebookImageManifest(ids.objectId, [ids.imageKey]);

    vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    await reconcileNotebookImageWithCloud(ids, true);
    await flushNotebookImageCloudEnqueueNow(ids);
    expect(await listUploads()).toHaveLength(1);

    await deleteDbs();
    resetNotebookImageCloudForTests();
    notebookImageMem.clear();
    vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: blobA,
    });

    const result = await hydrateNotebookImageFromCloud(ids);
    expect(result.status).toBe('cloud_hit');
    const local = await nbImageLoadBlob(ids.imageKey);
    expect(local?.type).toBe('image/png');
    expect(new Uint8Array(await local!.arrayBuffer())).toEqual(
      new Uint8Array(await blobA.arrayBuffer()),
    );
  });

  it('B reopen with local + cloud does not enqueue unnecessary re-upload', async () => {
    const blob = pngBlob([9, 9, 9]);
    await nbImageSaveBlob(ids.imageKey, blob);
    vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: blob,
    });
    setNotebookImageManifest(ids.objectId, [ids.imageKey]);
    const action = await reconcileNotebookImageWithCloud(ids, true);
    expect(action).toBe('skip');
    scheduleNotebookImageCloudUpload(ids, Date.now(), true);
    await flushAllPendingNotebookImageCloudEnqueues();
    expect(await listUploads()).toHaveLength(0);
  });

  it('local-only image migrates when referenced and cloud missing', async () => {
    await nbImageSaveBlob(ids.imageKey, pngBlob());
    expect((await nbImageLoadBlob(ids.imageKey))?.size).toBeGreaterThan(0);
    vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    setNotebookImageManifest(ids.objectId, [ids.imageKey]);
    expect(await reconcileNotebookImageWithCloud(ids, true)).toBe('upload');
    await flushNotebookImageCloudEnqueueNow(ids);
    expect(await listUploads()).toHaveLength(1);
  });

  it('removed ::img:: ref GC deletes local + enqueues cloud delete', async () => {
    await nbImageSaveBlob(ids.imageKey, pngBlob());
    setNotebookImageManifest(ids.objectId, [ids.imageKey]);
    const removed = await gcOrphanNotebookImages({
      userId: ids.userId,
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      referencedKeys: [],
    });
    expect(removed).toEqual([ids.imageKey]);
    expect(await nbImageLoadBlob(ids.imageKey)).toBeUndefined();

    const listed = await listPendingOperations({
      userId: ids.userId,
      workspaceId: ids.sectionId,
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.some(op => op.operationType === 'delete')).toBe(true);
  });

  it('tombstone prevents stale local resurrection after cloud delete', async () => {
    await nbImageSaveBlob(ids.imageKey, pngBlob());
    await deleteNotebookImageAsset(ids);
    const entityKey = userContentAssetEntityKey({
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      assetType: 'notebook-image',
      assetId: ids.imageKey,
    });
    expect(isUserContentAssetDeleted(entityKey)).toBe(true);

    vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    setNotebookImageManifest(ids.objectId, [ids.imageKey]);
    scheduleNotebookImageCloudUpload(ids, Date.now(), true);
    await flushNotebookImageCloudEnqueueNow(ids);
    expect(await listUploads()).toHaveLength(0);
  });

  it('hydrateNotebookImagesWithCloud hydrates all refs without user interaction', async () => {
    const blob = pngBlob([7, 7]);
    vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: blob,
    });
    await hydrateNotebookImagesWithCloud({
      userId: ids.userId,
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      imageKeys: [ids.imageKey],
    });
    const local = await nbImageLoadBlob(ids.imageKey);
    expect(local?.size).toBeGreaterThan(0);
  });

  it('pending upload blocks Saved status', async () => {
    await nbImageSaveBlob(ids.imageKey, pngBlob());
    vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    setNotebookImageManifest(ids.objectId, [ids.imageKey]);
    await reconcileNotebookImageWithCloud(ids, true);
    await flushNotebookImageCloudEnqueueNow(ids);
    expect(getCloudSyncSnapshot().anyCloudPending || (await listUploads()).length > 0).toBe(true);
    const uploads = await listUploads();
    expect(parseUserContentAssetDescriptor(uploads[0]!.payload)?.assetType).toBe(
      'notebook-image',
    );
  });

  it('unreferenced image cannot upload even with local bytes', async () => {
    await nbImageSaveBlob(ids.imageKey, pngBlob());
    vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    setNotebookImageManifest(ids.objectId, []);
    expect(await reconcileNotebookImageWithCloud(ids, false)).toBe('skip');
    expect(await listUploads()).toHaveLength(0);
  });
});
