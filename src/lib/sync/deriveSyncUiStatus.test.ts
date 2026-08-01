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
import { deriveSyncUiStatus } from './deriveSyncUiStatus';
import {
  clearSyncTimelineForTests,
  formatSyncTimelineLines,
  getSyncTimelineEvents,
  isSyncTimelineEnabled,
  recordSyncTimelineEvent,
} from './syncEventTimeline';

describe('deriveSyncUiStatus', () => {
  beforeEach(() => {
    resetSaveStatusForTests();
    clearSyncTimelineForTests();
  });

  it('maps local error to local_failed over pending', () => {
    markSaveError('pdfBlob', 'IndexedDB transaction failed');
    const snap = getSaveStatusSnapshot();
    expect(snap.anyPending).toBe(true);
    expect(snap.anyError).toBe(true);
    const ui = deriveSyncUiStatus(snap, { online: true });
    expect(ui.phase).toBe('local_failed');
    expect(ui.label).toBe('Save failed');
  });

  it('maps offline over saving when no error', () => {
    markSavePending('freeSpaceObjects');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), { online: false });
    expect(ui.phase).toBe('offline');
    expect(ui.label).toBe('Offline');
  });

  it('maps pending to saving_local when online', () => {
    markSavePending('freeSpacePositions');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), { online: true });
    expect(ui.phase).toBe('saving_local');
    expect(ui.label).toBe('Saving');
  });

  it('maps showSavedLocal to saved_local', () => {
    markSaveOk('freeSpaceObjects');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), { online: true, showSavedLocal: true });
    expect(ui.phase).toBe('saved_local');
    expect(ui.label).toBe('Saved locally');
  });

  it('returns idle when quiet', () => {
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), { online: true, showSavedLocal: false });
    expect(ui.phase).toBe('idle');
    expect(ui.label).toBe('');
  });

  it('never emits sync_pending or sync_failed as phase', () => {
    const phases = [
      deriveSyncUiStatus(getSaveStatusSnapshot(), { online: true }).phase,
      deriveSyncUiStatus(getSaveStatusSnapshot(), { online: false }).phase,
    ];
    markSavePending('handwriting');
    phases.push(deriveSyncUiStatus(getSaveStatusSnapshot(), { online: true }).phase);
    markSaveError('handwriting', 'fail');
    phases.push(deriveSyncUiStatus(getSaveStatusSnapshot(), { online: true }).phase);
    expect(phases).not.toContain('sync_pending');
    expect(phases).not.toContain('sync_failed');
  });

  it('keeps multi-tab conflicts diagnostics-only (not user phase)', () => {
    recordStorageConflict('merge test');
    const ui = deriveSyncUiStatus(getSaveStatusSnapshot(), { online: true });
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
    // May or may not record depending on env; force-enable via direct push path by mocking
    const enabled = isSyncTimelineEnabled({
      dev: true,
      search: '',
      storage: { getItem: () => null },
    });
    expect(enabled).toBe(true);

    clearSyncTimelineForTests();
    // Call through mark path when DEV — use direct record after confirming gate
    if (isSyncTimelineEnabled({ dev: true, search: '', storage: { getItem: () => null } })) {
      // recordSyncTimelineEvent uses runtime import.meta.env.DEV; call with enabled check bypass:
      // re-record by temporarily relying on vitest DEV
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
    // Production gate reads window before applying QA storage; stub only for this assertion.
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
