// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./flushPendingFreeSpaceCreates', () => ({
  flushPendingFreeSpaceCreates: vi.fn(),
}));

import type { CacheNamespace } from '../focusCacheNamespace';
import type { FlushPendingFreeSpaceCreatesResult } from './flushPendingFreeSpaceCreates';
import {
  FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS,
  FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS,
  invalidateFreeSpaceAutoFlushScope,
  registerFreeSpaceAutoFlushScope,
  requestFreeSpacePendingFlushNow,
  resetFreeSpaceAutoFlushForTests,
  scheduleFreeSpacePendingFlush,
  setFreeSpaceAutoFlushImplForTests,
  setFreeSpaceAutoFlushOnlineForTests,
} from './freeSpaceObjectAutoFlush';
import { notifyFreeSpacePendingEnqueue } from './freeSpacePendingFlushTrigger';

const ns: CacheNamespace = {
  userId: 'user-1',
  workspaceId: 'section-1',
};

const otherNs: CacheNamespace = {
  userId: 'user-1',
  workspaceId: 'section-2',
};

function okResult(
  overrides: Partial<FlushPendingFreeSpaceCreatesResult> = {},
): FlushPendingFreeSpaceCreatesResult {
  return {
    processed: 1,
    removed: 1,
    skippedUnsupported: 0,
    skippedMalformed: 0,
    failedCloud: 0,
    ...overrides,
  };
}

function cloudFail(): FlushPendingFreeSpaceCreatesResult {
  return {
    processed: 1,
    removed: 0,
    skippedUnsupported: 0,
    skippedMalformed: 0,
    failedCloud: 1,
    stoppedReason: 'cloud_write_failed',
  };
}

const flushMock = vi.fn(async (): Promise<FlushPendingFreeSpaceCreatesResult> => okResult());

beforeEach(() => {
  vi.useFakeTimers();
  resetFreeSpaceAutoFlushForTests();
  setFreeSpaceAutoFlushOnlineForTests(true);
  flushMock.mockReset();
  flushMock.mockResolvedValue(okResult());
  setFreeSpaceAutoFlushImplForTests(flushMock);
});

afterEach(() => {
  resetFreeSpaceAutoFlushForTests();
  vi.useRealTimers();
});

describe('scheduleFreeSpacePendingFlush', () => {
  it('does not flush before the trailing debounce', async () => {
    scheduleFreeSpacePendingFlush(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS - 1);
    expect(flushMock).not.toHaveBeenCalled();
  });

  it('flushes once after debounce', async () => {
    scheduleFreeSpacePendingFlush(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
    expect(flushMock).toHaveBeenCalledTimes(1);
    expect(flushMock).toHaveBeenCalledWith(ns);
  });

  it('collapses duplicate schedules into one drain', async () => {
    scheduleFreeSpacePendingFlush(ns);
    scheduleFreeSpacePendingFlush(ns);
    scheduleFreeSpacePendingFlush(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it('resets trailing debounce on later enqueue', async () => {
    scheduleFreeSpacePendingFlush(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS - 50);
    scheduleFreeSpacePendingFlush(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS - 50);
    expect(flushMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it('does not flush when offline', async () => {
    setFreeSpaceAutoFlushOnlineForTests(false);
    scheduleFreeSpacePendingFlush(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
    expect(flushMock).not.toHaveBeenCalled();
  });

  it('does not schedule for an invalid namespace', async () => {
    scheduleFreeSpacePendingFlush({ userId: '', workspaceId: 'section-1' });
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
    expect(flushMock).not.toHaveBeenCalled();
  });

  it('bound enqueue notify schedules a debounced flush', async () => {
    notifyFreeSpacePendingEnqueue(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});

describe('requestFreeSpacePendingFlushNow', () => {
  it('drains immediately without waiting for debounce', async () => {
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it('does not flush when offline', async () => {
    setFreeSpaceAutoFlushOnlineForTests(false);
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    expect(flushMock).not.toHaveBeenCalled();
  });

  it('drains leftover ops on remount/requestNow', async () => {
    registerFreeSpaceAutoFlushScope(ns);
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});

describe('serialization', () => {
  it('runs one flush at a time and performs another drain pass if scheduled during flight', async () => {
    let release!: (value: FlushPendingFreeSpaceCreatesResult) => void;
    flushMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    flushMock.mockResolvedValue(okResult());

    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(1);

    requestFreeSpacePendingFlushNow(ns);
    requestFreeSpacePendingFlushNow(ns);
    expect(flushMock).toHaveBeenCalledTimes(1);

    release(okResult());
    await Promise.resolve();
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(2);
  });

  it('does not start a parallel flush for the same namespace', async () => {
    let active = 0;
    let maxActive = 0;
    const resolvers: Array<(value: FlushPendingFreeSpaceCreatesResult) => void> = [];
    flushMock.mockImplementation(
      () =>
        new Promise(resolve => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          resolvers.push(value => {
            active -= 1;
            resolve(value);
          });
        }),
    );

    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    expect(maxActive).toBe(1);
    expect(resolvers).toHaveLength(1);
    resolvers[0]?.(okResult());
    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(1);
    resolvers[1]?.(okResult());
    await Promise.resolve();
    expect(maxActive).toBe(1);
  });

  it('isolates namespaces', async () => {
    requestFreeSpacePendingFlushNow(ns);
    requestFreeSpacePendingFlushNow(otherNs);
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(2);
  });
});

describe('cloud_write_failed retry bound', () => {
  it('schedules exactly one delayed retry after a failed normal drain', async () => {
    flushMock.mockResolvedValue(cloudFail());
    scheduleFreeSpacePendingFlush(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
    expect(flushMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS - 1);
    expect(flushMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(flushMock).toHaveBeenCalledTimes(2);
  });

  it('does not recursively schedule another delayed retry if the delayed retry also fails', async () => {
    flushMock.mockResolvedValue(cloudFail());
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS);
    expect(flushMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS * 5);
    expect(flushMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a later external trigger after the bounded retry is exhausted', async () => {
    flushMock.mockResolvedValue(cloudFail());
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS);
    expect(flushMock).toHaveBeenCalledTimes(2);

    flushMock.mockResolvedValue(okResult());
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(3);
  });

  it('allows a later successful enqueue schedule after the bounded retry is exhausted', async () => {
    flushMock.mockResolvedValue(cloudFail());
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS);
    expect(flushMock).toHaveBeenCalledTimes(2);

    flushMock.mockResolvedValue(okResult());
    scheduleFreeSpacePendingFlush(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
    expect(flushMock).toHaveBeenCalledTimes(3);
  });
});

describe('scope invalidation', () => {
  it('cancels a pending debounce without deleting queue state', async () => {
    scheduleFreeSpacePendingFlush(ns);
    invalidateFreeSpaceAutoFlushScope(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
    expect(flushMock).not.toHaveBeenCalled();
  });

  it('cancels a pending delayed retry', async () => {
    flushMock.mockResolvedValue(cloudFail());
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(1);
    invalidateFreeSpaceAutoFlushScope(ns);
    await vi.advanceTimersByTimeAsync(FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS);
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it('ignores in-flight follow-up after invalidate', async () => {
    let release!: (value: FlushPendingFreeSpaceCreatesResult) => void;
    flushMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    requestFreeSpacePendingFlushNow(ns);
    await Promise.resolve();
    requestFreeSpacePendingFlushNow(ns);
    invalidateFreeSpaceAutoFlushScope(ns);
    release(okResult());
    await Promise.resolve();
    await Promise.resolve();
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});
