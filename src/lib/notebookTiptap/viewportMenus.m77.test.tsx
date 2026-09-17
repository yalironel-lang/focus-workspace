/**
 * M7.7 — viewport-anchored menu clamp + coarse table size cell contract.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { computeViewportAnchoredMenuPosition } from './viewportAnchoredMenu';
import { NotebookTiptapCandidateTableSizePicker } from '../../components/notebook/tiptap/NotebookTiptapCandidateTableSizePicker';

describe('computeViewportAnchoredMenuPosition', () => {
  it('clamps near bottom-right of a narrow viewport', () => {
    vi.stubGlobal('innerWidth', 768);
    vi.stubGlobal('innerHeight', 1024);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 768, height: 1024, addEventListener() {}, removeEventListener() {} },
    });

    const pos = computeViewportAnchoredMenuPosition({
      anchor: { top: 980, bottom: 1000, left: 700, right: 740, width: 40, height: 20 },
      menuWidth: 280,
      menuHeight: 160,
    });
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + 280).toBeLessThanOrEqual(768 - 8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.placement).toBe('above');
  });

  it('prefers below when space allows', () => {
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 800);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 1024, height: 800, addEventListener() {}, removeEventListener() {} },
    });
    const pos = computeViewportAnchoredMenuPosition({
      anchor: { top: 40, bottom: 70, left: 20, right: 60, width: 40, height: 30 },
      menuWidth: 200,
      menuHeight: 120,
    });
    expect(pos.placement).toBe('below');
    expect(pos.top).toBeGreaterThanOrEqual(70);
  });
});

describe('table size picker touch cell contract', () => {
  it('uses >=28px cells when pointer is coarse', async () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const anchorRef = { current: anchor };
    const root = createRoot(host);

    act(() => {
      root.render(
        createElement(NotebookTiptapCandidateTableSizePicker, {
          open: true,
          onClose: () => {},
          onPick: () => {},
          anchorRef,
        }),
      );
    });

    await vi.waitFor(() => {
      const cell = document.querySelector('[data-nb-candidate-table-size-cell]') as HTMLElement | null;
      expect(cell).toBeTruthy();
      expect(cell!.getAttribute('data-nb-table-size-cell-px')).toBe('28');
      expect(cell!.style.minWidth).toBe('28px');
      expect(cell!.style.minHeight).toBe('28px');
    });

    const picker = document.querySelector('[data-nb-candidate-table-size-picker]') as HTMLElement;
    expect(picker.style.position).toBe('fixed');
    expect(picker.getAttribute('data-nb-table-size-coarse')).toBe('1');

    act(() => root.unmount());
    host.remove();
    anchor.remove();
  });

  it('keeps compact 14px cells on fine pointer', async () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const root = createRoot(host);

    act(() => {
      root.render(
        createElement(NotebookTiptapCandidateTableSizePicker, {
          open: true,
          onClose: () => {},
          onPick: () => {},
          anchorRef: { current: anchor },
        }),
      );
    });

    await vi.waitFor(() => {
      const cell = document.querySelector('[data-nb-candidate-table-size-cell]') as HTMLElement | null;
      expect(cell).toBeTruthy();
      expect(cell!.getAttribute('data-nb-table-size-cell-px')).toBe('14');
    });

    act(() => root.unmount());
    host.remove();
    anchor.remove();
  });
});
