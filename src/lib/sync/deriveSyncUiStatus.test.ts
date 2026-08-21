// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSaveStatusSnapshot,
  markSaveError,
  markSaveOk,
  markSavePending,
  recordStorageConflict,
  resetSaveStatusForTests,
  subscribeSaveStatus,
} from '../saveStatus';
import {
  getCloudSyncSnapshot,
  noteCloudFlushEnded,
  noteCloudFlushStarted,
  noteCloudOpEnqueued,
  noteCloudOpResolved,
  noteCloudWriteFailed,
  reconcileCloudPendingOps,
  resetCloudSyncStatusForTests,
} from './cloudSyncStatus';
import { deriveSyncUiStatus } from './deriveSyncUiStatus';
import {
  clearSyncTimelineForTests,
  formatSyncTimelineLines,
  getSyncTimelineEvents,
  isSyncTimelineEnabled,
  recordSyncTimelineEvent,
} from './syncEventTimeline';

function emptyCloud() {
  return getCloudSyncSnapshot();
}

describe('cloudSyncStatus ledger', () => {
  beforeEach(() => {
    resetCloudSyncStatusForTests();
  });

  it('tracks overlapping ops without clearing early', () => {
    noteCloudOpEnqueued('a');
    noteCloudOpEnqueued('b');
    expect(getCloudSyncSnapshot().pendingCount).toBe(2);
    noteCloudOpResolved('a');
    expect(getCloudSyncSnapshot().pendingCount).toBe(1);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(true);
    noteCloudOpResolved('b');
    expect(getCloudSyncSnapshot().pendingCount).toBe(0);
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);
  });

  it('keeps failure sticky only while pending remains', () => {
    noteCloudOpEnqueued('a');
    noteCloudWriteFailed('cloud_write_failed');
    expect(getCloudSyncSnapshot().anyCloudFailure).toBe(true);
    noteCloudOpResolved('a');
    expect(getCloudSyncSnapshot().anyCloudFailure).toBe(false);
    expect(getCloudSyncSnapshot().lastFailureAt).toBeNull();
  });

  it('reconcile replaces drift with authoritative ids', () => {
    noteCloudOpEnqueued('stale');
    reconcileCloudPendingOps(['live-1', 'live-2']);
    expect(getCloudSyncSnapshot().pendingOpIds.sort()).toEqual(['live-1', 'live-2']);
  });

  it('flushInFlight counts as cloud pending', () => {
    noteCloudFlushStarted();
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(true);
    noteCloudFlushEnded();
    expect(getCloudSyncSnapshot().anyCloudPending).toBe(false);
  });
});

describe('deriveSyncUiStatus', () => {
  beforeEach(() => {
    resetSaveStatusForTests();
    resetCloudSyncStatusForTests();
    clearSyncTimelineForTests();
  });

  it('A: local pending maps to Saving…', () => {
    markSavePending('freeSpaceObjects');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: emptyCloud(),
    });
    expect(ui.phase).toBe('saving_local');
    expect(ui.label).toBe('Saving…');
  });

  it('B: local durable + cloud pending → Waiting to sync', () => {
    markSaveOk('freeSpaceObjects');
    noteCloudOpEnqueued('op-1');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
    });
    expect(ui.phase).toBe('sync_pending');
    expect(ui.label).toBe('Waiting to sync');
  });

  it('C: cloud drained + showSaved → Saved', () => {
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: emptyCloud(),
      showSaved: true,
    });
    expect(ui.phase).toBe('saved');
    expect(ui.label).toBe('Saved');
  });

  it('D/E: one cloud success while another remains → NOT Saved', () => {
    noteCloudOpEnqueued('a');
    noteCloudOpEnqueued('b');
    noteCloudOpResolved('a');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
      showSaved: true,
    });
    expect(ui.phase).toBe('sync_pending');
    expect(ui.label).not.toBe('Saved');
  });

  it('F: cloud failure → Sync failed', () => {
    noteCloudOpEnqueued('a');
    noteCloudWriteFailed('cloud_write_failed');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
    });
    expect(ui.phase).toBe('sync_failed');
    expect(ui.label).toBe('Sync failed');
  });

  it('H: after failure, pending without sticky failure display uses Waiting when failure cleared by drain path mid-retry', () => {
    noteCloudOpEnqueued('a');
    noteCloudWriteFailed('cloud_write_failed');
    expect(deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
    }).phase).toBe('sync_failed');
    // Retry in flight still has pending; failure stays until drain
    noteCloudFlushStarted();
    expect(deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
    }).phase).toBe('sync_failed');
    noteCloudFlushEnded();
    noteCloudOpResolved('a');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
      showSaved: true,
    });
    expect(ui.phase).toBe('saved');
  });

  it('J: offline with queued work → Offline', () => {
    noteCloudOpEnqueued('a');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: false,
      cloud: getCloudSyncSnapshot(),
    });
    expect(ui.phase).toBe('offline');
    expect(ui.label).toBe('Offline');
  });

  it('K: reconnect with pending queue → Waiting to sync', () => {
    noteCloudOpEnqueued('a');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
    });
    expect(ui.phase).toBe('sync_pending');
  });

  it('L: quiet / no cloud work does not fabricate Saved', () => {
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: emptyCloud(),
      showSaved: false,
    });
    expect(ui.phase).toBe('idle');
    expect(ui.label).toBe('');
  });

  it('maps local error to local_failed over pending', () => {
    markSaveError('pdfBlob', 'IndexedDB transaction failed');
    const snap = getSaveStatusSnapshot();
    expect(snap.anyPending).toBe(true);
    expect(snap.anyError).toBe(true);
    const ui = deriveSyncUiStatus(snap, { online: true, cloud: emptyCloud() });
    expect(ui.phase).toBe('local_failed');
    expect(ui.label).toBe('Save failed');
  });

  it('local pending beats cloud pending', () => {
    markSavePending('freeSpaceObjects');
    noteCloudOpEnqueued('op-1');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: getCloudSyncSnapshot(),
    });
    expect(ui.phase).toBe('saving_local');
  });

  it('keeps multi-tab conflicts diagnostics-only (not user phase)', () => {
    recordStorageConflict('merge test');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: true,
      cloud: emptyCloud(),
    });
    expect(ui.conflictCount).toBe(1);
    expect(ui.phase).toBe('idle');
    expect(ui.label).not.toMatch(/conflict/i);
  });
});

describe('subscribeSaveStatus', () => {
  beforeEach(() => {
    resetSaveStatusForTests();
  });

  it('notifies listeners on markSaveOk and stops after unsubscribe', () => {
    const spy = vi.fn();
    const unsub = subscribeSaveStatus(spy);
    markSavePending('freeSpaceObjects');
    markSaveOk('freeSpaceObjects');
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    const callsAfterSubscribe = spy.mock.calls.length;
    unsub();
    markSavePending('freeSpacePositions');
    expect(spy.mock.calls.length).toBe(callsAfterSubscribe);
  });
});

describe('syncEventTimeline gating', () => {
  beforeEach(() => {
    clearSyncTimelineForTests();
  });

  afterEach(() => {
    clearSyncTimelineForTests();
    vi.unstubAllGlobals();
  });

  it('records metadata-only events when enabled', () => {
    recordSyncTimelineEvent('saving_started', { channel: 'freeSpaceObjects' });
    const enabled = isSyncTimelineEnabled({
      dev: true,
      search: '',
      storage: { getItem: () => null },
    });
    expect(enabled).toBe(true);

    clearSyncTimelineForTests();
    if (isSyncTimelineEnabled({ dev: true, search: '', storage: { getItem: () => null } })) {
      recordSyncTimelineEvent('local_save_completed', { channel: 'handwriting' });
    }

    const lines = formatSyncTimelineLines(getSyncTimelineEvents());
    for (const line of lines) {
      expect(line).not.toMatch(/https?:\/\//);
      expect(line).not.toMatch(/\.pdf/i);
      expect(line.toLowerCase()).not.toContain('notebook body');
    }
  });

  it('is disabled in ordinary production (no QA)', () => {
    expect(
      isSyncTimelineEnabled({
        dev: false,
        search: '',
        storage: { getItem: () => null },
      }),
    ).toBe(false);
  });

  it('is enabled when QA storage flag set', () => {
    vi.stubGlobal('window', { location: { search: '' } });
    expect(
      isSyncTimelineEnabled({
        dev: false,
        search: '',
        storage: { getItem: (k: string) => (k === 'FW_QA_MODE' ? '1' : null) },
      }),
    ).toBe(true);
  });
});
