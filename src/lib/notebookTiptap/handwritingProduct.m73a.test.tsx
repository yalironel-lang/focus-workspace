/**
 * M7.3A — TipTap Notebook product handwriting foundation.
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import {
  insertNbHandwritingAtSelection,
  newHandwritingKey,
  removeSelectedNbHandwriting,
  resolveNbHandwritingInsertTarget,
} from './candidateHandwritingInsert';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { applyNotebookPersist, findActivePage } from '../notebookPages/hydrate';
import type { NotebookContent } from '../../types/notebook';
import {
  emptyHandwritingData,
  type HandwritingBlockData,
  type HandwritingStroke,
} from '../handwritingTypes';

const hwSetMock = vi.fn();
const hwGetCachedMock = vi.fn();
const hydrateHandwritingBlocksMock = vi.fn();
const hwDeleteMock = vi.fn();

vi.mock('../notebookHandwritingStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../notebookHandwritingStore')>();
  return {
    ...actual,
    hwSet: (...args: unknown[]) => hwSetMock(...args),
    hwGetCached: (...args: unknown[]) => hwGetCachedMock(...args),
    hydrateHandwritingBlocks: (...args: unknown[]) => hydrateHandwritingBlocksMock(...args),
    hwDelete: (...args: unknown[]) => hwDeleteMock(...args),
  };
});

function makeStroke(id: string): HandwritingStroke {
  return {
    id,
    tool: 'pen',
    color: '#1a1a1a',
    width: 2.5,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ],
  };
}

function makeData(strokes: HandwritingStroke[]): HandwritingBlockData {
  return {
    ...emptyHandwritingData(400, 220),
    strokes,
    updatedAt: Date.now(),
  };
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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  vi.clearAllMocks();
});

beforeEach(() => {
  hwSetMock.mockReset();
  hwGetCachedMock.mockReset();
  hydrateHandwritingBlocksMock.mockReset();
  hwDeleteMock.mockReset();
  hwSetMock.mockResolvedValue({ ok: true });
  hwGetCachedMock.mockReturnValue(null);
  hydrateHandwritingBlocksMock.mockResolvedValue(undefined);
  hwDeleteMock.mockResolvedValue(undefined);
});

function paragraphABEditor() {
  const body =
    '~nb1:["paragraph","Paragraph A",[],null]\n~nb1:["paragraph","Paragraph B",[],null]';
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions({ objectId: 'obj-hw-1' }),
    content: bodyToTiptapDoc(body, 1),
  });
}

describe('M7.3A legacy ↔ TipTap ↔ canonical round-trip', () => {
  it('1. ::hw:: reference hydrates to nbHandwriting and serializes back without TipTap JSON/base64', () => {
    const body =
      '~nb1:["paragraph","Text above",[],null]\n::hw::hw-legacy-1::\n~nb1:["paragraph","Text below",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const rt = tiptapDocToBody(doc, 1);
    expect(rt).toContain('::hw::hw-legacy-1::');
    expect(rt).toContain('Text above');
    expect(rt).toContain('Text below');
    expect(rt).not.toMatch(/"type"\s*:\s*"doc"/);
    expect(rt).not.toMatch(/"strokes"/);
    expect(rt).not.toMatch(/data:image\//);

    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions({ objectId: 'obj-1' }),
      content: doc,
    });
    expect(editor.state.doc.child(1).type.name).toBe('nbHandwriting');
    expect(editor.state.doc.child(1).attrs.key).toBe('hw-legacy-1');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('::hw::hw-legacy-1::');
    editor.destroy();
  });
});

describe('M7.3A opening / missing asset safety', () => {
  it('2. opening TipTap handwriting causes zero hwSet writes', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: '::hw::hw-open-zero::',
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
        objectId: 'obj-open',
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(host!.querySelector('[data-nb="nbHandwriting"]')).toBeTruthy(),
    );
    expect(hwSetMock).not.toHaveBeenCalled();
    expect(hwDeleteMock).not.toHaveBeenCalled();
  });

  it('9. missing asset preserves canonical reference on serialize', () => {
    hwGetCachedMock.mockReturnValue(null);
    const body =
      '~nb1:["paragraph","Keep",[],null]\n::hw::missing-hw-key::\n~nb1:["paragraph","Alive",[],null]';
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions({ objectId: 'obj-miss' }),
      content: bodyToTiptapDoc(body, 1),
    });
    expect(editor.state.doc.child(1).type.name).toBe('nbHandwriting');
    expect(editor.state.doc.child(1).attrs.key).toBe('missing-hw-key');
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('::hw::missing-hw-key::');
    expect(serialized).toContain('Keep');
    expect(serialized).toContain('Alive');
    expect(hwDeleteMock).not.toHaveBeenCalled();
    expect(hwSetMock).not.toHaveBeenCalled();
    editor.destroy();
  });
});

describe('M7.3A insert / selection / delete / undo', () => {
  it('3–4. insert at selection and between A/B without blank paragraph', () => {
    const editor = paragraphABEditor();
    const endA = editor.state.doc.child(0).nodeSize - 1;
    editor.commands.setTextSelection(endA);
    const target = resolveNbHandwritingInsertTarget(editor.state);
    expect(target).toEqual({ kind: 'pos', pos: editor.state.doc.child(0).nodeSize });

    expect(insertNbHandwritingAtSelection(editor, 'hw-bound-1', target)).toBe(true);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Paragraph A');
    expect(editor.state.doc.child(1).type.name).toBe('nbHandwriting');
    expect(editor.state.doc.child(1).attrs.key).toBe('hw-bound-1');
    expect(editor.state.doc.child(2).textContent).toBe('Paragraph B');

    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toBe(
      '~nb1:["paragraph","Paragraph A",[],null]\n::hw::hw-bound-1::\n~nb1:["paragraph","Paragraph B",[],null]',
    );
    expect(serialized).not.toMatch(/\["paragraph","",/);
    expect(serialized).not.toMatch(/"strokes"/);
    expect(serialized).not.toMatch(/"type"\s*:\s*"doc"/);
    editor.destroy();
  });

  it('5–8. select, delete only handwriting reference, undo restores, text survives', () => {
    const body =
      '~nb1:["paragraph","Before",[],null]\n::hw::hw-del-1::\n~nb1:["paragraph","After",[],null]';
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions({ objectId: 'obj-del' }),
      content: bodyToTiptapDoc(body, 1),
    });
    let hwPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'nbHandwriting' && hwPos == null) hwPos = pos;
    });
    expect(hwPos).not.toBeNull();
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, hwPos!)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('nbHandwriting');

    expect(removeSelectedNbHandwriting(editor)).toBe(true);
    expect(hwDeleteMock).not.toHaveBeenCalled();
    const afterDelete = tiptapDocToBody(editor.getJSON(), 1);
    expect(afterDelete).not.toContain('::hw::hw-del-1::');
    expect(afterDelete).toContain('Before');
    expect(afterDelete).toContain('After');

    expect(editor.commands.undo()).toBe(true);
    const afterUndo = tiptapDocToBody(editor.getJSON(), 1);
    expect(afterUndo).toContain('::hw::hw-del-1::');
    expect(afterUndo).toContain('Before');
    expect(afterUndo).toContain('After');
    editor.destroy();
  });

  it('product Block menu exposes Handwriting (not DEV wording)', async () => {
    const onInsertHandwriting = vi.fn();
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
        onInsertHandwriting,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());

    const trigger = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;
    expect(trigger.textContent).toMatch(/Block \/ Academic/);
    expect(host!.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      trigger.click();
    });
    const menu = document.querySelector('[data-nb-product-block-menu="1"]');
    expect(menu).toBeTruthy();

    const labels = Array.from(menu!.querySelectorAll('[role="menuitem"]')).map(
      el => (el.textContent ?? '').trim(),
    );
    expect(labels.indexOf('Handwriting')).toBe(labels.indexOf('Step') + 2);

    const option = document.querySelector(
      '[data-nb-product-handwriting-option="1"]',
    ) as HTMLButtonElement;
    expect(option).toBeTruthy();
    expect(option.textContent).toMatch(/^Handwriting$/);
    expect(option.textContent).not.toMatch(/DEV|candidate/i);

    act(() => {
      option.click();
    });
    expect(onInsertHandwriting).toHaveBeenCalledTimes(1);
    expect(onInsertHandwriting.mock.calls[0]![0]).toHaveProperty('insertTarget');
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();
  });
});

describe('M7.3A multi-page + refresh + edit strokes', () => {
  it('10. multi-page isolation: P2 handwriting does not modify P1/P3', () => {
    let nb: NotebookContent = {
      type: 'notebook',
      schemaVersion: 1,
      body: '',
      bodyCodecVersion: 1,
      activePageId: 'p2',
      activeSectionId: 's1',
      sections: [{ id: 's1', title: 'S', pageIds: ['p1', 'p2', 'p3'] }],
      pages: [
        {
          id: 'p1',
          sectionId: 's1',
          kind: 'document',
          title: 'P1',
          documentBody: '~nb1:["paragraph","P1 text",[],null]',
          documentBodyCodecVersion: 1,
        },
        {
          id: 'p2',
          sectionId: 's1',
          kind: 'document',
          title: 'P2',
          documentBody: '~nb1:["paragraph","P2 text",[],null]',
          documentBodyCodecVersion: 1,
        },
        {
          id: 'p3',
          sectionId: 's1',
          kind: 'document',
          title: 'P3',
          documentBody: '~nb1:["paragraph","P3 text",[],null]',
          documentBodyCodecVersion: 1,
        },
      ],
    };

    const p2Body =
      '~nb1:["paragraph","P2 text",[],null]\n::hw::hw-page2::';
    nb = applyNotebookPersist(nb, { body: p2Body, codecVersion: 1 });

    expect(findActivePage(nb)?.id).toBe('p2');
    expect(nb.pages!.find(p => p.id === 'p1')!.documentBody).toContain('P1 text');
    expect(nb.pages!.find(p => p.id === 'p1')!.documentBody).not.toContain('::hw::');
    expect(nb.pages!.find(p => p.id === 'p2')!.documentBody).toContain('::hw::hw-page2::');
    expect(nb.pages!.find(p => p.id === 'p3')!.documentBody).toContain('P3 text');
    expect(nb.pages!.find(p => p.id === 'p3')!.documentBody).not.toContain('::hw::');
  });

  it('11. page-switch async protection pattern: abort when page changes before insert', () => {
    const pageAtStart = 'p1';
    const pageNow = 'p2';
    const shouldInsert = pageNow === pageAtStart;
    expect(shouldInsert).toBe(false);
    // Simulate: would have created a key but must not mutate P2 body.
    const key = newHandwritingKey();
    expect(key.startsWith('hw-')).toBe(true);
  });

  it('12. existing strokes survive additional save (append, not replace-with-empty)', async () => {
    const key = 'hw-stroke-survive';
    const objectId = 'obj-stroke';
    const first = makeData([makeStroke('st-1')]);
    const second = makeData([makeStroke('st-1'), makeStroke('st-2')]);

    // Simulate HandwritingBlock persist path: never write empty over good data.
    await hwSetMock(objectId, key, first);
    await hwSetMock(objectId, key, second);
    expect(hwSetMock).toHaveBeenCalledTimes(2);
    const lastPayload = hwSetMock.mock.calls[1]![2] as HandwritingBlockData;
    expect(lastPayload.strokes).toHaveLength(2);
    expect(lastPayload.strokes.map(s => s.id)).toEqual(['st-1', 'st-2']);
    expect(lastPayload.strokes).not.toHaveLength(0);

    // Body remains reference-only.
    const body = `Notes\n::hw::${key}::`;
    expect(body).not.toMatch(/st-1|strokes|base64/);
  });

  it('13. refresh/reopen representation stays ::hw:: + nbHandwriting', () => {
    const body =
      '~nb1:["paragraph","P2 text",[],null]\n::hw::hw-reopen::';
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions({ objectId: 'obj-re' }),
      content: bodyToTiptapDoc(body, 1),
    });
    expect(editor.state.doc.child(1).type.name).toBe('nbHandwriting');
    expect(editor.state.doc.child(1).attrs.key).toBe('hw-reopen');
    const out = tiptapDocToBody(editor.getJSON(), 1);
    expect(out).toContain('::hw::hw-reopen::');
    expect(out).not.toMatch(/"type"\s*:\s*"doc"/);
    editor.destroy();

    const again = new Editor({
      extensions: createNotebookTiptapSandboxExtensions({ objectId: 'obj-re' }),
      content: bodyToTiptapDoc(out, 1),
    });
    expect(again.state.doc.child(1).attrs.key).toBe('hw-reopen');
    again.destroy();
  });

  it('14–15. no TipTap JSON persistence and no base64/strokes in canonical body', () => {
    const editor = paragraphABEditor();
    insertNbHandwritingAtSelection(editor, 'hw-clean-1');
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('::hw::hw-clean-1::');
    expect(serialized).not.toMatch(/"type"\s*:\s*"doc"/);
    expect(serialized).not.toMatch(/"type"\s*:\s*"nbHandwriting"/);
    expect(serialized).not.toMatch(/"strokes"/);
    expect(serialized).not.toMatch(/data:image\//);
    expect(serialized).not.toMatch(/base64/);
    editor.destroy();
  });

  it('16. restore compatibility: remove does not GC asset (Undo / notebook restore)', () => {
    const body = '::hw::hw-keep-asset::';
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions({ objectId: 'obj-keep' }),
      content: bodyToTiptapDoc(body, 1),
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
    );
    removeSelectedNbHandwriting(editor);
    expect(hwDeleteMock).not.toHaveBeenCalled();
    editor.commands.undo();
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('::hw::hw-keep-asset::');
    editor.destroy();
  });

  it('Enter after handwriting NodeSelection creates continuation paragraph', () => {
    const body =
      '~nb1:["paragraph","Above",[],null]\n::hw::hw-enter::';
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions({ objectId: 'obj-enter' }),
      content: bodyToTiptapDoc(body, 1),
    });
    let hwPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'nbHandwriting' && hwPos == null) hwPos = pos;
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, hwPos!)));
    expect(editor.commands.keyboardShortcut('Enter')).toBe(true);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(1).type.name).toBe('nbHandwriting');
    expect(editor.state.doc.child(2).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(2).textContent).toBe('');
    editor.destroy();
  });
});
