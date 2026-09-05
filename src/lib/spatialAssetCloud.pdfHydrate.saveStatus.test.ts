// @vitest-environment happy-dom
/**
 * Cloud PDF hydrate + best-effort cache must not poison global Save failed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadPdfBlobMock = vi.fn();
const savePdfBlobMock = vi.fn();
const downloadMock = vi.fn();

vi.mock('./freeSpacePdfIdb', () => ({
  loadPdfBlob: (...args: unknown[]) => loadPdfBlobMock(...args),
  savePdfBlob: (...args: unknown[]) => savePdfBlobMock(...args),
}));

vi.mock('./freeSpaceImageIdb', () => ({
  loadImageBlob: vi.fn(),
  saveImageBlob: vi.fn(),
}));

vi.mock('./userContentStorage', async importOriginal => {
  const actual = await importOriginal<typeof import('./userContentStorage')>();
  return {
    ...actual,
    downloadUserContentAsset: (...args: unknown[]) => downloadMock(...args),
  };
});

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {},
}));

vi.mock('./userContentAssetEnqueue', () => ({
  enqueueUserContentAssetOp: vi.fn(),
}));

vi.mock('./userContentAssetResolver', () => ({
  registerUserContentAssetResolver: vi.fn(),
}));

vi.mock('./userContentAssetAuthority', () => ({
  canUploadUserContentAsset: () => true,
  clearUserContentAssetDeleted: vi.fn(),
  isUserContentAssetDeleted: () => false,
  markUserContentAssetDeleted: vi.fn(),
  userContentAssetEntityKey: (x: { objectId: string }) => x.objectId,
}));

import {
  getSaveStatusSnapshot,
  markSaveError,
  resetSaveStatusForTests,
} from './saveStatus';
import { deriveSyncUiStatus } from './sync/deriveSyncUiStatus';
import type { CloudSyncSnapshot } from './sync/cloudSyncStatus';
import { hydrateSpatialPdfWithCloud } from './spatialAssetCloud';

function emptyCloud(): CloudSyncSnapshot {
  return {
    pendingCount: 0,
    pendingOpIds: [],
    flushInFlight: false,
    anyCloudPending: false,
    anyCloudFailure: false,
    lastFailureAt: null,
    lastFailureMessage: null,
  };
}

beforeEach(() => {
  resetSaveStatusForTests();
  loadPdfBlobMock.mockReset();
  savePdfBlobMock.mockReset();
  downloadMock.mockReset();
});

describe('hydrateSpatialPdfWithCloud save-status honesty', () => {
  const ids = {
    userId: 'user-1',
    sectionId: 'sec-1',
    objectId: 'ps-pdf-1',
    assetType: 'pdf' as const,
  };

  it('cloud hit + cache fail opens viewer without global Save failed', async () => {
    loadPdfBlobMock.mockResolvedValue(undefined);
    const cloud = new Blob(['%PDF-cloud'], { type: 'application/pdf' });
    downloadMock.mockResolvedValue({ ok: true, value: cloud });
    // Simulate real savePdfBlob({ reportSaveStatus: false }) — throws, no ledger mutation
    savePdfBlobMock.mockImplementation(async (_s, _o, _b, opts?: { reportSaveStatus?: boolean }) => {
      expect(opts?.reportSaveStatus).toBe(false);
      throw new Error('IndexedDB is not available in this browser session');
    });

    const outcome = await hydrateSpatialPdfWithCloud(ids);

    expect(outcome.result).toBe('cloud_hit');
    expect(outcome.cachePersisted).toBe(false);
    expect(outcome.blob).toBe(cloud);

    const snap = getSaveStatusSnapshot();
    expect(snap.anyError).toBe(false);
    expect(snap.channels.pdfBlob.lastError).toBeNull();
    const ui = deriveSyncUiStatus(snap, { online: true, cloud: emptyCloud() });
    expect(ui.phase).not.toBe('local_failed');
    expect(ui.label).not.toBe('Save failed');
  });

  it('authoritative pdfBlob failure still surfaces Save failed', () => {
    markSaveError('pdfBlob', 'IndexedDB is not available in this browser session');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: emptyCloud(),
    });
    expect(ui.phase).toBe('local_failed');
    expect(ui.label).toBe('Save failed');
  });
});
