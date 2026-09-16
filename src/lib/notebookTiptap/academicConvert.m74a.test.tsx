/**
 * M7.4A — Floating "Turn into" CONVERT vs sticky + Add CREATE.
 * Floating toolbar is selection-only (non-empty range); caret alone must not summon it.
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import {
  insertCandidateBlockAtTarget,
  runCandidateBlockCommand,
} from './candidateBlockCommands';
import { resolveNbImageInsertTarget } from './candidateImageInsert';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { Editor as TiptapEditor } from '@tiptap/core';
import { serializeRichLine } from '../notebookInlineMarks';
import { selectionShouldShowToolbar } from '../../components/notebook/tiptap/NotebookTiptapCandidateSelectionToolbar';

const TEXT = 'Demand is the quantity consumers are willing to buy.';
const HE = 'האינפלציה היא עלייה מתמשכת ברמת המחירים הכללית.';

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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

function gesture(el: Element) {
  act(() => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  });
}

/** Programmatic non-empty selection (keyboard Shift+Arrow analogue). */
function selectRange(editor: Editor, from: number, to: number) {
  act(() => {
    editor.chain().focus().setTextSelection({ from, to }).run();
  });
}

/** Pointer gesture that ends with a non-empty selection (mouse-drag analogue). */
function mouseSelectRange(editor: Editor, from: number, to: number) {
  act(() => {
    editor.view.dom.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    );
    editor.chain().focus().setTextSelection({ from, to }).run();
    window.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

function openTurnInto() {
  const trigger = document.querySelector(
    '[data-nb-candidate-block-convert="1"]',
  ) as HTMLButtonElement;
  expect(trigger).toBeTruthy();
  expect(trigger.querySelector('[data-nb-candidate-block-convert-label="1"]')?.textContent).toBe(
    'Turn into',
  );
  gesture(trigger);
  return document.querySelector('[data-nb-candidate-block-menu="1"]') as HTMLElement;
}

function snapshotDoc(ed: Editor) {
  const rows: Array<{ type: string; tone?: string; text: string }> = [];
  ed.state.doc.forEach(node => {
    rows.push({
      type: node.type.name,
      tone: node.type.name === 'nbCallout' ? String(node.attrs.tone) : undefined,
      text: node.textContent,
    });
  });
  return rows;
}

async function mountEditor(body: string, pageKey: string) {
  let editor: Editor | null = null;
  const onReady = vi.fn();
  mount(
    createElement(NotebookTiptapCandidateEditor, {
      sourceDocumentBody: body,
      pageKey,
      onReady,
      onEditorReady: ed => {
        editor = ed;
      },
    }),
  );
  await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  await vi.waitFor(() => expect(editor).toBeTruthy());
  return editor!;
}

describe('M7.4A selection-toolbar eligibility (caret must not summon)', () => {
  it('1. click/caret in paragraph → toolbar absent', async () => {
    const editor = await mountEditor(TEXT, 'caret-para');
    act(() => {
      editor.chain().focus().setTextSelection(4).run();
    });
    expect(editor.state.selection.empty).toBe(true);
    expect(selectionShouldShowToolbar(editor)).toBe(false);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('2. click/caret in Definition → toolbar absent', async () => {
    const editor = await mountEditor(`!definition ${TEXT}`, 'caret-def');
    act(() => {
      editor.chain().focus().setTextSelection(2).run();
    });
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.parent.attrs.tone).toBe('definition');
    expect(selectionShouldShowToolbar(editor)).toBe(false);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('3. typing with collapsed caret → toolbar absent', async () => {
    const editor = await mountEditor('Hi', 'caret-type');
    act(() => {
      editor.chain().focus().setTextSelection(3).insertContent('x').run();
    });
    expect(editor.state.selection.empty).toBe(true);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('4–5. mouse selection shows toolbar only after pointerup (no mid-drag open)', async () => {
    const editor = await mountEditor(TEXT, 'mouse-sel');
    act(() => {
      editor.view.dom.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      );
      editor.chain().focus().setTextSelection({ from: 2, to: 10 }).run();
    });
    // Mid-drag: range exists internally but toolbar stays closed.
    expect(editor.state.selection.empty).toBe(false);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-nb-candidate-block-convert="1"]')).toBeTruthy();
  });

  it('6. keyboard non-empty selection → toolbar appears', async () => {
    const editor = await mountEditor(TEXT, 'kbd-sel');
    selectRange(editor, 2, 12);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );
  });

  it('7. selection collapses → toolbar dismisses', async () => {
    const editor = await mountEditor(TEXT, 'collapse-sel');
    selectRange(editor, 2, 12);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );
    act(() => {
      editor.chain().focus().setTextSelection(5).run();
    });
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });
});

describe('M7.4A floating Turn into = CONVERT (selection path)', () => {
  it('8–9. selected text → Turn into Common Mistake; preserves content; dismisses toolbar', async () => {
    const editor = await mountEditor(`!definition ${TEXT}`, 'convert-1');
    selectRange(editor, 2, 10);
    expect(editor.state.selection.$from.parent.attrs.tone).toBe('definition');

    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );

    const menu = openTurnInto();
    expect(menu).toBeTruthy();
    gesture(menu.querySelector('[data-nb-candidate-block="callout:mistake"]')!);

    expect(snapshotDoc(editor)).toEqual([{ type: 'nbCallout', tone: 'mistake', text: TEXT }]);
    expect(document.querySelector('[data-nb-candidate-block-menu="1"]')).toBeNull();
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
    await act(async () => {
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      await new Promise<void>(r => requestAnimationFrame(() => r()));
    });
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();

    // New selection re-engages Turn into, then convert to Summary.
    mouseSelectRange(editor, 2, 10);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-block-convert="1"]')).toBeTruthy(),
    );

    const menu2 = openTurnInto();
    gesture(menu2.querySelector('[data-nb-candidate-block="callout:summary"]')!);
    expect(snapshotDoc(editor)).toEqual([{ type: 'nbCallout', tone: 'summary', text: TEXT }]);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('Paragraph ↔ Definition converts in place from a real selection', async () => {
    const editor = await mountEditor(TEXT, 'convert-2');
    selectRange(editor, 1, 8);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-block-convert="1"]')).toBeTruthy(),
    );

    gesture(openTurnInto().querySelector('[data-nb-candidate-block="callout:definition"]')!);
    expect(snapshotDoc(editor)).toEqual([{ type: 'nbCallout', tone: 'definition', text: TEXT }]);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();

    mouseSelectRange(editor, 2, 10);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-block-convert="1"]')).toBeTruthy(),
    );

    gesture(openTurnInto().querySelector('[data-nb-candidate-block="paragraph"]')!);
    expect(snapshotDoc(editor)).toEqual([{ type: 'nbParagraph', text: TEXT }]);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('marks / link / inline math survive Turn into convert', async () => {
    const rich = serializeRichLine({
      plain: 'Bold math $x^2$ link',
      marks: [
        { s: 0, e: 4, t: 'b' },
        { s: 16, e: 20, t: 'a', v: 'https://example.com' },
      ],
    });
    const editor = await mountEditor(rich, 'convert-marks');
    selectRange(editor, 1, 6);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-block-convert="1"]')).toBeTruthy(),
    );
    gesture(openTurnInto().querySelector('[data-nb-candidate-block="callout:concept"]')!);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).attrs.tone).toBe('concept');
    const out = tiptapDocToBody(editor.getJSON());
    expect(out).toContain('Bold math');
    expect(out).toContain('$x^2$');
    expect(out).toMatch(/example\.com/);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('14. Hebrew RTL + neighbor unchanged; 13. + Add still CREATE-only', async () => {
    const editor = await mountEditor(`Neighbor A\n!definition ${HE}\nNeighbor B`, 'convert-he');
    act(() => {
      const start = editor.state.doc.child(0).nodeSize;
      editor.chain().focus().setTextSelection({ from: start + 1, to: start + 8 }).run();
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-block-convert="1"]')).toBeTruthy(),
    );
    gesture(openTurnInto().querySelector('[data-nb-candidate-block="callout:summary"]')!);
    const after = snapshotDoc(editor);
    expect(after).toEqual([
      { type: 'nbParagraph', text: 'Neighbor A' },
      { type: 'nbCallout', tone: 'summary', text: HE },
      { type: 'nbParagraph', text: 'Neighbor B' },
    ]);
    expect(after[1]!.text).toBe(HE);

    // + Add still CREATE after convert (caret alone — no floating toolbar required).
    act(() => {
      const end = editor.state.doc.content.size - 1;
      editor.commands.setTextSelection(end);
    });
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
    const add = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;
    act(() => {
      add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      add.click();
    });
    act(() => {
      (
        document.querySelector(
          '[data-nb-product-academic-option="callout:example"]',
        ) as HTMLButtonElement
      ).click();
    });
    const tones = snapshotDoc(editor)
      .filter(r => r.type === 'nbCallout')
      .map(r => r.tone);
    expect(tones).toContain('summary');
    expect(tones).toContain('example');
    expect(tones.filter(t => t === 'summary').length).toBe(1);
  });

  it('Undo/Redo conversion; canonical serialize', () => {
    const ed = new TiptapEditor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(`!definition ${TEXT}`),
    });
    ed.commands.setTextSelection({ from: 1, to: 8 });
    expect(runCandidateBlockCommand(ed, 'callout:mistake')).toBe(true);
    expect(ed.state.doc.child(0).attrs.tone).toBe('mistake');
    expect(ed.commands.undo()).toBe(true);
    expect(ed.state.doc.child(0).attrs.tone).toBe('definition');
    expect(ed.commands.redo()).toBe(true);
    expect(ed.state.doc.child(0).attrs.tone).toBe('mistake');
    const out = tiptapDocToBody(ed.getJSON());
    expect(out.startsWith('!mistake ')).toBe(true);
    expect(out).toContain(TEXT);
    expect(out).not.toMatch(/"type"\s*:\s*"doc"/);
    ed.destroy();
  });

  it('15. create helper still inserts between A and B without converting', () => {
    const ed = new TiptapEditor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(`!definition ${TEXT}\nB`),
    });
    const endA = ed.state.doc.child(0).nodeSize - 1;
    ed.commands.setTextSelection(endA);
    expect(
      insertCandidateBlockAtTarget(ed, 'callout:concept', resolveNbImageInsertTarget(ed.state)),
    ).toBe(true);
    const snap = snapshotDoc(ed);
    expect(snap[0]).toEqual({ type: 'nbCallout', tone: 'definition', text: TEXT });
    expect(snap.some(r => r.tone === 'concept')).toBe(true);
    expect(snap.filter(r => r.tone === 'definition').length).toBe(1);
    ed.destroy();
  });

  it('11. Escape suppression still works', async () => {
    const editor = await mountEditor(`!definition ${TEXT}`, 'dismiss-esc');

    selectRange(editor, 2, 10);
    act(() => {
      editor.view.dom.focus();
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );

    act(() => {
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      const handledByPm = editor.view.someProp('handleKeyDown', f => f(editor.view, escapeEvent));
      expect(handledByPm).toBe(true);
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
    await act(async () => {
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      await new Promise<void>(r => requestAnimationFrame(() => r()));
    });
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
    // Same selection must stay suppressed.
    selectRange(editor, 2, 10);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();

    // Deliberate editor pointer gesture allows toolbar again.
    mouseSelectRange(editor, 2, 10);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );

    // 12. outside click still works
    act(() => {
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('Escape closes Turn into picker and dismisses floating toolbar', async () => {
    const editor = await mountEditor(`!definition ${TEXT}`, 'dismiss-esc-menu');
    selectRange(editor, 2, 10);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-block-convert="1"]')).toBeTruthy(),
    );
    openTurnInto();
    expect(document.querySelector('[data-nb-candidate-block-menu="1"]')).toBeTruthy();

    act(() => {
      const menu = document.querySelector('[data-nb-candidate-block-menu="1"]');
      menu?.querySelector<HTMLButtonElement>('[data-nb-candidate-block]')?.focus();
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.querySelector('[data-nb-candidate-block-menu="1"]')).toBeNull();
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeNull();
  });

  it('10. Bold then Italic on same selected range remains possible', async () => {
    const editor = await mountEditor(TEXT, 'fmt-multi');
    selectRange(editor, 1, 7);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );
    const bold = document.querySelector('[data-nb-candidate-fmt="bold"]') as HTMLButtonElement;
    const italic = document.querySelector('[data-nb-candidate-fmt="italic"]') as HTMLButtonElement;
    gesture(bold);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    gesture(italic);
    expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy();
    expect(editor.isActive('bold')).toBe(true);
    expect(editor.isActive('italic')).toBe(true);
  });
});
