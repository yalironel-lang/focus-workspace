// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePdfBlobForViewerOpen } from './freeSpacePdfOpen';

const loadPdfBlobMock = vi.fn();
const hydrateMock = vi.fn();
const downloadMock = vi.fn();
const savePdfBlobMock = vi.fn();

vi.mock('./freeSpacePdfIdb', () => ({
  loadPdfBlob: (...args: unknown[]) => loadPdfBlobMock(...args),
  savePdfBlob: (...args: unknown[]) => savePdfBlobMock(...args),
}));

vi.mock('./spatialAssetCloud', async importOriginal => {
  const actual = await importOriginal<typeof import('./spatialAssetCloud')>();
  return {
    ...actual,
    hydrateSpatialPdfWithCloud: (...args: unknown[]) => hydrateMock(...args),
  };
});

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

beforeEach(() => {
  loadPdfBlobMock.mockReset();
  hydrateMock.mockReset();
  downloadMock.mockReset();
  savePdfBlobMock.mockReset();
});

describe('resolvePdfBlobForViewerOpen', () => {
  const base = {
    sectionId: 'sec-1',
    objectId: 'ps-pdf-1',
    userId: 'user-1',
  };

  it('1. local Blob exists → uses local, no cloud hydrate', async () => {
    const local = new Blob(['%PDF-local'], { type: 'application/pdf' });
    loadPdfBlobMock.mockResolvedValue(local);

    const result = await resolvePdfBlobForViewerOpen(base);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('local');
    expect(await result.blob.text()).toBe('%PDF-local');
    expect(hydrateMock).not.toHaveBeenCalled();
  });

  it('2. local Blob missing → cloud Blob downloads and opens', async () => {
    loadPdfBlobMock.mockResolvedValue(undefined);
    const cloud = new Blob(['%PDF-cloud'], { type: 'application/pdf' });
    hydrateMock.mockResolvedValue({
      result: 'cloud_hit',
      blob: cloud,
      cachePersisted: true,
    });

    const result = await resolvePdfBlobForViewerOpen(base);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('cloud');
    expect(await result.blob.text()).toBe('%PDF-cloud');
    expect(hydrateMock).toHaveBeenCalledTimes(1);
  });

  it('3. local IDB lookup throws → cloud Blob still opens', async () => {
    loadPdfBlobMock.mockRejectedValue(new Error('IndexedDB is not available'));
    const cloud = new Blob(['%PDF-after-throw'], { type: 'application/pdf' });
    hydrateMock.mockResolvedValue({
      result: 'cloud_hit',
      blob: cloud,
      cachePersisted: false,
    });

    const result = await resolvePdfBlobForViewerOpen(base);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('cloud');
    expect(result.cachePersisted).toBe(false);
    expect(await result.blob.text()).toBe('%PDF-after-throw');
  });

  it('4. cloud download succeeds + IDB save fails → still opens (via hydrate outcome)', async () => {
    loadPdfBlobMock.mockResolvedValue(undefined);
    const cloud = new Blob(['%PDF-nocache'], { type: 'application/pdf' });
    hydrateMock.mockResolvedValue({
      result: 'cloud_hit',
      blob: cloud,
      cachePersisted: false,
    });

    const result = await resolvePdfBlobForViewerOpen(base);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cachePersisted).toBe(false);
    expect(await result.blob.text()).toBe('%PDF-nocache');
  });

  it('5. local missing + cloud fails → recover (ok false)', async () => {
    loadPdfBlobMock.mockResolvedValue(undefined);
    hydrateMock.mockResolvedValue({
      result: 'missing',
      blob: null,
      cachePersisted: false,
      errorMessage: 'not_found',
    });

    const result = await resolvePdfBlobForViewerOpen(base);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not_found');
  });

  it('6. late auth: no user → no hydrate; with user → hydrates', async () => {
    loadPdfBlobMock.mockResolvedValue(undefined);
    const cloud = new Blob(['%PDF-auth'], { type: 'application/pdf' });
    hydrateMock.mockResolvedValue({
      result: 'cloud_hit',
      blob: cloud,
      cachePersisted: true,
    });

    const noUser = await resolvePdfBlobForViewerOpen({ ...base, userId: null });
    expect(noUser.ok).toBe(false);
    if (!noUser.ok) expect(noUser.reason).toBe('no_user');
    expect(hydrateMock).not.toHaveBeenCalled();

    const withUser = await resolvePdfBlobForViewerOpen(base);
    expect(withUser.ok).toBe(true);
    expect(hydrateMock).toHaveBeenCalledTimes(1);
  });

  it('8. single resolve call does not double-hydrate', async () => {
    loadPdfBlobMock.mockResolvedValue(undefined);
    hydrateMock.mockResolvedValue({
      result: 'cloud_hit',
      blob: new Blob(['x'], { type: 'application/pdf' }),
      cachePersisted: true,
    });

    await resolvePdfBlobForViewerOpen(base);
    expect(hydrateMock).toHaveBeenCalledTimes(1);
  });
});
