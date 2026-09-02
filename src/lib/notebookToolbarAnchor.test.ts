/**
 * Floating toolbar placement — prefer above selection with clearance.
 */
import { describe, expect, it } from 'vitest';
import { computeToolbarAnchor } from './notebookSelectionToolbar';

describe('computeToolbarAnchor', () => {
  it('places toolbar above when there is room', () => {
    const rect = new DOMRect(200, 300, 120, 20);
    const a = computeToolbarAnchor(rect, 420, 80);
    expect(a.top).toBe(300 - 80 - 10);
    expect(a.left).toBe(200 + 60 - 210);
    expect(a.width).toBe(420);
  });

  it('falls back below when near top of viewport', () => {
    const rect = new DOMRect(200, 40, 120, 20);
    const a = computeToolbarAnchor(rect, 420, 80);
    expect(a.top).toBe(40 + 20 + 10);
  });

  it('clamps horizontally near left edge', () => {
    const rect = new DOMRect(10, 300, 40, 20);
    const a = computeToolbarAnchor(rect, 420, 80);
    expect(a.left).toBe(12);
  });

  it('clamps horizontally near right edge', () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const rect = new DOMRect(vw - 30, 300, 20, 20);
    const a = computeToolbarAnchor(rect, 420, 80);
    expect(a.left).toBe(vw - 420 - 12);
  });

  it('does not pull an above placement down onto the selection', () => {
    const rect = new DOMRect(400, 200, 100, 24);
    const a = computeToolbarAnchor(rect, 420, 80);
    expect(a.top + 80).toBeLessThanOrEqual(rect.top);
  });
});
