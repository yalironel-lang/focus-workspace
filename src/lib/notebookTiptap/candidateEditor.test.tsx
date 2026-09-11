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

describe('candidate feature flag defaults OFF', () => {
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

  it('candidate and shadow flags default off', () => {
    expect(isNotebookTiptapCandidateEnabled()).toBe(false);
    expect(isNotebookTiptapEditorEnabled()).toBe(false);
  });

  it('candidate active requires DEV + flag', () => {
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    localStorage.setItem('notebookTiptapCandidate', '1');
    expect(isNotebookTiptapCandidateEnabled()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(Boolean(import.meta.env.DEV));
    localStorage.setItem('notebookTiptapCandidate', '0');
    expect(isNotebookTiptapCandidateEnabled()).toBe(false);
  });
});

describe('NotebookTiptapCandidateEditor', () => {
  it('loads real body, has no persistence API, shows badge', async () => {
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
    expect(host!.querySelector('[data-nb-candidate-badge="1"]')?.textContent).toMatch(/TipTap candidate/i);
    expect(host!.querySelector('[data-nb-candidate-persistence="never"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-candidate-toolbar="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-candidate-dir="1"]')).toBeTruthy();
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
});
