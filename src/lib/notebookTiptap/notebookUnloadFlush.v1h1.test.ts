/**
 * V1-H1 — Notebook pending debounce flush via global editor registry.
 * Mirrors ProjectNotebookBlock flushNotebookPersist semantics without mounting React.
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  flushAllFreeSpacePersistence,
  registerEditorPersistFlush,
  registerFreeSpacePersistFlush,
  resetFreeSpacePersistFlushForTests,
} from '../freeSpacePersistFlush';

afterEach(() => {
  resetFreeSpacePersistFlushForTests();
  vi.useRealTimers();
});

describe('notebook debounce → global unload flush (V1-H1)', () => {
  it('A. edit → wait normal debounce → content committed', async () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    let pending: { content: { body: string }; commit: typeof commit } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flushNotebookPersist = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pending) return;
      const p = pending;
      pending = null;
      p.commit(p.content);
    };

    // simulate pushContent
    pending = { content: { body: 'after-debounce' }, commit };
    timer = setTimeout(flushNotebookPersist, 420);

    await vi.advanceTimersByTimeAsync(420);
    expect(commit).toHaveBeenCalledWith({ body: 'after-debounce' });
    expect(pending).toBeNull();
  });

  it('B. edit → flush before debounce expires → latest content persists into storage snapshot', () => {
    vi.useFakeTimers();
    const storageBodies: string[] = [];
    let pending: { content: { body: string }; commit: (c: { body: string }) => void } | null =
      null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let durableBody: string | null = null;

    const flushNotebookPersist = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pending) return;
      const p = pending;
      pending = null;
      p.commit(p.content);
    };

    registerEditorPersistFlush(flushNotebookPersist);
    registerFreeSpacePersistFlush(() => {
      if (durableBody != null) storageBodies.push(durableBody);
    });

    pending = {
      content: { body: 'latest-typed' },
      commit: c => {
        durableBody = c.body;
      },
    };
    timer = setTimeout(flushNotebookPersist, 420);

    // Unload before 420ms
    flushAllFreeSpacePersistence();

    expect(pending).toBeNull();
    expect(durableBody).toBe('latest-typed');
    expect(storageBodies).toEqual(['latest-typed']);
    // Timer must not double-commit later
    vi.advanceTimersByTime(420);
    expect(storageBodies).toEqual(['latest-typed']);
  });

  it('C. repeated flush is safe', () => {
    let commits = 0;
    let pending: { content: { body: string }; commit: () => void } | null = {
      content: { body: 'x' },
      commit: () => {
        commits += 1;
      },
    };
    const flushNotebookPersist = () => {
      if (!pending) return;
      const p = pending;
      pending = null;
      p.commit();
    };
    registerEditorPersistFlush(flushNotebookPersist);
    flushAllFreeSpacePersistence();
    flushAllFreeSpacePersistence();
    expect(commits).toBe(1);
  });

  it('D. unregister leaves no stale flush callback', () => {
    const calls: string[] = [];
    let pending: { body: string } | null = { body: 'stale-obj' };
    const flushA = () => {
      if (!pending) return;
      calls.push(`a:${pending.body}`);
      pending = null;
    };
    const unreg = registerEditorPersistFlush(flushA);
    unreg();
    pending = { body: 'should-not-flush-via-a' };
    registerEditorPersistFlush(() => {
      calls.push('b-only');
    });
    flushAllFreeSpacePersistence();
    expect(calls).toEqual(['b-only']);
  });
});
