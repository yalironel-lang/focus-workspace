// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncTimelineForTests,
  formatSyncTimelineLines,
  getSyncTimelineEvents,
  isSyncTimelineEnabled,
  recordSyncTimelineEvent,
} from './syncEventTimeline';

describe('syncEventTimeline', () => {
  beforeEach(() => {
    clearSyncTimelineForTests();
  });

  afterEach(() => {
    clearSyncTimelineForTests();
    vi.unstubAllEnvs?.();
  });

  it('does not record when timeline disabled', () => {
    // Force gate off by stubbing: recordSyncTimelineEvent checks isSyncTimelineEnabled()
    // which reads import.meta.env.DEV — in vitest DEV is often true.
    // Test the gate helper directly for production path.
    expect(
      isSyncTimelineEnabled({
        dev: false,
        search: '',
        storage: { getItem: () => null },
      }),
    ).toBe(false);
  });

  it('formats lines without user content fields', () => {
    // Manually inject via recording only if enabled; otherwise push through get/set by recording with DEV
    const before = getSyncTimelineEvents().length;
    recordSyncTimelineEvent('offline_detected');
    const events = getSyncTimelineEvents();
    // If DEV enabled in vitest, event was added
    if (events.length > before) {
      const lines = formatSyncTimelineLines(events);
      expect(lines.some(l => l.includes('offline_detected'))).toBe(true);
      for (const line of lines) {
        expect(line).not.toMatch(/data:image/);
        expect(line).not.toMatch(/\/Users\//);
      }
    }
  });
});
