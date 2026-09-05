// @vitest-environment happy-dom
/**
 * PDF IDB saveStatus reporting: authoritative vs best-effort cache.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSaveStatusSnapshot,
  resetSaveStatusForTests,
} from './saveStatus';
import { deriveSyncUiStatus } from './sync/deriveSyncUiStatus';
import type { CloudSyncSnapshot } from './sync/cloudSyncStatus';

vi.mock('./indexedDbEnvironment', async importOriginal => {
  const actual = await importOriginal<typeof import('./indexedDbEnvironment')>();
  return {
    ...actual,
    getIndexedDB: vi.fn(),
    probeIndexedDbEnvironment: () => ({
      typeofIndexedDB: 'object',
      typeofWindowIndexedDB: 'object',
      hasGlobalThisIndexedDB: true,
      hasWindowIndexedDB: true,
      resolved: true,
      userAgent: 'test',
      displayMode: 'browser',
      iosStandalone: false,
      isServiceWorkerContext: false,
      privateModeHint: 'unlikely' as const,
      runtimeContext: 'browser-main' as const,
      wkWebViewHint: false,
    }),
  };
});

import { getIndexedDB } from './indexedDbEnvironment';
import { savePdfBlob } from './freeSpacePdfIdb';

const getIndexedDBMock = vi.mocked(getIndexedDB);

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
  getIndexedDBMock.mockReset();
  getIndexedDBMock.mockImplementation(() => globalThis.indexedDB);
});

describe('savePdfBlob saveStatus reporting', () => {
  const sectionId = 'sec-1';
  const objectId = 'ps-pdf-1';
  const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });

  it('authoritative failure (default) marks global Save failed', async () => {
    getIndexedDBMock.mockReturnValue(null);

    await expect(savePdfBlob(sectionId, objectId, blob)).rejects.toThrow(/IndexedDB is not available/);

    const snap = getSaveStatusSnapshot();
    expect(snap.anyError).toBe(true);
    expect(snap.channels.pdfBlob.lastError).toMatch(/IndexedDB is not available/);
    const ui = deriveSyncUiStatus(snap, { online: true, cloud: emptyCloud() });
    expect(ui.phase).toBe('local_failed');
    expect(ui.label).toBe('Save failed');
  });

  it('best-effort cache failure does not mark global Save failed', async () => {
    getIndexedDBMock.mockReturnValue(null);

    await expect(
      savePdfBlob(sectionId, objectId, blob, { reportSaveStatus: false }),
    ).rejects.toThrow(/IndexedDB is not available/);

    const snap = getSaveStatusSnapshot();
    expect(snap.anyError).toBe(false);
    expect(snap.channels.pdfBlob.lastError).toBeNull();
    const ui = deriveSyncUiStatus(snap, { online: true, cloud: emptyCloud() });
    expect(ui.phase).toBe('idle');
    expect(ui.label).toBe('');
  });

  it('successful authoritative write clears pending and records ok', async () => {
    await savePdfBlob(sectionId, objectId, blob);

    const snap = getSaveStatusSnapshot();
    expect(snap.anyError).toBe(false);
    expect(snap.anyPending).toBe(false);
    expect(snap.channels.pdfBlob.lastOkAt).not.toBeNull();
    expect(snap.channels.pdfBlob.lastError).toBeNull();
  });

  it('successful best-effort write does not touch saveStatus ledger', async () => {
    await savePdfBlob(sectionId, objectId, blob, { reportSaveStatus: false });

    const snap = getSaveStatusSnapshot();
    expect(snap.anyPending).toBe(false);
    expect(snap.anyError).toBe(false);
    expect(snap.channels.pdfBlob.lastOkAt).toBeNull();
    expect(snap.channels.pdfBlob.pending).toBe(false);
  });
});
