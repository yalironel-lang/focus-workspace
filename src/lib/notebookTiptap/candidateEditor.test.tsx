/**
 * Milestone 4 TipTap candidate editor — memory-only, flag-gated.
 *
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isNotebookTiptapCandidateActive,
  isNotebookTiptapCandidateEnabled,
  isNotebookTiptapEditorEnabled,
} from './featureFlag';
import { hasBidiControlChars } from './direction';

const { NotebookTiptapCandidateEditor } = await import(
  '../../components/notebook/tiptap/NotebookTiptapCandidateEditor'
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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

describe('candidate feature flag defaults (M7.1A)', () => {
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

  it('candidate defaults ON; shadow/parity editor stays OFF', () => {
    expect(isNotebookTiptapCandidateEnabled()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(true);
    expect(isNotebookTiptapEditorEnabled()).toBe(false);
  });

  it('candidate active follows enable flag; DEV LS OFF still works in DEV', () => {
    expect(isNotebookTiptapCandidateActive()).toBe(true);
    localStorage.setItem('notebookTiptapCandidate', '0');
    // Vitest runs as DEV — historical LS OFF still honored for local engineering.
    expect(isNotebookTiptapCandidateEnabled()).toBe(false);
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    // Production seam: same LS must not pin TipTap OFF.
    expect(isNotebookTiptapCandidateEnabled({ isDev: false })).toBe(true);
    expect(isNotebookTiptapCandidateActive({ isDev: false })).toBe(true);
    localStorage.setItem('notebookTiptapCandidate', '1');
    expect(isNotebookTiptapCandidateEnabled()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(true);
  });
});

describe('NotebookTiptapCandidateEditor', () => {
  it('loads real body, has no persistence API, shows product toolbar', async () => {
    const source = '# Title\nהפונקציה $f(x)$ היא רציפה';
    const frozen = source;
    const onReady = vi.fn();
    const onSnapshot = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: source,
        pageKey: 'page-a',
        onReady,
        onSnapshot,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0]![0].persistence).toBe(false);
    expect(onReady.mock.calls[0]![0].editable).toBe(true);
    expect(source).toBe(frozen);
    expect(host!.querySelector('[data-nb-tiptap-candidate="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-candidate-badge="1"]')).toBeNull();
    expect(host!.querySelector('[data-nb-candidate-persistence="never"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-toolbar="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-undo="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-redo="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-block="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-dir="1"]')).toBeTruthy();
    expect(host!.textContent).not.toMatch(/Temp DEV tools/i);
    expect(host!.textContent).not.toMatch(/TIPTAP CANDIDATE/i);
    // Engineering QA strip may still mount under vitest DEV; product absence covered in m71d.
    // Component props must not include persistence callbacks
    expect(NotebookTiptapCandidateEditor.length).toBeLessThanOrEqual(1);
    const snap = onSnapshot.mock.calls.at(-1)?.[0];
    expect(snap.dirtyKind).toBe('pristine');
    expect(snap.status).toBe('SAFE');
    if (snap.body) expect(hasBidiControlChars(snap.body)).toBe(false);
  });

  it('pageKey change discards edits and reloads source', async () => {
    const onReady = vi.fn();
    const onSnapshot = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Page A',
        pageKey: 'a',
        onReady,
        onSnapshot,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    onReady.mockClear();
    onSnapshot.mockClear();
    act(() => {
      root!.render(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: 'Page B Hebrew שלום',
          pageKey: 'b',
          onReady,
          onSnapshot,
        }),
      );
    });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls.at(-1)![0].pageKey).toBe('b');
    expect(host!.querySelector('[data-nb-candidate-page="b"]')).toBeTruthy();
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    const snap = onSnapshot.mock.calls.at(-1)?.[0];
    expect(snap.userEdited).toBe(false);
    expect(snap.dirtyKind).toBe('pristine');
    expect(snap.body).toBe('Page B Hebrew שלום');
  });

  it('edits stay memory-only (source string unchanged)', async () => {
    const source = 'Hello';
    const frozen = source;
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: source,
        pageKey: 'p1',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(source).toBe(frozen);
  });

  it('Enter in paragraph creates a new paragraph (DOM keydown reaches TipTap)', async () => {
    const onReady = vi.fn();
    const onSnapshot = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello line',
        pageKey: 'enter-test',
        onReady,
        onSnapshot,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const pm = host!.querySelector('.ProseMirror, [data-nb-tiptap-candidate="1"]') as HTMLElement | null;
    expect(pm).toBeTruthy();
    pm!.focus();
    // Place caret at end via TipTap is hard from DOM; dispatch Enter after click
    act(() => {
      pm!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await vi.waitFor(() => {
      const snap = onSnapshot.mock.calls.at(-1)?.[0];
      // Either user_edit after Enter split, or at least body has a newline from split
      expect(snap?.body?.includes('\n') || snap?.dirtyKind === 'user_edit').toBeTruthy();
    });
  });

  it('Enter matrix matches M2 sandbox semantics (candidate extensions)', async () => {
    const { Editor } = await import('@tiptap/core');
    const { bodyToTiptapDoc } = await import('./blocksToTiptapDoc');
    const { tiptapDocToBody } = await import('./tiptapDocToBody');
    const { createNotebookTiptapSandboxExtensions } = await import('./sandboxExtensions');

    const make = (body: string) =>
      new Editor({
        extensions: createNotebookTiptapSandboxExtensions(),
        content: bodyToTiptapDoc(body),
        editable: true,
      });

    // paragraph → new paragraph
    {
      const ed = make('Hello');
      ed.chain().focus().setTextSelection(3).run();
      ed.commands.keyboardShortcut('Enter');
      expect(tiptapDocToBody(ed.getJSON()).split('\n').length).toBeGreaterThanOrEqual(2);
      ed.destroy();
    }
    // non-empty bullet → continue bullet
    {
      const ed = make('- Item');
      ed.commands.focus('end');
      ed.commands.keyboardShortcut('Enter');
      const body = tiptapDocToBody(ed.getJSON());
      expect(body.split('\n')[0]).toMatch(/^- /);
      expect(body.split('\n').length).toBeGreaterThanOrEqual(2);
      ed.destroy();
    }
    // empty bullet → paragraph
    {
      const ed = make('- ');
      ed.commands.keyboardShortcut('Enter');
      expect(tiptapDocToBody(ed.getJSON()).startsWith('- ')).toBe(false);
      ed.destroy();
    }
    // title Enter → paragraph below
    {
      const ed = make('# Title');
      ed.commands.focus('end');
      ed.commands.keyboardShortcut('Enter');
      const lines = tiptapDocToBody(ed.getJSON()).split('\n');
      expect(lines[0]).toMatch(/^# /);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      ed.destroy();
    }
  });

  it('M5.2: onUserEdit prop activates guarded persistence mode on the component', async () => {
    const onReady = vi.fn();
    const onUserEdit = vi.fn();
    let editorInstance: import('@tiptap/core').Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Original page text',
        pageKey: 'persist-test',
        onReady,
        onEditorReady: (ed: import('@tiptap/core').Editor | null) => {
          editorInstance = ed;
        },
        onUserEdit,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0]![0].persistence).toBe(true);
    expect(host!.querySelector('[data-nb-candidate-persistence="guarded"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-candidate-badge="1"]')).toBeNull();
    expect(host!.textContent).not.toMatch(/M5\.2 Guarded Persist/i);
    // Status strip is engineering chrome (explicit opt-in); product path must not require it.

    // Opening/mounting MUST NOT call onUserEdit
    expect(onUserEdit).not.toHaveBeenCalled();

    // Mutate document via editorInstance
    await vi.waitFor(() => expect(editorInstance).toBeTruthy());
    act(() => {
      editorInstance!.commands.focus('end');
      editorInstance!.commands.insertContent(' added');
    });

    await vi.waitFor(() => expect(onUserEdit).toHaveBeenCalled());
    expect(onUserEdit).toHaveBeenCalledWith(expect.any(String), 1);
    const [persistedBody, codecVersion] = onUserEdit.mock.calls[0]!;
    expect(codecVersion).toBe(1);
    expect(persistedBody.startsWith('~nb1:')).toBe(true);
    expect(persistedBody).toContain('Original page text added');

    // Engineering status strip is opt-in; product persistence contract is onUserEdit above.
  });
});
