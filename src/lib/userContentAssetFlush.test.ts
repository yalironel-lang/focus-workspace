/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { resetFocusCacheDbForTests } from './focusCache/db';
import { FOCUS_CACHE_DB_NAME } from './focusCache/types';
import { listPendingOperations } from './focusCache/pendingOperations';
import { flushPendingFreeSpaceCreates } from './focusCache/flushPendingFreeSpaceCreates';
import {
  getCloudSyncSnapshot,
  noteCloudOpEnqueued,
  resetCloudSyncStatusForTests,
} from './sync/cloudSyncStatus';
import { enqueueUserContentAssetOp } from './userContentAssetEnqueue';
import {
  clearUserContentAssetResolversForTests,
  registerUserContentAssetResolver,
} from './userContentAssetResolver';
import * as storage from './userContentStorage';

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

const ns = { userId: 'user-1', workspaceId: 'sec-1' };

async function deleteFocusCacheDatabase(): Promise<void> {
  await resetFocusCacheDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(FOCUS_CACHE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

describe('user content asset flush + sync status', () => {
  beforeEach(async () => {
    await deleteFocusCacheDatabase();
    resetCloudSyncStatusForTests();
    clearUserContentAssetResolversForTests();
    vi.restoreAllMocks();
  });

  it('rejects Blob in pending payload via enqueuePendingOperation contract', async () => {
    const { enqueuePendingOperation } = await import('./focusCache/pendingOperations');
    const result = await enqueuePendingOperation({
      namespace: ns,
      entityType: 'user_content_asset',
      entityId: 'x',
      operationType: 'create',
      payload: { blob: new Blob(['x']) } as unknown as null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_operation');
  });

  it('queued asset op prevents Saved (anyCloudPending)', async () => {
    noteCloudOpEnqueued('synthetic-asset-op');
    const snap = getCloudSyncSnapshot();
    expect(snap.anyCloudPending).toBe(true);
    expect(snap.pendingCount).toBe(1);
  });

  it('upload success resolves pending op', async () => {
    registerUserContentAssetResolver('fixture', async () => new Blob(['hello']));
    vi.spyOn(storage, 'uploadUserContentAsset').mockResolvedValue({
      ok: true,
      value: { path: 'user-1/sec-1/obj-1/handwriting/block-1' },
    });

    const enqueued = await enqueueUserContentAssetOp({
      userId: 'user-1',
      sectionId: 'sec-1',
      objectId: 'obj-1',
      assetType: 'handwriting',
      assetId: 'block-1',
      assetOp: 'upload',
      localRef: { store: 'fixture', key: 'k' },
      contentType: 'application/json',
    });
    expect(enqueued.ok).toBe(true);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(true);

    const flush = await flushPendingFreeSpaceCreates(ns);
    expect(flush.stoppedReason).toBeUndefined();
    expect(flush.removed).toBe(1);
    expect(flush.failedCloud).toBe(0);

    const listed = await listPendingOperations(ns);
    expect(listed.ok && listed.value.length).toBe(0);
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);
  });

  it('upload failure leaves op retryable and reports cloud failure', async () => {
    registerUserContentAssetResolver('fixture', async () => new Blob(['hello']));
    vi.spyOn(storage, 'uploadUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'upload_failed',
      message: 'network',
    });

    await enqueueUserContentAssetOp({
      userId: 'user-1',
      sectionId: 'sec-1',
      objectId: 'obj-1',
      assetType: 'handwriting',
      assetId: 'block-1',
      assetOp: 'upload',
      localRef: { store: 'fixture', key: 'k' },
    });

    const flush = await flushPendingFreeSpaceCreates(ns);
    expect(flush.stoppedReason).toBe('cloud_write_failed');
    expect(flush.failedCloud).toBe(1);

    const listed = await listPendingOperations(ns);
    expect(listed.ok && listed.value.length).toBe(1);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(true);
    expect(getCloudSyncSnapshot().anyCloudFailure).toBe(true);
  });

  it('delete success resolves pending op', async () => {
    vi.spyOn(storage, 'removeUserContentAsset').mockResolvedValue({
      ok: true,
      value: { removed: true },
    });

    await enqueueUserContentAssetOp({
      userId: 'user-1',
      sectionId: 'sec-1',
      objectId: 'obj-1',
      assetType: 'pdf',
      assetId: 'original',
      assetOp: 'delete',
      localRef: { store: 'fixture', key: 'k' },
    });

    const flush = await flushPendingFreeSpaceCreates(ns);
    expect(flush.removed).toBe(1);
    expect(flush.stoppedReason).toBeUndefined();

    const listed = await listPendingOperations(ns);
    expect(listed.ok && listed.value.length).toBe(0);
  });

  it('delete failure remains retryable', async () => {
    vi.spyOn(storage, 'removeUserContentAsset').mockResolvedValue({
      ok: false,
      reason: 'remove_failed',
      message: 'denied',
    });

    await enqueueUserContentAssetOp({
      userId: 'user-1',
      sectionId: 'sec-1',
      objectId: 'obj-1',
      assetType: 'pdf',
      assetId: 'original',
      assetOp: 'delete',
      localRef: { store: 'fixture', key: 'k' },
    });

    const flush = await flushPendingFreeSpaceCreates(ns);
    expect(flush.stoppedReason).toBe('cloud_write_failed');
    const listed = await listPendingOperations(ns);
    expect(listed.ok && listed.value.length).toBe(1);
  });
});
