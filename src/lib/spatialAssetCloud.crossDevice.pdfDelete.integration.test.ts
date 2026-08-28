/**
 * Cross-device Free Space PDF delete + stale-client resurrection guard.
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spatialPdfMem = vi.hoisted(() => new Map<string, Blob>());
const cloudObjectStore = vi.hoisted(() => new Map<string, unknown>());
const cloudStore = vi.hoisted(() => new Map<string, Blob>());

const userId = 'user-pdf-del-ab';
const sectionId = 'section-pdf-del-1';

function spatialPdfKey(sectionId: string, objectId: string): string {
  return `${sectionId}::${objectId}`;
}

vi.mock('./freeSpacePdfIdb', async importOriginal => {
  const mod = await importOriginal<typeof import('./freeSpacePdfIdb')>();
  return {
    ...mod,
    savePdfBlob: vi.fn(async (sectionId: string, objectId: string, blob: Blob) => {
      spatialPdfMem.set(spatialPdfKey(sectionId, objectId), blob);
    }),
    loadPdfBlob: vi.fn(async (sectionId: string, objectId: string) =>
      spatialPdfMem.get(spatialPdfKey(sectionId, objectId)),
    ),
    deletePdfBlob: vi.fn(async (sectionId: string, objectId: string) => {
      spatialPdfMem.delete(spatialPdfKey(sectionId, objectId));
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
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: cloudObjectStore.has(val) && col === 'id' ? { id: val } : null,
              error: null,
            }),
          }),
          maybeSingle: async () => ({
            data: cloudObjectStore.has(val) ? { id: val } : null,
            error: null,
          }),
        }),
      }),
    }),
  },
}));

import { resetFocusCacheDbForTests } from './focusCache/db';
import { FOCUS_CACHE_DB_NAME } from './focusCache/types';
import { flushPendingFreeSpaceCreates } from './focusCache/flushPendingFreeSpaceCreates';
import { clearUserContentAssetResolversForTests } from './userContentAssetResolver';
import * as userContentStorage from './userContentStorage';
import { savePdfBlob, loadPdfBlob } from './freeSpacePdfIdb';
import {
  buildSpatialAssetPath,
  deleteSpatialAssetLocal,
  enqueueSpatialAssetCloudDelete,
  onSpatialPdfSaved,
  reconcileSpatialAssetWithCloud,
  resetSpatialAssetCloudForTests,
} from './spatialAssetCloud';
import {
  isUserContentAssetDeleted,
  resetUserContentAssetAuthorityForTests,
  userContentAssetEntityKey,
} from './userContentAssetAuthority';
import { enqueueFreeSpaceObjectCreatesAfterLocalPersist } from './focusCache/freeSpaceObjectCreateEnqueue';
import { enqueueFreeSpaceObjectDeletesAfterLocalDelete } from './focusCache/freeSpaceObjectDeleteEnqueue';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

const boardId = 'main';

async function deleteDbs(): Promise<void> {
  await resetFocusCacheDbForTests();
  for (const name of [FOCUS_CACHE_DB_NAME, 'fw_free_space_pdf_v1']) {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  }
}

describe('Free Space PDF delete cross-device', () => {
  beforeEach(async () => {
    cloudStore.clear();
    cloudObjectStore.clear();
    spatialPdfMem.clear();
    await deleteDbs();
    clearUserContentAssetResolversForTests();
    resetSpatialAssetCloudForTests();
    resetUserContentAssetAuthorityForTests();
    vi.restoreAllMocks();
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
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('CLIENT A delete → stale CLIENT B reconcile must not re-upload PDF', async () => {
    const objectId = 'ps-pdf-del-1';
    const now = Date.now();
    const pdfObj: ProjectSpaceObject = {
      id: objectId,
      type: 'pdf',
      title: 'lecture.pdf',
      content: {
        type: 'pdf',
        fileName: 'lecture.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
        lastOpenedAt: now,
        page: 1,
        zoom: 1,
        ingestionPhase: 'ready',
      },
      createdAt: now,
      updatedAt: now,
    };
    const pdfIds = { userId, sectionId, objectId, assetType: 'pdf' as const };
    const path = buildSpatialAssetPath(pdfIds);
    const blob = new Blob(['%PDF-1.1'], { type: 'application/pdf' });

    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [pdfObj],
    });
    await savePdfBlob(sectionId, objectId, blob);
    await onSpatialPdfSaved(pdfIds);
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    cloudObjectStore.delete(objectId);
    cloudStore.delete(path);
    await deleteSpatialAssetLocal(pdfIds);
    await enqueueSpatialAssetCloudDelete(pdfIds);
    enqueueFreeSpaceObjectDeletesAfterLocalDelete(true, {
      userId,
      sectionId,
      boardId,
      entityIds: [objectId],
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    spatialPdfMem.set(spatialPdfKey(sectionId, objectId), blob);
    const reconcile = await reconcileSpatialAssetWithCloud(pdfIds, true);
    expect(reconcile).toBe('skip');
    expect(cloudStore.has(path)).toBe(false);
    expect(await loadPdfBlob(sectionId, objectId)).toBeUndefined();
    expect(
      isUserContentAssetDeleted(
        userContentAssetEntityKey({
          sectionId,
          objectId,
          assetType: 'pdf',
          assetId: objectId,
        }),
      ),
    ).toBe(true);
  });
});
