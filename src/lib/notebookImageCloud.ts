/**
 * Notebook inline images ↔ user-content Storage (notebook-image).
 *
 * Local SOT: fw_notebook_images_v1 IDB. Refs: ::img::{key}::{alt}::
 * Upload requires manifest reference. Tombstone blocks resurrection after delete.
 */

import { fwPersistWarn } from './freeSpacePersistence';
import {
  nbImageDelete,
  nbImageLoadBlob,
  nbImageSaveBlob,
} from './notebookImageStore';
import { enqueueUserContentAssetOp } from './userContentAssetEnqueue';
import { registerUserContentAssetResolver } from './userContentAssetResolver';
import {
  buildUserContentPath,
  downloadUserContentAsset,
} from './userContentStorage';
import { isSupabaseConfigured } from './supabase';
import {
  canUploadUserContentAsset,
  clearUserContentAssetDeleted,
  markUserContentAssetDeleted,
  userContentAssetEntityKey,
} from './userContentAssetAuthority';

export const NOTEBOOK_IMAGE_STORE_ID = 'notebook_images' as const;
export const NOTEBOOK_IMAGE_CLOUD_CONTENT_TYPE = 'image/png' as const;
const ENQUEUE_DEBOUNCE_MS = 2000;

export type NotebookImageCloudIds = {
  userId: string;
  sectionId: string;
  objectId: string;
  imageKey: string;
};

type PendingUpload = {
  ids: NotebookImageCloudIds;
  updatedAt: number;
  referenced: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const pendingUploads = new Map<string, PendingUpload>();
const lastEnqueuedUpdatedAt = new Map<string, number>();
/** Per-object manifest of referenced image keys (authoritative for upload). */
const manifestByObject = new Map<string, Set<string>>();
let resolverRegistered = false;

function objectManifestKey(objectId: string): string {
  return objectId;
}

function assetTimerKey(ids: NotebookImageCloudIds): string {
  return `${ids.userId}/${ids.sectionId}/${ids.objectId}/${ids.imageKey}`;
}

function entityKey(ids: NotebookImageCloudIds): string {
  return userContentAssetEntityKey({
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'notebook-image',
    assetId: ids.imageKey,
  });
}

function idsReady(ids: Partial<NotebookImageCloudIds>): ids is NotebookImageCloudIds {
  return Boolean(
    ids.userId?.trim() &&
      ids.sectionId?.trim() &&
      ids.objectId?.trim() &&
      ids.imageKey?.trim(),
  );
}

export function buildNotebookImageCloudPath(ids: NotebookImageCloudIds): string {
  return buildUserContentPath({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'notebook-image',
    assetId: ids.imageKey,
  });
}

export function setNotebookImageManifest(objectId: string, keys: readonly string[]): void {
  manifestByObject.set(objectManifestKey(objectId), new Set(keys.filter(Boolean)));
}

export function isNotebookImageReferenced(objectId: string, imageKey: string): boolean {
  const set = manifestByObject.get(objectManifestKey(objectId));
  return set?.has(imageKey) ?? false;
}

async function notebookImageResolver(
  descriptor: Parameters<typeof registerUserContentAssetResolver>[1] extends (
    d: infer D,
  ) => unknown
    ? D
    : never,
): Promise<Blob | null> {
  if (descriptor.localRef.store !== NOTEBOOK_IMAGE_STORE_ID) return null;
  return (await nbImageLoadBlob(descriptor.localRef.key)) ?? null;
}

export function ensureNotebookImageCloudResolverRegistered(): void {
  if (resolverRegistered) return;
  registerUserContentAssetResolver(NOTEBOOK_IMAGE_STORE_ID, notebookImageResolver);
  resolverRegistered = true;
}

export function resetNotebookImageCloudForTests(): void {
  for (const p of pendingUploads.values()) {
    if (p.timer) clearTimeout(p.timer);
  }
  pendingUploads.clear();
  lastEnqueuedUpdatedAt.clear();
  manifestByObject.clear();
  resolverRegistered = false;
}

function cancelPending(ids: NotebookImageCloudIds): void {
  const key = assetTimerKey(ids);
  const pending = pendingUploads.get(key);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingUploads.delete(key);
}

async function enqueueUploadNow(
  ids: NotebookImageCloudIds,
  updatedAt: number,
  referenced: boolean,
): Promise<boolean> {
  ensureNotebookImageCloudResolverRegistered();
  const timerKey = assetTimerKey(ids);
  if (lastEnqueuedUpdatedAt.get(timerKey) === updatedAt) return true;

  if (
    !canUploadUserContentAsset({
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      assetType: 'notebook-image',
      assetId: ids.imageKey,
      referenced,
    })
  ) {
    cancelPending(ids);
    return true;
  }

  const blob = await nbImageLoadBlob(ids.imageKey);
  if (!blob) {
    cancelPending(ids);
    return true;
  }

  if (isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    const path = buildNotebookImageCloudPath(ids);
    const downloaded = await downloadUserContentAsset(path);
    if (downloaded.ok) {
      cancelPending(ids);
      lastEnqueuedUpdatedAt.set(timerKey, updatedAt);
      return true;
    }
  }

  clearUserContentAssetDeleted(entityKey(ids));

  const result = await enqueueUserContentAssetOp({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'notebook-image',
    assetId: ids.imageKey,
    assetOp: 'upload',
    localRef: { store: NOTEBOOK_IMAGE_STORE_ID, key: ids.imageKey },
    contentType: blob.type || NOTEBOOK_IMAGE_CLOUD_CONTENT_TYPE,
    updatedAt,
    byteLength: blob.size,
  });

  if (!result.ok) {
    fwPersistWarn(`notebook-image enqueue failed: key=${ids.imageKey} reason=${result.reason}`);
    return false;
  }
  lastEnqueuedUpdatedAt.set(timerKey, updatedAt);
  return true;
}

export function scheduleNotebookImageCloudUpload(
  ids: Partial<NotebookImageCloudIds>,
  updatedAt: number,
  referenced = true,
): void {
  if (!idsReady(ids)) return;
  const key = assetTimerKey(ids);
  const existing = pendingUploads.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pendingUploads.delete(key);
    void enqueueUploadNow(ids, updatedAt, referenced);
  }, ENQUEUE_DEBOUNCE_MS);
  pendingUploads.set(key, { ids, updatedAt, referenced, timer });
}

export async function flushNotebookImageCloudEnqueueNow(
  ids: Partial<NotebookImageCloudIds>,
  referenced = true,
): Promise<boolean> {
  if (!idsReady(ids)) return true;
  const key = assetTimerKey(ids);
  const pending = pendingUploads.get(key);
  if (!pending) return true;
  if (pending.timer) clearTimeout(pending.timer);
  pendingUploads.delete(key);
  return enqueueUploadNow(pending.ids, pending.updatedAt, referenced);
}

export async function flushAllPendingNotebookImageCloudEnqueues(): Promise<void> {
  const entries = [...pendingUploads.values()];
  pendingUploads.clear();
  await Promise.all(
    entries.map(async pending => {
      if (pending.timer) clearTimeout(pending.timer);
      await enqueueUploadNow(pending.ids, pending.updatedAt, pending.referenced);
    }),
  );
}

export async function enqueueNotebookImageCloudDelete(
  ids: Partial<NotebookImageCloudIds>,
): Promise<boolean> {
  if (!idsReady(ids)) return false;
  ensureNotebookImageCloudResolverRegistered();
  cancelPending(ids);
  lastEnqueuedUpdatedAt.delete(assetTimerKey(ids));
  markUserContentAssetDeleted(entityKey(ids));

  const result = await enqueueUserContentAssetOp({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'notebook-image',
    assetId: ids.imageKey,
    assetOp: 'delete',
    localRef: { store: NOTEBOOK_IMAGE_STORE_ID, key: ids.imageKey },
  });
  return result.ok;
}

export type NotebookImageHydrateResult =
  | { status: 'local_hit' }
  | { status: 'cloud_hit' }
  | { status: 'missing' }
  | { status: 'offline' }
  | { status: 'error' };

/** Local IDB first; cloud on miss. Does not enqueue upload. */
export async function hydrateNotebookImageFromCloud(
  ids: Partial<NotebookImageCloudIds>,
): Promise<NotebookImageHydrateResult> {
  if (!idsReady(ids)) return { status: 'missing' };

  const local = await nbImageLoadBlob(ids.imageKey);
  if (local && local.size > 0) return { status: 'local_hit' };

  if (!isSupabaseConfigured) return { status: 'missing' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline' };
  }

  const path = buildNotebookImageCloudPath(ids);
  const downloaded = await downloadUserContentAsset(path);
  if (!downloaded.ok) {
    if (downloaded.reason === 'not_found') return { status: 'missing' };
    return { status: 'error' };
  }

  if (!downloaded.value.type.startsWith('image/')) {
    fwPersistWarn(`notebook-image hydrate rejected non-image blob: key=${ids.imageKey}`);
    return { status: 'error' };
  }

  await nbImageSaveBlob(ids.imageKey, downloaded.value);
  return { status: 'cloud_hit' };
}

/**
 * Reconcile after local paint: migrate if referenced + cloud missing;
 * never upload if unreferenced or tombstoned.
 */
export async function reconcileNotebookImageWithCloud(
  ids: Partial<NotebookImageCloudIds>,
  referenced: boolean,
): Promise<'upload' | 'skip' | 'hydrated'> {
  if (!idsReady(ids)) return 'skip';
  if (!referenced) return 'skip';

  const hydrate = await hydrateNotebookImageFromCloud(ids);
  if (hydrate.status === 'cloud_hit') return 'hydrated';
  if (hydrate.status === 'local_hit') {
    if (isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      const path = buildNotebookImageCloudPath(ids);
      const downloaded = await downloadUserContentAsset(path);
      if (downloaded.ok) return 'skip';
    }
    scheduleNotebookImageCloudUpload(ids, Date.now(), referenced);
    return 'upload';
  }
  if (hydrate.status === 'missing') {
    const local = await nbImageLoadBlob(ids.imageKey);
    if (local) {
      scheduleNotebookImageCloudUpload(ids, Date.now(), referenced);
      return referenced ? 'upload' : 'skip';
    }
  }
  return 'skip';
}

/** After local save — schedule cloud upload when referenced. */
export function onNotebookImageSaved(
  ids: Partial<NotebookImageCloudIds>,
  referenced = true,
): void {
  if (!idsReady(ids) || !referenced) return;
  clearUserContentAssetDeleted(entityKey(ids));
  scheduleNotebookImageCloudUpload(ids, Date.now(), true);
}

export async function deleteNotebookImageAsset(
  ids: Partial<NotebookImageCloudIds>,
): Promise<void> {
  if (!idsReady(ids)) return;
  cancelPending(ids);
  await nbImageDelete(ids.imageKey);
  await enqueueNotebookImageCloudDelete(ids);
}

/** Diff manifest vs current refs; delete assets dropped from notebook content. */
export async function gcOrphanNotebookImages(input: {
  userId: string;
  sectionId: string;
  objectId: string;
  referencedKeys: readonly string[];
}): Promise<string[]> {
  const prev = manifestByObject.get(objectManifestKey(input.objectId));
  const next = new Set(input.referencedKeys.filter(Boolean));
  setNotebookImageManifest(input.objectId, [...next]);
  const removed: string[] = [];
  if (!prev) return removed;
  for (const imageKey of prev) {
    if (next.has(imageKey)) continue;
    await deleteNotebookImageAsset({
      userId: input.userId,
      sectionId: input.sectionId,
      objectId: input.objectId,
      imageKey,
    });
    removed.push(imageKey);
  }
  return removed;
}

/** Hydrate all referenced images: local IDB first, then cloud on miss. */
export async function hydrateNotebookImagesWithCloud(input: {
  userId: string;
  sectionId: string;
  objectId: string;
  imageKeys: readonly string[];
}): Promise<void> {
  const keys = [...new Set(input.imageKeys.filter(Boolean))];
  setNotebookImageManifest(input.objectId, keys);
  for (const imageKey of keys) {
    const ids = {
      userId: input.userId,
      sectionId: input.sectionId,
      objectId: input.objectId,
      imageKey,
    };
    const hydrate = await hydrateNotebookImageFromCloud(ids);
    if (hydrate.status === 'local_hit' || hydrate.status === 'cloud_hit') {
      await reconcileNotebookImageWithCloud(ids, true);
    }
  }
}

ensureNotebookImageCloudResolverRegistered();
