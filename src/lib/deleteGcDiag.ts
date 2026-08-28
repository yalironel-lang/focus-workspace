/**
 * Runtime diagnostics for delete / GC / resurrection guards.
 * Prefix: [DELETE-GC-DIAG]
 */

import { boardScopedFreeSpaceKeys } from './freeSpacePersistence';
import { FREE_SPACE_OBJECT_ENTITY_TYPE } from './focusCache/freeSpaceObjectCreateEnqueue';
import { listTombstones } from './knowledge/tombstoneStore';
import { buildSpatialAssetPath, type SpatialAssetIds } from './spatialAssetCloud';
import { fsImageSyncDiagFetchCloudObject } from './spatialAssetCloud.fsImageSyncDiag';
import {
  fsImageSyncDiagResolveAuthUserId,
  fsImageSyncDiagResolveSectionIdFromUrl,
} from './spatialAssetCloud.fsImageSyncDiag';
import {
  isUserContentAssetDeleted,
  userContentAssetEntityKey,
} from './userContentAssetAuthority';
import {
  USER_CONTENT_ASSET_ENTITY_TYPE,
  parseUserContentAssetDescriptor,
} from './userContentAssetDescriptor';

export type DeleteGcSurface =
  | 'free_space_image'
  | 'free_space_pdf'
  | 'notebook_image'
  | 'handwriting'
  | 'notebook'
  | 'unknown';

export type DeleteGcInferredState =
  | 0 // not deleted
  | 1 // local-only delete / cloud still exists
  | 2 // structured deleted / asset orphan remains
  | 3 // asset deleted / structured object remains
  | 4 // cloud delete complete
  | 5 // resurrection risk detected
  | 6; // stale client attempted resurrection (suppressed)

const LATEST_MARKER_KEY = 'fw_delete_gc_diag_latest_v1';

type LatestMarker = {
  surface: DeleteGcSurface;
  userId: string;
  sectionId: string;
  boardId: string;
  objectId: string;
  assetType: 'spatial-image' | 'pdf' | 'notebook-image' | 'handwriting' | null;
  deletedAt: number;
  lastError?: string;
};

export type DeleteGcDiagLatestResult = {
  surface: DeleteGcSurface | null;
  userId: string | null;
  sectionId: string | null;
  boardId: string | null;
  objectId: string | null;
  assetType: string | null;
  assetId: string | null;
  storagePath: string | null;
  localStructuredExists: boolean;
  localBlobExists: boolean;
  pendingStructuredDeleteExists: boolean;
  pendingAssetDeleteExists: boolean;
  cloudStructuredExists: boolean;
  cloudAssetExists: boolean;
  tombstoneExists: boolean;
  tombstoneTimestamp: number | null;
  lastDeleteError: string | null;
  inferredDeleteState: DeleteGcInferredState | null;
  error?: string;
};

export function deleteGcDiagLog(
  boundary: string,
  ctx: {
    userId?: string;
    sectionId?: string;
    boardId?: string;
    objectId?: string;
    surface?: DeleteGcSurface;
  },
  extra?: Record<string, unknown>,
): void {
  if (typeof console === 'undefined') return;
  console.info(
    '[DELETE-GC-DIAG]',
    JSON.stringify({
      boundary,
      userId: ctx.userId ?? null,
      sectionId: ctx.sectionId ?? null,
      boardId: ctx.boardId ?? null,
      objectId: ctx.objectId ?? null,
      surface: ctx.surface ?? null,
      ...extra,
    }),
  );
}

export function deleteGcDiagMarkLatest(input: {
  surface: DeleteGcSurface;
  userId: string;
  sectionId: string;
  boardId?: string;
  objectId: string;
  assetType?: LatestMarker['assetType'];
  lastError?: string;
}): void {
  try {
    const marker: LatestMarker = {
      surface: input.surface,
      userId: input.userId,
      sectionId: input.sectionId,
      boardId: input.boardId || 'main',
      objectId: input.objectId,
      assetType: input.assetType ?? null,
      deletedAt: Date.now(),
      lastError: input.lastError,
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
    if (!parsed?.objectId || !parsed?.sectionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function localStructuredExists(sectionId: string, boardId: string, objectId: string): boolean {
  try {
    const raw = localStorage.getItem(boardScopedFreeSpaceKeys(sectionId, boardId).objects);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;
    return parsed.some(
      row => row && typeof row === 'object' && (row as { id?: string }).id === objectId,
    );
  } catch {
    return false;
  }
}

async function localBlobExists(
  sectionId: string,
  objectId: string,
  assetType: 'spatial-image' | 'pdf' | null,
): Promise<boolean> {
  try {
    if (assetType === 'pdf') {
      const { loadPdfBlob } = await import('./freeSpacePdfIdb');
      const blob = await loadPdfBlob(sectionId, objectId);
      return !!blob && blob.size > 0;
    }
    if (assetType === 'spatial-image') {
      const { loadImageBlob } = await import('./freeSpaceImageIdb');
      const blob = await loadImageBlob(sectionId, objectId);
      return !!blob && blob.size > 0;
    }
    return false;
  } catch {
    return false;
  }
}

async function fetchCloudAssetExists(ids: SpatialAssetIds): Promise<boolean> {
  try {
    const { downloadUserContentAsset } = await import('./userContentStorage');
    const path = buildSpatialAssetPath(ids);
    const downloaded = await downloadUserContentAsset(path);
    return downloaded.ok;
  } catch {
    return false;
  }
}

async function findPendingStructuredDelete(
  userId: string,
  sectionId: string,
  objectId: string,
): Promise<boolean> {
  try {
    const { listPendingOperations } = await import('./focusCache/pendingOperations');
    const listed = await listPendingOperations({ userId, workspaceId: sectionId });
    if (!listed.ok) return false;
    return listed.value.some(
      op =>
        op.entityType === FREE_SPACE_OBJECT_ENTITY_TYPE &&
        op.entityId === objectId &&
        op.operationType === 'delete',
    );
  } catch {
    return false;
  }
}

async function findPendingAssetDelete(
  userId: string,
  sectionId: string,
  objectId: string,
): Promise<boolean> {
  try {
    const { listPendingOperations } = await import('./focusCache/pendingOperations');
    const listed = await listPendingOperations({ userId, workspaceId: sectionId });
    if (!listed.ok) return false;
    return listed.value.some(op => {
      if (op.entityType !== USER_CONTENT_ASSET_ENTITY_TYPE) return false;
      const d = parseUserContentAssetDescriptor(op.payload);
      return d != null && d.objectId === objectId && d.assetOp === 'delete';
    });
  } catch {
    return false;
  }
}

async function findObjectTombstone(
  sectionId: string,
  objectId: string,
): Promise<{ exists: boolean; timestamp: number | null }> {
  try {
    const rows = await listTombstones(sectionId);
    const hit = rows.find(
      t => t.kind === 'free_space_object' && t.objectId === objectId,
    );
    if (!hit) return { exists: false, timestamp: null };
    return { exists: true, timestamp: hit.deletedAt };
  } catch {
    return { exists: false, timestamp: null };
  }
}

function inferDeleteState(input: {
  localStructuredExists: boolean;
  localBlobExists: boolean;
  cloudStructuredExists: boolean;
  cloudAssetExists: boolean;
  tombstoneExists: boolean;
  assetTombstoneExists: boolean;
  pendingStructuredDeleteExists: boolean;
  pendingAssetDeleteExists: boolean;
}): DeleteGcInferredState {
  const cloudGone = !input.cloudStructuredExists && !input.cloudAssetExists;
  const cloudComplete =
    !input.cloudStructuredExists &&
    !input.cloudAssetExists &&
    !input.pendingStructuredDeleteExists &&
    !input.pendingAssetDeleteExists;

  if (
    input.assetTombstoneExists &&
    input.localBlobExists &&
    !input.cloudStructuredExists
  ) {
    return 6;
  }

  if (cloudComplete && (input.tombstoneExists || input.assetTombstoneExists)) {
    return 4;
  }

  if (!input.cloudStructuredExists && input.cloudAssetExists) {
    return 2;
  }

  if (input.cloudStructuredExists && !input.cloudAssetExists) {
    return 3;
  }

  if (
    !input.localStructuredExists &&
    !input.localBlobExists &&
    input.cloudStructuredExists
  ) {
    return 1;
  }

  if (
    input.localBlobExists &&
    !input.cloudStructuredExists &&
    !input.assetTombstoneExists &&
    !input.tombstoneExists
  ) {
    return 5;
  }

  if (cloudGone && !input.localStructuredExists && !input.localBlobExists) {
    return 4;
  }

  return 0;
}

export async function deleteGcDiagLatest(): Promise<DeleteGcDiagLatestResult> {
  const userId = await fsImageSyncDiagResolveAuthUserId();
  const sectionId = fsImageSyncDiagResolveSectionIdFromUrl();
  const marker = readLatestMarker();

  if (!marker && (!userId || !sectionId)) {
    return {
      surface: null,
      userId,
      sectionId,
      boardId: null,
      objectId: null,
      assetType: null,
      assetId: null,
      storagePath: null,
      localStructuredExists: false,
      localBlobExists: false,
      pendingStructuredDeleteExists: false,
      pendingAssetDeleteExists: false,
      cloudStructuredExists: false,
      cloudAssetExists: false,
      tombstoneExists: false,
      tombstoneTimestamp: null,
      lastDeleteError: null,
      inferredDeleteState: null,
      error: 'no_delete_marker_and_missing_context',
    };
  }

  const resolvedUserId = marker?.userId ?? userId;
  const resolvedSectionId = marker?.sectionId ?? sectionId;
  const objectId = marker?.objectId ?? null;
  const boardId = marker?.boardId ?? 'main';
  const assetType = marker?.assetType ?? null;

  if (!resolvedUserId || !resolvedSectionId || !objectId) {
    return {
      surface: marker?.surface ?? null,
      userId: resolvedUserId,
      sectionId: resolvedSectionId,
      objectId,
      boardId,
      assetType,
      assetId: null,
      storagePath: null,
      localStructuredExists: false,
      localBlobExists: false,
      pendingStructuredDeleteExists: false,
      pendingAssetDeleteExists: false,
      cloudStructuredExists: false,
      cloudAssetExists: false,
      tombstoneExists: false,
      tombstoneTimestamp: null,
      lastDeleteError: marker?.lastError ?? null,
      inferredDeleteState: null,
      error: 'missing_user_section_or_object',
    };
  }

  const spatialAssetType =
    assetType === 'pdf' || assetType === 'spatial-image' ? assetType : null;
  const assetId = spatialAssetType ? objectId : null;
  const storagePath =
    spatialAssetType != null
      ? buildSpatialAssetPath({
          userId: resolvedUserId,
          sectionId: resolvedSectionId,
          objectId,
          assetType: spatialAssetType,
        })
      : null;

  const structuredLocal = localStructuredExists(resolvedSectionId, boardId, objectId);
  const blobLocal = await localBlobExists(resolvedSectionId, objectId, spatialAssetType);

  const cloudRow = await fsImageSyncDiagFetchCloudObject({
    objectId,
    sectionId: resolvedSectionId,
  });
  const cloudStructuredExists = cloudRow.ok;

  let cloudAssetExists = false;
  if (spatialAssetType) {
    cloudAssetExists = await fetchCloudAssetExists({
      userId: resolvedUserId,
      sectionId: resolvedSectionId,
      objectId,
      assetType: spatialAssetType,
    });
  }

  const pendingStructuredDeleteExists = await findPendingStructuredDelete(
    resolvedUserId,
    resolvedSectionId,
    objectId,
  );
  const pendingAssetDeleteExists = await findPendingAssetDelete(
    resolvedUserId,
    resolvedSectionId,
    objectId,
  );

  const objTomb = await findObjectTombstone(resolvedSectionId, objectId);
  const assetTombstoneExists =
    spatialAssetType != null &&
    isUserContentAssetDeleted(
      userContentAssetEntityKey({
        sectionId: resolvedSectionId,
        objectId,
        assetType: spatialAssetType,
        assetId: objectId,
      }),
    );

  const inferredDeleteState = inferDeleteState({
    localStructuredExists: structuredLocal,
    localBlobExists: blobLocal,
    cloudStructuredExists,
    cloudAssetExists,
    tombstoneExists: objTomb.exists,
    assetTombstoneExists,
    pendingStructuredDeleteExists,
    pendingAssetDeleteExists,
  });

  const result: DeleteGcDiagLatestResult = {
    surface: marker?.surface ?? null,
    userId: resolvedUserId,
    sectionId: resolvedSectionId,
    boardId,
    objectId,
    assetType,
    assetId,
    storagePath,
    localStructuredExists: structuredLocal,
    localBlobExists: blobLocal,
    pendingStructuredDeleteExists,
    pendingAssetDeleteExists,
    cloudStructuredExists,
    cloudAssetExists,
    tombstoneExists: objTomb.exists,
    tombstoneTimestamp: objTomb.timestamp,
    lastDeleteError: marker?.lastError ?? null,
    inferredDeleteState,
  };

  deleteGcDiagLog('probe_latest', {
    userId: resolvedUserId,
    sectionId: resolvedSectionId,
    objectId,
    surface: marker?.surface,
  }, result as unknown as Record<string, unknown>);

  return result;
}

declare global {
  interface Window {
    __fwDeleteGcDiagLatest?: () => Promise<DeleteGcDiagLatestResult>;
  }
}

if (typeof window !== 'undefined') {
  window.__fwDeleteGcDiagLatest = () => deleteGcDiagLatest();
}
