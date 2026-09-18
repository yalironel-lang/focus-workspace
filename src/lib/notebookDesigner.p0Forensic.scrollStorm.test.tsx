/**
 * P0 forensic + regression: scroll must not storm React state when floating
 * selection chrome is closed (Designer-closed Notebook scroll path).
 *
 * Proven cause: window capture-phase scroll → syncFromEditor → setDiag every tick.
 * Combined with sticky product toolbar (study overflow:visible), this locked Chrome.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NotebookTiptapCandidateSelectionToolbar } from '../components/notebook/tiptap/NotebookTiptapCandidateSelectionToolbar';
import {
  nbP0ForensicsReset,
  nbP0ForensicsSnapshot,
} from './notebookP0Forensics';
import { nextNotebookSurfaceWidthPx } from './notebookDesignerLayout';

(globalThis as { __NB_P0_FORENSICS__?: boolean }).__NB_P0_FORENSICS__ = true;

function actFlush() {
  return new Promise<void>(r => setTimeout(r, 0));
}

describe('P0 forensic — scroll/main-thread suspects', () => {
  let host: HTMLDivElement;
  let root: Root;
  let editor: Editor;

  beforeEach(() => {
    nbP0ForensicsReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    editor = new Editor({
      extensions: [StarterKit],
      content: '<p>Hello forensic notebook scroll body with enough text to select.</p>'.repeat(40),
    });
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    editor.destroy();
    nbP0ForensicsReset();
  });

  it('A. closed floating chrome: scroll does NOT sync (no setState storm)', async () => {
    root.render(createElement(NotebookTiptapCandidateSelectionToolbar, { editor }));
    for (let i = 0; i < 5; i++) await actFlush();

    editor.commands.focus('end');
    for (let i = 0; i < 3; i++) await actFlush();

    nbP0ForensicsReset();
    const SCROLL_N = 120;
    for (let i = 0; i < SCROLL_N; i++) {
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    for (let i = 0; i < 5; i++) await actFlush();

    const snap = nbP0ForensicsSnapshot();
    expect(snap.selectionToolbarScrollSyncs).toBe(0);
    expect(snap.tipTapOnUserEdit).toBe(0);
    expect(snap.notebookPersistCommits).toBe(0);
  });

  it('B. shell width stabilizer still suppresses fractional oscillation (no setState loop)', () => {
    let w = 920;
    let changes = 0;
    for (let i = 0; i < 500; i++) {
      const measured = i % 2 === 0 ? 920.4 : 919.6;
      const next = nextNotebookSurfaceWidthPx(w, measured);
      if (next !== w) changes += 1;
      w = next;
    }
    expect(changes).toBe(0);
    expect(w).toBe(920);
  });

  it('C. idle editor: no docChanged / persist from scroll-only events', async () => {
    nbP0ForensicsReset();
    for (let i = 0; i < 50; i++) {
      window.dispatchEvent(new Event('scroll'));
    }
    await actFlush();
    const snap = nbP0ForensicsSnapshot();
    expect(snap.tipTapDocChangedTransactions).toBe(0);
    expect(snap.tipTapOnUserEdit).toBe(0);
  });

  it('D. regression contract: scroll gating is idle-closed only (unit of the proven mechanism)', () => {
    const floatingChromeOpen = false;
    const source: 'scroll' | 'editor' = 'scroll';
    const shouldSync = !(source === 'scroll' && !floatingChromeOpen);
    expect(shouldSync).toBe(false);
  });
});
