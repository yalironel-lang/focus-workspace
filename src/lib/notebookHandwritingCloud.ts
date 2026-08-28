/**
 * Free Space notebook handwriting ↔ private `user-content` Storage.
 *
 * Local SOT remains fw_notebook_handwriting_v1. Cloud jobs are JSON descriptors only.
 * assetId = blockKey (stable ::hw:: / page-ink key). Path:
 *   {userId}/{sectionId}/{objectId}/handwriting/{blockKey}
 *
 * V1 conflict policy: Last-Write-Wins on payload.updatedAt (client clock).
 * Local renders immediately; online reconcile may replace local or enqueue upload.
 */

import { fwPersistWarn } from './freeSpacePersistence';
import {
  hwGet,
  hwLoadBlock,
  hwSet,
  makeHandwritingStorageKey,
  type HwLoadFailureStage,
} from './notebookHandwritingStore';
import {
  sanitizeHandwritingData,
  type HandwritingBlockData,
} from './handwritingTypes';
import { enqueueUserContentAssetOp } from './userContentAssetEnqueue';
import {
  registerUserContentAssetResolver,
  type UserContentAssetResolver,
} from './userContentAssetResolver';
import {
  buildUserContentPath,
  downloadUserContentAsset,
} from './userContentStorage';
import { isSupabaseConfigured } from './supabase';

export const NOTEBOOK_HANDWRITING_STORE_ID = 'notebook_handwriting' as const;
export const HANDWRITING_CLOUD_CONTENT_TYPE = 'application/json' as const;
/** Trailing debounce after local IDB save before enqueue (not per-pointer-move). */
export const HANDWRITING_CLOUD_ENQUEUE_DEBOUNCE_MS = 2000;

export type HandwritingCloudIds = {
  userId: string;
  sectionId: string;
  objectId: string;
  blockKey: string;
};

type PendingUpload = {
  ids: HandwritingCloudIds;
  updatedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const pendingUploads = new Map<string, PendingUpload>();
/** Skip re-enqueue when the same updatedAt was already queued successfully. */
const lastEnqueuedUpdatedAt = new Map<string, number>();

let resolverRegistered = false;

function cloudAssetKey(ids: HandwritingCloudIds): string {
  return `${ids.userId}/${ids.sectionId}/${ids.objectId}/${ids.blockKey}`;
}

export function handwritingCloudAssetId(blockKey: string): string {
  return blockKey;
}

export function handwritingLocalRefKey(objectId: string, blockKey: string): string {
  return makeHandwritingStorageKey(objectId, blockKey);
}

export function buildHandwritingCloudPath(ids: HandwritingCloudIds): string {
  return buildUserContentPath({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'handwriting',
    assetId: handwritingCloudAssetId(ids.blockKey),
  });
}

function parseLocalRefKey(key: string): { objectId: string; blockKey: string } | null {
  const idx = key.indexOf(':');
  if (idx <= 0 || idx === key.length - 1) return null;
  return { objectId: key.slice(0, idx), blockKey: key.slice(idx + 1) };
}

export async function parseHandwritingCloudBlob(
  blob: Blob,
): Promise<HandwritingBlockData | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await blob.text());
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    (parsed as { type?: unknown }).type !== 'handwriting'
  ) {
    return null;
  }
  return sanitizeHandwritingData(parsed);
}

/** Compare LWW versions. Equal → 0; a newer → positive; b newer → negative. */
export function compareHandwritingUpdatedAt(a: number, b: number): number {
  return a - b;
}

const handwritingResolver: UserContentAssetResolver = async descriptor => {
  if (descriptor.localRef.store !== NOTEBOOK_HANDWRITING_STORE_ID) return null;
  const parsed = parseLocalRefKey(descriptor.localRef.key);
  if (!parsed) return null;
  const data = await hwGet(parsed.objectId, parsed.blockKey);
  if (!data) return null;
  try {
    const json = JSON.stringify(data);
    return new Blob([json], { type: HANDWRITING_CLOUD_CONTENT_TYPE });
  } catch {
    return null;
  }
};

/** Idempotent — safe to call from module load and tests. */
export function ensureNotebookHandwritingCloudResolverRegistered(): void {
  if (resolverRegistered) return;
  registerUserContentAssetResolver(NOTEBOOK_HANDWRITING_STORE_ID, handwritingResolver);
  resolverRegistered = true;
}

export function resetNotebookHandwritingCloudForTests(): void {
  for (const pending of pendingUploads.values()) {
    if (pending.timer) clearTimeout(pending.timer);
  }
  pendingUploads.clear();
  lastEnqueuedUpdatedAt.clear();
  resolverRegistered = false;
}

function idsReady(ids: Partial<HandwritingCloudIds>): ids is HandwritingCloudIds {
  return Boolean(
    ids.userId &&
      ids.sectionId &&
      ids.objectId &&
      ids.blockKey &&
      ids.userId === ids.userId.trim() &&
      ids.sectionId === ids.sectionId.trim() &&
      ids.objectId === ids.objectId.trim() &&
      ids.blockKey === ids.blockKey.trim(),
  );
}

function cancelPendingUpload(ids: HandwritingCloudIds): void {
  const key = cloudAssetKey(ids);
  const pending = pendingUploads.get(key);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingUploads.delete(key);
}

async function writeRemotePreservingUpdatedAt(
  objectId: string,
  blockKey: string,
  remote: HandwritingBlockData,
): Promise<boolean> {
  const saved = await hwSet(objectId, blockKey, remote, { preserveUpdatedAt: true });
  return saved.ok;
}

/**
 * Defense-in-depth before enqueue: never upload if remote is newer or equal.
 * If remote is newer, apply it locally (preserve updatedAt) and cancel pending.
 */
async function enqueueUploadNow(ids: HandwritingCloudIds, updatedAt: number): Promise<boolean> {
  ensureNotebookHandwritingCloudResolverRegistered();
  const key = cloudAssetKey(ids);
  if (lastEnqueuedUpdatedAt.get(key) === updatedAt) {
    return true;
  }

  const local = await hwGet(ids.objectId, ids.blockKey);
  if (!local) {
    // Local deleted before flush — do not upload stale bytes.
    cancelPendingUpload(ids);
    return true;
  }

  // Prefer the live local stamp (may have advanced since schedule).
  const localUpdatedAt = local.updatedAt;

  if (isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    let path: string;
    try {
      path = buildHandwritingCloudPath(ids);
    } catch {
      path = '';
    }
    if (path) {
      const downloaded = await downloadUserContentAsset(path);
      if (downloaded.ok) {
        const remote = await parseHandwritingCloudBlob(downloaded.value);
        if (remote) {
          if (compareHandwritingUpdatedAt(remote.updatedAt, localUpdatedAt) > 0) {
            // Remote newer — apply remote, do not upload stale local.
            cancelPendingUpload(ids);
            await writeRemotePreservingUpdatedAt(ids.objectId, ids.blockKey, remote);
            lastEnqueuedUpdatedAt.set(key, remote.updatedAt);
            return true;
          }
          if (compareHandwritingUpdatedAt(remote.updatedAt, localUpdatedAt) === 0) {
            // Equal — no-op upload.
            cancelPendingUpload(ids);
            lastEnqueuedUpdatedAt.set(key, localUpdatedAt);
            return true;
          }
        }
      }
      // not_found / network error: proceed to enqueue local (migration / offline catch-up)
    }
  }

  const result = await enqueueUserContentAssetOp({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'handwriting',
    assetId: handwritingCloudAssetId(ids.blockKey),
    assetOp: 'upload',
    localRef: {
      store: NOTEBOOK_HANDWRITING_STORE_ID,
      key: handwritingLocalRefKey(ids.objectId, ids.blockKey),
    },
    contentType: HANDWRITING_CLOUD_CONTENT_TYPE,
    updatedAt: localUpdatedAt,
  });

  if (!result.ok) {
    fwPersistWarn(
      `handwriting cloud enqueue upload failed: object=${ids.objectId} block=${ids.blockKey} reason=${result.reason}`,
    );
    return false;
  }
  lastEnqueuedUpdatedAt.set(key, localUpdatedAt);
  return true;
}

/**
 * After a successful local IDB save: schedule trailing cloud enqueue.
 * Call flushHandwritingCloudEnqueueNow on tab hide / unmount so the op
 * is persisted before the process dies (avoids silent loss in the debounce gap).
 */
export function scheduleHandwritingCloudUpload(
  ids: Partial<HandwritingCloudIds>,
  updatedAt: number,
): void {
  if (!idsReady(ids)) return;
  if (!Number.isFinite(updatedAt)) return;

  const key = cloudAssetKey(ids);
  const existing = pendingUploads.get(key);
  if (existing?.timer) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    const pending = pendingUploads.get(key);
    pendingUploads.delete(key);
    if (!pending) return;
    void enqueueUploadNow(pending.ids, pending.updatedAt);
  }, HANDWRITING_CLOUD_ENQUEUE_DEBOUNCE_MS);

  pendingUploads.set(key, { ids, updatedAt, timer });
}

/** Flush one asset's pending debounce immediately (lifecycle / unload). */
export async function flushHandwritingCloudEnqueueNow(
  ids: Partial<HandwritingCloudIds>,
): Promise<boolean> {
  if (!idsReady(ids)) return true;
  const key = cloudAssetKey(ids);
  const pending = pendingUploads.get(key);
  if (!pending) return true;
  if (pending.timer) clearTimeout(pending.timer);
  pendingUploads.delete(key);
  return enqueueUploadNow(pending.ids, pending.updatedAt);
}

/** Flush all scheduled handwriting cloud enqueues (beforeunload / pagehide). */
export async function flushAllPendingHandwritingCloudEnqueues(): Promise<void> {
  const entries = [...pendingUploads.values()];
  pendingUploads.clear();
  await Promise.all(
    entries.map(async pending => {
      if (pending.timer) clearTimeout(pending.timer);
      await enqueueUploadNow(pending.ids, pending.updatedAt);
    }),
  );
}

export async function enqueueHandwritingCloudDelete(
  ids: Partial<HandwritingCloudIds>,
): Promise<boolean> {
  if (!idsReady(ids)) return false;
  ensureNotebookHandwritingCloudResolverRegistered();

  const key = cloudAssetKey(ids);
  const pending = pendingUploads.get(key);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingUploads.delete(key);
  lastEnqueuedUpdatedAt.delete(key);

  const result = await enqueueUserContentAssetOp({
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    assetType: 'handwriting',
    assetId: handwritingCloudAssetId(ids.blockKey),
    assetOp: 'delete',
    localRef: {
      store: NOTEBOOK_HANDWRITING_STORE_ID,
      key: handwritingLocalRefKey(ids.objectId, ids.blockKey),
    },
    contentType: HANDWRITING_CLOUD_CONTENT_TYPE,
  });

  if (!result.ok) {
    fwPersistWarn(
      `handwriting cloud enqueue delete failed: object=${ids.objectId} block=${ids.blockKey} reason=${result.reason}`,
    );
    return false;
  }
  return true;
}

export type HandwritingCloudHydrateResult =
  | { status: 'local_hit'; data: HandwritingBlockData }
  | { status: 'cloud_hit'; data: HandwritingBlockData }
  | { status: 'empty' }
  | { status: 'local_error'; failureStage: HwLoadFailureStage; errorName?: string }
  | { status: 'network_error'; message?: string }
  | { status: 'malformed' };

export type HandwritingReconcileResult =
  | { action: 'keep_local'; data: HandwritingBlockData }
  | { action: 'apply_remote'; data: HandwritingBlockData }
  | { action: 'upload_local'; data: HandwritingBlockData }
  | { action: 'empty' }
  | { action: 'skipped_offline'; data: HandwritingBlockData | null }
  | { action: 'network_error'; data: HandwritingBlockData | null; message?: string }
  | { action: 'malformed'; data: HandwritingBlockData | null };

/**
 * Fast path for first paint: local IDB first; cloud only on local miss.
 * Does NOT enqueue migrate-on-hit (that was the stale-overwrite bug).
 * Call reconcileHandwritingWithCloud after local_hit for LWW.
 */
export async function hydrateHandwritingWithCloud(ids: {
  userId?: string;
  sectionId?: string;
  objectId: string;
  blockKey: string;
}): Promise<HandwritingCloudHydrateResult> {
  ensureNotebookHandwritingCloudResolverRegistered();

  const local = await hwLoadBlock(ids.objectId, ids.blockKey);
  if (local.status === 'loaded') {
    return { status: 'local_hit', data: local.data };
  }
  if (local.status === 'error') {
    return {
      status: 'local_error',
      failureStage: local.failureStage,
      errorName: local.errorName,
    };
  }

  if (!ids.userId || !ids.sectionId || !isSupabaseConfigured) {
    return { status: 'empty' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'empty' };
  }

  let path: string;
  try {
    path = buildHandwritingCloudPath({
      userId: ids.userId,
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      blockKey: ids.blockKey,
    });
  } catch {
    return { status: 'empty' };
  }

  const downloaded = await downloadUserContentAsset(path);
  if (!downloaded.ok) {
    if (downloaded.reason === 'not_found') return { status: 'empty' };
    fwPersistWarn(
      `handwriting cloud hydrate failed: path=${path} reason=${downloaded.reason}` +
        (downloaded.message ? ` message=${downloaded.message}` : ''),
    );
    return { status: 'network_error', message: downloaded.message };
  }

  const data = await parseHandwritingCloudBlob(downloaded.value);
  if (!data) return { status: 'malformed' };

  const saved = await writeRemotePreservingUpdatedAt(ids.objectId, ids.blockKey, data);
  if (!saved) {
    fwPersistWarn(
      `handwriting cloud hydrate local write failed: object=${ids.objectId} block=${ids.blockKey}`,
    );
  }

  return { status: 'cloud_hit', data };
}

/**
 * Online LWW reconcile after local paint (or when caller already has local).
 *
 * - remote newer → write IDB preserving updatedAt, cancel pending upload
 * - local newer → schedule upload
 * - equal → no-op
 * - remote missing + local → schedule upload (migration; see delete-race limitation)
 */
export async function reconcileHandwritingWithCloud(
  ids: Partial<HandwritingCloudIds> & { objectId: string; blockKey: string },
  localData?: HandwritingBlockData | null,
): Promise<HandwritingReconcileResult> {
  ensureNotebookHandwritingCloudResolverRegistered();

  let localResolved: HandwritingBlockData | null;
  if (localData !== undefined) {
    localResolved = localData;
  } else {
    const loaded = await hwLoadBlock(ids.objectId, ids.blockKey);
    localResolved = loaded.status === 'loaded' ? loaded.data : null;
  }

  if (!ids.userId || !ids.sectionId || !isSupabaseConfigured) {
    return localResolved
      ? { action: 'skipped_offline', data: localResolved }
      : { action: 'empty' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return localResolved
      ? { action: 'skipped_offline', data: localResolved }
      : { action: 'empty' };
  }
  if (!idsReady({ ...ids, userId: ids.userId, sectionId: ids.sectionId })) {
    return localResolved
      ? { action: 'skipped_offline', data: localResolved }
      : { action: 'empty' };
  }

  const fullIds: HandwritingCloudIds = {
    userId: ids.userId,
    sectionId: ids.sectionId,
    objectId: ids.objectId,
    blockKey: ids.blockKey,
  };

  let path: string;
  try {
    path = buildHandwritingCloudPath(fullIds);
  } catch {
    return localResolved
      ? { action: 'skipped_offline', data: localResolved }
      : { action: 'empty' };
  }

  const downloaded = await downloadUserContentAsset(path);
  if (!downloaded.ok) {
    if (downloaded.reason === 'not_found') {
      if (localResolved) {
        scheduleHandwritingCloudUpload(fullIds, localResolved.updatedAt);
        return { action: 'upload_local', data: localResolved };
      }
      return { action: 'empty' };
    }
    fwPersistWarn(
      `handwriting reconcile download failed: path=${path} reason=${downloaded.reason}` +
        (downloaded.message ? ` message=${downloaded.message}` : ''),
    );
    return {
      action: 'network_error',
      data: localResolved,
      message: downloaded.message,
    };
  }

  const remote = await parseHandwritingCloudBlob(downloaded.value);
  if (!remote) {
    return { action: 'malformed', data: localResolved };
  }

  if (!localResolved) {
    await writeRemotePreservingUpdatedAt(ids.objectId, ids.blockKey, remote);
    lastEnqueuedUpdatedAt.set(cloudAssetKey(fullIds), remote.updatedAt);
    return { action: 'apply_remote', data: remote };
  }

  const cmp = compareHandwritingUpdatedAt(remote.updatedAt, localResolved.updatedAt);
  if (cmp > 0) {
    cancelPendingUpload(fullIds);
    await writeRemotePreservingUpdatedAt(ids.objectId, ids.blockKey, remote);
    lastEnqueuedUpdatedAt.set(cloudAssetKey(fullIds), remote.updatedAt);
    return { action: 'apply_remote', data: remote };
  }
  if (cmp < 0) {
    scheduleHandwritingCloudUpload(fullIds, localResolved.updatedAt);
    return { action: 'upload_local', data: localResolved };
  }

  // Equal — no upload.
  lastEnqueuedUpdatedAt.set(cloudAssetKey(fullIds), localResolved.updatedAt);
  cancelPendingUpload(fullIds);
  return { action: 'keep_local', data: localResolved };
}

/**
 * @deprecated Blind migrate-on-hit was the stale-overwrite path.
 * Prefer reconcileHandwritingWithCloud.
 */
export function migrateLocalHandwritingToCloud(
  ids: Partial<HandwritingCloudIds>,
  data: HandwritingBlockData,
): void {
  if (!idsReady(ids)) return;
  void reconcileHandwritingWithCloud(ids, data);
}

ensureNotebookHandwritingCloudResolverRegistered();
