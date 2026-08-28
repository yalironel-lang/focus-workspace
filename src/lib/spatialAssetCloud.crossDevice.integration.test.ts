/**
 * Cross-device Free Space spatial-image regression (physical P0 scenario).
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spatialImageMem = vi.hoisted(() => new Map<string, Blob>());
const cloudObjectStore = vi.hoisted(() => new Map<string, unknown>());
const cloudStore = vi.hoisted(() => new Map<string, Blob>());

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

vi.mock('./focusCache/freeSpaceObjectCloud', () => ({
  upsertFreeSpaceObjectFromCreatePayload: vi.fn(async (input: {
    objectId: string;
    object: unknown;
  }) => {
    cloudObjectStore.set(input.objectId, structuredClone(input.object));
    return { ok: true as const };
  }),
  deleteFreeSpaceObjectFromCloud: vi.fn(async () => ({ ok: true as const })),
  fetchFreeSpaceObjectsForSection: vi.fn(async () => ({
    ok: true as const,
    rows: [...cloudObjectStore.entries()].map(([id, object]) => ({
      id,
      user_id: userId,
      section_id: sectionId,
      board_id: 'main',
      object,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  })),
}));

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
import {
  buildSpatialAssetPath,
  hydrateSpatialImageWithCloud,
  onSpatialImageSaved,
  resetSpatialAssetCloudForTests,
  scheduleSpatialAssetCloudUpload,
} from './spatialAssetCloud';
import { resetUserContentAssetAuthorityForTests } from './userContentAssetAuthority';
import {
  enqueueFreeSpaceObjectCreatesAfterLocalPersist,
} from './focusCache/freeSpaceObjectCreateEnqueue';
import {
  enqueueFreeSpaceObjectUpdate,
} from './focusCache/freeSpaceObjectUpdateEnqueue';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { upsertFreeSpaceObjectFromCreatePayload } from './focusCache/freeSpaceObjectCloud';

const userId = 'user-fs-image-ab';
const sectionId = 'section-fs-image-1';
const boardId = 'main';

function makeImageObject(objectId: string, updatedAt: number): ProjectSpaceObject {
  return {
    id: objectId,
    type: 'image',
    title: 'diagram.png',
    content: {
      type: 'image',
      url: '',
      fileName: 'diagram.png',
      fileSize: 3,
      naturalWidth: 100,
      naturalHeight: 80,
    },
    createdAt: updatedAt,
    updatedAt,
  };
}

async function deleteDbs(): Promise<void> {
  await resetFocusCacheDbForTests();
  for (const name of [FOCUS_CACHE_DB_NAME, 'fw_free_space_image_v1']) {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
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

describe('spatial-image cross-device on existing board', () => {
  beforeEach(async () => {
    cloudStore.clear();
    cloudObjectStore.clear();
    spatialImageMem.clear();
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

  it('CLIENT A insert → cloud object+binary → CLIENT B empty cache hydrates', async () => {
    const existingNotebookId = 'ps-notebook-existing';
    const existing: ProjectSpaceObject = {
      id: existingNotebookId,
      type: 'notebook',
      title: 'Notes',
      content: { type: 'notebook', body: 'existing notes' },
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now() - 60_000,
    };
    cloudObjectStore.set(existingNotebookId, existing);

    const imageObjectId = 'ps-image-new-1';
    const blobA = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
    const imageObj = makeImageObject(imageObjectId, Date.now());

    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [imageObj],
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    await saveImageBlob(sectionId, imageObjectId, blobA);
    await onSpatialImageSaved({
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image',
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    const cloudObj = cloudObjectStore.get(imageObjectId) as ProjectSpaceObject;
    expect(cloudObj.content).toMatchObject({
      type: 'image',
      fileName: 'diagram.png',
      fileSize: 3,
      url: '',
    });
    const path = buildSpatialAssetPath({
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image',
    });
    expect(cloudStore.has(path)).toBe(true);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);

    spatialImageMem.clear();
    expect(await loadImageBlob(sectionId, imageObjectId)).toBeUndefined();

    const hydrateResult = await hydrateSpatialImageWithCloud({
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image',
    });
    expect(hydrateResult).toBe('cloud_hit');
    const blobB = await loadImageBlob(sectionId, imageObjectId);
    expect(blobB?.type).toBe('image/png');
    expect(new Uint8Array(await blobB!.arrayBuffer())).toEqual(
      new Uint8Array(await blobA.arrayBuffer()),
    );
  });

  it('schedule-only upload after object flush yields dishonest Saved (regression guard)', async () => {
    const imageObjectId = 'ps-image-delay-2';
    const blobA = new Blob([new Uint8Array([1, 2])], { type: 'image/png' });
    const imageObj = makeImageObject(imageObjectId, Date.now());

    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [imageObj],
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });
    resetCloudSyncStatusForTests();

    await saveImageBlob(sectionId, imageObjectId, blobA);
    scheduleSpatialAssetCloudUpload(
      { userId, sectionId, objectId: imageObjectId, assetType: 'spatial-image' },
      Date.now(),
      true,
    );

    const listed = await listPendingOperations({ userId, workspaceId: sectionId });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.some(op => op.entityType === 'user_content_asset')).toBe(false);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);

    const path = buildSpatialAssetPath({
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image',
    });
    expect(cloudStore.has(path)).toBe(false);
  });

  it('CLIENT B move persists → CLIENT A refetch keeps image metadata', async () => {
    const imageObjectId = 'ps-image-move-1';
    const blobA = new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' });
    const t0 = Date.now();
    const imageObj = makeImageObject(imageObjectId, t0);

    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [imageObj],
    });
    await saveImageBlob(sectionId, imageObjectId, blobA);
    await onSpatialImageSaved({
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image',
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    spatialImageMem.clear();
    const hydrated = await hydrateSpatialImageWithCloud({
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image',
    });
    expect(hydrated).toBe('cloud_hit');

    const moved = {
      ...imageObj,
      title: 'moved-diagram.png',
      geometry: { x: 120, y: 80, w: 300, h: 240 },
      updatedAt: imageObj.updatedAt + 5000,
    };
    await enqueueFreeSpaceObjectUpdate({
      userId,
      sectionId,
      boardId,
      object: moved,
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    const pulled = cloudObjectStore.get(imageObjectId) as ProjectSpaceObject;
    expect(pulled.title).toBe('moved-diagram.png');
    expect(pulled.content).toMatchObject({ fileName: 'diagram.png', type: 'image' });

    spatialImageMem.clear();
    await hydrateSpatialImageWithCloud({
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image',
    });
    const blobAgain = await loadImageBlob(sectionId, imageObjectId);
    expect(blobAgain?.size).toBeGreaterThan(0);
    expect(vi.mocked(upsertFreeSpaceObjectFromCreatePayload).mock.calls.length).toBeGreaterThan(0);
  });
});
