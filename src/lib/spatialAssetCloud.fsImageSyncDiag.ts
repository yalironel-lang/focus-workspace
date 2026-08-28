/**
 * Temporary diagnostics for Free Space spatial-image cross-device sync.
 * Prefix: [FS-IMAGE-SYNC-DIAG]
 */

import {
  boardScopedFreeSpaceKeys,
  sectionActiveBoardKey,
  sectionBoardsListKey,
} from './freeSpacePersistence';
import { buildSpatialAssetPath } from './spatialAssetCloud';
import { USER_CONTENT_ASSET_ENTITY_TYPE, parseUserContentAssetDescriptor } from './userContentAssetDescriptor';

export type FsImageSyncDiagBoundary =
  | 'A_image_insert'
  | 'B_asset_id'
  | 'C_local_blob_write'
  | 'D_spatial_object_update'
  | 'E_object_payload_persist'
  | 'F_user_content_enqueue'
  | 'G_asset_upload_flush'
  | 'H_storage_response'
  | 'I_saved_status'
  | 'J_device_b_object_pull'
  | 'K_image_ref_extract'
  | 'L_spatial_hydrate'
  | 'M_local_cache_rebuild'
  | 'N_renderer_source';

export type FsImageSyncDiagContext = {
  userId?: string;
  sectionId?: string;
  boardId?: string;
  objectId?: string;
  assetId?: string;
};

const LATEST_MARKER_KEY = 'fw_fs_image_sync_diag_latest_v1';

type LatestMarker = {
  userId: string;
  sectionId: string;
  boardId: string;
  objectId: string;
  insertedAt: number;
};

type LocalImageObject = {
  objectId: string;
  boardId: string;
  updatedAt: number;
  content: Record<string, unknown>;
  title: string;
};

export type FsImageSyncDiagLatestResult = {
  userId: string | null;
  sectionId: string | null;
  boardId: string | null;
  objectId: string | null;
  assetId: string | null;
  expectedStoragePath: string | null;
  localBlobExists: boolean;
  localBlobSize: number | null;
  cloudRowExists: boolean;
  cloudRowReason: string | null;
  cloudContentValid: boolean;
  structuredObjectExistsInCloud: boolean;
  cloudObjectContent: Record<string, unknown> | null;
  storageExists: boolean;
  storageByteLength: number | null;
  storageMimeType: string | null;
  pendingAssetOperationExists: boolean;
  pendingAssetOperation: Record<string, unknown> | null;
  inferredCaseId: 1 | 2 | 3 | 4 | null;
  error?: string;
};

export type FsImageSyncDiagHydrationEntry = {
  objectId: string;
  assetId: string;
  boardId: string;
  structuredObjectPresent: boolean;
  localContent: Record<string, unknown> | null;
  cloudContent: Record<string, unknown> | null;
  cloudObjectRowPresent: boolean;
  localBlobBeforeHydrate: boolean;
  localBlobSizeBefore: number | null;
  expectedStoragePath: string | null;
  cloudDownloadAttempted: boolean;
  cloudDownloadResult: string | null;
  downloadedByteLength: number | null;
  hydrateResult: string | null;
  localBlobAfterHydrate: boolean;
  localBlobSizeAfter: number | null;
  inferredRendererState: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
};

export function fsImageSyncDiagAssetId(objectId: string): string {
  return objectId;
}

export function fsImageSyncDiagStoragePath(ids: {
  userId: string;
  sectionId: string;
  objectId: string;
}): string {
  return buildSpatialAssetPath({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'spatial-image',
  });
}

export function fsImageSyncDiagSummarizeImageContent(
  content: unknown,
): Record<string, unknown> | null {
  if (!content || typeof content !== 'object') return null;
  const c = content as Record<string, unknown>;
  if (c.type !== 'image') return null;
  return {
    url: typeof c.url === 'string' ? c.url : null,
    fileName: typeof c.fileName === 'string' ? c.fileName : null,
    fileSize: typeof c.fileSize === 'number' ? c.fileSize : null,
    naturalWidth: typeof c.naturalWidth === 'number' ? c.naturalWidth : null,
    naturalHeight: typeof c.naturalHeight === 'number' ? c.naturalHeight : null,
  };
}

function isStructuredSpatialImageContent(content: unknown): boolean {
  const summary = fsImageSyncDiagSummarizeImageContent(content);
  if (!summary) return false;
  const fileName = summary.fileName;
  const fileSize = summary.fileSize;
  return (
    (typeof fileName === 'string' && fileName.length > 0) ||
    (typeof fileSize === 'number' && Number.isFinite(fileSize) && fileSize > 0)
  );
}

export function inferFsImageSyncCaseId(input: {
  structuredObjectExistsInCloud: boolean;
  storageExists: boolean;
}): 1 | 2 | 3 | 4 {
  if (!input.structuredObjectExistsInCloud && !input.storageExists) return 1;
  if (input.structuredObjectExistsInCloud && !input.storageExists) return 2;
  if (!input.structuredObjectExistsInCloud && input.storageExists) return 3;
  return 4;
}

export function fsImageSyncDiagMarkLatest(ctx: FsImageSyncDiagContext): void {
  if (!ctx.userId || !ctx.sectionId || !ctx.objectId) return;
  try {
    const marker: LatestMarker = {
      userId: ctx.userId,
      sectionId: ctx.sectionId,
      boardId: ctx.boardId?.trim() || 'main',
      objectId: ctx.objectId,
      insertedAt: Date.now(),
    };
    sessionStorage.setItem(LATEST_MARKER_KEY, JSON.stringify(marker));
  } catch {
    /* quota / private mode */
  }
}

export function fsImageSyncDiagLog(
  boundary: FsImageSyncDiagBoundary,
  ctx: FsImageSyncDiagContext,
  extra?: Record<string, unknown>,
): void {
  if (boundary === 'A_image_insert') {
    fsImageSyncDiagMarkLatest(ctx);
  }
  if (typeof console === 'undefined') return;
  const payload = {
    boundary,
    userId: ctx.userId ?? null,
    sectionId: ctx.sectionId ?? null,
    boardId: ctx.boardId ?? null,
    objectId: ctx.objectId ?? null,
    assetId: ctx.assetId ?? ctx.objectId ?? null,
    storagePath:
      ctx.userId && ctx.sectionId && ctx.objectId
        ? fsImageSyncDiagStoragePath({
            userId: ctx.userId,
            sectionId: ctx.sectionId,
            objectId: ctx.objectId,
          })
        : null,
    ...extra,
  };
  console.info('[FS-IMAGE-SYNC-DIAG]', JSON.stringify(payload));
}

export async function fsImageSyncDiagResolveAuthUserId(): Promise<string | null> {
  try {
    const { supabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export function fsImageSyncDiagResolveSectionIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/section\/([^/?#]+)/);
  return match?.[1]?.trim() || null;
}

function readLatestMarker(): LatestMarker | null {
  try {
    const raw = sessionStorage.getItem(LATEST_MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatestMarker;
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.sectionId !== 'string' ||
      typeof parsed.objectId !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function listBoardIdsForSection(sectionId: string): string[] {
  const boardIds = new Set<string>(['main']);
  try {
    const raw = localStorage.getItem(sectionBoardsListKey(sectionId));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const b of parsed) {
          if (b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string') {
            const id = (b as { id: string }).id.trim();
            if (id) boardIds.add(id);
          }
        }
      }
    }
    const prefix = `fw_section_${sectionId}_board_`;
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

function loadLocalImageObjects(sectionId: string): LocalImageObject[] {
  const out: LocalImageObject[] = [];
  for (const boardId of listBoardIdsForSection(sectionId)) {
    try {
      const raw = localStorage.getItem(boardScopedFreeSpaceKeys(sectionId, boardId).objects);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const row of parsed) {
        if (!row || typeof row !== 'object') continue;
        const o = row as Record<string, unknown>;
        if (o.type !== 'image' || typeof o.id !== 'string') continue;
        const content =
          o.content && typeof o.content === 'object'
            ? (o.content as Record<string, unknown>)
            : {};
        out.push({
          objectId: o.id,
          boardId,
          updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
          content,
          title: typeof o.title === 'string' ? o.title : 'Image',
        });
      }
    } catch {
      /* ignore board */
    }
  }
  return out;
}

function pickLatestSpatialImage(input: {
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

  const images = loadLocalImageObjects(input.sectionId);
  if (images.length === 0) return null;
  images.sort((a, b) => b.updatedAt - a.updatedAt);
  const latest = images[0];
  return { objectId: latest.objectId, boardId: latest.boardId };
}

export async function fsImageSyncDiagFetchCloudObject(input: {
  objectId: string;
  sectionId?: string;
}): Promise<{ ok: true; row: unknown } | { ok: false; reason: string }> {
  try {
    const { supabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured) return { ok: false, reason: 'supabase_not_configured' };
    let q = supabase
      .from('free_space_objects')
      .select('id, section_id, board_id, object, updated_at')
      .eq('id', input.objectId);
    if (input.sectionId) q = q.eq('section_id', input.sectionId);
    const { data, error } = await q.maybeSingle();
    if (error) return { ok: false, reason: error.message };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, row: data };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

export async function fsImageSyncDiagFetchStorageBinary(input: {
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
    const path = fsImageSyncDiagStoragePath(input);
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

async function findPendingAssetOperation(input: {
  userId: string;
  sectionId: string;
  objectId: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const { listPendingOperations } = await import('./focusCache/pendingOperations');
    const listed = await listPendingOperations({
      userId: input.userId,
      workspaceId: input.sectionId,
    });
    if (!listed.ok) return null;
    for (const op of listed.value) {
      if (op.entityType !== USER_CONTENT_ASSET_ENTITY_TYPE) continue;
      const descriptor = parseUserContentAssetDescriptor(op.payload);
      if (!descriptor || descriptor.objectId !== input.objectId) continue;
      if (descriptor.assetType !== 'spatial-image') continue;
      return {
        opId: op.id,
        operationType: op.operationType,
        entityId: op.entityId,
        assetOp: descriptor.assetOp,
        storagePath: descriptor.storagePath,
        byteLength: descriptor.byteLength ?? null,
        updatedAt: descriptor.updatedAt,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function fsImageSyncDiagLatest(): Promise<FsImageSyncDiagLatestResult> {
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
      cloudRowReason: null,
      cloudContentValid: false,
      structuredObjectExistsInCloud: false,
      cloudObjectContent: null,
      storageExists: false,
      storageByteLength: null,
      storageMimeType: null,
      pendingAssetOperationExists: false,
      pendingAssetOperation: null,
      inferredCaseId: null,
      error: !userId ? 'auth_user_missing' : 'section_id_missing_from_url',
    };
  }

  const picked = pickLatestSpatialImage({ userId, sectionId });
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
      cloudRowReason: null,
      cloudContentValid: false,
      structuredObjectExistsInCloud: false,
      cloudObjectContent: null,
      storageExists: false,
      storageByteLength: null,
      storageMimeType: null,
      pendingAssetOperationExists: false,
      pendingAssetOperation: null,
      inferredCaseId: null,
      error: 'no_spatial_image_found_for_section',
    };
  }

  const objectId = picked.objectId;
  const assetId = fsImageSyncDiagAssetId(objectId);
  const expectedStoragePath = fsImageSyncDiagStoragePath({ userId, sectionId, objectId });

  let localBlobExists = false;
  let localBlobSize: number | null = null;
  try {
    const { loadImageBlob } = await import('./freeSpaceImageIdb');
    const blob = await loadImageBlob(sectionId, objectId);
    if (blob && blob.size > 0) {
      localBlobExists = true;
      localBlobSize = blob.size;
    }
  } catch {
    /* ignore */
  }

  const objectRow = await fsImageSyncDiagFetchCloudObject({ objectId, sectionId });
  const cloudRowExists = objectRow.ok;
  const cloudRowReason = objectRow.ok ? null : objectRow.reason;
  const cloudObjectRaw =
    objectRow.ok ? (objectRow.row as { object?: unknown }).object : null;
  const cloudObjectContent = fsImageSyncDiagSummarizeImageContent(cloudObjectRaw);
  const cloudContentValid = isStructuredSpatialImageContent(cloudObjectRaw);
  const structuredObjectExistsInCloud = cloudRowExists && cloudContentValid;

  const storage = await fsImageSyncDiagFetchStorageBinary({ userId, sectionId, objectId });
  const storageExists = storage.ok && 'exists' in storage && storage.exists;
  const storageByteLength =
    storage.ok && 'exists' in storage && storage.exists ? storage.byteLength : null;
  const storageMimeType =
    storage.ok && 'exists' in storage && storage.exists ? storage.contentType : null;

  const pendingAssetOperation = await findPendingAssetOperation({
    userId,
    sectionId,
    objectId,
  });

  const inferredCaseId = inferFsImageSyncCaseId({
    structuredObjectExistsInCloud,
    storageExists,
  });

  const result: FsImageSyncDiagLatestResult = {
    userId,
    sectionId,
    boardId: picked.boardId,
    objectId,
    assetId,
    expectedStoragePath,
    localBlobExists,
    localBlobSize,
    cloudRowExists,
    cloudRowReason,
    cloudContentValid,
    structuredObjectExistsInCloud,
    cloudObjectContent,
    storageExists,
    storageByteLength,
    storageMimeType,
    pendingAssetOperationExists: pendingAssetOperation != null,
    pendingAssetOperation,
    inferredCaseId,
  };

  fsImageSyncDiagLog('I_saved_status', { userId, sectionId, boardId: picked.boardId, objectId, assetId }, {
    ...result,
    cloudObjectOk: objectRow.ok,
    cloudObjectReason: objectRow.ok ? null : objectRow.reason,
    caseId: inferredCaseId,
  });

  return result;
}

function inferRendererState(input: {
  content: Record<string, unknown> | null;
  localBlobAfter: boolean;
  userId: string | null;
}): 'idle' | 'loading' | 'ready' | 'error' {
  const summary = fsImageSyncDiagSummarizeImageContent(input.content);
  if (!summary) return 'idle';
  const fileName = summary.fileName;
  const fileSize = summary.fileSize;
  const hasSignal =
    (typeof fileName === 'string' && fileName.length > 0) ||
    (typeof fileSize === 'number' && fileSize > 0);
  if (!hasSignal) return 'idle';
  if (typeof summary.url === 'string' && summary.url.startsWith('blob:')) return 'error';
  if (input.localBlobAfter) return 'ready';
  if (!input.userId) return 'loading';
  return 'error';
}

export async function fsImageSyncDiagHydration(): Promise<{
  userId: string | null;
  sectionId: string | null;
  entries: FsImageSyncDiagHydrationEntry[];
  error?: string;
}> {
  const userId = await fsImageSyncDiagResolveAuthUserId();
  const sectionId = fsImageSyncDiagResolveSectionIdFromUrl();
  if (!sectionId) {
    return { userId, sectionId: null, entries: [], error: 'section_id_missing_from_url' };
  }

  const localImages = loadLocalImageObjects(sectionId);
  const cloudRows = new Map<string, Record<string, unknown>>();
  if (userId) {
    try {
      const { supabase, isSupabaseConfigured } = await import('./supabase');
      if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('free_space_objects')
          .select('id, object, board_id, updated_at')
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

  const seen = new Set<string>();
  const targets: LocalImageObject[] = [...localImages];
  for (const [objectId, row] of cloudRows) {
    if (seen.has(objectId)) continue;
    const obj = row.object;
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    if (o.type !== 'image') continue;
    seen.add(objectId);
    if (targets.some(t => t.objectId === objectId)) continue;
    targets.push({
      objectId,
      boardId: typeof row.board_id === 'string' ? row.board_id : 'main',
      updatedAt: 0,
      content: o,
      title: typeof o.title === 'string' ? o.title : 'Image',
    });
  }

  const { loadImageBlob } = await import('./freeSpaceImageIdb');
  const { downloadUserContentAsset } = await import('./userContentStorage');
  const { hydrateSpatialImageWithCloud } = await import('./spatialAssetCloud');

  const entries: FsImageSyncDiagHydrationEntry[] = [];
  for (const target of targets) {
    const assetId = fsImageSyncDiagAssetId(target.objectId);
    const expectedStoragePath =
      userId != null
        ? fsImageSyncDiagStoragePath({
            userId,
            sectionId,
            objectId: target.objectId,
          })
        : null;

    let localBlobSizeBefore: number | null = null;
    let localBlobBeforeHydrate = false;
    try {
      const before = await loadImageBlob(sectionId, target.objectId);
      if (before && before.size > 0) {
        localBlobBeforeHydrate = true;
        localBlobSizeBefore = before.size;
      }
    } catch {
      /* ignore */
    }

    const cloudRow = cloudRows.get(target.objectId);
    const cloudRaw = cloudRow?.object;
    const cloudContent = fsImageSyncDiagSummarizeImageContent(cloudRaw);

    let cloudDownloadAttempted = false;
    let cloudDownloadResult: string | null = null;
    let downloadedByteLength: number | null = null;
    if (userId && expectedStoragePath) {
      cloudDownloadAttempted = true;
      const downloaded = await downloadUserContentAsset(expectedStoragePath);
      if (!downloaded.ok) {
        cloudDownloadResult = downloaded.reason;
      } else {
        cloudDownloadResult = 'ok';
        downloadedByteLength = downloaded.value.size;
      }
    }

    let hydrateResult: string | null = null;
    if (userId) {
      try {
        hydrateResult = await hydrateSpatialImageWithCloud({
          userId,
          sectionId,
          objectId: target.objectId,
          assetType: 'spatial-image',
        });
      } catch (e) {
        hydrateResult = `error:${String(e)}`;
      }
    }

    let localBlobAfterHydrate = false;
    let localBlobSizeAfter: number | null = null;
    try {
      const after = await loadImageBlob(sectionId, target.objectId);
      if (after && after.size > 0) {
        localBlobAfterHydrate = true;
        localBlobSizeAfter = after.size;
      }
    } catch {
      /* ignore */
    }

    const localContent = fsImageSyncDiagSummarizeImageContent(target.content);
    entries.push({
      objectId: target.objectId,
      assetId,
      boardId: target.boardId,
      structuredObjectPresent: isStructuredSpatialImageContent(target.content),
      localContent,
      cloudContent,
      cloudObjectRowPresent: cloudRow != null,
      localBlobBeforeHydrate,
      localBlobSizeBefore,
      expectedStoragePath,
      cloudDownloadAttempted,
      cloudDownloadResult,
      downloadedByteLength,
      hydrateResult,
      localBlobAfterHydrate,
      localBlobSizeAfter,
      inferredRendererState: inferRendererState({
        content: localContent,
        localBlobAfter: localBlobAfterHydrate,
        userId,
      }),
      error: null,
    });
  }

  fsImageSyncDiagLog('J_device_b_object_pull', { userId: userId ?? undefined, sectionId }, {
    imageCount: entries.length,
    entries: entries.map(e => ({
      objectId: e.objectId,
      cloudObjectRowPresent: e.cloudObjectRowPresent,
      cloudDownloadResult: e.cloudDownloadResult,
      hydrateResult: e.hydrateResult,
      inferredRendererState: e.inferredRendererState,
    })),
  });

  return { userId, sectionId, entries };
}

export async function fsImageSyncDiagProbeAfterSaved(input: {
  userId: string;
  sectionId: string;
  objectId: string;
}): Promise<FsImageSyncDiagLatestResult> {
  fsImageSyncDiagMarkLatest({
    userId: input.userId,
    sectionId: input.sectionId,
    objectId: input.objectId,
  });
  return fsImageSyncDiagLatest();
}

declare global {
  interface Window {
    __fwFsImageSyncDiagFetchAsset?: (
      objectId: string,
      sectionId?: string,
      userId?: string,
    ) => Promise<FsImageSyncDiagLatestResult | void>;
    __fwFsImageSyncDiagLatest?: () => Promise<FsImageSyncDiagLatestResult>;
    __fwFsImageSyncDiagHydration?: () => Promise<{
      userId: string | null;
      sectionId: string | null;
      entries: FsImageSyncDiagHydrationEntry[];
      error?: string;
    }>;
  }
}

if (typeof window !== 'undefined') {
  window.__fwFsImageSyncDiagLatest = () => fsImageSyncDiagLatest();
  window.__fwFsImageSyncDiagHydration = () => fsImageSyncDiagHydration();
  window.__fwFsImageSyncDiagFetchAsset = async (objectId, sectionId, userId) => {
    const resolvedUserId = userId ?? (await fsImageSyncDiagResolveAuthUserId());
    const resolvedSectionId = sectionId ?? fsImageSyncDiagResolveSectionIdFromUrl();
    if (!resolvedUserId || !resolvedSectionId) {
      console.warn('[FS-IMAGE-SYNC-DIAG] need authenticated user on /section/:id route');
      return;
    }
    fsImageSyncDiagMarkLatest({
      userId: resolvedUserId,
      sectionId: resolvedSectionId,
      objectId,
    });
    return fsImageSyncDiagLatest();
  };
}
