/**
 * Cross-device Free Space delete + stale-client resurrection guard.
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

const userId = 'user-fs-del-ab';
const sectionId = 'section-fs-del-1';

vi.mock('./focusCache/freeSpaceObjectCloud', () => ({
  upsertFreeSpaceObjectFromCreatePayload: vi.fn(async (input: {
    objectId: string;
    object: unknown;
  }) => {
    cloudObjectStore.set(input.objectId, structuredClone(input.object));
    return { ok: true as const };
  }),
  deleteFreeSpaceObjectFromCloud: vi.fn(async (input: { objectId: string }) => {
    cloudObjectStore.delete(input.objectId);
    return { ok: true as const };
  }),
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

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          eq: (col2: string, val2: string) => ({
            maybeSingle: async () => {
              if (table !== 'free_space_objects') return { data: null, error: null };
              const hit = cloudObjectStore.has(val) && col === 'id';
              return { data: hit ? { id: val, section_id: val2 } : null, error: null };
            },
          }),
          maybeSingle: async () => {
            if (table !== 'free_space_objects') return { data: null, error: null };
            const hit = cloudObjectStore.has(val);
            return { data: hit ? { id: val } : null, error: null };
          },
        }),
      }),
    }),
  },
}));

import { resetFocusCacheDbForTests } from './focusCache/db';
import { FOCUS_CACHE_DB_NAME } from './focusCache/types';
import { listPendingOperations } from './focusCache/pendingOperations';
import { flushPendingFreeSpaceCreates } from './focusCache/flushPendingFreeSpaceCreates';
import { applyFreeSpaceCloudDeleteToMountedBoard } from './focusCache/freeSpaceObjectPull';
import {
  getCloudSyncSnapshot,
  resetCloudSyncStatusForTests,
} from './sync/cloudSyncStatus';
import { clearUserContentAssetResolversForTests } from './userContentAssetResolver';
import * as userContentStorage from './userContentStorage';
import { saveImageBlob, loadImageBlob } from './freeSpaceImageIdb';
import {
  buildSpatialAssetPath,
  deleteSpatialAssetLocal,
  enqueueSpatialAssetCloudDelete,
  onSpatialImageSaved,
  reconcileSpatialAssetWithCloud,
  resetSpatialAssetCloudForTests,
} from './spatialAssetCloud';
import {
  isUserContentAssetDeleted,
  resetUserContentAssetAuthorityForTests,
  userContentAssetEntityKey,
} from './userContentAssetAuthority';
import {
  enqueueFreeSpaceObjectCreatesAfterLocalPersist,
} from './focusCache/freeSpaceObjectCreateEnqueue';
import { enqueueFreeSpaceObjectDeletesAfterLocalDelete } from './focusCache/freeSpaceObjectDeleteEnqueue';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { boardScopedFreeSpaceKeys } from './freeSpacePersistence';

const boardId = 'main';

function makeImageObject(objectId: string): ProjectSpaceObject {
  const now = Date.now();
  return {
    id: objectId,
    type: 'image',
    title: 'diagram.png',
    content: {
      type: 'image',
      url: '',
      fileName: 'diagram.png',
      fileSize: 9,
      naturalWidth: 10,
      naturalHeight: 8,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function persistLocalObjects(objects: ProjectSpaceObject[]): void {
  localStorage.setItem(
    boardScopedFreeSpaceKeys(sectionId, boardId).objects,
    JSON.stringify(objects),
  );
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
  vi.spyOn(userContentStorage, 'downloadUserContentAsset').mockImplementation(async path => {
    const blob = cloudStore.get(path);
    if (!blob) return { ok: false as const, reason: 'not_found' as const };
    return { ok: true as const, value: blob };
  });
  vi.spyOn(userContentStorage, 'removeUserContentAsset').mockImplementation(async path => {
    cloudStore.delete(path);
    return { ok: true as const, value: { removed: true } };
  });
}

describe('Free Space spatial-image delete cross-device', () => {
  beforeEach(async () => {
    cloudStore.clear();
    cloudObjectStore.clear();
    spatialImageMem.clear();
    localStorage.clear();
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

  it('CLIENT A delete → stale CLIENT B reconcile must not re-upload', async () => {
    const imageObjectId = 'ps-image-del-1';
    const imageObj = makeImageObject(imageObjectId);
    const blob = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
    const imageIds = {
      userId,
      sectionId,
      objectId: imageObjectId,
      assetType: 'spatial-image' as const,
    };
    const path = buildSpatialAssetPath(imageIds);

    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [imageObj],
    });
    await saveImageBlob(sectionId, imageObjectId, blob);
    await onSpatialImageSaved(imageIds);
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    expect(cloudObjectStore.has(imageObjectId)).toBe(true);
    expect(cloudStore.has(path)).toBe(true);

    // CLIENT B: stale local structured + blob (pre-delete snapshot).
    persistLocalObjects([imageObj]);
    expect(await loadImageBlob(sectionId, imageObjectId)).toBeDefined();

    // CLIENT A: production delete orchestration.
    cloudObjectStore.delete(imageObjectId);
    cloudStore.delete(path);
    await deleteSpatialAssetLocal(imageIds);
    await enqueueSpatialAssetCloudDelete(imageIds);
    enqueueFreeSpaceObjectDeletesAfterLocalDelete(true, {
      userId,
      sectionId,
      boardId,
      entityIds: [imageObjectId],
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    expect(cloudObjectStore.has(imageObjectId)).toBe(false);
    expect(cloudStore.has(path)).toBe(false);

    // CLIENT B still stale until reconcile — simulate card reconcile before pull UI update.
    spatialImageMem.set(spatialImageKey(sectionId, imageObjectId), blob);
    const reconcile = await reconcileSpatialAssetWithCloud(imageIds, true);
    expect(reconcile).toBe('skip');
    expect(cloudStore.has(path)).toBe(false);

    const listed = await listPendingOperations({ userId, workspaceId: sectionId });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.some(op => op.operationType === 'create')).toBe(false);
      expect(listed.value.filter(op => op.operationType === 'upload').length).toBe(0);
    }

    expect(
      isUserContentAssetDeleted(
        userContentAssetEntityKey({
          sectionId,
          objectId: imageObjectId,
          assetType: 'spatial-image',
          assetId: imageObjectId,
        }),
      ),
    ).toBe(true);
  });

  it('CLIENT A delete → CLIENT B inbound pull removes object and suppresses asset', async () => {
    const imageObjectId = 'ps-image-del-2';
    const imageObj = makeImageObject(imageObjectId);
    persistLocalObjects([imageObj]);
    await saveImageBlob(sectionId, imageObjectId, new Blob([new Uint8Array([1])], { type: 'image/png' }));

    const result = await applyFreeSpaceCloudDeleteToMountedBoard({
      sectionId,
      boardId,
      userId,
      objectId: imageObjectId,
      getReactObjects: () => [imageObj],
      loadDurableObjects: () => [imageObj],
      isCurrent: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removed).toBe(true);

    const raw = localStorage.getItem(boardScopedFreeSpaceKeys(sectionId, boardId).objects);
    const parsed = raw ? JSON.parse(raw) : [];
    expect(parsed.some((o: { id: string }) => o.id === imageObjectId)).toBe(false);
    expect(await loadImageBlob(sectionId, imageObjectId)).toBeUndefined();
    expect(
      isUserContentAssetDeleted(
        userContentAssetEntityKey({
          sectionId,
          objectId: imageObjectId,
          assetType: 'spatial-image',
          assetId: imageObjectId,
        }),
      ),
    ).toBe(true);
  });
});
