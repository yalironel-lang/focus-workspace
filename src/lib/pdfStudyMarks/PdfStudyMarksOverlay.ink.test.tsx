/**
 * PDF Annotate / Apple Pencil V1 — overlay pointer policy + stroke commit.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfStudyMarksOverlay } from '../../components/project-space/PdfStudyMarksOverlay';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { PdfInkStroke } from './types';

const tokens = {
  accent: '#2563eb',
} as unknown as AtmosphereTokens;

function mockRect(el: HTMLElement, width = 200, height = 300) {
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

function dispatchPointer(
  el: Element,
  type: string,
  init: {
    pointerId?: number;
    pointerType: string;
    clientX: number;
    clientY: number;
    pressure?: number;
    button?: number;
  },
) {
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType,
    clientX: init.clientX,
    clientY: init.clientY,
    pressure: init.pressure ?? 0.5,
    button: init.button ?? 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
  });
  el.dispatchEvent(ev);
}

describe('PdfStudyMarksOverlay ink V1', () => {
  let host: HTMLDivElement;
  let root: Root;
  let scrollHost: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    scrollHost = document.createElement('div');
    scrollHost.dataset.pdfScrollHost = '1';
    scrollHost.style.overflow = 'auto';
    scrollHost.scrollTop = 40;
    Object.defineProperty(scrollHost, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 40,
    });
    host.appendChild(scrollHost);
    const page = document.createElement('div');
    page.style.width = '200px';
    page.style.height = '300px';
    page.style.position = 'relative';
    scrollHost.appendChild(page);
    root = createRoot(page);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  function renderOverlay(opts: {
    tool: 'view' | 'highlight' | 'ink' | 'eraser';
    strokes?: PdfInkStroke[];
    onAddStroke?: ReturnType<typeof vi.fn>;
    onRemoveStroke?: ReturnType<typeof vi.fn>;
    page?: number;
  }) {
    const onAddStroke = opts.onAddStroke ?? vi.fn();
    const onRemoveStroke = opts.onRemoveStroke ?? vi.fn();
    const onAddRegion = vi.fn();
    const onRemoveRegion = vi.fn();
    act(() => {
      root.render(
        createElement(PdfStudyMarksOverlay, {
          page: opts.page ?? 1,
          tokens,
          regions: [],
          strokes: opts.strokes ?? [],
          tool: opts.tool,
          onAddRegion,
          onRemoveRegion,
          onAddStroke,
          onRemoveStroke,
        }),
      );
    });
    const overlay = scrollHost.querySelector('[data-pdf-page-overlay]') as HTMLElement;
    expect(overlay).toBeTruthy();
    mockRect(overlay);
    return { overlay, onAddStroke, onRemoveStroke };
  }

  it('1. pen draws in Annotate (ink) mode', () => {
    const { overlay, onAddStroke } = renderOverlay({ tool: 'ink' });
    act(() => {
      dispatchPointer(overlay, 'pointerdown', {
        pointerType: 'pen',
        clientX: 20,
        clientY: 30,
        pressure: 0.7,
      });
      dispatchPointer(overlay, 'pointermove', {
        pointerType: 'pen',
        clientX: 40,
        clientY: 50,
        pressure: 0.8,
      });
      dispatchPointer(overlay, 'pointerup', {
        pointerType: 'pen',
        clientX: 40,
        clientY: 50,
      });
    });
    expect(onAddStroke).toHaveBeenCalledTimes(1);
    const [, stroke] = onAddStroke.mock.calls[0]!;
    expect(stroke.points.length).toBeGreaterThanOrEqual(1);
    expect(stroke.points[0].x).toBeCloseTo(0.1, 5);
    expect(stroke.points[0].y).toBeCloseTo(0.1, 5);
  });

  it('2. touch does not draw', () => {
    const { overlay, onAddStroke } = renderOverlay({ tool: 'ink' });
    act(() => {
      dispatchPointer(overlay, 'pointerdown', {
        pointerType: 'touch',
        clientX: 20,
        clientY: 30,
      });
      dispatchPointer(overlay, 'pointermove', {
        pointerType: 'touch',
        clientX: 20,
        clientY: 10,
      });
      dispatchPointer(overlay, 'pointerup', {
        pointerType: 'touch',
        clientX: 20,
        clientY: 10,
      });
    });
    expect(onAddStroke).not.toHaveBeenCalled();
  });

  it('3. touch remains scroll-capable (forwards dy to pdf scroll host)', () => {
    const { overlay } = renderOverlay({ tool: 'ink' });
    const before = scrollHost.scrollTop;
    act(() => {
      dispatchPointer(overlay, 'pointerdown', {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 50,
        clientY: 100,
      });
      dispatchPointer(overlay, 'pointermove', {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 50,
        clientY: 80,
      });
      dispatchPointer(overlay, 'pointerup', {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 50,
        clientY: 80,
      });
    });
    // finger moved up 20px → scrollTop increases by 20 (content moves up)
    expect(scrollHost.scrollTop).toBe(before + 20);
  });

  it('9. pointer cancel does not commit broken stroke', () => {
    const { overlay, onAddStroke } = renderOverlay({ tool: 'ink' });
    act(() => {
      dispatchPointer(overlay, 'pointerdown', {
        pointerType: 'pen',
        clientX: 10,
        clientY: 10,
      });
      dispatchPointer(overlay, 'pointermove', {
        pointerType: 'pen',
        clientX: 30,
        clientY: 30,
      });
      dispatchPointer(overlay, 'pointercancel', {
        pointerType: 'pen',
        clientX: 30,
        clientY: 30,
      });
    });
    expect(onAddStroke).not.toHaveBeenCalled();
  });

  it('10. dot stroke persists (single point commit)', () => {
    const { overlay, onAddStroke } = renderOverlay({ tool: 'ink' });
    act(() => {
      dispatchPointer(overlay, 'pointerdown', {
        pointerType: 'pen',
        clientX: 100,
        clientY: 150,
      });
      dispatchPointer(overlay, 'pointerup', {
        pointerType: 'pen',
        clientX: 100,
        clientY: 150,
      });
    });
    expect(onAddStroke).toHaveBeenCalledTimes(1);
    expect(onAddStroke.mock.calls[0]![1].points).toHaveLength(1);
  });

  it('11. eraser removes only the intended stroke', () => {
    const strokes: PdfInkStroke[] = [
      { id: 'keep', color: '#000', width: 2, points: [{ x: 0.9, y: 0.9 }] },
      { id: 'kill', color: '#000', width: 2, points: [{ x: 0.1, y: 0.1 }] },
    ];
    const { overlay, onRemoveStroke } = renderOverlay({ tool: 'eraser', strokes });
    act(() => {
      dispatchPointer(overlay, 'pointerdown', {
        pointerType: 'pen',
        clientX: 20,
        clientY: 30,
      });
    });
    expect(onRemoveStroke).toHaveBeenCalledWith(1, 'kill');
  });

  it('6. per-page overlay identity: page prop isolates callbacks', () => {
    const onAddStroke = vi.fn();
    const { overlay } = renderOverlay({ tool: 'ink', page: 3, onAddStroke });
    act(() => {
      dispatchPointer(overlay, 'pointerdown', {
        pointerType: 'mouse',
        clientX: 10,
        clientY: 10,
      });
      dispatchPointer(overlay, 'pointerup', {
        pointerType: 'mouse',
        clientX: 10,
        clientY: 10,
      });
    });
    expect(onAddStroke).toHaveBeenCalledWith(3, expect.any(Object));
    expect(overlay.getAttribute('data-pdf-page-overlay')).toBe('3');
  });

  it('view mode: ink pointer does not draw', () => {
    const { overlay, onAddStroke } = renderOverlay({ tool: 'view' });
    act(() => {
      dispatchPointer(overlay, 'pointerdown', {
        pointerType: 'pen',
        clientX: 20,
        clientY: 30,
      });
      dispatchPointer(overlay, 'pointerup', {
        pointerType: 'pen',
        clientX: 20,
        clientY: 30,
      });
    });
    expect(onAddStroke).not.toHaveBeenCalled();
  });
});
