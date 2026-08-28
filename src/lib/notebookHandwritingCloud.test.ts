/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { resetFocusCacheDbForTests } from './focusCache/db';
import { FOCUS_CACHE_DB_NAME } from './focusCache/types';
import { listPendingOperations } from './focusCache/pendingOperations';
import { flushPendingFreeSpaceCreates } from './focusCache/flushPendingFreeSpaceCreates';
import {
  getCloudSyncSnapshot,
  resetCloudSyncStatusForTests,
} from './sync/cloudSyncStatus';
import { parseUserContentAssetDescriptor } from './userContentAssetDescriptor';
import { clearUserContentAssetResolversForTests } from './userContentAssetResolver';
import * as storage from './userContentStorage';
import {
  emptyHandwritingData,
  type HandwritingBlockData,
} from './handwritingTypes';
import {
  hwDelete,
  hwGet,
  hwSet,
  resetNotebookHandwritingStoreForTests,
} from './notebookHandwritingStore';
import {
  HANDWRITING_CLOUD_CONTENT_TYPE,
  HANDWRITING_CLOUD_ENQUEUE_DEBOUNCE_MS,
  buildHandwritingCloudPath,
  enqueueHandwritingCloudDelete,
  ensureNotebookHandwritingCloudResolverRegistered,
  flushAllPendingHandwritingCloudEnqueues,
  flushHandwritingCloudEnqueueNow,
  hydrateHandwritingWithCloud,
  reconcileHandwritingWithCloud,
  resetNotebookHandwritingCloudForTests,
  scheduleHandwritingCloudUpload,
} from './notebookHandwritingCloud';
import { resolveLocalUserContentAsset } from './userContentAssetResolver';
import type { UserContentAssetDescriptor } from './userContentAssetDescriptor';

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(),
        download: vi.fn(),
        remove: vi.fn(),
      }),
    },
  },
}));

vi.mock('./focusCache/freeSpacePendingFlushTrigger', () => ({
  notifyFreeSpacePendingEnqueue: vi.fn(),
}));

const ids = {
  userId: 'user-1',
  sectionId: 'sec-1',
  objectId: 'obj-1',
  blockKey: 'hw-abc123',
};

function sampleData(updatedAt: number, strokeId = 'st-1'): HandwritingBlockData {
  return {
    type: 'handwriting',
    strokes: [
      {
        id: strokeId,
        tool: 'pen',
        color: '#111',
        width: 2,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
        ],
      },
    ],
    canvas: { width: 600, height: 480 },
    updatedAt,
  };
}

async function deleteFocusCacheDatabase(): Promise<void> {
  await resetFocusCacheDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(FOCUS_CACHE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

async function deleteHwDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('fw_notebook_handwriting_v1');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('delete hw db failed'));
    req.onblocked = () => resolve();
  });
}

async function listUploads() {
  const listed = await listPendingOperations({
    userId: ids.userId,
    workspaceId: ids.sectionId,
  });
  if (!listed.ok) return [];
  return listed.value.filter(
    op => op.entityType === 'user_content_asset' && op.operationType === 'create',
  );
}

describe('notebook handwriting cloud LWW', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    resetNotebookHandwritingStoreForTests();
    await deleteFocusCacheDatabase();
    await deleteHwDatabase();
    resetCloudSyncStatusForTests();
    clearUserContentAssetResolversForTests();
    resetNotebookHandwritingCloudForTests();
    ensureNotebookHandwritingCloudResolverRegistered();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetNotebookHandwritingStoreForTests();
    resetNotebookHandwritingCloudForTests();
  });

  it('maps stable path from objectId + blockKey', () => {
    expect(buildHandwritingCloudPath(ids)).toBe(
      'user-1/sec-1/obj-1/handwriting/hw-abc123',
    );
  });

  it('cloud enqueue debounce constant is trailing ~2s', () => {
    expect(HANDWRITING_CLOUD_ENQUEUE_DEBOUNCE_MS).toBe(2000);
  });

  it('A: local 100 / remote 200 → remote wins, no stale upload', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(100, 'local-a'), {
      preserveUpdatedAt: true,
    });
    const hydrate = await hydrateHandwritingWithCloud(ids);
    expect(hydrate.status).toBe('local_hit');
    if (hydrate.status !== 'local_hit') return;
    expect(hydrate.data.updatedAt).toBe(100);

    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: new Blob([JSON.stringify(sampleData(200, 'remote-b'))], {
        type: 'application/json',
      }),
    });
    const uploadSpy = vi.spyOn(storage, 'uploadUserContentAsset');

    const result = await reconcileHandwritingWithCloud(ids, hydrate.data);
    expect(result.action).toBe('apply_remote');
    if (result.action !== 'apply_remote') return;
    expect(result.data.updatedAt).toBe(200);
    expect(result.data.strokes[0]?.id).toBe('remote-b');

    await flushAllPendingHandwritingCloudEnqueues();
    expect(await listUploads()).toHaveLength(0);
    expect(uploadSpy).not.toHaveBeenCalled();

    const stored = await hwGet(ids.objectId, ids.blockKey);
    expect(stored?.updatedAt).toBe(200);
  });

  it('B: local 200 / remote 100 → local wins → upload local', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(200, 'local-b'), {
      preserveUpdatedAt: true,
    });
    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: new Blob([JSON.stringify(sampleData(100, 'remote-old'))], {
        type: 'application/json',
      }),
    });

    const result = await reconcileHandwritingWithCloud(ids);
    expect(result.action).toBe('upload_local');
    await flushHandwritingCloudEnqueueNow(ids);
    // enqueueUploadNow re-checks remote; mock still returns 100 → local newer → enqueue
    expect(await listUploads()).toHaveLength(1);
  });

  it('C: local 100 / remote 100 → no unnecessary upload', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(100), { preserveUpdatedAt: true });
    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: new Blob([JSON.stringify(sampleData(100))], { type: 'application/json' }),
    });
    const result = await reconcileHandwritingWithCloud(ids);
    expect(result.action).toBe('keep_local');
    await flushAllPendingHandwritingCloudEnqueues();
    expect(await listUploads()).toHaveLength(0);
  });

  it('D: local missing / remote 100 → hydrate remote preserving updatedAt', async () => {
    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: new Blob([JSON.stringify(sampleData(100, 'from-cloud'))], {
        type: 'application/json',
      }),
    });
    const hydrate = await hydrateHandwritingWithCloud(ids);
    expect(hydrate.status).toBe('cloud_hit');
    if (hydrate.status !== 'cloud_hit') return;
    expect(hydrate.data.updatedAt).toBe(100);
    const stored = await hwGet(ids.objectId, ids.blockKey);
    expect(stored?.updatedAt).toBe(100);
    expect(stored?.strokes[0]?.id).toBe('from-cloud');
  });

  it('E: local 100 / remote missing → migration upload', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(100), { preserveUpdatedAt: true });
    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    const result = await reconcileHandwritingWithCloud(ids);
    expect(result.action).toBe('upload_local');
    await flushHandwritingCloudEnqueueNow(ids);
    expect(await listUploads()).toHaveLength(1);
  });

  it('F: remote hydration preserves remote updatedAt (no Date.now restamp)', async () => {
    const before = Date.now();
    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: new Blob([JSON.stringify(sampleData(55))], { type: 'application/json' }),
    });
    await hydrateHandwritingWithCloud(ids);
    const stored = await hwGet(ids.objectId, ids.blockKey);
    expect(stored?.updatedAt).toBe(55);
    expect(stored!.updatedAt).toBeLessThan(before + 1_000_000);
  });

  it('G: Device A stale local cannot overwrite Device B newer cloud', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(100, 'stale-a'), {
      preserveUpdatedAt: true,
    });
    // Blind schedule as if old migrate path queued an upload
    scheduleHandwritingCloudUpload(ids, 100);

    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: true,
      value: new Blob([JSON.stringify(sampleData(200, 'newer-b'))], {
        type: 'application/json',
      }),
    });
    const uploadSpy = vi.spyOn(storage, 'uploadUserContentAsset').mockResolvedValue({
      ok: true,
      value: { path: buildHandwritingCloudPath(ids) },
    });

    await flushHandwritingCloudEnqueueNow(ids);
    expect(await listUploads()).toHaveLength(0);
    expect(uploadSpy).not.toHaveBeenCalled();
    expect((await hwGet(ids.objectId, ids.blockKey))?.strokes[0]?.id).toBe('newer-b');
  });

  it('H: deleted block key not mounted — GC path enqueues cloud delete (no resurrect via reconcile when local cleared)', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(100), { preserveUpdatedAt: true });
    await hwDelete(ids.objectId, ids.blockKey);
    await enqueueHandwritingCloudDelete(ids);
    const listed = await listPendingOperations({
      userId: ids.userId,
      workspaceId: ids.sectionId,
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.some(op => op.operationType === 'delete')).toBe(true);

    // Stale schedule after local delete must not upload
    scheduleHandwritingCloudUpload(ids, 100);
    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    await flushHandwritingCloudEnqueueNow(ids);
    const uploads = await listUploads();
    expect(uploads).toHaveLength(0);
  });

  it('I: offline local edit still schedules enqueue safely', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await hwSet(ids.objectId, ids.blockKey, sampleData(50), { preserveUpdatedAt: true });
    const stored = (await hwGet(ids.objectId, ids.blockKey))!;
    // User edit restamps
    await hwSet(ids.objectId, ids.blockKey, { ...stored, strokes: sampleData(1, 'offline').strokes });
    const after = (await hwGet(ids.objectId, ids.blockKey))!;
    scheduleHandwritingCloudUpload(ids, after.updatedAt);
    await flushHandwritingCloudEnqueueNow(ids);
    // Offline: enqueueUploadNow skips remote compare and still enqueues
    expect(await listUploads()).toHaveLength(1);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(true);
  });

  it('local save remains immediate; descriptor is JSON-only', async () => {
    const saved = await hwSet(ids.objectId, ids.blockKey, sampleData(42));
    expect(saved.ok).toBe(true);
    const stored = await hwGet(ids.objectId, ids.blockKey);
    expect(stored?.strokes).toHaveLength(1);

    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    scheduleHandwritingCloudUpload(ids, stored!.updatedAt);
    await flushHandwritingCloudEnqueueNow(ids);
    const uploads = await listUploads();
    expect(uploads).toHaveLength(1);
    const desc = parseUserContentAssetDescriptor(uploads[0]!.payload);
    expect(desc?.storagePath).toBe('user-1/sec-1/obj-1/handwriting/hw-abc123');
    expect(desc?.localRef).toEqual({
      store: 'notebook_handwriting',
      key: 'obj-1:hw-abc123',
    });
    expect(JSON.stringify(uploads[0]!.payload)).not.toMatch(/Blob/);
  });

  it('resolver returns JSON blob from IDB; miss when absent', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(7), { preserveUpdatedAt: true });
    const descriptor: UserContentAssetDescriptor = {
      version: 1,
      assetOp: 'upload',
      userId: ids.userId,
      sectionId: ids.sectionId,
      objectId: ids.objectId,
      assetType: 'handwriting',
      assetId: ids.blockKey,
      storagePath: buildHandwritingCloudPath(ids),
      localRef: { store: 'notebook_handwriting', key: 'obj-1:hw-abc123' },
      contentType: HANDWRITING_CLOUD_CONTENT_TYPE,
      updatedAt: 7,
    };
    const blob = await resolveLocalUserContentAsset(descriptor);
    expect(blob).toBeInstanceOf(Blob);
    expect(JSON.parse(await blob!.text()).updatedAt).toBe(7);

    await hwDelete(ids.objectId, ids.blockKey);
    expect(await resolveLocalUserContentAsset(descriptor)).toBeNull();
  });

  it('hydration: local hit skips cloud download', async () => {
    const download = vi.spyOn(storage, 'downloadUserContentAsset');
    await hwSet(ids.objectId, ids.blockKey, sampleData(3), { preserveUpdatedAt: true });
    const result = await hydrateHandwritingWithCloud(ids);
    expect(result.status).toBe('local_hit');
    expect(download).not.toHaveBeenCalled();
  });

  it('pending handwriting upload prevents Saved until flush success', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(11), { preserveUpdatedAt: true });
    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    scheduleHandwritingCloudUpload(ids, 11);
    await flushHandwritingCloudEnqueueNow(ids);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(true);

    vi.spyOn(storage, 'uploadUserContentAsset').mockResolvedValue({
      ok: true,
      value: { path: buildHandwritingCloudPath(ids) },
    });
    const flush = await flushPendingFreeSpaceCreates({
      userId: ids.userId,
      workspaceId: ids.sectionId,
    });
    expect(flush.stoppedReason).toBeUndefined();
    expect(flush.removed).toBe(1);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);
  });

  it('delete supersedes pending upload', async () => {
    await hwSet(ids.objectId, ids.blockKey, sampleData(1), { preserveUpdatedAt: true });
    vi.spyOn(storage, 'downloadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'not_found',
    });
    scheduleHandwritingCloudUpload(ids, 1);
    await flushHandwritingCloudEnqueueNow(ids);
    await hwDelete(ids.objectId, ids.blockKey);
    await enqueueHandwritingCloudDelete(ids);
    const listed = await listPendingOperations({
      userId: ids.userId,
      workspaceId: ids.sectionId,
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]!.operationType).toBe('delete');
  });

  it('empty local handwriting data still serializes', () => {
    expect(() => JSON.stringify(emptyHandwritingData(400, 360))).not.toThrow();
  });
});
