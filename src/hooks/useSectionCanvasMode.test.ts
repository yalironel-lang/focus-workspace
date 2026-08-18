import { createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSaveStatusForTests } from '../lib/saveStatus';
import { VIEWPORT_PERSIST_DEBOUNCE_MS } from '../lib/viewportPersist';
import { useSectionCanvasMode, type SectionCanvasState } from './useSectionCanvasMode';

const SECTION = 'viewport-hook-test';
const VIEWPORT_KEY = `fw_section_${SECTION}_free_space_viewport_v1`;

let latest: SectionCanvasState | null = null;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Probe({ sectionId }: { sectionId: string }) {
  const state = useSectionCanvasMode(sectionId);
  useEffect(() => {
    latest = state;
  });
  latest = state;
  return null;
}

function mountHook(sectionId = SECTION): SectionCanvasState {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(Probe, { sectionId }));
  });
  if (!latest) throw new Error('hook did not mount');
  return latest;
}

function viewportDisk(): string | null {
  return localStorage.getItem(VIEWPORT_KEY);
}

function dispatchViewportStorage(v: { zoom: number; panX: number; panY: number }): void {
  const ev = new StorageEvent('storage', {
    key: VIEWPORT_KEY,
    newValue: JSON.stringify(v),
    storageArea: localStorage,
  });
  act(() => {
    window.dispatchEvent(ev);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  latest = null;
  localStorage.clear();
  resetSaveStatusForTests();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  resetSaveStatusForTests();
});

describe('useSectionCanvasMode viewport ownership', () => {
  it('restores viewport from disk on mount (reload)', () => {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify({ zoom: 1.25, panX: 80, panY: -12 }));
    const s = mountHook();
    expect(s.zoom).toBe(1.25);
    expect(s.panX).toBe(80);
    expect(s.panY).toBe(-12);
  });

  it('does not persist hydrate/mount when disk already has the viewport', () => {
    const raw = JSON.stringify({ zoom: 1, panX: 40, panY: 40 });
    localStorage.setItem(VIEWPORT_KEY, raw);
    const spy = vi.spyOn(localStorage, 'setItem');
    mountHook();
    act(() => {
      vi.advanceTimersByTime(VIEWPORT_PERSIST_DEBOUNCE_MS + 20);
    });
    expect(spy.mock.calls.some(call => String(call[0]) === VIEWPORT_KEY)).toBe(false);
  });

  it('persists a local viewport change after debounce', () => {
    mountHook();
    act(() => {
      latest!.setPan(-100, 50);
    });
    expect(viewportDisk()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(VIEWPORT_PERSIST_DEBOUNCE_MS + 20);
    });
    expect(viewportDisk()).toBe(JSON.stringify({ zoom: 1, panX: -100, panY: 50 }));
  });

  it('does not persist when remote storage applies at idle', () => {
    mountHook();
    dispatchViewportStorage({ zoom: 1, panX: -176, panY: -77 });
    expect(latest!.panX).toBe(-176);
    expect(latest!.panY).toBe(-77);
    act(() => {
      vi.advanceTimersByTime(VIEWPORT_PERSIST_DEBOUNCE_MS + 20);
    });
    expect(viewportDisk()).toBeNull();
  });

  it('does not write back when the two-client storage path applies twice', () => {
    mountHook();
    const spy = vi.spyOn(localStorage, 'setItem');
    dispatchViewportStorage({ zoom: 1, panX: -176, panY: -77 });
    act(() => {
      vi.advanceTimersByTime(VIEWPORT_PERSIST_DEBOUNCE_MS + 20);
    });
    dispatchViewportStorage({ zoom: 1, panX: -176, panY: -77 });
    act(() => {
      vi.advanceTimersByTime(VIEWPORT_PERSIST_DEBOUNCE_MS + 20);
    });
    expect(spy.mock.calls.some(call => String(call[0]) === VIEWPORT_KEY)).toBe(false);
  });

  it('ignores remote storage while local navigation is active', () => {
    const s = mountHook();
    act(() => {
      s.beginLocalNavigation();
    });
    dispatchViewportStorage({ zoom: 1, panX: -500, panY: -500 });
    expect(latest!.panX).toBe(40);
    expect(latest!.panY).toBe(40);
    expect(latest!.isLocalNavigationActive()).toBe(true);
  });

  it('releases navigation ownership so a later remote can apply', () => {
    mountHook();
    act(() => {
      latest!.beginLocalNavigation();
      latest!.endLocalNavigation();
    });
    expect(latest!.isLocalNavigationActive()).toBe(false);
    dispatchViewportStorage({ zoom: 1, panX: -90, panY: 12 });
    expect(latest!.panX).toBe(-90);
    expect(latest!.panY).toBe(12);
  });

  it('keeps the local final viewport after navigation and persists it, not a stale remote', () => {
    mountHook();
    act(() => {
      latest!.beginLocalNavigation();
    });
    dispatchViewportStorage({ zoom: 1, panX: -176, panY: -77 });
    act(() => {
      latest!.setPan(-10, -20);
      latest!.endLocalNavigation();
    });
    expect(latest!.panX).toBe(-10);
    expect(latest!.panY).toBe(-20);
    dispatchViewportStorage({ zoom: 1, panX: -176, panY: -77 });
    expect(latest!.panX).toBe(-10);
    expect(latest!.panY).toBe(-20);
    act(() => {
      vi.advanceTimersByTime(VIEWPORT_PERSIST_DEBOUNCE_MS + 20);
    });
    expect(viewportDisk()).toBe(JSON.stringify({ zoom: 1, panX: -10, panY: -20 }));
  });

  it('debounces rapid local pan commits into one persist write', () => {
    mountHook();
    act(() => {
      latest!.setPan(1, 1);
      latest!.setPan(2, 2);
      latest!.setPan(3, 3);
    });
    expect(viewportDisk()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(VIEWPORT_PERSIST_DEBOUNCE_MS + 20);
    });
    expect(viewportDisk()).toBe(JSON.stringify({ zoom: 1, panX: 3, panY: 3 }));
  });
});
