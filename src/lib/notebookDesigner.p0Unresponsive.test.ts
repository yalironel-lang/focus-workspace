/**
 * P0 — Notebook shell ResizeObserver / sticky toolbar must not main-thread lock.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  nextNotebookSurfaceWidthPx,
  resolveNotebookDesignerContainerMode,
} from './notebookDesignerLayout';
import { nbProductToolbarShellStyle } from '../components/notebook/tiptap/notebookProductToolbarChrome';
import { notebookAppearanceStudyPageStyle, resolveNotebookAppearanceVisualTokens } from './notebookAppearanceVisualTokens';
import { appearanceFromNotebookDesignPreset } from './notebookAppearance';

describe('P0 page-unresponsive guards', () => {
  it('nextNotebookSurfaceWidthPx rounds and suppresses no-op updates', () => {
    expect(nextNotebookSurfaceWidthPx(800, 800.4)).toBe(800);
    expect(nextNotebookSurfaceWidthPx(800, 800.6)).toBe(801);
    expect(nextNotebookSurfaceWidthPx(801, 801.2)).toBe(801);
    // Simulated scrollbar oscillation around the same rounded width stays idle.
    let w = 900;
    for (let i = 0; i < 200; i++) {
      const measured = i % 2 === 0 ? 900.2 : 899.6;
      const next = nextNotebookSurfaceWidthPx(w, measured);
      expect(next).toBe(900);
      w = next;
    }
  });

  it('Designer closed path: study page stays overflow visible (sticky works) without toolbar blur', () => {
    const page = notebookAppearanceStudyPageStyle(
      resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('classic')),
    );
    expect(page.overflow).toBe('visible');
    const toolbar = nbProductToolbarShellStyle();
    expect(toolbar.position).toBe('sticky');
    expect(toolbar.backdropFilter).toBeUndefined();
    expect(resolveNotebookDesignerContainerMode(900)).toBe('panel');
    expect(resolveNotebookDesignerContainerMode(400)).toBe('sheet');
  });

  it('appearance token resolve is bounded (no pathological per-call cost)', () => {
    const appearance = appearanceFromNotebookDesignPreset('aurora');
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) {
      resolveNotebookAppearanceVisualTokens(appearance);
    }
    const ms = performance.now() - t0;
    // Generous ceiling — local CI variance; catches accidental O(n²) regressions.
    expect(ms).toBeLessThan(1500);
  });
});
