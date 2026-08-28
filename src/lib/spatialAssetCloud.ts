/**
 * Free Space spatial image + PDF binaries ↔ user-content Storage.
 */

import { fwPersistWarn } from './freeSpacePersistence';
import { loadImageBlob } from './freeSpaceImageIdb';
import { loadPdfBlob } from './freeSpacePdfIdb';
import { enqueueUserContentAssetOp } from './userContentAssetEnqueue';
import { registerUserContentAssetResolver } from './userContentAssetResolver';
import {
  buildUserContentPath,
  downloadUserContentAsset,
} from './userContentStorage';
import { isSupabaseConfigured } from './supabase';
import { saveImageBlob } from './freeSpaceImageIdb';
import { savePdfBlob } from './freeSpacePdfIdb';
import {
  canUploadUserContentAsset,
  clearUserContentAssetDeleted,
  isUserContentAssetDeleted,
  markUserContentAssetDeleted,
  userContentAssetEntityKey,
} from './userContentAssetAuthority';
import {
  fsImageSyncDiagAssetId,
  fsImageSyncDiagLog,
} from './spatialAssetCloud.fsImageSyncDiag';

export const SPATIAL_IMAGE_STORE_ID = 'free_space_image' as const;
export const SPATIAL_PDF_STORE_ID = 'free_space_pdf' as const;

export type SpatialAssetIds = {
  userId: string;
  sectionId: string;
  objectId: string;
  assetType: 'spatial-image' | 'pdf';
};

const ENQUEUE_DEBOUNCE_MS = 2000;
const pendingUploads = new Map<string, ReturnType<typeof setTimeout>>();
let resolversRegistered = false;

function timerKey(ids: SpatialAssetIds): string {
  return `${ids.sectionId}/${ids.objectId}/${ids.assetType}`;
}

function idsReady(ids: Partial<SpatialAssetIds>): ids is SpatialAssetIds {
  return Boolean(
    ids.userId?.trim() &&
      ids.sectionId?.trim() &&
      ids.objectId?.trim() &&
      (ids.assetType === 'spatial-image' || ids.assetType === 'pdf'),
  );
}

export function buildSpatialAssetPath(ids: SpatialAssetIds): string {
  return buildUserContentPath({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: ids.assetType,
    assetId: ids.objectId,
  });
}

async function loadLocalBlob(ids: SpatialAssetIds): Promise<Blob | undefined> {
  if (ids.assetType === 'spatial-image') {
    return loadImageBlob(ids.sectionId, ids.objectId);
  }
  return loadPdfBlob(ids.sectionId, ids.objectId);
}

async function saveLocalBlob(ids: SpatialAssetIds, blob: Blob): Promise<void> {
  if (ids.assetType === 'spatial-image') {
    await saveImageBlob(ids.sectionId, ids.objectId, blob);
  } else {
    await savePdfBlob(ids.sectionId, ids.objectId, blob);
  }
}

function storeIdFor(ids: SpatialAssetIds): string {
  return ids.assetType === 'spatial-image' ? SPATIAL_IMAGE_STORE_ID : SPATIAL_PDF_STORE_ID;
}

function localRefKey(ids: SpatialAssetIds): string {
  return `${ids.sectionId}::${ids.objectId}`;
}

export function ensureSpatialAssetResolversRegistered(): void {
  if (resolversRegistered) return;
  registerUserContentAssetResolver(SPATIAL_IMAGE_STORE_ID, async descriptor => {
    const key = descriptor.localRef.key;
    const sep = key.indexOf('::');
    if (sep <= 0) return null;
    const sectionId = key.slice(0, sep);
    const objectId = key.slice(sep + 2);
    return (await loadImageBlob(sectionId, objectId)) ?? null;
  });
  registerUserContentAssetResolver(SPATIAL_PDF_STORE_ID, async descriptor => {
    const key = descriptor.localRef.key;
    const sep = key.indexOf('::');
    if (sep <= 0) return null;
    const sectionId = key.slice(0, sep);
    const objectId = key.slice(sep + 2);
    return (await loadPdfBlob(sectionId, objectId)) ?? null;
  });
  resolversRegistered = true;
}

export function resetSpatialAssetCloudForTests(): void {
  for (const t of pendingUploads.values()) clearTimeout(t);
  pendingUploads.clear();
  resolversRegistered = false;
}

function entityKey(ids: SpatialAssetIds): string {
  return userContentAssetEntityKey({
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: ids.assetType,
    assetId: ids.objectId,
  });
}

function cancelPendingUpload(ids: SpatialAssetIds): void {
  const key = timerKey(ids);
  const pending = pendingUploads.get(key);
  if (pending) clearTimeout(pending);
  pendingUploads.delete(key);
}

async function enqueueSpatialUploadNow(
  ids: SpatialAssetIds,
  updatedAt: number,
  referenced = true,
): Promise<boolean> {
  ensureSpatialAssetResolversRegistered();
  cancelPendingUpload(ids);

  if (
    !canUploadUserContentAsset({
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      assetType: ids.assetType,
      assetId: ids.objectId,
      referenced,
    })
  ) {
    return true;
  }

  const blob = await loadLocalBlob(ids);
  if (!blob) {
    if (ids.assetType === 'spatial-image') {
      fsImageSyncDiagLog('F_user_content_enqueue', {
        userId: ids.userId,
        sectionId: ids.sectionId,
        objectId: ids.objectId,
        assetId: fsImageSyncDiagAssetId(ids.objectId),
      }, { skipped: true, reason: 'local_blob_missing' });
    }
    return true;
  }

  if (isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    const path = buildSpatialAssetPath(ids);
    const downloaded = await downloadUserContentAsset(path);
    if (downloaded.ok) {
      if (ids.assetType === 'spatial-image') {
        fsImageSyncDiagLog('H_storage_response', {
          userId: ids.userId,
          sectionId: ids.sectionId,
          objectId: ids.objectId,
          assetId: fsImageSyncDiagAssetId(ids.objectId),
        }, { alreadyInCloud: true, byteLength: downloaded.value.size });
      }
      return true;
    }
  }

  clearUserContentAssetDeleted(entityKey(ids));

  if (ids.assetType === 'spatial-image') {
    fsImageSyncDiagLog('F_user_content_enqueue', {
      userId: ids.userId,
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      assetId: fsImageSyncDiagAssetId(ids.objectId),
    }, {
      byteLength: blob.size,
      contentType: blob.type || 'image/png',
      updatedAt,
      referenced,
    });
  }

  const result = await enqueueUserContentAssetOp({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: ids.assetType,
    assetId: ids.objectId,
    assetOp: 'upload',
    localRef: { store: storeIdFor(ids), key: localRefKey(ids) },
    contentType: blob.type || (ids.assetType === 'pdf' ? 'application/pdf' : 'image/png'),
    updatedAt,
    byteLength: blob.size,
  });

  if (!result.ok) {
    fwPersistWarn(`spatial asset enqueue failed: ${ids.objectId} reason=${result.reason}`);
    if (ids.assetType === 'spatial-image') {
      fsImageSyncDiagLog('F_user_content_enqueue', {
        userId: ids.userId,
        sectionId: ids.sectionId,
        objectId: ids.objectId,
        assetId: fsImageSyncDiagAssetId(ids.objectId),
      }, { ok: false, reason: result.reason });
    }
    return false;
  }
  if (ids.assetType === 'spatial-image') {
    fsImageSyncDiagLog('F_user_content_enqueue', {
      userId: ids.userId,
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      assetId: fsImageSyncDiagAssetId(ids.objectId),
    }, { ok: true, opId: result.value.id });
  }
  return true;
}

/** After local blob save — enqueue cloud upload immediately (honest Saved). */
export async function onSpatialImageSaved(
  ids: Partial<SpatialAssetIds>,
  referenced = true,
): Promise<boolean> {
  if (!idsReady(ids) || ids.assetType !== 'spatial-image' || !referenced) return true;
  clearUserContentAssetDeleted(entityKey(ids));
  return flushSpatialAssetCloudEnqueueNow(ids, referenced);
}

/** After local PDF blob save — enqueue cloud upload immediately (honest Saved). */
export async function onSpatialPdfSaved(
  ids: Partial<SpatialAssetIds>,
  referenced = true,
): Promise<boolean> {
  if (!idsReady(ids) || ids.assetType !== 'pdf' || !referenced) return true;
  clearUserContentAssetDeleted(entityKey(ids));
  return flushSpatialAssetCloudEnqueueNow(ids, referenced);
}

export function scheduleSpatialAssetCloudUpload(
  ids: Partial<SpatialAssetIds>,
  updatedAt: number = Date.now(),
  referenced = true,
): void {
  if (!idsReady(ids)) return;
  const key = timerKey(ids);
  const existing = pendingUploads.get(key);
  if (existing) clearTimeout(existing);
  pendingUploads.set(
    key,
    setTimeout(() => {
      pendingUploads.delete(key);
      void enqueueSpatialUploadNow(ids, updatedAt, referenced);
    }, ENQUEUE_DEBOUNCE_MS),
  );
}

export async function flushSpatialAssetCloudEnqueueNow(
  ids: Partial<SpatialAssetIds>,
  referenced = true,
): Promise<boolean> {
  if (!idsReady(ids)) return true;
  cancelPendingUpload(ids);
  return enqueueSpatialUploadNow(ids, Date.now(), referenced);
}

export async function enqueueSpatialAssetCloudDelete(
  ids: Partial<SpatialAssetIds>,
): Promise<boolean> {
  if (!idsReady(ids)) return false;
  ensureSpatialAssetResolversRegistered();
  cancelPendingUpload(ids);
  markUserContentAssetDeleted(entityKey(ids));

  const result = await enqueueUserContentAssetOp({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: ids.assetType,
    assetId: ids.objectId,
    assetOp: 'delete',
    localRef: { store: storeIdFor(ids), key: localRefKey(ids) },
  });
  return result.ok;
}

async function isFreeSpaceStructuredObjectInCloud(
  sectionId: string,
  objectId: string,
): Promise<boolean> {
  const { fsImageSyncDiagFetchCloudObject } = await import('./spatialAssetCloud.fsImageSyncDiag');
  const row = await fsImageSyncDiagFetchCloudObject({ objectId, sectionId });
  if (row.ok) return true;
  if (row.reason === 'not_found') return false;
  return true;
}

async function hasPendingStructuredWrite(
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
        op.entityType === 'free_space_object' &&
        op.entityId === objectId &&
        (op.operationType === 'create' || op.operationType === 'update'),
    );
  } catch {
    return false;
  }
}

async function hasPendingStructuredDelete(
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
        op.entityType === 'free_space_object' &&
        op.entityId === objectId &&
        op.operationType === 'delete',
    );
  } catch {
    return false;
  }
}

async function isFreeSpaceObjectKnowledgeTombstoned(
  sectionId: string,
  objectId: string,
): Promise<boolean> {
  try {
    const { listTombstones } = await import('./knowledge/tombstoneStore');
    const rows = await listTombstones(sectionId);
    return rows.some(t => t.kind === 'free_space_object' && t.objectId === objectId);
  } catch {
    return false;
  }
}

/**
 * Peer/inbound delete: block stale local blob from re-uploading after cloud structured row is gone.
 */
export async function suppressSpatialAssetAfterPeerDelete(
  ids: Partial<SpatialAssetIds>,
): Promise<void> {
  if (!idsReady(ids)) return;
  cancelPendingUpload(ids);
  markUserContentAssetDeleted(entityKey(ids));
  await deleteSpatialAssetLocal(ids);
  void import('./deleteGcDiag').then(({ deleteGcDiagLog }) => {
    deleteGcDiagLog(
      'suppress_peer_delete',
      {
        userId: ids.userId,
        sectionId: ids.sectionId,
        objectId: ids.objectId,
        surface: ids.assetType === 'pdf' ? 'free_space_pdf' : 'free_space_image',
      },
      { assetType: ids.assetType },
    );
  });
}

export async function hydrateSpatialAssetFromCloud(
  ids: Partial<SpatialAssetIds>,
): Promise<boolean> {
  if (!idsReady(ids) || !isSupabaseConfigured) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  const local = await loadLocalBlob(ids);
  if (local && local.size > 0) return true;

  const path = buildSpatialAssetPath(ids);
  if (ids.assetType === 'spatial-image') {
    fsImageSyncDiagLog('L_spatial_hydrate', {
      userId: ids.userId,
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      assetId: fsImageSyncDiagAssetId(ids.objectId),
    }, { phase: 'download_start', path });
  }
  const downloaded = await downloadUserContentAsset(path);
  if (!downloaded.ok) {
    if (ids.assetType === 'spatial-image') {
      fsImageSyncDiagLog('L_spatial_hydrate', {
        userId: ids.userId,
        sectionId: ids.sectionId,
        objectId: ids.objectId,
        assetId: fsImageSyncDiagAssetId(ids.objectId),
      }, { ok: false, reason: downloaded.reason });
    }
    return false;
  }

  await saveLocalBlob(ids, downloaded.value);
  if (ids.assetType === 'spatial-image') {
    fsImageSyncDiagLog('M_local_cache_rebuild', {
      userId: ids.userId,
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      assetId: fsImageSyncDiagAssetId(ids.objectId),
    }, {
      ok: true,
      byteLength: downloaded.value.size,
      contentType: downloaded.value.type || null,
    });
  }
  return true;
}

export type SpatialImageHydrateResult = 'local_hit' | 'cloud_hit' | 'missing';

/** Local IDB first; cloud on miss; schedules upload when local exists but cloud missing. */
export async function hydrateSpatialImageWithCloud(
  ids: Partial<SpatialAssetIds>,
): Promise<SpatialImageHydrateResult> {
  if (!idsReady(ids) || ids.assetType !== 'spatial-image') return 'missing';

  const local = await loadLocalBlob(ids);
  if (local && local.size > 0) {
    await reconcileSpatialAssetWithCloud(ids, true);
    return 'local_hit';
  }

  const hydrated = await hydrateSpatialAssetFromCloud(ids);
  return hydrated ? 'cloud_hit' : 'missing';
}

export type SpatialPdfHydrateResult = 'local_hit' | 'cloud_hit' | 'missing';

/** Local IDB first; cloud on miss; schedules upload when local exists but cloud missing. */
export async function hydrateSpatialPdfWithCloud(
  ids: Partial<SpatialAssetIds>,
): Promise<SpatialPdfHydrateResult> {
  if (!idsReady(ids) || ids.assetType !== 'pdf') return 'missing';

  const local = await loadLocalBlob(ids);
  if (local && local.size > 0) {
    await reconcileSpatialAssetWithCloud(ids, true);
    return 'local_hit';
  }

  const hydrated = await hydrateSpatialAssetFromCloud(ids);
  return hydrated ? 'cloud_hit' : 'missing';
}

/** Local miss → cloud hydrate; local hit + cloud missing → schedule upload when referenced. */
export async function reconcileSpatialAssetWithCloud(
  ids: Partial<SpatialAssetIds>,
  referenced = true,
): Promise<'upload' | 'skip' | 'hydrated'> {
  if (!idsReady(ids) || !referenced) return 'skip';

  if (isUserContentAssetDeleted(entityKey(ids))) {
    await deleteSpatialAssetLocal(ids);
    return 'skip';
  }

  const local = await loadLocalBlob(ids);
  if (!local || local.size === 0) {
    const hydrated = await hydrateSpatialAssetFromCloud(ids);
    return hydrated ? 'hydrated' : 'skip';
  }

  if (isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    const path = buildSpatialAssetPath(ids);
    const downloaded = await downloadUserContentAsset(path);
    if (downloaded.ok) return 'skip';

    const structuredPresent = await isFreeSpaceStructuredObjectInCloud(
      ids.sectionId,
      ids.objectId,
    );
    if (!structuredPresent) {
      const pendingWrite = await hasPendingStructuredWrite(
        ids.userId,
        ids.sectionId,
        ids.objectId,
      );
      const pendingDelete = await hasPendingStructuredDelete(
        ids.userId,
        ids.sectionId,
        ids.objectId,
      );
      const knowledgeTombstone = await isFreeSpaceObjectKnowledgeTombstoned(
        ids.sectionId,
        ids.objectId,
      );
      if (pendingDelete || knowledgeTombstone || !pendingWrite) {
        await suppressSpatialAssetAfterPeerDelete(ids);
        void import('./deleteGcDiag').then(({ deleteGcDiagLog }) => {
          deleteGcDiagLog(
            'resurrection_suppressed',
            {
              userId: ids.userId,
              sectionId: ids.sectionId,
              objectId: ids.objectId,
              surface: ids.assetType === 'pdf' ? 'free_space_pdf' : 'free_space_image',
            },
            {
              reason: 'structured_object_missing_in_cloud',
              pendingWrite,
              pendingDelete,
              knowledgeTombstone,
            },
          );
        });
        return 'skip';
      }
    }
  }

  scheduleSpatialAssetCloudUpload(ids, Date.now(), true);
  return 'upload';
}

export async function deleteSpatialAssetLocal(
  ids: Partial<SpatialAssetIds>,
): Promise<void> {
  if (!idsReady(ids)) return;
  cancelPendingUpload(ids);
  if (ids.assetType === 'spatial-image') {
    const { deleteImageBlob } = await import('./freeSpaceImageIdb');
    await deleteImageBlob(ids.sectionId, ids.objectId).catch(() => undefined);
  } else {
    const { deletePdfBlob } = await import('./freeSpacePdfIdb');
    await deletePdfBlob(ids.sectionId, ids.objectId).catch(() => undefined);
  }
}

ensureSpatialAssetResolversRegistered();
