// @vitest-environment happy-dom
/**
 * PDF hydrate returns viewer Blob even when IDB cache write fails.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadPdfBlobMock = vi.fn();
const savePdfBlobMock = vi.fn();
const downloadMock = vi.fn();

vi.mock('./freeSpacePdfIdb', () => ({
  loadPdfBlob: (...args: unknown[]) => loadPdfBlobMock(...args),
  savePdfBlob: (...args: unknown[]) => savePdfBlobMock(...args),
  loadImageBlob: vi.fn(),
  saveImageBlob: vi.fn(),
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

import { hydrateSpatialPdfWithCloud } from './spatialAssetCloud';

beforeEach(() => {
  loadPdfBlobMock.mockReset();
  savePdfBlobMock.mockReset();
  downloadMock.mockReset();
});

describe('hydrateSpatialPdfWithCloud IDB-tolerant cloud hit', () => {
  const ids = {
    userId: 'user-1',
    sectionId: 'sec-1',
    objectId: 'ps-pdf-1',
    assetType: 'pdf' as const,
  };

  it('returns downloaded Blob when savePdfBlob throws', async () => {
    loadPdfBlobMock.mockRejectedValue(new Error('IndexedDB is not available'));
    const cloud = new Blob(['%PDF-1.7 cloud'], { type: 'application/pdf' });
    downloadMock.mockResolvedValue({ ok: true, value: cloud });
    savePdfBlobMock.mockRejectedValue(new Error('IndexedDB put failed'));

    const outcome = await hydrateSpatialPdfWithCloud(ids);

    expect(outcome.result).toBe('cloud_hit');
    expect(outcome.cachePersisted).toBe(false);
    expect(outcome.blob).toBeTruthy();
    expect(await outcome.blob!.text()).toBe('%PDF-1.7 cloud');
    expect(savePdfBlobMock).toHaveBeenCalledWith(
      ids.sectionId,
      ids.objectId,
      cloud,
      { reportSaveStatus: false },
    );
  });

  it('local hit returns local blob without download', async () => {
    const local = new Blob(['%PDF-local'], { type: 'application/pdf' });
    loadPdfBlobMock.mockResolvedValue(local);

    const outcome = await hydrateSpatialPdfWithCloud(ids);

    expect(outcome.result).toBe('local_hit');
    expect(outcome.blob).toBe(local);
    // reconcile may probe cloud; viewer still uses local bytes.
    expect(await outcome.blob!.text()).toBe('%PDF-local');
  });

  it('cloud miss surfaces errorMessage', async () => {
    loadPdfBlobMock.mockResolvedValue(undefined);
    downloadMock.mockResolvedValue({ ok: false, reason: 'not_found', message: 'Object not found' });

    const outcome = await hydrateSpatialPdfWithCloud(ids);

    expect(outcome.result).toBe('missing');
    expect(outcome.blob).toBeNull();
    expect(outcome.errorMessage).toMatch(/not_found/);
  });
});
