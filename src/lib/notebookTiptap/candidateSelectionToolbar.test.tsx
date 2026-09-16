/**
 * M4.1 TipTap candidate selection toolbar + format adapter.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import {
  readCandidateFormatState,
  runCandidateFormatCommand,
} from './candidateFormatCommands';
import { hasBidiControlChars } from './direction';
import {
  isNotebookTiptapCandidateActive,
  isNotebookTiptapCandidateEnabled,
} from './featureFlag';

const { NotebookTiptapCandidateEditor } = await import(
  '../../components/notebook/tiptap/NotebookTiptapCandidateEditor'
);
const { NotebookTiptapCandidateSelectionToolbar } = await import(
  '../../components/notebook/tiptap/NotebookTiptapCandidateSelectionToolbar'
);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(el: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(el);
  });
}

function makeEditor(body: string) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: bodyToTiptapDoc(body),
    editable: true,
  });
}

/** Select a substring by plain text offset within the first textblock. */
function selectPlainRange(ed: Editor, start: number, end: number) {
  let pos = 1;
  const text = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\0');
  // Prefer absolute doc search for the slice
  const needle = text.slice(start, end);
  let foundFrom: number | null = null;
  ed.state.doc.descendants((node, nodePos) => {
    if (foundFrom != null) return false;
    if (!node.isText || !node.text) return;
    const idx = node.text.indexOf(needle);
    if (idx >= 0 && needle.length > 0) {
      foundFrom = nodePos + idx;
      return false;
    }
  });
  if (foundFrom == null) {
    // Fallback: setTextSelection using relative offsets in first paragraph
    ed.chain().focus().setTextSelection({ from: pos + start, to: pos + end }).run();
    return;
  }
  ed.chain()
    .focus()
    .setTextSelection({ from: foundFrom, to: foundFrom + (end - start) })
    .run();
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

describe('candidateFormatCommands adapter', () => {
  it('Bold applies only to selected text; selection preserved', () => {
    const ed = makeEditor('This is an important concept');
    selectPlainRange(ed, 'This is an '.length, 'This is an important concept'.length);
    const before = ed.state.selection;
    expect(runCandidateFormatCommand(ed, { type: 'toggleBold' })).toBe(true);
    const after = ed.state.selection;
    expect(after.from).toBe(before.from);
    expect(after.to).toBe(before.to);
    expect(ed.isActive('bold')).toBe(true);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('important concept');
    expect(body).toContain('"t":"b"');
    // Unselected prefix stays in plain text
    expect(body).toContain('This is an');
    ed.destroy();
  });

  it('Italic / Underline / Strike toggle on selection', () => {
    const ed = makeEditor('Hello world');
    selectPlainRange(ed, 0, 5);
    expect(runCandidateFormatCommand(ed, { type: 'toggleItalic' })).toBe(true);
    expect(ed.isActive('italic')).toBe(true);
    expect(runCandidateFormatCommand(ed, { type: 'toggleUnderline' })).toBe(true);
    expect(ed.isActive('underline')).toBe(true);
    expect(runCandidateFormatCommand(ed, { type: 'toggleStrike' })).toBe(true);
    expect(ed.isActive('strike')).toBe(true);
    ed.destroy();
  });

  it('font size / color / highlight apply and clearFormatting resets', () => {
    const ed = makeEditor('Styled text here');
    selectPlainRange(ed, 0, 6);
    expect(runCandidateFormatCommand(ed, { type: 'setFontSize', px: 24 })).toBe(true);
    expect(runCandidateFormatCommand(ed, { type: 'setTextColor', color: '#fca5a5' })).toBe(true);
    expect(runCandidateFormatCommand(ed, { type: 'setHighlight', color: '#fef08a' })).toBe(true);
    let st = readCandidateFormatState(ed);
    expect(st.fontSizePx).toBe(24);
    expect(st.highlight).toBe('#fef08a');
    expect(runCandidateFormatCommand(ed, { type: 'clearFormatting' })).toBe(true);
    st = readCandidateFormatState(ed);
    expect(st.bold).toBe(false);
    expect(st.italic).toBe(false);
    expect(st.fontSizePx).toBeNull();
    expect(st.color == null || st.color === '').toBe(true);
    ed.destroy();
  });

  it('collapsed selection rejects format commands', () => {
    const ed = makeEditor('Hello');
    ed.commands.focus('end');
    expect(ed.state.selection.empty).toBe(true);
    expect(runCandidateFormatCommand(ed, { type: 'toggleBold' })).toBe(false);
    ed.destroy();
  });

  it('Hebrew selection formatting preserves text and no bidi controls', () => {
    const ed = makeEditor('זה רעיון חשוב מאוד');
    selectPlainRange(ed, 3, 8);
    const beforeSel = { from: ed.state.selection.from, to: ed.state.selection.to };
    expect(runCandidateFormatCommand(ed, { type: 'toggleBold' })).toBe(true);
    expect(ed.state.selection.from).toBe(beforeSel.from);
    expect(ed.state.selection.to).toBe(beforeSel.to);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('זה');
    expect(body).toContain('רעיון');
    expect(hasBidiControlChars(body)).toBe(false);
    ed.destroy();
  });

  it('mixed Hebrew/English selection formats without corrupting text', () => {
    const src = 'המודל predicts higher demand בשנת 2026';
    const ed = makeEditor(src);
    const start = src.indexOf('predicts');
    selectPlainRange(ed, start, start + 'predicts'.length);
    expect(runCandidateFormatCommand(ed, { type: 'toggleItalic' })).toBe(true);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('המודל');
    expect(body).toContain('predicts');
    expect(body).toContain('2026');
    expect(hasBidiControlChars(body)).toBe(false);
    ed.destroy();
  });

  it('inline math source survives surrounding formatting + serialization', () => {
    const src = 'הפונקציה $f(x)=x^2+1$ היא רציפה';
    const ed = makeEditor(src);
    // Select Hebrew word before math
    selectPlainRange(ed, 0, 'הפונקציה'.length);
    expect(runCandidateFormatCommand(ed, { type: 'toggleBold' })).toBe(true);
    // Select after math
    const after = ' היא רציפה';
    const idx = src.indexOf(after.trim());
    selectPlainRange(ed, idx, src.length);
    expect(runCandidateFormatCommand(ed, { type: 'setTextColor', color: '#93c5fd' })).toBe(true);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('$f(x)=x^2+1$');
    expect(hasBidiControlChars(body)).toBe(false);
    ed.destroy();
  });
});

describe('NotebookTiptapCandidateSelectionToolbar visibility', () => {
  it('toolbar hidden with collapsed selection; visible with non-empty selection', async () => {
    const ed = makeEditor('Select me please');
    const mountPoint = document.createElement('div');
    document.body.appendChild(mountPoint);
    mountPoint.appendChild(ed.view.dom);

    mount(createElement(NotebookTiptapCandidateSelectionToolbar, { editor: ed }));

    act(() => {
      ed.commands.focus('end');
    });
    expect(ed.state.selection.empty).toBe(true);

    // No selection → product formatting toolbar closed (engineering sel-diag is opt-in).
    expect(
      document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]'),
    ).toBeNull();

    act(() => {
      selectPlainRange(ed, 0, 6);
    });
    expect(ed.state.selection.empty).toBe(false);

    await vi.waitFor(() => {
      const el = document.querySelector(
        '[data-nb-candidate-selection-toolbar-open="1"]',
      ) as HTMLElement | null;
      expect(el).toBeTruthy();
      expect(el!.style.position).toBe('fixed');
    });

    const boldBtn = document.querySelector(
      '[data-nb-candidate-fmt="bold"]',
    ) as HTMLButtonElement | null;
    expect(boldBtn).toBeTruthy();
    const from = ed.state.selection.from;
    const to = ed.state.selection.to;
    act(() => {
      boldBtn!.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
      );
    });
    expect(ed.state.selection.from).toBe(from);
    expect(ed.state.selection.to).toBe(to);
    expect(ed.isActive('bold')).toBe(true);
    expect(tiptapDocToBody(ed.getJSON())).toContain('"t":"b"');

    act(() => {
      ed.commands.setTextSelection(ed.state.selection.to);
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]'),
      ).toBeNull();
    });

    ed.destroy();
    mountPoint.remove();
  });

  it('real candidate EditorContent path opens toolbar on text selection', async () => {
    let ed: Editor | null = null;
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'This is an important concept',
        pageKey: 'vis-qa',
        onReady,
        onEditorReady: next => {
          ed = next;
        },
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => expect(ed).toBeTruthy());

    act(() => {
      // "important concept" — positions after doc open + paragraph open
      ed!.chain().focus().setTextSelection({ from: 12, to: 29 }).run();
    });

    await vi.waitFor(() => {
      const bar = document.querySelector(
        '[data-nb-candidate-selection-toolbar-open="1"]',
      ) as HTMLElement | null;
      expect(bar).toBeTruthy();
      expect(bar!.style.position).toBe('fixed');
      expect(Number.parseInt(bar!.style.zIndex || '0', 10)).toBeGreaterThanOrEqual(10200);
    });
  });

  it('real candidate Bold via capture pointerdown applies mark and keeps selection', async () => {
    let ed: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'This is an important concept',
        pageKey: 'bold-qa',
        onEditorReady: next => {
          ed = next;
        },
      }),
    );
    await vi.waitFor(() => expect(ed).toBeTruthy());

    act(() => {
      ed!.chain().focus().setTextSelection({ from: 12, to: 29 }).run();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-nb-candidate-fmt="bold"]')).toBeTruthy();
    });

    const from = ed!.state.selection.from;
    const to = ed!.state.selection.to;
    const boldBtn = document.querySelector('[data-nb-candidate-fmt="bold"]') as HTMLButtonElement;
    act(() => {
      boldBtn.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
      );
    });

    expect(ed!.isActive('bold')).toBe(true);
    expect(ed!.state.selection.from).toBe(from);
    expect(ed!.state.selection.to).toBe(to);
    expect(tiptapDocToBody(ed!.getJSON())).toContain('"t":"b"');
    expect(tiptapDocToBody(ed!.getJSON())).toContain('important concept');
  });

  it('pageKey reset hides selection by remounting pristine editor', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello candidate',
        pageKey: 'page-a',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(host!.querySelector('[data-nb-product-toolbar="1"]')).toBeTruthy();
    expect(host!.textContent).not.toMatch(/Temp DEV tools/i);

    act(() => {
      root!.render(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: 'Other page body',
          pageKey: 'page-b',
          onReady,
        }),
      );
    });
    await vi.waitFor(() => {
      expect(
        host!.querySelector('[data-nb-candidate-page]')?.getAttribute('data-nb-candidate-page'),
      ).toBe('page-b');
    });
    expect(
      document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]'),
    ).toBeNull();
  });

  it('candidate has no persistence props and no candidate badge chrome', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'x',
        pageKey: 'p1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0][0].persistence).toBe(false);
    expect(host!.querySelector('[data-nb-candidate-persistence="never"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-candidate-badge="1"]')).toBeNull();
    expect(host!.textContent).not.toMatch(/TipTap candidate/i);
    expect(host!.querySelector('[data-nb-product-toolbar="1"]')).toBeTruthy();
  });
});

describe('candidate flag OFF leaves CE path conceptually unchanged', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults ON (M7.1A body editor)', () => {
    expect(isNotebookTiptapCandidateEnabled()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(true);
  });
});


describe('M4.1 complete pointer gesture', () => {
  it('keeps font-size menu open after a delayed compatibility mousedown', async () => {
    const ed = makeEditor('Hello שלום');
    mount(createElement(NotebookTiptapCandidateSelectionToolbar, { editor: ed }));
    act(() => { ed.commands.setTextSelection({ from: 1, to: 6 }); });
    const button = document.querySelector('[data-nb-candidate-fmt="fontSize"]')!;
    act(() => { button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
    expect(document.querySelector('[data-nb-candidate-fontsize-menu]')).toBeTruthy();
    await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
    act(() => { button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    expect(document.querySelector('[data-nb-candidate-fontsize-menu]')).toBeTruthy();
    ed.destroy();
  });
});

describe('M4.1 real editor gestures and isolation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('all formatting gestures fire once, keep selection, render font sizes, and never write storage', async () => {
    const storageWrite = vi.fn();
    const dbOpen = vi.fn();
    const network = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: storageWrite, removeItem: storageWrite });
    vi.stubGlobal('indexedDB', { open: dbOpen });
    vi.stubGlobal('fetch', network);
    let ed: Editor | null = null;
    mount(createElement(NotebookTiptapCandidateEditor, {
      sourceDocumentBody: 'prefix שלום world suffix', pageKey: 'm41-gestures',
      onEditorReady: next => { ed = next; },
    }));
    await vi.waitFor(() => expect(ed).toBeTruthy());
    act(() => { ed!.commands.setTextSelection({ from: 8, to: 18 }); });
    let changes = 0;
    ed!.on('transaction', ({ transaction }) => { if (transaction.docChanged) changes++; });
    async function gesture(selector: string, expectedChanges = 1) {
      const btn = document.querySelector(selector)!;
      expect(btn).toBeTruthy();
      const before = changes;
      act(() => { btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
      await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
      act(() => {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      });
      expect(changes - before).toBe(expectedChanges);
      expect(ed!.state.selection.from).toBe(8);
      expect(ed!.state.selection.to).toBe(18);
    }
    for (const id of ['bold', 'italic', 'underline', 'strike']) await gesture(`[data-nb-candidate-fmt="${id}"]`);
    await gesture('[data-nb-candidate-fmt="color"]');
    await gesture('[data-nb-candidate-fmt="highlight"]');
    for (const px of [12, 14, 16, 18, 20, 24, 28, 32]) {
      await gesture('[data-nb-candidate-fmt="fontSize"]', 0);
      await gesture(`[data-nb-candidate-fmt="fontSize-${px}"]`);
      expect(readCandidateFormatState(ed!).fontSizePx).toBe(px === 18 ? null : px);
      if (px !== 18) expect(host!.querySelector(`[style*="font-size: ${px}px"]`)).toBeTruthy();
    }
    await gesture('[data-nb-candidate-fmt="clear"]');
    // A second gesture on the same mounted control must still work.
    await gesture('[data-nb-candidate-fmt="bold"]');
    await gesture('[data-nb-candidate-fmt="bold"]');
    expect(ed!.state.doc.textContent).toBe('prefix שלום world suffix');
    expect(storageWrite).not.toHaveBeenCalled();
    expect(dbOpen).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    act(() => root!.render(createElement(NotebookTiptapCandidateEditor, {
      sourceDocumentBody: 'Other page', pageKey: 'm41-other',
      onEditorReady: next => { ed = next; },
    })));
    expect(ed!.state.doc.textContent).toBe('Other page');
    expect(document.querySelector('[data-nb-candidate-selection-toolbar]')).toBeNull();
  });

  it('restores saved selection when it collapses during toolbar interaction', () => {
    const ed = makeEditor('abc def');
    mount(createElement(NotebookTiptapCandidateSelectionToolbar, { editor: ed }));
    act(() => { ed.commands.setTextSelection({ from: 1, to: 4 }); });
    const btn = document.querySelector('[data-nb-candidate-fmt="bold"]')!;
    act(() => {
      ed.commands.setTextSelection(7);
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(ed.state.selection.from).toBe(1);
    expect(ed.state.selection.to).toBe(4);
    expect(readCandidateFormatState(ed).bold).toBe(true);
    ed.destroy();
  });
});
