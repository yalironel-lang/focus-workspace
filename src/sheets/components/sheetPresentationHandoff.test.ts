/**
 * Documents the PR 3B presentation handoff ordering contract.
 * React remounts UOV from props in the same render as viewMode; therefore
 * canonical content must be flushed BEFORE viewMode changes.
 */
import { describe, expect, it, vi } from 'vitest';
import { createSheetExportScheduler } from './sheetExportScheduler';
import { flushSheetForObject, registerSheetFlush } from './sheetFlushRegistry';

describe('sheet presentation handoff ordering', () => {
  it('flushes pending dirty export before a simulated viewMode change', () => {
    vi.useFakeTimers();
    const commits: unknown[] = [];
    let viewMode: 'floating' | 'fullscreen' = 'floating';
    let canonical: unknown = { v: 'old' };
    let engineDoc: unknown = { v: 'old' };

    const sched = createSheetExportScheduler({
      exportDocument: () => engineDoc,
      commit: (doc) => {
        commits.push(doc);
        canonical = doc;
      },
      isAlive: () => true,
      debounceMs: 180,
    });
    const unreg = registerSheetFlush('sheet-1', () => sched.flush());

    // User types — debounce pending
    engineDoc = { v: 'dirty-a1' };
    sched.schedule();
    expect(commits).toHaveLength(0);
    expect(canonical).toEqual({ v: 'old' });

    // Presentation transition: flush THEN change mode (SectionPage contract)
    flushSheetForObject('sheet-1');
    viewMode = 'fullscreen';
    // New engine would mount from canonical — must already be dirty value
    expect(commits).toHaveLength(1);
    expect(canonical).toEqual({ v: 'dirty-a1' });
    expect(viewMode).toBe('fullscreen');

    // Debounce must not fire a second stale commit
    vi.advanceTimersByTime(500);
    expect(commits).toHaveLength(1);

    unreg();
    vi.useRealTimers();
  });
});
