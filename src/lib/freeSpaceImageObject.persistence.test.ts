/**
 * Production-path regression: legacy split CREATE+UPDATE (CASE 3) vs fixed single CREATE.
 *
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
  fetchFreeSpaceObjectsForSection: vi.fn(async () => ({ ok: true as const, rows: [] })),
}));

vi.mock('./focusCache/freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

import { resetFocusCacheDbForTests } from './focusCache/db';
import { FOCUS_CACHE_DB_NAME } from './focusCache/types';
import { flushPendingFreeSpaceCreates } from './focusCache/flushPendingFreeSpaceCreates';
import {
  getCloudSyncSnapshot,
  resetCloudSyncStatusForTests,
} from './sync/cloudSyncStatus';
import { clearUserContentAssetResolversForTests } from './userContentAssetResolver';
import * as userContentStorage from './userContentStorage';
import { saveImageBlob } from './freeSpaceImageIdb';
import {
  buildSpatialAssetPath,
  onSpatialImageSaved,
  resetSpatialAssetCloudForTests,
} from './spatialAssetCloud';
import { resetUserContentAssetAuthorityForTests } from './userContentAssetAuthority';
import { enqueueFreeSpaceObjectCreatesAfterLocalPersist } from './focusCache/freeSpaceObjectCreateEnqueue';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

const userId = 'user-prod-image';
const sectionId = 'section-prod-image';
const boardId = 'main';

function isStructuredImageContent(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const c = content as Record<string, unknown>;
  if (c.type !== 'image') return false;
  const fileName = c.fileName;
  const fileSize = c.fileSize;
  return (
    (typeof fileName === 'string' && fileName.length > 0) ||
    (typeof fileSize === 'number' && Number.isFinite(fileSize) && fileSize > 0)
  );
}

function makeFullImageObject(objectId: string, updatedAt: number): ProjectSpaceObject {
  return {
    id: objectId,
    type: 'image',
    title: 'photo.png',
    content: {
      type: 'image',
      url: '',
      fileName: 'photo.png',
      fileSize: 3494253,
      naturalWidth: 800,
      naturalHeight: 600,
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
  vi.spyOn(userContentStorage, 'uploadUserContentAsset').mockImplementation(async input => {
    cloudStore.set(input.storagePath, input.body);
    return { ok: true as const, value: { path: input.storagePath } };
  });
}

describe('Free Space spatial image production-path persistence', () => {
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

  it('legacy split path: asset durable, structured object invalid (CASE 3)', async () => {
    const objectId = 'ps-image-legacy-case3';
    const t0 = Date.now();
    const emptyObj: ProjectSpaceObject = {
      id: objectId,
      type: 'image',
      title: 'photo.png',
      content: { type: 'image', url: '' },
      createdAt: t0,
      updatedAt: t0,
    };

    // addObject('image') — immediate CREATE enqueue; auto-flush fires at 300ms in prod.
    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [emptyObj],
    });

    const blob = new Blob([new Uint8Array(100)], { type: 'image/png' });
    await saveImageBlob(sectionId, objectId, blob);
    await onSpatialImageSaved({
      userId,
      sectionId,
      objectId,
      assetType: 'spatial-image',
    });

    // CREATE flushes before debounced updateObjectFields (400ms) enqueues UPDATE.
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    const path = buildSpatialAssetPath({
      userId,
      sectionId,
      objectId,
      assetType: 'spatial-image',
    });
    expect(cloudStore.has(path)).toBe(true);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);

    const cloudObj = cloudObjectStore.get(objectId) as ProjectSpaceObject;
    expect(cloudObj).toBeDefined();
    expect(isStructuredImageContent(cloudObj.content)).toBe(false);
  });

  it('fixed addSpatialImageObject path: structured object and asset both durable', async () => {
    const objectId = 'ps-image-fixed-case4';
    const imageObj = makeFullImageObject(objectId, Date.now());
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [imageObj],
    });
    await saveImageBlob(sectionId, objectId, blob);
    await onSpatialImageSaved({
      userId,
      sectionId,
      objectId,
      assetType: 'spatial-image',
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    const cloudObj = cloudObjectStore.get(objectId) as ProjectSpaceObject;
    expect(isStructuredImageContent(cloudObj.content)).toBe(true);
    expect(cloudObj.content).toMatchObject({
      type: 'image',
      fileName: 'photo.png',
      fileSize: 3494253,
    });

    const path = buildSpatialAssetPath({
      userId,
      sectionId,
      objectId,
      assetType: 'spatial-image',
    });
    expect(cloudStore.has(path)).toBe(true);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);
  });
});
