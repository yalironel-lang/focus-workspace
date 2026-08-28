/**
 * Temporary diagnostics for Free Space PDF cross-device sync.
 * Prefix: [FS-PDF-SYNC-DIAG]
 */

import {
  boardScopedFreeSpaceKeys,
  sectionActiveBoardKey,
} from './freeSpacePersistence';
import { buildSpatialAssetPath } from './spatialAssetCloud';
import {
  USER_CONTENT_ASSET_ENTITY_TYPE,
  parseUserContentAssetDescriptor,
} from './userContentAssetDescriptor';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './focusCache/freeSpaceObjectCreateEnqueue';
import {
  fsImageSyncDiagFetchCloudObject,
  fsImageSyncDiagResolveAuthUserId,
  fsImageSyncDiagResolveSectionIdFromUrl,
  inferFsImageSyncCaseId,
} from './spatialAssetCloud.fsImageSyncDiag';

export type FsPdfSyncDiagLatestResult = {
  userId: string | null;
  sectionId: string | null;
  boardId: string | null;
  objectId: string | null;
  assetId: string | null;
  expectedStoragePath: string | null;
  localBlobExists: boolean;
  localBlobSize: number | null;
  cloudRowExists: boolean;
  cloudContentValid: boolean;
  cloudObjectContent: Record<string, unknown> | null;
  storageExists: boolean;
  storageByteLength: number | null;
  storageMimeType: string | null;
  pendingStructuredOperationExists: boolean;
  pendingAssetOperationExists: boolean;
  inferredCaseId: 1 | 2 | 3 | 4 | null;
  error?: string;
};

export type FsPdfSyncDiagHydrationEntry = {
  objectId: string;
  assetId: string;
  structuredObjectPresent: boolean;
  cloudDownloadAttempted: boolean;
  cloudDownloadResult: string | null;
  downloadedByteLength: number | null;
  localBlobAfterHydrate: boolean;
  rendererState: 'idle' | 'loading' | 'ready' | 'recover' | 'error';
  error: string | null;
};

const LATEST_MARKER_KEY = 'fw_fs_pdf_sync_diag_latest_v1';

type LatestMarker = {
  userId: string;
  sectionId: string;
  boardId: string;
  objectId: string;
  insertedAt: number;
};

type LocalPdfObject = {
  objectId: string;
  boardId: string;
  updatedAt: number;
  content: Record<string, unknown>;
  title: string;
};

export function fsPdfSyncDiagAssetId(objectId: string): string {
  return objectId;
}

export function fsPdfSyncDiagStoragePath(ids: {
  userId: string;
  sectionId: string;
  objectId: string;
}): string {
  return buildSpatialAssetPath({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'pdf',
  });
}

export function fsPdfSyncDiagSummarizePdfContent(
  content: unknown,
): Record<string, unknown> | null {
  if (!content || typeof content !== 'object') return null;
  const c = content as Record<string, unknown>;
  if (c.type !== 'pdf') return null;
  return {
    fileName: typeof c.fileName === 'string' ? c.fileName : null,
    fileType: typeof c.fileType === 'string' ? c.fileType : null,
    fileSize: typeof c.fileSize === 'number' ? c.fileSize : null,
    ingestionPhase: typeof c.ingestionPhase === 'string' ? c.ingestionPhase : null,
    pageCount: typeof c.pageCount === 'number' ? c.pageCount : null,
  };
}

export function isStructuredPdfContent(content: unknown): boolean {
  const summary = fsPdfSyncDiagSummarizePdfContent(content);
  if (!summary) return false;
  const fileName = summary.fileName;
  const fileSize = summary.fileSize;
  return (
    (typeof fileName === 'string' && fileName.length > 0) ||
    (typeof fileSize === 'number' && Number.isFinite(fileSize) && fileSize > 0)
  );
}

export function fsPdfSyncDiagLog(
  boundary: string,
  ctx: {
    userId?: string;
    sectionId?: string;
    boardId?: string;
    objectId?: string;
    assetId?: string;
  },
  extra?: Record<string, unknown>,
): void {
  if (typeof console === 'undefined') return;
  console.info(
    '[FS-PDF-SYNC-DIAG]',
    JSON.stringify({
      boundary,
      userId: ctx.userId ?? null,
      sectionId: ctx.sectionId ?? null,
      boardId: ctx.boardId ?? null,
      objectId: ctx.objectId ?? null,
      assetId: ctx.assetId ?? null,
      ...extra,
    }),
  );
}

export function fsPdfSyncDiagMarkLatest(ctx: {
  userId: string;
  sectionId: string;
  boardId?: string;
  objectId: string;
}): void {
  try {
    const marker: LatestMarker = {
      userId: ctx.userId,
      sectionId: ctx.sectionId,
      boardId: ctx.boardId || 'main',
      objectId: ctx.objectId,
      insertedAt: Date.now(),
    };
    localStorage.setItem(LATEST_MARKER_KEY, JSON.stringify(marker));
  } catch {
    /* ignore */
  }
}

function readLatestMarker(): LatestMarker | null {
  try {
    const raw = localStorage.getItem(LATEST_MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatestMarker;
    if (!parsed?.objectId || !parsed?.sectionId || !parsed?.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function listBoardIdsForSection(sectionId: string): string[] {
  const boardIds = new Set<string>(['main']);
  try {
    const listRaw = localStorage.getItem(`${sectionId}_boards_list_v1`);
    if (listRaw) {
      const parsed: unknown = JSON.parse(listRaw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string' && id) boardIds.add(id);
        }
      }
    }
    const prefix = `${sectionId}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix) || !k.endsWith('_objects_v1')) continue;
      const mid = k.slice(prefix.length, -'_objects_v1'.length);
      if (mid) boardIds.add(mid);
    }
  } catch {
    /* ignore */
  }
  return [...boardIds];
}

function loadLocalPdfObjects(sectionId: string): LocalPdfObject[] {
  const out: LocalPdfObject[] = [];
  for (const boardId of listBoardIdsForSection(sectionId)) {
    try {
      const raw = localStorage.getItem(boardScopedFreeSpaceKeys(sectionId, boardId).objects);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const row of parsed) {
        if (!row || typeof row !== 'object') continue;
        const o = row as Record<string, unknown>;
        if (o.type !== 'pdf' || typeof o.id !== 'string') continue;
        const content =
          o.content && typeof o.content === 'object'
            ? (o.content as Record<string, unknown>)
            : {};
        out.push({
          objectId: o.id,
          boardId,
          updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
          content,
          title: typeof o.title === 'string' ? o.title : 'PDF',
        });
      }
    } catch {
      /* ignore board */
    }
  }
  return out;
}

function pickLatestPdf(input: {
  userId: string;
  sectionId: string;
}): { objectId: string; boardId: string } | null {
  const marker = readLatestMarker();
  if (
    marker &&
    marker.userId === input.userId &&
    marker.sectionId === input.sectionId &&
    marker.objectId
  ) {
    return { objectId: marker.objectId, boardId: marker.boardId || 'main' };
  }
  const pdfs = loadLocalPdfObjects(input.sectionId);
  if (pdfs.length === 0) return null;
  pdfs.sort((a, b) => b.updatedAt - a.updatedAt);
  const latest = pdfs[0];
  return { objectId: latest.objectId, boardId: latest.boardId };
}

async function fetchStorageBinary(input: {
  userId: string;
  sectionId: string;
  objectId: string;
}): Promise<
  | { ok: true; exists: true; byteLength: number; contentType: string | null }
  | { ok: true; exists: false }
  | { ok: false; reason: string }
> {
  try {
    const { downloadUserContentAsset } = await import('./userContentStorage');
    const path = fsPdfSyncDiagStoragePath(input);
    const downloaded = await downloadUserContentAsset(path);
    if (!downloaded.ok) {
      if (downloaded.reason === 'not_found') return { ok: true, exists: false };
      return { ok: false, reason: downloaded.reason };
    }
    return {
      ok: true,
      exists: true,
      byteLength: downloaded.value.size,
      contentType: downloaded.value.type || null,
    };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

async function findPendingStructuredOperation(input: {
  userId: string;
  sectionId: string;
  objectId: string;
}): Promise<boolean> {
  try {
    const { listPendingOperations } = await import('./focusCache/pendingOperations');
    const listed = await listPendingOperations({
      userId: input.userId,
      workspaceId: input.sectionId,
    });
    if (!listed.ok) return false;
    return listed.value.some(
      op =>
        op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE &&
        op.entityId === input.objectId &&
        (op.operationType === 'create' || op.operationType === 'update'),
    );
  } catch {
    return false;
  }
}

async function findPendingAssetOperation(input: {
  userId: string;
  sectionId: string;
  objectId: string;
}): Promise<boolean> {
  try {
    const { listPendingOperations } = await import('./focusCache/pendingOperations');
    const listed = await listPendingOperations({
      userId: input.userId,
      workspaceId: input.sectionId,
    });
    if (!listed.ok) return false;
    return listed.value.some(op => {
      if (op.entityType !== USER_CONTENT_ASSET_ENTITY_TYPE) return false;
      const descriptor = parseUserContentAssetDescriptor(op.payload);
      return descriptor != null && descriptor.objectId === input.objectId && descriptor.assetType === 'pdf';
    });
  } catch {
    return false;
  }
}

export async function fsPdfSyncDiagLatest(): Promise<FsPdfSyncDiagLatestResult> {
  const userId = await fsImageSyncDiagResolveAuthUserId();
  const sectionId = fsImageSyncDiagResolveSectionIdFromUrl();
  if (!userId || !sectionId) {
    return {
      userId,
      sectionId,
      boardId: null,
      objectId: null,
      assetId: null,
      expectedStoragePath: null,
      localBlobExists: false,
      localBlobSize: null,
      cloudRowExists: false,
      cloudContentValid: false,
      cloudObjectContent: null,
      storageExists: false,
      storageByteLength: null,
      storageMimeType: null,
      pendingStructuredOperationExists: false,
      pendingAssetOperationExists: false,
      inferredCaseId: null,
      error: !userId ? 'auth_user_missing' : 'section_id_missing_from_url',
    };
  }

  const picked = pickLatestPdf({ userId, sectionId });
  if (!picked) {
    return {
      userId,
      sectionId,
      boardId: localStorage.getItem(sectionActiveBoardKey(sectionId)) || 'main',
      objectId: null,
      assetId: null,
      expectedStoragePath: null,
      localBlobExists: false,
      localBlobSize: null,
      cloudRowExists: false,
      cloudContentValid: false,
      cloudObjectContent: null,
      storageExists: false,
      storageByteLength: null,
      storageMimeType: null,
      pendingStructuredOperationExists: false,
      pendingAssetOperationExists: false,
      inferredCaseId: null,
      error: 'no_spatial_pdf_found_for_section',
    };
  }

  const objectId = picked.objectId;
  const assetId = fsPdfSyncDiagAssetId(objectId);
  const expectedStoragePath = fsPdfSyncDiagStoragePath({ userId, sectionId, objectId });

  let localBlobExists = false;
  let localBlobSize: number | null = null;
  try {
    const { loadPdfBlob } = await import('./freeSpacePdfIdb');
    const blob = await loadPdfBlob(sectionId, objectId);
    if (blob && blob.size > 0) {
      localBlobExists = true;
      localBlobSize = blob.size;
    }
  } catch {
    /* ignore */
  }

  const objectRow = await fsImageSyncDiagFetchCloudObject({ objectId, sectionId });
  const cloudRowExists = objectRow.ok;
  const cloudObjectRaw =
    objectRow.ok ? (objectRow.row as { object?: unknown }).object : null;
  const cloudObjectContent = fsPdfSyncDiagSummarizePdfContent(cloudObjectRaw);
  const cloudContentValid = isStructuredPdfContent(cloudObjectRaw);
  const structuredObjectExistsInCloud = cloudRowExists && cloudContentValid;

  const storage = await fetchStorageBinary({ userId, sectionId, objectId });
  const storageExists = storage.ok && 'exists' in storage && storage.exists;
  const storageByteLength =
    storage.ok && 'exists' in storage && storage.exists ? storage.byteLength : null;
  const storageMimeType =
    storage.ok && 'exists' in storage && storage.exists ? storage.contentType : null;

  const pendingStructuredOperationExists = await findPendingStructuredOperation({
    userId,
    sectionId,
    objectId,
  });
  const pendingAssetOperationExists = await findPendingAssetOperation({
    userId,
    sectionId,
    objectId,
  });

  const inferredCaseId = inferFsImageSyncCaseId({
    structuredObjectExistsInCloud,
    storageExists,
  });

  const result: FsPdfSyncDiagLatestResult = {
    userId,
    sectionId,
    boardId: picked.boardId,
    objectId,
    assetId,
    expectedStoragePath,
    localBlobExists,
    localBlobSize,
    cloudRowExists,
    cloudContentValid,
    cloudObjectContent,
    storageExists,
    storageByteLength,
    storageMimeType,
    pendingStructuredOperationExists,
    pendingAssetOperationExists,
    inferredCaseId,
  };

  fsPdfSyncDiagLog('I_saved_status_probe', {
    userId,
    sectionId,
    boardId: picked.boardId,
    objectId,
    assetId,
  }, result as unknown as Record<string, unknown>);

  return result;
}

function inferPdfRendererState(input: {
  content: Record<string, unknown> | null;
  localBlobAfter: boolean;
}): 'idle' | 'loading' | 'ready' | 'recover' | 'error' {
  const summary = fsPdfSyncDiagSummarizePdfContent(input.content);
  if (!summary) return 'idle';
  const fileName = summary.fileName;
  if (typeof fileName !== 'string' || fileName.length === 0) return 'idle';
  if (input.localBlobAfter) return 'ready';
  return 'recover';
}

export async function fsPdfSyncDiagHydration(): Promise<{
  userId: string | null;
  sectionId: string | null;
  entries: FsPdfSyncDiagHydrationEntry[];
  error?: string;
}> {
  const userId = await fsImageSyncDiagResolveAuthUserId();
  const sectionId = fsImageSyncDiagResolveSectionIdFromUrl();
  if (!sectionId) {
    return { userId, sectionId: null, entries: [], error: 'section_id_missing_from_url' };
  }

  const localPdfs = loadLocalPdfObjects(sectionId);
  const cloudRows = new Map<string, Record<string, unknown>>();
  if (userId) {
    try {
      const { supabase, isSupabaseConfigured } = await import('./supabase');
      if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('free_space_objects')
          .select('id, object, board_id')
          .eq('section_id', sectionId);
        for (const row of data ?? []) {
          if (row && typeof row.id === 'string') {
            cloudRows.set(row.id, row as Record<string, unknown>);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const targets = new Map<string, LocalPdfObject>();
  for (const pdf of localPdfs) targets.set(pdf.objectId, pdf);
  for (const [objectId, row] of cloudRows) {
    const obj = row.object;
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    if (o.type !== 'pdf') continue;
    if (targets.has(objectId)) continue;
    targets.set(objectId, {
      objectId,
      boardId: typeof row.board_id === 'string' ? row.board_id : 'main',
      updatedAt: 0,
      content: o,
      title: typeof o.title === 'string' ? o.title : 'PDF',
    });
  }

  const { loadPdfBlob } = await import('./freeSpacePdfIdb');
  const { hydrateSpatialPdfWithCloud } = await import('./spatialAssetCloud');

  const entries: FsPdfSyncDiagHydrationEntry[] = [];
  for (const target of targets.values()) {
    const assetId = fsPdfSyncDiagAssetId(target.objectId);
    const cloudRow = cloudRows.get(target.objectId);
    const cloudObj = cloudRow?.object;
    const structuredObjectPresent = isStructuredPdfContent(cloudObj ?? target.content);

    let localBlobBefore = false;
    try {
      const blob = await loadPdfBlob(sectionId, target.objectId);
      localBlobBefore = !!blob && blob.size > 0;
    } catch {
      /* ignore */
    }

    let cloudDownloadAttempted = false;
    let cloudDownloadResult: string | null = null;
    let downloadedByteLength: number | null = null;
    let hydrateResult: string | null = null;

    if (!localBlobBefore && userId) {
      cloudDownloadAttempted = true;
      hydrateResult = await hydrateSpatialPdfWithCloud({
        userId,
        sectionId,
        objectId: target.objectId,
        assetType: 'pdf',
      });
      cloudDownloadResult = hydrateResult;
      if (hydrateResult === 'cloud_hit') {
        const blob = await loadPdfBlob(sectionId, target.objectId);
        downloadedByteLength = blob?.size ?? null;
      } else if (hydrateResult === 'missing') {
        cloudDownloadResult = 'not_found';
      }
    }

    let localBlobAfter = false;
    try {
      const blob = await loadPdfBlob(sectionId, target.objectId);
      localBlobAfter = !!blob && blob.size > 0;
    } catch {
      /* ignore */
    }

    entries.push({
      objectId: target.objectId,
      assetId,
      structuredObjectPresent,
      cloudDownloadAttempted,
      cloudDownloadResult,
      downloadedByteLength,
      localBlobAfterHydrate: localBlobAfter,
      rendererState: inferPdfRendererState({
        content: target.content,
        localBlobAfter,
      }),
      error: null,
    });
  }

  fsPdfSyncDiagLog('J_device_b_hydration', { userId: userId ?? undefined, sectionId }, {
    pdfCount: entries.length,
    entries,
  });

  return { userId, sectionId, entries };
}

declare global {
  interface Window {
    __fwFsPdfSyncDiagLatest?: () => Promise<FsPdfSyncDiagLatestResult>;
    __fwFsPdfSyncDiagHydration?: () => Promise<{
      userId: string | null;
      sectionId: string | null;
      entries: FsPdfSyncDiagHydrationEntry[];
      error?: string;
    }>;
  }
}

if (typeof window !== 'undefined') {
  window.__fwFsPdfSyncDiagLatest = () => fsPdfSyncDiagLatest();
  window.__fwFsPdfSyncDiagHydration = () => fsPdfSyncDiagHydration();
}
