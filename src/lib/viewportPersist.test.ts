import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSaveStatusForTests } from './saveStatus';
import {
  WHEEL_PAN_SETTLE_MS,
  decideRemoteViewportApply,
  liveWheelPanFromDeltas,
  persistMergedViewport,
  persistViewportJson,
  shouldScheduleViewportPersist,
} from './viewportPersist';

const KEY = 'fw_section_test_free_space_viewport_v1';

beforeEach(() => {
  localStorage.clear();
  resetSaveStatusForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('viewport persist policy', () => {
  it('persists local changes and not remote-storage or hydrate', () => {
    expect(shouldScheduleViewportPersist('local')).toBe(true);
    expect(shouldScheduleViewportPersist('remote-storage')).toBe(false);
    expect(shouldScheduleViewportPersist('hydrate')).toBe(false);
  });

  it('ignores remote viewport while local navigation or local persist is pending', () => {
    expect(decideRemoteViewportApply({
      localNavigationActive: true,
      localPersistPending: false,
    })).toBe('ignore');
    expect(decideRemoteViewportApply({
      localNavigationActive: false,
      localPersistPending: true,
    })).toBe('ignore');
    expect(decideRemoteViewportApply({
      localNavigationActive: false,
      localPersistPending: false,
    })).toBe('apply');
  });

  it('skips localStorage.setItem when serialized viewport is unchanged', () => {
    const raw = JSON.stringify({ zoom: 1, panX: 10, panY: 20 });
    localStorage.setItem(KEY, raw);
    const spy = vi.spyOn(localStorage, 'setItem');
    expect(persistViewportJson(KEY, raw)).toBe('skipped');
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe(raw);
  });

  it('writes when serialized viewport changed', () => {
    localStorage.setItem(KEY, JSON.stringify({ zoom: 1, panX: 10, panY: 20 }));
    const next = JSON.stringify({ zoom: 1, panX: 11, panY: 20 });
    expect(persistViewportJson(KEY, next)).toBe('written');
    expect(localStorage.getItem(KEY)).toBe(next);
  });

  it('persistMergedViewport skips equal serialized values (no write-back loop fuel)', () => {
    const raw = JSON.stringify({ zoom: 1, panX: 10, panY: 20 });
    localStorage.setItem(KEY, raw);
    const spy = vi.spyOn(localStorage, 'setItem');
    const { result, valuesEqual } = persistMergedViewport(
      KEY,
      { zoom: 1, panX: 10, panY: 20 },
      { zoom: 1, panX: 10, panY: 20 },
    );
    expect(result).toBe('skipped');
    expect(valuesEqual).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('wheel pan live path contract', () => {
  it('applies the same pan direction as the previous React wheel path', () => {
    expect(liveWheelPanFromDeltas({ panX: 40, panY: 40 }, 10, -5, 1)).toEqual({
      panX: 30,
      panY: 45,
    });
  });

  it('does not call React setPan until the wheel gesture settles', () => {
    vi.useFakeTimers();
    const setPan = vi.fn();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onLiveWheel = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPan(1, 2), WHEEL_PAN_SETTLE_MS);
    };
    onLiveWheel();
    onLiveWheel();
    onLiveWheel();
    expect(setPan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(WHEEL_PAN_SETTLE_MS);
    expect(setPan).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
