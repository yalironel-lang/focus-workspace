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
import { ensureProjectObjectContent } from '../hooks/useSectionFreeSpaceObjects';
import {
  bumpPdfPage,
  isPdfFileReplacement,
  mergePdfIngestionReadyContent,
  normalizePdfPage,
  normalizePdfZoom,
} from './pdfViewerState';
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

describe('PDF viewer state persistence', () => {
  const file = {
    fileName: 'lecture.pdf',
    fileType: 'application/pdf',
    fileSize: 120_000,
  };

  it('A: page 37 survives materializing → ready', () => {
    const ready = mergePdfIngestionReadyContent(
      { page: 37, zoom: 1, fileName: file.fileName, fileSize: file.fileSize },
      file,
      { pageCount: 100 },
    );
    expect(ready.page).toBe(37);
  });

  it('B: zoom survives materializing → ready', () => {
    const ready = mergePdfIngestionReadyContent(
      { page: 5, zoom: 1.6, fileName: file.fileName, fileSize: file.fileSize },
      file,
      { pageCount: 50 },
    );
    expect(ready.zoom).toBe(1.6);
  });

  it('C: file replacement resets page to 1', () => {
    const ready = mergePdfIngestionReadyContent(
      { page: 37, zoom: 1.8, fileName: 'old.pdf', fileSize: 99_000 },
      file,
      { pageCount: 100 },
    );
    expect(ready.page).toBe(1);
    expect(ready.zoom).toBe(1);
  });

  it('D: clamps page to pageCount on normalization', () => {
    expect(normalizePdfPage(50, 30)).toBe(30);
    const c = ensureProjectObjectContent('pdf', {
      type: 'pdf',
      fileName: 'x.pdf',
      fileType: 'application/pdf',
      fileSize: 1,
      lastOpenedAt: null,
      page: 50,
      zoom: 1,
      pageCount: 30,
    });
    if (c.type === 'pdf') expect(c.page).toBe(30);
  });

  it('E: invalid page values fall back to 1', () => {
    expect(normalizePdfPage(0)).toBe(1);
    expect(normalizePdfPage(-2)).toBe(1);
    expect(normalizePdfPage(NaN)).toBe(1);
  });

  it('F: independent PDF objects keep separate page state', () => {
    const a = ensureProjectObjectContent('pdf', {
      type: 'pdf',
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 1,
      lastOpenedAt: null,
      page: 37,
      zoom: 1,
    });
    const b = ensureProjectObjectContent('pdf', {
      type: 'pdf',
      fileName: 'b.pdf',
      fileType: 'application/pdf',
      fileSize: 1,
      lastOpenedAt: null,
      page: 8,
      zoom: 1.5,
    });
    if (a.type === 'pdf' && b.type === 'pdf') {
      expect(a.page).toBe(37);
      expect(b.page).toBe(8);
    }
  });

  it('G: studyfile pdf uses same normalization rules', () => {
    const c = ensureProjectObjectContent('studyfile', {
      type: 'studyfile',
      fileName: 'slides.pdf',
      fileType: 'application/pdf',
      fileSize: 5000,
      fileKind: 'pdf',
      role: 'lecture',
      usageLabel: '',
      externalUrl: null,
      lastOpenedAt: null,
      page: 8,
      zoom: 1.2,
    });
    if (c.type === 'studyfile') {
      expect(c.page).toBe(8);
      expect(c.zoom).toBe(1.2);
    }
  });

  it('H: page survives JSON serialization round-trip', () => {
    const content = {
      type: 'pdf' as const,
      fileName: 'lecture.pdf',
      fileType: 'application/pdf',
      fileSize: 1000,
      lastOpenedAt: Date.now(),
      page: 37,
      zoom: 1.25,
      pageCount: 80,
      ingestionPhase: 'ready' as const,
    };
    const restored = ensureProjectObjectContent('pdf', JSON.parse(JSON.stringify(content)));
    if (restored.type === 'pdf') {
      expect(restored.page).toBe(37);
      expect(restored.zoom).toBe(1.25);
    }
  });

  it('isPdfFileReplacement detects size change', () => {
    expect(
      isPdfFileReplacement(
        { fileName: 'a.pdf', fileSize: 100 },
        { fileName: 'a.pdf', fileSize: 200 },
      ),
    ).toBe(true);
  });

  it('bumpPdfPage respects pageCount', () => {
    expect(bumpPdfPage(30, 1, 30)).toBe(30);
    expect(normalizePdfZoom(3)).toBe(2.5);
  });
});
