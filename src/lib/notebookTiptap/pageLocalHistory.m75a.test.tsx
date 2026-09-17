/**
 * M7.5A — Page-local TipTap history + pageKey emission integrity.
 *
 * Contract:
 * - Switching pages resets undo/redo for the newly hydrated page (baseline = hydrated body).
 * - Undo after A→B must never restore A into B or persist A into B.
 * - Hydration itself emits zero onUserEdit writes.
 * - Same-page self-echo still preserves undo history.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { Editor as TiptapEditor } from '@tiptap/core';
import { undoDepth, redoDepth } from '@tiptap/pm/history';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { serializeRichLine } from '../notebookInlineMarks';
import {
  candidateEditorHistoryDepth,
  resetCandidateEditorHistory,
} from './candidatePageHistory';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';

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

type Emission = { body: string; codecVersion: number; pageKeyAtEmit: string };

async function mountEditable(opts: {
  body: string;
  pageKey: string;
  /** Omit for legacy/plain prose. Pass 1 only for genuine ~nb1: bodies. */
  codecVersion?: number;
}) {
  let editor: Editor | null = null;
  const onReady = vi.fn();
  const emissions: Emission[] = [];
  const pageKeyHolder = { current: opts.pageKey };

  const renderProps = (body: string, pageKey: string, codecVersion?: number) =>
    createElement(NotebookTiptapCandidateEditor, {
      sourceDocumentBody: body,
      sourceBodyCodecVersion: codecVersion,
      pageKey,
      onReady,
      onEditorReady: ed => {
        editor = ed;
      },
      onUserEdit: (payload) => {
        emissions.push({ body: payload.body, codecVersion: payload.codecVersion, pageKeyAtEmit: pageKeyHolder.current });
      },
    });

  const render = (body: string, pageKey: string, codecVersion?: number) => {
    pageKeyHolder.current = pageKey;
    act(() => {
      root!.render(renderProps(body, pageKey, codecVersion));
    });
  };

  mount(renderProps(opts.body, opts.pageKey, opts.codecVersion));
  await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  await vi.waitFor(() => expect(editor).toBeTruthy());
  await vi.waitFor(() => expect(editor!.isEditable).toBe(true));

  return {
    get editor() {
      return editor!;
    },
    emissions,
    pageKeyHolder,
    render,
    onReady,
  };
}

function editorBody(ed: Editor): string {
  return ed.state.doc.textContent;
}

function appendText(ed: Editor, text: string) {
  act(() => {
    const end = Math.max(1, ed.state.doc.content.size - 1);
    ed.chain().focus().setTextSelection(end).insertContent(text).run();
  });
}

describe('candidatePageHistory helper', () => {
  it('resetCandidateEditorHistory clears undo/redo without changing doc', () => {
    const ed = new TiptapEditor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc('Hello'),
    });
    ed.commands.insertContent(' world');
    expect(undoDepth(ed.state)).toBeGreaterThan(0);
    const before = ed.getJSON();
    resetCandidateEditorHistory(ed);
    expect(candidateEditorHistoryDepth(ed)).toEqual({ undo: 0, redo: 0 });
    expect(ed.getJSON()).toEqual(before);
    expect(ed.commands.undo()).toBe(false);
    ed.destroy();
  });
});

describe('M7.5A page-local history + pageKey integrity', () => {
  it('TEST 1 — cross-page undo must not corrupt Page B or emit Alpha into B', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    expect(editorBody(ctx.editor)).toBe('Alpha');
    appendText(ctx.editor, ' edited');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toContain('Alpha edited'));
    const emitsAfterA = ctx.emissions.length;
    expect(emitsAfterA).toBeGreaterThan(0);
    expect(ctx.emissions.at(-1)!.pageKeyAtEmit).toBe('page-a');

    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Beta'));
    const emitsAfterSwitch = ctx.emissions.length;
    expect(emitsAfterSwitch).toBe(emitsAfterA); // TEST 4 hydration zero-write

    expect(undoDepth(ctx.editor.state)).toBe(0);
    act(() => {
      ctx.editor.commands.undo();
    });
    expect(editorBody(ctx.editor)).toBe('Beta');
    expect(ctx.emissions.length).toBe(emitsAfterSwitch);
    expect(ctx.emissions.some(e => e.pageKeyAtEmit === 'page-b' && /Alpha/.test(e.body))).toBe(false);
  });

  it('TEST 2 — Page B own history undo/redo stays on B', async () => {
    const ctx = await mountEditable({ body: 'Beta', pageKey: 'page-b' });
    appendText(ctx.editor, ' edited');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Beta edited'));
    act(() => {
      expect(ctx.editor.commands.undo()).toBe(true);
    });
    expect(editorBody(ctx.editor)).toBe('Beta');
    act(() => {
      expect(ctx.editor.commands.redo()).toBe(true);
    });
    expect(editorBody(ctx.editor)).toBe('Beta edited');
    expect(ctx.emissions.every(e => e.pageKeyAtEmit === 'page-b')).toBe(true);
    expect(ctx.emissions.every(e => !/Alpha/.test(e.body))).toBe(true);
  });

  it('TEST 3 — switch back: B history never injects into A (reset contract)', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    appendText(ctx.editor, ' A1');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toContain('Alpha A1'));
    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Beta'));
    appendText(ctx.editor, ' B1');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Beta B1'));

    ctx.render('Alpha A1', 'page-a');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Alpha A1'));
    expect(undoDepth(ctx.editor.state)).toBe(0);
    act(() => {
      expect(ctx.editor.commands.undo()).toBe(false);
    });
    expect(editorBody(ctx.editor)).toBe('Alpha A1');
    expect(editorBody(ctx.editor)).not.toContain('Beta');
  });

  it('TEST 4 — A→B hydration produces zero user-edit persistence writes', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    const before = ctx.emissions.length;
    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Beta'));
    ctx.render('Gamma', 'page-c');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Gamma'));
    expect(ctx.emissions.length).toBe(before);
  });

  it('TEST 5 — emissions carry the active pageKey (no stale A on B edits)', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    appendText(ctx.editor, '!');
    await vi.waitFor(() => expect(ctx.emissions.length).toBeGreaterThan(0));
    expect(ctx.emissions.at(-1)!.pageKeyAtEmit).toBe('page-a');

    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Beta'));
    const beforeB = ctx.emissions.length;
    appendText(ctx.editor, '!');
    await vi.waitFor(() => expect(ctx.emissions.length).toBeGreaterThan(beforeB));
    expect(ctx.emissions.at(-1)!.pageKeyAtEmit).toBe('page-b');
  });

  it('TEST 6 — same-page self-echo preserves undo history', async () => {
    const ctx = await mountEditable({ body: 'Hello', pageKey: 'page-a' });
    appendText(ctx.editor, ' world');
    await vi.waitFor(() => expect(ctx.emissions.length).toBeGreaterThan(0));
    const bodyAfterEdit = ctx.emissions.at(-1)!.body;
    const codecAfterEdit = ctx.emissions.at(-1)!.codecVersion;
    expect(undoDepth(ctx.editor.state)).toBeGreaterThan(0);

    // Parent reflects the emitted body + codec (self-echo) — must NOT reset history.
    ctx.render(bodyAfterEdit, 'page-a', codecAfterEdit);
    await act(async () => {
      await Promise.resolve();
    });
    expect(undoDepth(ctx.editor.state)).toBeGreaterThan(0);
    act(() => {
      expect(ctx.editor.commands.undo()).toBe(true);
    });
    expect(editorBody(ctx.editor)).toBe('Hello');
  });

  it('TEST 7 — rapid A→B→A→B hydration: no phantom writes, content matches active page', async () => {
    const ctx = await mountEditable({ body: 'A0', pageKey: 'a' });
    const before = ctx.emissions.length;
    ctx.render('B0', 'b');
    ctx.render('A0', 'a');
    ctx.render('B0', 'b');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('B0'));
    expect(ctx.emissions.length).toBe(before);
    expect(undoDepth(ctx.editor.state)).toBe(0);
    act(() => {
      expect(ctx.editor.commands.undo()).toBe(false);
    });
    expect(editorBody(ctx.editor)).toBe('B0');
  });

  it('TEST 8 — selection from A does not mutate B after switch', async () => {
    const ctx = await mountEditable({ body: 'Alpha selected text', pageKey: 'page-a' });
    act(() => {
      ctx.editor.chain().focus().setTextSelection({ from: 1, to: 6 }).run();
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nb-candidate-selection-toolbar-open="1"]')).toBeTruthy(),
    );

    ctx.render('Beta only', 'page-b');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toBe('Beta only'));
    act(() => {
      expect(ctx.editor.commands.undo()).toBe(false);
    });
    expect(editorBody(ctx.editor)).toBe('Beta only');
  });

  it('TEST 9 — fail-closed corrupt versioned body still blocks edits/persistence', async () => {
    let editor: Editor | null = null;
    const onUserEdit = vi.fn();
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '~nb1:["not-valid"',
        sourceBodyCodecVersion: undefined,
        pageKey: 'bad',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit,
      }),
    );
    await vi.waitFor(() => expect(editor).toBeTruthy());
    expect(editor!.isEditable).toBe(false);
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  it('TEST 10 — rich canonical content survives page-switch history reset', async () => {
    const rich = [
      serializeRichLine({
        plain: 'Formatted note',
        marks: [{ s: 0, e: 9, t: 'b' }],
      }),
      '!definition Demand is quantity demanded.',
      '::img::img-keep::"Alt"::240::',
    ].join('\n');

    const ctx = await mountEditable({ body: rich, pageKey: 'page-a' });
    expect(editorBody(ctx.editor)).toContain('Demand');
    appendText(ctx.editor, 'X');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toContain('X'));

    const other = '!summary Other page.';
    ctx.render(other, 'page-b');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toContain('Other page'));
    expect(undoDepth(ctx.editor.state)).toBe(0);
    act(() => {
      expect(ctx.editor.commands.undo()).toBe(false);
    });
    expect(editorBody(ctx.editor)).toContain('Other page');
    expect(editorBody(ctx.editor)).not.toContain('Demand');

    ctx.render(rich, 'page-a');
    await vi.waitFor(() => expect(editorBody(ctx.editor)).toContain('Demand'));
    expect(editorBody(ctx.editor)).toContain('Formatted note');
    expect(redoDepth(ctx.editor.state)).toBe(0);
  });
});
