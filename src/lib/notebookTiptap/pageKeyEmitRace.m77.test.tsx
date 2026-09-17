/**
 * M7.7 — pageKey transition emission identity.
 *
 * Contract: NEVER emit OLD_PAGE_BODY tagged with NEW_PAGE_KEY during the
 * prop-advanced / not-yet-hydrated window.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { canEmitUserEditForHydratedPage } from './candidateEmitPageIdentity';
import { undoDepth } from '@tiptap/pm/history';

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

type Emission = { body: string; codecVersion: number; pageKey: string };

async function mountEditable(opts: { body: string; pageKey: string; codecVersion?: number }) {
  let editor: Editor | null = null;
  const onReady = vi.fn();
  const emissions: Emission[] = [];

  const renderProps = (body: string, pageKey: string, codecVersion?: number) =>
    createElement(NotebookTiptapCandidateEditor, {
      sourceDocumentBody: body,
      sourceBodyCodecVersion: codecVersion,
      pageKey,
      onReady,
      onEditorReady: ed => {
        editor = ed;
      },
      onUserEdit: payload => {
        emissions.push({
          body: payload.body,
          codecVersion: payload.codecVersion,
          pageKey: payload.pageKey,
        });
      },
    });

  const render = (body: string, pageKey: string, codecVersion?: number) => {
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
    render,
  };
}

function appendText(ed: Editor, text: string) {
  act(() => {
    const end = Math.max(1, ed.state.doc.content.size - 1);
    ed.chain().focus().setTextSelection(end).insertContent(text).run();
  });
}

describe('canEmitUserEditForHydratedPage', () => {
  it('allows only matching non-empty page keys', () => {
    expect(canEmitUserEditForHydratedPage({ propPageKey: 'a', hydratedPageKey: 'a' })).toBe(true);
    expect(canEmitUserEditForHydratedPage({ propPageKey: 'b', hydratedPageKey: 'a' })).toBe(false);
    expect(canEmitUserEditForHydratedPage({ propPageKey: '', hydratedPageKey: 'a' })).toBe(false);
  });
});

describe('M7.7 pageKey hydrated-generation emission', () => {
  it('never emits A body tagged pageKey B during pre-hydrate transition', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    expect(ctx.editor.state.doc.textContent).toBe('Alpha');

    // Advance props WITHOUT act so the hydrate effect has not committed yet.
    root!.render(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Beta',
        pageKey: 'page-b',
        onUserEdit: payload => {
          ctx.emissions.push({
            body: payload.body,
            codecVersion: payload.codecVersion,
            pageKey: payload.pageKey,
          });
        },
        onEditorReady: () => {},
      }),
    );

    // Force a docChanged transaction while the editor still holds Alpha.
    // (Do not wrap in act — that would flush the pending hydrate effect.)
    const end = Math.max(1, ctx.editor.state.doc.content.size - 1);
    ctx.editor.view.dispatch(ctx.editor.state.tr.insertText(' FORCED', end));

    expect(ctx.editor.state.doc.textContent).toContain('Alpha');
    expect(
      ctx.emissions.some(e => e.pageKey === 'page-b' && /Alpha/.test(e.body)),
    ).toBe(false);

    // Complete hydration under act.
    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(ctx.editor.state.doc.textContent).toBe('Beta'));
    expect(ctx.emissions.some(e => e.pageKey === 'page-b' && /Alpha/.test(e.body))).toBe(false);
  });

  it('rapid A→B→A never tags foreign body with wrong pageKey', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    appendText(ctx.editor, ' A1');
    await vi.waitFor(() => expect(ctx.emissions.length).toBeGreaterThan(0));

    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(ctx.editor.state.doc.textContent).toBe('Beta'));
    appendText(ctx.editor, ' B1');
    await vi.waitFor(() =>
      expect(ctx.emissions.some(e => e.pageKey === 'page-b' && /B1/.test(e.body))).toBe(true),
    );

    ctx.render('Alpha A1', 'page-a');
    await vi.waitFor(() => expect(ctx.editor.state.doc.textContent).toBe('Alpha A1'));
    appendText(ctx.editor, ' A2');
    await vi.waitFor(() =>
      expect(ctx.emissions.some(e => e.pageKey === 'page-a' && /A2/.test(e.body))).toBe(true),
    );

    expect(ctx.emissions.some(e => e.pageKey === 'page-b' && /Alpha/.test(e.body))).toBe(false);
    expect(ctx.emissions.some(e => e.pageKey === 'page-a' && /Beta/.test(e.body))).toBe(false);
  });

  it('edit immediately before switch persists only under old pageKey', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    appendText(ctx.editor, ' pre');
    await vi.waitFor(() =>
      expect(ctx.emissions.some(e => e.pageKey === 'page-a' && /pre/.test(e.body))).toBe(true),
    );
    const lastA = ctx.emissions.filter(e => e.pageKey === 'page-a').at(-1)!;
    expect(lastA.body).toMatch(/pre/);

    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(ctx.editor.state.doc.textContent).toBe('Beta'));
    expect(ctx.emissions.some(e => e.pageKey === 'page-b' && /pre/.test(e.body))).toBe(false);
  });

  it('edit immediately after switch emits under new pageKey only', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(ctx.editor.state.doc.textContent).toBe('Beta'));
    const before = ctx.emissions.length;
    appendText(ctx.editor, ' post');
    await vi.waitFor(() => expect(ctx.emissions.length).toBeGreaterThan(before));
    const newest = ctx.emissions.at(-1)!;
    expect(newest.pageKey).toBe('page-b');
    expect(newest.body).toMatch(/post/);
    expect(newest.body).not.toMatch(/Alpha/);
  });

  it('Undo/Redo remains page-local after switch', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    appendText(ctx.editor, ' edit');
    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(ctx.editor.state.doc.textContent).toBe('Beta'));
    expect(undoDepth(ctx.editor.state)).toBe(0);
    act(() => {
      ctx.editor.commands.undo();
    });
    expect(ctx.editor.state.doc.textContent).toBe('Beta');
  });

  it('hydrate itself produces zero user-edit emissions', async () => {
    const ctx = await mountEditable({ body: 'Alpha', pageKey: 'page-a' });
    const before = ctx.emissions.length;
    ctx.render('Beta', 'page-b');
    await vi.waitFor(() => expect(ctx.editor.state.doc.textContent).toBe('Beta'));
    ctx.render('Gamma', 'page-c');
    await vi.waitFor(() => expect(ctx.editor.state.doc.textContent).toBe('Gamma'));
    expect(ctx.emissions.length).toBe(before);
  });
});
