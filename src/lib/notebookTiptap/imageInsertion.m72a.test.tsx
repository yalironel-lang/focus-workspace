/**
 * M7.2A — Notebook product image insertion UX.
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
  NOTEBOOK_IMAGE_FILE_ACCEPT,
  altFromImageFileName,
  insertNbImageRefAtSelection,
  resolveNbImageInsertTarget,
  selectTopLevelBlockBoundary,
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

function makePngFile(name = 'diagram.png'): File {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new File([bytes], name, { type: 'image/png' });
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
  nbImageSetMock.mockReset();
  nbImageSetMock.mockResolvedValue(true);
});

describe('M7.2A helper: storeNotebookImageFile', () => {
  it('stores exactly one asset and returns key/alt (no body mutation)', async () => {
    const file = makePngFile('my_chart.png');
    const result = await storeNotebookImageFile(file, { key: 'img-fixed-1' });
    expect(result).toEqual({ ok: true, key: 'img-fixed-1', alt: 'my chart' });
    expect(nbImageSetMock).toHaveBeenCalledTimes(1);
    const [key, dataUrl] = nbImageSetMock.mock.calls[0]!;
    expect(key).toBe('img-fixed-1');
    expect(String(dataUrl).startsWith('data:')).toBe(true);
    expect(String(dataUrl)).not.toMatch(/::img::/);
  });

  it('storage failure → ok:false, zero body side effects', async () => {
    nbImageSetMock.mockResolvedValue(false);
    const result = await storeNotebookImageFile(makePngFile());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('storage_failed');
    expect(nbImageSetMock).toHaveBeenCalledTimes(1);
  });

  it('non-image file → ok:false without store call', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const result = await storeNotebookImageFile(file);
    expect(result).toEqual({ ok: false, reason: 'not_image' });
    expect(nbImageSetMock).not.toHaveBeenCalled();
  });

  it('altFromImageFileName cleans extension and separators', () => {
    expect(altFromImageFileName('quarterly-results_v2.jpeg')).toBe('quarterly results v2');
  });
});

describe('M7.2A insertNbImageRefAtSelection', () => {
  it('inserts exactly one nbImageRef; surrounding text survives; body has ::img:: not base64', () => {
    const body =
      '~nb1:["paragraph","Line above",[],null]\n~nb1:["paragraph","Line below",[],null]';
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(body, 1),
    });
    // Place caret at end of first paragraph
    const endP1 = editor.state.doc.child(0).nodeSize - 1;
    editor.commands.setTextSelection(endP1);

    expect(insertNbImageRefAtSelection(editor, 'img-m72a', 'Diagram')).toBe(true);
    expect(editor.state.doc.childCount).toBe(3);
    const imgNodes = [];
    editor.state.doc.forEach(node => {
      if (node.type.name === 'nbImageRef') imgNodes.push(node);
    });
    expect(imgNodes).toHaveLength(1);
    expect(imgNodes[0]!.attrs.key).toBe('img-m72a');
    expect(imgNodes[0]!.attrs.width).toBeNull();

    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('Line above');
    expect(serialized).toContain('Line below');
    expect(serialized).toContain('::img::img-m72a::"Diagram"::');
    expect(serialized).not.toMatch(/data:image\//);
    expect(serialized).not.toMatch(/"type"\s*:\s*"doc"/);
    editor.destroy();
  });

  it('width semantics remain M6.1-compatible after insert (null → optional width)', () => {
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc('~nb1:["paragraph","x",[],null]', 1),
    });
    insertNbImageRefAtSelection(editor, 'img-w', 'W');
    // Select the image node then update width (M6.1 resize path)
    let imgPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'nbImageRef' && imgPos == null) imgPos = pos;
    });
    expect(imgPos).not.toBeNull();
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos!)));
    editor.commands.updateAttributes('nbImageRef', { width: 420 });
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('::img::img-w::"W"::420::');
    expect(serialized).toContain('x');
    editor.destroy();
  });
});

describe('M7.2A product UI entry', () => {
  it('1–2. Image action exists and invokes file input click', async () => {
    const onInsertImageFile = vi.fn();
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
        onInsertImageFile,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());

    const trigger = host!.querySelector('[data-nb-product-block="1"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(host!.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      trigger.click();
    });
    const menu = document.querySelector('[data-nb-product-block-menu="1"]');
    expect(menu).toBeTruthy();

    const option = host!.querySelector('[data-nb-product-image-option="1"]') as HTMLButtonElement
      ?? document.querySelector('[data-nb-product-image-option="1"]') as HTMLButtonElement;
    expect(option).toBeTruthy();
    expect(option.textContent).toMatch(/^Image$/);
    // Immediately after Step in product order
    const labels = Array.from(menu!.querySelectorAll('[role="menuitem"]')).map(
      el => (el.textContent ?? '').trim(),
    );
    expect(labels.indexOf('Image')).toBe(labels.indexOf('Step') + 1);

    const input = host!.querySelector(
      '[data-nb-product-image-input="1"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toBe(NOTEBOOK_IMAGE_FILE_ACCEPT);

    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    act(() => {
      option.click();
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(onInsertImageFile).not.toHaveBeenCalled(); // picker cancel / no file yet
    expect(document.querySelector('[data-nb-product-block-menu="1"]')).toBeNull();
  });

  it('3. cancel / empty file input = zero mutation callback', async () => {
    const onInsertImageFile = vi.fn();
    const onUserEdit = vi.fn();
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: 'Hello',
        pageKey: 'page-1',
        onReady,
        onUserEdit,
        onInsertImageFile,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const input = host!.querySelector(
      '[data-nb-product-image-input="1"]',
    ) as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onInsertImageFile).not.toHaveBeenCalled();
    expect(onUserEdit).not.toHaveBeenCalled();
    expect(nbImageSetMock).not.toHaveBeenCalled();
  });

  it('4–8. successful file selection stores one asset, inserts one ref, text survives', async () => {
    const bodies: string[] = [];
    let editor: Editor | null = null;
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody:
          '~nb1:["paragraph","Before",[],null]\n~nb1:["paragraph","After",[],null]',
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit: payload => {
          bodies.push(payload.body);
        },
        onInsertImageFile: async (file, ctx) => {
          const stored = await storeNotebookImageFile(file, { key: 'img-ui-1' });
          expect(stored.ok).toBe(true);
          if (!stored.ok || !editor) return;
          insertNbImageRefAtSelection(editor, stored.key, stored.alt, ctx.insertTarget);
        },
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => expect(editor).toBeTruthy());

    const input = host!.querySelector(
      '[data-nb-product-image-input="1"]',
    ) as HTMLInputElement;
    const file = makePngFile('photo.png');
    await act(async () => {
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: {
          0: file,
          length: 1,
          item: (i: number) => (i === 0 ? file : null),
        },
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await vi.waitFor(() => expect(nbImageSetMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(bodies.length).toBeGreaterThan(0));

    const last = bodies.at(-1)!;
    expect(last).toContain('::img::img-ui-1::');
    expect(last).toContain('Before');
    expect(last).toContain('After');
    expect(last).not.toMatch(/data:image\//);
    expect(last).not.toMatch(/"type"\s*:\s*"doc"/);

    let imgCount = 0;
    editor!.state.doc.forEach(n => {
      if (n.type.name === 'nbImageRef') imgCount += 1;
    });
    expect(imgCount).toBe(1);
  });
});

describe('M7.2A multi-page + refresh', () => {
  it('6 + 9. insertion affects only active page; reopen preserves ::img:: width', () => {
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
      '~nb1:["paragraph","P2 text",[],null]\n::img::img-page2::"Shot"::480::';
    nb = applyNotebookPersist(nb, { body: p2Body, codecVersion: 1 });

    expect(findActivePage(nb)?.id).toBe('p2');
    expect(nb.pages!.find(p => p.id === 'p1')!.documentBody).toContain('P1 text');
    expect(nb.pages!.find(p => p.id === 'p1')!.documentBody).not.toContain('::img::');
    expect(nb.pages!.find(p => p.id === 'p2')!.documentBody).toContain('::img::img-page2::"Shot"::480::');
    expect(nb.pages!.find(p => p.id === 'p3')!.documentBody).toContain('P3 text');
    expect(nb.pages!.find(p => p.id === 'p3')!.documentBody).not.toContain('::img::');

    // Refresh/reopen hydrate
    const reloaded = bodyToTiptapDoc(nb.pages!.find(p => p.id === 'p2')!.documentBody!, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: reloaded,
    });
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(1).attrs.key).toBe('img-page2');
    expect(editor.state.doc.child(1).attrs.width).toBe(480);
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('::img::img-page2::"Shot"::480::');
    editor.destroy();
  });

  it('12. missing asset ref remains non-destructive on hydrate', () => {
    const body = '::img::missing-key::"Gone"::';
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(body, 1),
    });
    expect(editor.state.doc.child(0).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(0).attrs.key).toBe('missing-key');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('::img::missing-key::');
    editor.destroy();
  });
});

describe('M7.2A block-boundary insertion (no blank paragraph)', () => {
  function paragraphABEditor() {
    const body =
      '~nb1:["paragraph","Paragraph A",[],null]\n~nb1:["paragraph","Paragraph B",[],null]';
    return new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(body, 1),
    });
  }

  it('A+B no blank para: caret at end of A → Image → A, image, B; no empty paragraph persisted', () => {
    const editor = paragraphABEditor();
    expect(editor.state.doc.childCount).toBe(2);
    const endA = editor.state.doc.child(0).nodeSize - 1;
    editor.commands.setTextSelection(endA);
    const target = resolveNbImageInsertTarget(editor.state);
    expect(target).toEqual({ kind: 'pos', pos: editor.state.doc.child(0).nodeSize });

    insertNbImageRefAtSelection(editor, 'img-bound', 'Between', target);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Paragraph A');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(2).textContent).toBe('Paragraph B');

    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toBe(
      '~nb1:["paragraph","Paragraph A",[],null]\n::img::img-bound::"Between"::\n~nb1:["paragraph","Paragraph B",[],null]',
    );
    // No empty paragraph merely to enable insertion
    expect(serialized).not.toMatch(/\["paragraph","",/);

    const reopened = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(serialized, 1),
    });
    expect(reopened.state.doc.childCount).toBe(3);
    expect(reopened.state.doc.child(0).textContent).toBe('Paragraph A');
    expect(reopened.state.doc.child(1).attrs.key).toBe('img-bound');
    expect(reopened.state.doc.child(2).textContent).toBe('Paragraph B');
    reopened.destroy();
    editor.destroy();
  });

  it('A+B: caret at start of B → same A → image → B order', () => {
    const editor = paragraphABEditor();
    const startB = editor.state.doc.child(0).nodeSize + 1;
    editor.commands.setTextSelection(startB);
    const target = resolveNbImageInsertTarget(editor.state);
    expect(target.kind).toBe('pos');
    insertNbImageRefAtSelection(editor, 'img-startb', 'X', target);
    expect(editor.state.doc.child(0).textContent).toBe('Paragraph A');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(2).textContent).toBe('Paragraph B');
    expect(tiptapDocToBody(editor.getJSON(), 1)).not.toMatch(/\["paragraph","",/);
    editor.destroy();
  });

  it('selectTopLevelBlockBoundary between A and B yields boundary insert target', () => {
    const editor = paragraphABEditor();
    const insertPos = editor.state.doc.child(0).nodeSize;
    selectTopLevelBlockBoundary(editor.view, insertPos);
    const target = resolveNbImageInsertTarget(editor.state);
    expect(target).toEqual({ kind: 'pos', pos: insertPos });
    insertNbImageRefAtSelection(editor, 'img-seam', 'Seam', target);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('Paragraph A');
    expect(tiptapDocToBody(editor.getJSON(), 1)).toContain('Paragraph B');
    expect(tiptapDocToBody(editor.getJSON(), 1)).not.toMatch(/\["paragraph","",/);
    editor.destroy();
  });

  it('normal mid-paragraph caret still inserts (split path) without losing other paragraph', () => {
    const editor = paragraphABEditor();
    editor.commands.setTextSelection(3); // inside "Paragraph A"
    const target = resolveNbImageInsertTarget(editor.state);
    expect(target).toEqual({ kind: 'split' });
    insertNbImageRefAtSelection(editor, 'img-mid', 'Mid', target);
    expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(3);
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('::img::img-mid::');
    expect(serialized).toContain('Paragraph B');
    editor.destroy();
  });
});
