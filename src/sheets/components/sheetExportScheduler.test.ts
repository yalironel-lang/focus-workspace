import { describe, expect, it, vi } from 'vitest';
import {
  createSheetExportScheduler,
  SHEET_EXPORT_DEBOUNCE_MS,
} from '../components/sheetExportScheduler';

describe('sheetExportScheduler', () => {
  it('uses a 180ms trailing debounce', () => {
    expect(SHEET_EXPORT_DEBOUNCE_MS).toBe(180);
  });

  it('coalesces rapid schedule calls into one commit', () => {
    vi.useFakeTimers();
    const exportDocument = vi.fn(() => ({ n: 1 }));
    const commit = vi.fn();
    const alive = { value: true };
    const sched = createSheetExportScheduler({
      exportDocument,
      commit,
      isAlive: () => alive.value,
      debounceMs: 180,
    });
    sched.schedule();
    sched.schedule();
    sched.schedule();
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(179);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('flushes dirty state immediately and skips when not alive', () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const alive = { value: true };
    const sched = createSheetExportScheduler({
      exportDocument: () => ({ ok: true }),
      commit,
      isAlive: () => alive.value,
      debounceMs: 180,
    });
    sched.schedule();
    sched.flush();
    expect(commit).toHaveBeenCalledTimes(1);
    sched.schedule();
    alive.value = false;
    sched.flush();
    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('cancel drops pending commits', () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const sched = createSheetExportScheduler({
      exportDocument: () => ({}),
      commit,
      isAlive: () => true,
      debounceMs: 180,
    });
    sched.schedule();
    sched.cancel();
    vi.advanceTimersByTime(500);
    expect(commit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
