/**
 * Production-path regression: legacy split CREATE+UPDATE (CASE 3) vs fixed single CREATE for PDF.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spatialPdfMem = vi.hoisted(() => new Map<string, Blob>());
const cloudObjectStore = vi.hoisted(() => new Map<string, unknown>());
const cloudStore = vi.hoisted(() => new Map<string, Blob>());

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
import { savePdfBlob } from './freeSpacePdfIdb';
import {
  buildSpatialAssetPath,
  hydrateSpatialPdfWithCloud,
  onSpatialPdfSaved,
  resetSpatialAssetCloudForTests,
} from './spatialAssetCloud';
import { resetUserContentAssetAuthorityForTests } from './userContentAssetAuthority';
import { enqueueFreeSpaceObjectCreatesAfterLocalPersist } from './focusCache/freeSpaceObjectCreateEnqueue';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { isStructuredPdfContent } from './spatialAssetCloud.fsPdfSyncDiag';

const userId = 'user-prod-pdf';
const sectionId = 'section-prod-pdf';
const boardId = 'main';

function makeFullPdfObject(objectId: string, updatedAt: number): ProjectSpaceObject {
  return {
    id: objectId,
    type: 'pdf',
    title: 'lecture.pdf',
    content: {
      type: 'pdf',
      fileName: 'lecture.pdf',
      fileType: 'application/pdf',
      fileSize: 120_000,
      lastOpenedAt: updatedAt,
      page: 1,
      zoom: 1,
      ingestionPhase: 'materializing',
    },
    createdAt: updatedAt,
    updatedAt,
  };
}

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
}

describe('Free Space PDF production-path persistence', () => {
  beforeEach(async () => {
    cloudStore.clear();
    cloudObjectStore.clear();
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

  it('legacy split path: asset durable, structured object invalid (CASE 3)', async () => {
    const objectId = 'ps-pdf-legacy-case3';
    const t0 = Date.now();
    const emptyObj: ProjectSpaceObject = {
      id: objectId,
      type: 'pdf',
      title: 'lecture.pdf',
      content: {
        type: 'pdf',
        fileName: '',
        fileType: '',
        fileSize: 0,
        lastOpenedAt: t0,
        page: 1,
        zoom: 1,
        ingestionPhase: 'materializing',
      },
      createdAt: t0,
      updatedAt: t0,
    };

    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [emptyObj],
    });

    const blob = new Blob(['%PDF-1.1'], { type: 'application/pdf' });
    await savePdfBlob(sectionId, objectId, blob);
    await onSpatialPdfSaved({
      userId,
      sectionId,
      objectId,
      assetType: 'pdf',
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    const path = buildSpatialAssetPath({
      userId,
      sectionId,
      objectId,
      assetType: 'pdf',
    });
    expect(cloudStore.has(path)).toBe(true);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);

    const cloudObj = cloudObjectStore.get(objectId) as ProjectSpaceObject;
    expect(cloudObj).toBeDefined();
    expect(isStructuredPdfContent(cloudObj.content)).toBe(false);
  });

  it('fixed addSpatialPdfObject path: structured object, asset, and B hydration (CASE 4)', async () => {
    const objectId = 'ps-pdf-fixed-case4';
    const pdfObj = makeFullPdfObject(objectId, Date.now());
    const pdfBytes = '%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    enqueueFreeSpaceObjectCreatesAfterLocalPersist(true, {
      userId,
      sectionId,
      boardId,
      objects: [pdfObj],
    });
    await savePdfBlob(sectionId, objectId, blob);
    await onSpatialPdfSaved({
      userId,
      sectionId,
      objectId,
      assetType: 'pdf',
    });
    await flushPendingFreeSpaceCreates({ userId, workspaceId: sectionId });

    const cloudObj = cloudObjectStore.get(objectId) as ProjectSpaceObject;
    expect(isStructuredPdfContent(cloudObj.content)).toBe(true);

    const path = buildSpatialAssetPath({
      userId,
      sectionId,
      objectId,
      assetType: 'pdf',
    });
    expect(cloudStore.has(path)).toBe(true);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);

    spatialPdfMem.clear();
    const hydrateResult = await hydrateSpatialPdfWithCloud({
      userId,
      sectionId,
      objectId,
      assetType: 'pdf',
    });
    expect(hydrateResult).toBe('cloud_hit');
    const blobB = spatialPdfMem.get(spatialPdfKey(sectionId, objectId));
    expect(blobB?.type).toBe('application/pdf');
    expect(await blobB!.text()).toBe(pdfBytes);
  });
});
