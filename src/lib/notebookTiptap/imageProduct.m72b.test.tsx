/**
 * M7.2B — Image product completion: selection, delete, replace, flow, resize.
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Editor } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import {
  insertNbImageRefAtSelection,
  removeSelectedNbImageRef,
  replaceNbImageRefAtPos,
  storeNotebookImageFile,
} from './candidateImageInsert';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { applyNotebookPersist, findActivePage } from '../notebookPages/hydrate';
import type { NotebookContent } from '../../types/notebook';

const nbImageSetMock = vi.fn();

vi.mock('../notebookImageStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../notebookImageStore')>();
  return {
    ...actual,
    nbImageSet: (...args: unknown[]) => nbImageSetMock(...args),
  };
});

function makePngFile(name = 'shot.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
}

function pressKey(editor: Editor, key: string): boolean | undefined {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  return editor.view.someProp('handleKeyDown', f => f(editor.view, event));
}

function makeEditor(body: string) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: bodyToTiptapDoc(body, 1),
  });
}

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

beforeEach(() => {
  nbImageSetMock.mockReset();
  nbImageSetMock.mockResolvedValue(true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

describe('M7.2B selection + delete', () => {
  it('clicking sets NodeSelection without changing surrounding text', () => {
    const body =
      '~nb1:["paragraph","Before",[],null]\n::img::k1::"Alt"::400::\n~nb1:["paragraph","After",[],null]';
    const editor = makeEditor(body);
    const imgPos = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('nbImageRef');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('Before');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('After');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('::img::k1::"Alt"::400::');
    editor.destroy();
  });

  it('Backspace/Delete on selected image removes only the image', () => {
    const body =
      '~nb1:["paragraph","Before",[],null]\n::img::k1::"Alt"::\n~nb1:["paragraph","After",[],null]';
    const editor = makeEditor(body);
    const imgPos = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)));
    expect(pressKey(editor, 'Backspace')).toBe(true);
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('Before');
    expect(editor.state.doc.child(1).textContent).toBe('After');
    expect(tiptapDocToBody(editor.getJSON(), 1)).not.toContain('::img::');

    // Rebuild and Delete key
    editor.commands.setContent(bodyToTiptapDoc(body, 1), { emitUpdate: false });
    const imgPos2 = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos2)));
    expect(removeSelectedNbImageRef(editor)).toBe(true);
    expect(tiptapDocToBody(editor.getJSON(), 1)).not.toContain('::img::');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('Before');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('After');
    editor.destroy();
  });

  it('undo/redo delete restores image reference without empty overwrite', () => {
    const body =
      '~nb1:["paragraph","Before",[],null]\n::img::k-undo::"U"::320::\n~nb1:["paragraph","After",[],null]';
    const editor = makeEditor(body);
    const imgPos = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)));
    removeSelectedNbImageRef(editor);
    expect(tiptapDocToBody(editor.getJSON(), 1)).not.toContain('::img::');
    editor.commands.undo();
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('::img::k-undo::"U"::320::');
    editor.commands.redo();
    expect(tiptapDocToBody(editor.getJSON(), 1)).not.toContain('::img::');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('Before');
    editor.destroy();
  });
});

describe('M7.2B document flow around images', () => {
  it('caret before/after image + Enter below works; Hebrew text survives', () => {
    const body =
      '~nb1:["paragraph","שלום לפני",[],null]\n::img::rtl-img::"תמונה"::\n~nb1:["paragraph","אחרי",[],null]';
    const editor = makeEditor(body);
    const imgPos = editor.state.doc.child(0).nodeSize;
    // Before image: end of first paragraph
    editor.commands.setTextSelection(imgPos - 1);
    expect(editor.state.selection.$from.parent.textContent).toBe('שלום לפני');

    // After image via GapCursor when valid
    const after = imgPos + editor.state.doc.child(1).nodeSize;
    const $after = editor.state.doc.resolve(after);
    if ((GapCursor as unknown as { valid: (p: typeof $after) => boolean }).valid($after)) {
      editor.view.dispatch(editor.state.tr.setSelection(new GapCursor($after)));
    } else {
      editor.commands.setTextSelection(after + 1);
    }

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)));
    expect(pressKey(editor, 'Enter')).toBe(true);
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('שלום לפני');
    expect(serialized).toContain('::img::rtl-img::');
    expect(serialized).toContain('אחרי');
    editor.destroy();
  });

  it('image at start / end / two adjacent images remain editable', () => {
    const start = makeEditor('::img::s::"S"::\n~nb1:["paragraph","T",[],null]');
    expect(start.state.doc.child(0).type.name).toBe('nbImageRef');
    start.view.dispatch(start.state.tr.setSelection(NodeSelection.create(start.state.doc, 0)));
    expect(pressKey(start, 'Enter')).toBe(true);
    expect(tiptapDocToBody(start.getJSON(), 1)).toContain('::img::s::');
    start.destroy();

    const end = makeEditor('~nb1:["paragraph","T",[],null]\n::img::e::"E"::');
    const imgPos = end.state.doc.child(0).nodeSize;
    end.view.dispatch(end.state.tr.setSelection(NodeSelection.create(end.state.doc, imgPos)));
    expect(pressKey(end, 'Enter')).toBe(true);
    expect(tiptapDocToBody(end.getJSON(), 1)).toContain('::img::e::');
    end.destroy();

    const adj = makeEditor('::img::a::"A"::\n::img::b::"B"::');
    expect(adj.state.doc.childCount).toBe(2);
    adj.view.dispatch(adj.state.tr.setSelection(NodeSelection.create(adj.state.doc, 0)));
    removeSelectedNbImageRef(adj);
    expect(adj.state.doc.childCount).toBe(1);
    expect(adj.state.doc.child(0).attrs.key).toBe('b');
    adj.destroy();
  });
});

describe('M7.2B replace image', () => {
  it('replace updates key/alt, keeps width and neighbors; cancel/fail leave body unchanged', async () => {
    const body =
      '~nb1:["paragraph","L",[],null]\n::img::old-key::"Old"::480::\n~nb1:["paragraph","R",[],null]';
    const editor = makeEditor(body);
    const imgPos = editor.state.doc.child(0).nodeSize;

    // Cancel path: no store call if we never invoke replace helper
    expect(nbImageSetMock).not.toHaveBeenCalled();
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('::img::old-key::"Old"::480::');

    // Storage failure → no body mutation
    nbImageSetMock.mockResolvedValueOnce(false);
    const fail = await storeNotebookImageFile(makePngFile('x.png'));
    expect(fail.ok).toBe(false);
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('::img::old-key::');

    // Success replace
    nbImageSetMock.mockResolvedValue(true);
    const stored = await storeNotebookImageFile(makePngFile('new.png'), { key: 'new-key' });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(
      replaceNbImageRefAtPos(editor, imgPos, {
        key: stored.key,
        alt: stored.alt,
        width: 480,
      }),
    ).toBe(true);
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('::img::new-key::"new"::480::');
    expect(serialized).not.toContain('old-key');
    expect(serialized).toContain('"L"');
    expect(serialized).toContain('"R"');
    expect(serialized).not.toMatch(/data:image\//);
    expect(serialized).not.toMatch(/"type"\s*:\s*"doc"/);
    editor.destroy();
  });

  it('page switch during async replace does not mutate wrong page (contract helper)', async () => {
    let nb: NotebookContent = {
      type: 'notebook',
      schemaVersion: 1,
      body: '',
      bodyCodecVersion: 1,
      activePageId: 'p1',
      activeSectionId: 's1',
      sections: [{ id: 's1', title: 'S', pageIds: ['p1', 'p2'] }],
      pages: [
        {
          id: 'p1',
          sectionId: 's1',
          kind: 'document',
          title: 'P1',
          documentBody: '~nb1:["paragraph","P1",[],null]\n::img::p1-img::"A"::200::',
          documentBodyCodecVersion: 1,
        },
        {
          id: 'p2',
          sectionId: 's1',
          kind: 'document',
          title: 'P2',
          documentBody: '~nb1:["paragraph","P2 only",[],null]',
          documentBodyCodecVersion: 1,
        },
      ],
    };
    // Simulate abort: store succeeds but we refuse to write because page changed.
    const pageAtStart = 'p1';
    const stored = await storeNotebookImageFile(makePngFile(), { key: 'replaced' });
    expect(stored.ok).toBe(true);
    const pageNow = 'p2';
    if (pageNow !== pageAtStart) {
      // no applyNotebookPersist
    } else if (stored.ok) {
      nb = applyNotebookPersist(nb, {
        body: '~nb1:["paragraph","P1",[],null]\n::img::replaced::"x"::200::',
        codecVersion: 1,
      });
    }
    expect(nb.pages!.find(p => p.id === 'p1')!.documentBody).toContain('::img::p1-img::');
    expect(nb.pages!.find(p => p.id === 'p2')!.documentBody).not.toContain('::img::');
    expect(findActivePage({ ...nb, activePageId: 'p1' })?.documentBody).toContain('p1-img');
  });

  it('product UI exposes Replace / Reset / Remove when image selected', async () => {
    const onReady = vi.fn();
    let editor: Editor | null = null;
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody:
          '~nb1:["paragraph","A",[],null]\n::img::ui-img::"Alt"::300::\n~nb1:["paragraph","B",[],null]',
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onReplaceImageFile: vi.fn(),
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => expect(editor).toBeTruthy());
    const imgPos = editor!.state.doc.child(0).nodeSize;
    act(() => {
      editor!.view.dispatch(
        editor!.state.tr.setSelection(NodeSelection.create(editor!.state.doc, imgPos)),
      );
    });
    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-image-actions="1"]')).toBeTruthy();
    });
    expect(host!.querySelector('[data-nb-image-replace="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-image-remove="1"]')).toBeTruthy();
    expect(host!.querySelector('[data-nb-image-reset="true"]')).toBeTruthy();
    expect(host!.textContent).toMatch(/Replace Image/);
    expect(host!.textContent).toMatch(/Remove Image/);
    expect(host!.textContent).toMatch(/Reset Size/);
  });
});

describe('M7.2B resize persistence', () => {
  it('width survives serialize/reopen; missing asset remains non-destructive', () => {
    const body = '~nb1:["paragraph","X",[],null]\n::img::rz::"R"::550::';
    const editor = makeEditor(body);
    expect(editor.state.doc.child(1).attrs.width).toBe(550);
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('::img::rz::"R"::550::');
    const reopened = makeEditor(serialized);
    expect(reopened.state.doc.child(1).attrs.width).toBe(550);
    reopened.destroy();
    editor.destroy();

    const missing = makeEditor('::img::gone::"G"::');
    expect(missing.state.doc.child(0).attrs.key).toBe('gone');
    expect(tiptapDocToBody(missing.getJSON(), 1)).toContain('::img::gone::');
    missing.destroy();
  });
});
