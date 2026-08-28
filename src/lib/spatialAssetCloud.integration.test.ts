/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spatialImageMem = vi.hoisted(() => new Map<string, Blob>());
const spatialPdfMem = vi.hoisted(() => new Map<string, Blob>());

function spatialImageKey(sectionId: string, objectId: string): string {
  return `${sectionId}::${objectId}`;
}

vi.mock('./freeSpaceImageIdb', async importOriginal => {
  const mod = await importOriginal<typeof import('./freeSpaceImageIdb')>();
  return {
    ...mod,
    saveImageBlob: vi.fn(async (sectionId: string, objectId: string, blob: Blob) => {
      spatialImageMem.set(spatialImageKey(sectionId, objectId), blob);
    }),
    loadImageBlob: vi.fn(async (sectionId: string, objectId: string) =>
      spatialImageMem.get(spatialImageKey(sectionId, objectId)),
    ),
    deleteImageBlob: vi.fn(async (sectionId: string, objectId: string) => {
      spatialImageMem.delete(spatialImageKey(sectionId, objectId));
    }),
  };
});

vi.mock('./freeSpacePdfIdb', async importOriginal => {
  const mod = await importOriginal<typeof import('./freeSpacePdfIdb')>();
  return {
    ...mod,
    savePdfBlob: vi.fn(async (sectionId: string, objectId: string, blob: Blob) => {
      spatialPdfMem.set(spatialImageKey(sectionId, objectId), blob);
    }),
    loadPdfBlob: vi.fn(async (sectionId: string, objectId: string) =>
      spatialPdfMem.get(spatialImageKey(sectionId, objectId)),
    ),
    deletePdfBlob: vi.fn(async (sectionId: string, objectId: string) => {
      spatialPdfMem.delete(spatialImageKey(sectionId, objectId));
    }),
  };
});

import { resetFocusCacheDbForTests } from './focusCache/db';
import { FOCUS_CACHE_DB_NAME } from './focusCache/types';
import { listPendingOperations } from './focusCache/pendingOperations';
import { flushPendingFreeSpaceCreates } from './focusCache/flushPendingFreeSpaceCreates';
import {
  getCloudSyncSnapshot,
  resetCloudSyncStatusForTests,
} from './sync/cloudSyncStatus';
import { clearUserContentAssetResolversForTests } from './userContentAssetResolver';
import * as userContentStorage from './userContentStorage';
import { saveImageBlob, loadImageBlob, deleteImageBlob } from './freeSpaceImageIdb';
import { savePdfBlob, loadPdfBlob, deletePdfBlob } from './freeSpacePdfIdb';
import {
  buildSpatialAssetPath,
  deleteSpatialAssetLocal,
  enqueueSpatialAssetCloudDelete,
  flushSpatialAssetCloudEnqueueNow,
  hydrateSpatialAssetFromCloud,
  reconcileSpatialAssetWithCloud,
  resetSpatialAssetCloudForTests,
  scheduleSpatialAssetCloudUpload,
} from './spatialAssetCloud';
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

const userId = 'user-spatial-1';
const sectionId = 'sec-spatial-1';
const imageObjectId = 'img-obj-1';
const pdfObjectId = 'pdf-obj-1';

const cloudStore = new Map<string, Blob>();

function entityKey(objectId: string, assetType: 'spatial-image' | 'pdf') {
  return userContentAssetEntityKey({
    sectionId,
    objectId,
    assetType,
    assetId: objectId,
  });
}

async function deleteDbs(): Promise<void> {
  await resetFocusCacheDbForTests();
  for (const name of [
    FOCUS_CACHE_DB_NAME,
    'fw_free_space_image_v1',
    'fw_free_space_pdf_v1',
  ]) {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error(`delete ${name} failed`));
      req.onblocked = () => resolve();
    });
  }
}

function wireCloudMocks(): void {
  vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockImplementation(async path => {
    const blob = cloudStore.get(path);
    if (!blob) return { ok: false as const, reason: 'not_found' as const };
    return { ok: true as const, value: blob };
  });
  vi.spyOn(userContentStorage, 'uploadUserContentAsset').mockImplementation(async input => {
    cloudStore.set(input.storagePath, input.body);
    return { ok: true as const, value: { path: input.storagePath } };
  });
  vi.spyOn(userContentStorage, 'removeUserContentAsset').mockImplementation(async path => {
    cloudStore.delete(path);
    return { ok: true as const, value: { removed: true } };
  });
}

async function listUploads() {
  const listed = await listPendingOperations({ userId, workspaceId: sectionId });
  if (!listed.ok) return [];
  return listed.value.filter(
    op => op.entityType === 'user_content_asset' && op.operationType === 'create',
  );
}

describe('spatial image/pdf A→B→A persistence', () => {
  beforeEach(async () => {
    cloudStore.clear();
    spatialImageMem.clear();
    spatialPdfMem.clear();
    await deleteDbs();
    resetCloudSyncStatusForTests();
    clearUserContentAssetResolversForTests();
    resetSpatialAssetCloudForTests();
    resetUserContentAssetAuthorityForTests();
    vi.restoreAllMocks();
    wireCloudMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    resetSpatialAssetCloudForTests();
    resetUserContentAssetAuthorityForTests();
  });

  it('spatial image: A upload → B hydrate → bytes match', async () => {
    const blobA = new Blob([new Uint8Array([10, 20, 30])], { type: 'image/png' });
    await saveImageBlob(sectionId, imageObjectId, blobA);
    expect((await loadImageBlob(sectionId, imageObjectId))?.size).toBeGreaterThan(0);

    const imageIds = {
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image' as const,
    };
    expect(await reconcileSpatialAssetWithCloud(imageIds, true)).toBe('upload');
    await flushSpatialAssetCloudEnqueueNow(imageIds);
    expect(await listUploads()).toHaveLength(1);
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });
    expect(cloudStore.has(buildSpatialAssetPath(imageIds))).toBe(true);

    await deleteImageBlob(sectionId, imageObjectId);
    expect(await loadImageBlob(sectionId, imageObjectId)).toBeUndefined();

    expect(await hydrateSpatialAssetFromCloud(imageIds)).toBe(true);
    const blobB = await loadImageBlob(sectionId, imageObjectId);
    expect(blobB?.type).toBe('image/png');
    expect(new Uint8Array(await blobB!.arrayBuffer())).toEqual(
      new Uint8Array(await blobA.arrayBuffer()),
    );
  });

  it('spatial image: B replace → A rehydrate newer bytes', async () => {
    const blobA = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const blobB = new Blob([new Uint8Array([2, 2])], { type: 'image/png' });
    const imageIds = {
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image' as const,
    };

    await saveImageBlob(sectionId, imageObjectId, blobA);
    await reconcileSpatialAssetWithCloud(imageIds, true);
    await flushSpatialAssetCloudEnqueueNow(imageIds);
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    await saveImageBlob(sectionId, imageObjectId, blobB);
    cloudStore.set(buildSpatialAssetPath(imageIds), blobB);

    await deleteImageBlob(sectionId, imageObjectId);
    expect(await hydrateSpatialAssetFromCloud(imageIds)).toBe(true);
    const rehydrated = await loadImageBlob(sectionId, imageObjectId);
    expect(new Uint8Array(await rehydrated!.arrayBuffer())).toEqual(
      new Uint8Array(await blobB.arrayBuffer()),
    );
  });

  it('spatial image delete: B delete → A cannot resurrect via upload', async () => {
    const blob = new Blob([new Uint8Array([5])], { type: 'image/png' });
    const imageIds = {
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image' as const,
    };
    await saveImageBlob(sectionId, imageObjectId, blob);
    await reconcileSpatialAssetWithCloud(imageIds, true);
    await flushSpatialAssetCloudEnqueueNow(imageIds);
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    await deleteSpatialAssetLocal(imageIds);
    await enqueueSpatialAssetCloudDelete(imageIds);
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });
    expect(cloudStore.has(buildSpatialAssetPath(imageIds))).toBe(false);
    expect(isUserContentAssetDeleted(entityKey(imageObjectId, 'spatial-image'))).toBe(true);

    scheduleSpatialAssetCloudUpload(imageIds, Date.now(), true);
    await flushSpatialAssetCloudEnqueueNow(imageIds);
    expect(await listUploads()).toHaveLength(0);
  });

  it('PDF: A upload → B hydrate → MIME/bytes correct', async () => {
    const pdfBytes = '%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';
    const blobA = new Blob([pdfBytes], { type: 'application/pdf' });
    await savePdfBlob(sectionId, pdfObjectId, blobA);

    const pdfIds = {
      userId,
      sectionId,
      objectId: pdfObjectId,
      assetType: 'pdf' as const,
    };
    expect(await reconcileSpatialAssetWithCloud(pdfIds, true)).toBe('upload');
    await flushSpatialAssetCloudEnqueueNow(pdfIds);
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    await deletePdfBlob(sectionId, pdfObjectId);
    expect(await hydrateSpatialAssetFromCloud(pdfIds)).toBe(true);
    const blobB = await loadPdfBlob(sectionId, pdfObjectId);
    expect(blobB?.type).toBe('application/pdf');
    expect(await blobB!.text()).toBe(pdfBytes);
  });

  it('PDF delete cancels pending upload and clears cloud', async () => {
    const blob = new Blob(['%PDF-1.1'], { type: 'application/pdf' });
    const pdfIds = {
      userId,
      sectionId,
      objectId: pdfObjectId,
      assetType: 'pdf' as const,
    };
    await savePdfBlob(sectionId, pdfObjectId, blob);
    scheduleSpatialAssetCloudUpload(pdfIds);
    await enqueueSpatialAssetCloudDelete(pdfIds);
    const listed = await listPendingOperations({ userId, workspaceId: sectionId });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.some(op => op.operationType === 'delete')).toBe(true);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(true);
  });
});
