/**
 * Permanent regression suite for M6.1 image & text document flow,
 * keymap safety, click behavior, and live TipTap state preservation.
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { applyNotebookPersist, findActivePage } from '../notebookPages/hydrate';
import { migrateLegacyNotebook } from '../notebookPages/legacyMigration';
import type { NotebookContent } from '../../types/notebook';

function pressKey(editor: Editor, key: string): boolean | undefined {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  return editor.view.someProp('handleKeyDown', f => f(editor.view, event));
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
});

describe('M6.1 Permanent Regression Suite: Requirements A through Q', () => {
  // -------------------------------------------------------------------------
  // TEST A: Backspace at start of trailing paragraph after image
  // -------------------------------------------------------------------------
  it('Requirement A: Backspace at start of trailing paragraph selects image without deleting it or text', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::\n~nb1:["paragraph","Text below",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    expect(editor.state.doc.childCount).toBe(3);
    const p1 = editor.state.doc.child(0);
    const img = editor.state.doc.child(1);
    const startP2 = p1.nodeSize + img.nodeSize + 1; // Caret at start of "Text below"

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, startP2)));
    expect(editor.state.selection.from).toBe(startP2);

    const handled = pressKey(editor, 'Backspace');
    expect(handled).toBe(true);

    // Image survives
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Text above');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(2).textContent).toBe('Text below');

    // Image becomes selected using NodeSelection
    expect(editor.state.selection instanceof NodeSelection).toBe(true);
    expect(editor.state.selection.from).toBe(p1.nodeSize);

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST B: Delete at end of leading paragraph before image
  // -------------------------------------------------------------------------
  it('Requirement B: Delete at end of leading paragraph selects image without deleting it or text', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::\n~nb1:["paragraph","Text below",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const endP1 = p1.content.size + 1; // Caret at end of "Text above"

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, endP1)));
    expect(editor.state.selection.from).toBe(endP1);

    const handled = pressKey(editor, 'Delete');
    expect(handled).toBe(true);

    // Image survives
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Text above');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(2).textContent).toBe('Text below');

    // Image becomes selected using NodeSelection
    expect(editor.state.selection instanceof NodeSelection).toBe(true);
    expect(editor.state.selection.from).toBe(p1.nodeSize);

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST C: Second explicit Delete/Backspace on selected image
  // -------------------------------------------------------------------------
  it('Requirement C: Second explicit Delete or Backspace on selected image deletes only image; surrounding text remains', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::\n~nb1:["paragraph","Text below",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const imgPos = p1.nodeSize;

    // Explicit NodeSelection on image
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    // Press Delete
    const handled = pressKey(editor, 'Delete');
    expect(handled).toBe(true);

    // Image is deleted; surrounding text remains intact
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('Text above');
    expect(editor.state.doc.child(1).textContent).toBe('Text below');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST D: Normal paragraph-to-paragraph Backspace behavior remains unchanged
  // -------------------------------------------------------------------------
  it('Requirement D: Normal paragraph-to-paragraph Backspace joins blocks normally', () => {
    const body = '~nb1:["paragraph","Para 1",[],null]\n~nb1:["paragraph","Para 2",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const startP2 = p1.nodeSize + 1; // Caret at start of Para 2

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, startP2)));
    const handled = pressKey(editor, 'Backspace');
    expect(handled).toBe(true);

    // Para 2 joined into Para 1
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).textContent).toBe('Para 1Para 2');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST E: Normal paragraph-to-paragraph Delete behavior remains unchanged
  // -------------------------------------------------------------------------
  it('Requirement E: Normal paragraph-to-paragraph Delete joins blocks normally', () => {
    const body = '~nb1:["paragraph","Para 1",[],null]\n~nb1:["paragraph","Para 2",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const endP1 = editor.state.doc.child(0).content.size + 1;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, endP1)));

    // Forward Delete at end of Para 1 falls through to joinForward/default delete
    pressKey(editor, 'Delete');
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).textContent).toBe('Para 1Para 2');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST F: Clicking inside existing text does not move caret to document end
  // -------------------------------------------------------------------------
  it('Requirement F: Clicking inside existing text does not hijack caret to document end', async () => {
    const v1Body =
      '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::\n~nb1:["paragraph","Text below",[],null]';
    let editorInstance: Editor | null = null;

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: v1Body,
        sourceBodyCodecVersion: 1,
        pageKey: 'req-f',
        onEditorReady: ed => {
          editorInstance = ed;
        },
      }),
    );

    await vi.waitFor(() => expect(editorInstance).not.toBeNull());
    const editor = editorInstance!;

    // Place caret at index 4 inside "Text above"
    act(() => {
      editor.commands.setTextSelection(4);
    });
    expect(editor.state.selection.from).toBe(4);

    // Mock getBoundingClientRect so editor has height/bottom
    const pmEl = host!.querySelector('.ProseMirror') as HTMLElement;
    vi.spyOn(pmEl, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 200,
      left: 10,
      right: 500,
      width: 490,
      height: 190,
      x: 10,
      y: 10,
      toJSON: () => {},
    });

    // Simulate click on paragraph element within ProseMirror
    act(() => {
      const pEl = pmEl.querySelector('p');
      pEl?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 50 }));
    });

    // Caret was NOT hijacked to end of document
    expect(editor.state.selection.from).toBe(4);
  });

  // -------------------------------------------------------------------------
  // TEST G: Clicking horizontal whitespace near an existing paragraph does not append a paragraph
  // -------------------------------------------------------------------------
  it('Requirement G: Clicking horizontal whitespace beside paragraph does not append paragraph', async () => {
    const v1Body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::';
    let editorInstance: Editor | null = null;

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: v1Body,
        sourceBodyCodecVersion: 1,
        pageKey: 'req-g',
        onEditorReady: ed => {
          editorInstance = ed;
        },
      }),
    );

    await vi.waitFor(() => expect(editorInstance).not.toBeNull());
    const editor = editorInstance!;
    expect(editor.state.doc.childCount).toBe(2);

    const rootEl = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    const pmEl = host!.querySelector('.ProseMirror') as HTMLElement;
    vi.spyOn(pmEl, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 200,
      left: 10,
      right: 500,
      width: 490,
      height: 190,
      x: 10,
      y: 10,
      toJSON: () => {},
    });

    // Click inside the vertical bounds of the document (clientY = 100 <= 200)
    act(() => {
      rootEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 100 }));
    });

    // Does NOT append an unwanted paragraph!
    expect(editor.state.doc.childCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // TEST H: Clicking below trailing atom allows continued writing below it
  // -------------------------------------------------------------------------
  it('Requirement H: Clicking strictly below trailing atom appends paragraph and focuses it', async () => {
    const v1Body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::';
    let editorInstance: Editor | null = null;

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: v1Body,
        sourceBodyCodecVersion: 1,
        pageKey: 'req-h',
        onEditorReady: ed => {
          editorInstance = ed;
        },
      }),
    );

    await vi.waitFor(() => expect(editorInstance).not.toBeNull());
    const editor = editorInstance!;
    expect(editor.state.doc.childCount).toBe(2);

    const rootEl = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    const pmEl = host!.querySelector('.ProseMirror') as HTMLElement;
    vi.spyOn(pmEl, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 200,
      left: 10,
      right: 500,
      width: 490,
      height: 190,
      x: 10,
      y: 10,
      toJSON: () => {},
    });

    // Click strictly below editor (clientY = 350 > 200)
    act(() => {
      rootEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 350 }));
    });

    // Appended one paragraph below image and focused it
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(2).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(2).textContent).toBe('');
  });

  // -------------------------------------------------------------------------
  // TEST I: Repeated below-document clicks do not create multiple empty paragraphs
  // -------------------------------------------------------------------------
  it('Requirement I: Repeated below-document clicks do not create multiple empty paragraphs', async () => {
    const v1Body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::';
    let editorInstance: Editor | null = null;

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: v1Body,
        sourceBodyCodecVersion: 1,
        pageKey: 'req-i',
        onEditorReady: ed => {
          editorInstance = ed;
        },
      }),
    );

    await vi.waitFor(() => expect(editorInstance).not.toBeNull());
    const editor = editorInstance!;
    const rootEl = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    const pmEl = host!.querySelector('.ProseMirror') as HTMLElement;
    vi.spyOn(pmEl, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 200,
      left: 10,
      right: 500,
      width: 490,
      height: 190,
      x: 10,
      y: 10,
      toJSON: () => {},
    });

    // First click below document
    act(() => {
      rootEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 350 }));
    });
    expect(editor.state.doc.childCount).toBe(3);

    // Second click below document
    act(() => {
      rootEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 360 }));
    });
    // Still 3! No duplicate empty paragraph created!
    expect(editor.state.doc.childCount).toBe(3);

    // Third click below document
    act(() => {
      rootEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 370 }));
    });
    expect(editor.state.doc.childCount).toBe(3);
  });

  // -------------------------------------------------------------------------
  // TEST J & K: Resize handles & Reset Size do not trigger container click side effects
  // -------------------------------------------------------------------------
  it('Requirement J & K: Resize handle and Reset Size interaction do not trigger container click', async () => {
    const v1Body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::';
    let editorInstance: Editor | null = null;

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: v1Body,
        sourceBodyCodecVersion: 1,
        pageKey: 'req-jk',
        onEditorReady: ed => {
          editorInstance = ed;
        },
      }),
    );

    await vi.waitFor(() => expect(editorInstance).not.toBeNull());
    const editor = editorInstance!;
    expect(editor.state.doc.childCount).toBe(2);

    // Select the image to show handles and reset button
    const p1 = editor.state.doc.child(0);
    act(() => {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p1.nodeSize)));
    });

    const rootEl = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    const resizeHandle = host!.querySelector('[data-nb-resize-handle="right"]') as HTMLElement;
    const resetBtn = host!.querySelector('[data-nb-image-reset="true"]') as HTMLElement;

    expect(resizeHandle).not.toBeNull();
    expect(resetBtn).not.toBeNull();

    // Click resize handle
    act(() => {
      resizeHandle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    // No new paragraph appended
    expect(editor.state.doc.childCount).toBe(2);

    // Click reset button
    act(() => {
      resetBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    // No new paragraph appended
    expect(editor.state.doc.childCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // TEST L: Candidate image insertion preserves recent live text typed before paste/drop
  // -------------------------------------------------------------------------
  it('Requirement L: Candidate image insertion preserves recent live text typed immediately before insertion', () => {
    const body = '~nb1:["paragraph","Live typed text before",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    let emittedBody: string | null = null;
    let emittedCodec: number | null = null;

    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON();
        emittedBody = tiptapDocToBody(json, 1);
        emittedCodec = 1;
      },
    });

    // User is at the end of the text and inserts an image (simulating paste/drop via candidate command)
    editor.chain().focus('end').insertContent({
      type: 'nbImageRef',
      attrs: { key: 'pasted-img', alt: 'Pasted Image', width: null },
    }).run();

    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('Live typed text before');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');

    // Serialized output contains BOTH the live text and the inserted image
    expect(emittedBody).toContain('Live typed text before');
    expect(emittedBody).toContain('::img::pasted-img::"Pasted Image"::');
    expect(emittedCodec).toBe(1);

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST M: Candidate image insertion preserves recent live text immediately after image insertion
  // -------------------------------------------------------------------------
  it('Requirement M: Candidate image insertion preserves recent live text immediately after image insertion', () => {
    const body = '~nb1:["paragraph","Live typed text before",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    let emittedBody: string | null = null;

    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON();
        emittedBody = tiptapDocToBody(json, 1);
      },
    });

    // 1. Insert image
    editor.chain().focus('end').insertContent({
      type: 'nbImageRef',
      attrs: { key: 'pasted-img', alt: 'Pasted Image', width: null },
    }).run();

    // 2. User types text below the image
    const endPos = editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(endPos, {
      type: 'nbParagraph',
      attrs: { variant: null, dir: 'auto' },
      content: [{ type: 'text', text: 'Live typed text after' }],
    }).run();

    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Live typed text before');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(2).textContent).toBe('Live typed text after');

    // Emitted body contains all three
    expect(emittedBody).toContain('Live typed text before');
    expect(emittedBody).toContain('::img::pasted-img::"Pasted Image"::');
    expect(emittedBody).toContain('Live typed text after');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST N: Immediate Page switch after paste/drop does not lose text/image
  // -------------------------------------------------------------------------
  it('Requirement N: Immediate Page switch after paste/drop preserves text and image', () => {
    const initialContent: NotebookContent = {
      type: 'notebook',
      activePageId: 'page-1',
      pages: [
        { id: 'page-1', title: 'Page 1', kind: 'document', documentBody: '~nb1:["paragraph","Page 1 text",[],null]', documentBodyCodecVersion: 1 },
        { id: 'page-2', title: 'Page 2', kind: 'document', documentBody: '~nb1:["paragraph","Page 2 text",[],null]', documentBodyCodecVersion: 1 },
      ],
      body: '~nb1:["paragraph","Page 1 text",[],null]',
      bodyCodecVersion: 1,
    };

    // Simulate candidate user edit inserting an image on page 1
    const candidateLiveRepresentation = {
      body: '~nb1:["paragraph","Page 1 text",[],null]\n::img::pasted-img-1::"Photo"::\n~nb1:["paragraph","Page 1 text after",[],null]',
      codecVersion: 1,
    };

    // Immediate page switch: applyNotebookPersist flushes candidateLiveRepresentation into page-1
    const persisted = applyNotebookPersist(initialContent, candidateLiveRepresentation);
    expect(persisted.pages?.[0]?.documentBody).toBe(candidateLiveRepresentation.body);

    // Switch activePageId to page-2
    const switchedContent: NotebookContent = {
      ...persisted,
      activePageId: 'page-2',
      body: persisted.pages?.[1]?.documentBody,
      bodyCodecVersion: persisted.pages?.[1]?.documentBodyCodecVersion,
    };

    // Return to page-1: page 1 content is 100% intact with text and image
    const returnedContent: NotebookContent = {
      ...switchedContent,
      activePageId: 'page-1',
      body: switchedContent.pages?.[0]?.documentBody,
      bodyCodecVersion: switchedContent.pages?.[0]?.documentBodyCodecVersion,
    };

    expect(returnedContent.body).toContain('Page 1 text');
    expect(returnedContent.body).toContain('::img::pasted-img-1::');
    expect(returnedContent.body).toContain('Page 1 text after');
  });

  // -------------------------------------------------------------------------
  // TEST O: Section switch and return does not lose text/image
  // -------------------------------------------------------------------------
  it('Requirement O: Section switch and return does not lose text and image', () => {
    const initialContent: NotebookContent = {
      type: 'notebook',
      activeSectionId: 'sec-1',
      activePageId: 'page-1',
      sections: [
        { id: 'sec-1', name: 'Section 1' },
        { id: 'sec-2', name: 'Section 2' },
      ],
      pages: [
        { id: 'page-1', sectionId: 'sec-1', title: 'P1', kind: 'document', documentBody: 'Initial', documentBodyCodecVersion: 1 },
        { id: 'page-2', sectionId: 'sec-2', title: 'P2', kind: 'document', documentBody: 'Section 2 text', documentBodyCodecVersion: 1 },
      ],
      body: 'Initial',
      bodyCodecVersion: 1,
    };

    // Live edit on page 1 with image and surrounding text
    const liveBody = '~nb1:["paragraph","Section 1 notes",[],null]\n::img::diagram-1::"Diagram"::600::\n~nb1:["paragraph","Followup notes",[],null]';
    const persisted = applyNotebookPersist(initialContent, { body: liveBody, codecVersion: 1 });

    // Switch section to sec-2
    const switched = {
      ...persisted,
      activeSectionId: 'sec-2',
      activePageId: 'page-2',
    };

    // Return to sec-1
    const returned = {
      ...switched,
      activeSectionId: 'sec-1',
      activePageId: 'page-1',
    };

    const activePage = findActivePage(returned);
    expect(activePage?.documentBody).toBe(liveBody);
    expect(activePage?.documentBody).toContain('::img::diagram-1::"Diagram"::600::');
  });

  // -------------------------------------------------------------------------
  // TEST P: Refresh preserves text + image + image sizing metadata
  // -------------------------------------------------------------------------
  it('Requirement P: Reload/hydration preserves text + image + width metadata', () => {
    const persistedBody = '~nb1:["paragraph","Before image",[],null]\n::img::k-99::"My Alt"::750::\n~nb1:["paragraph","After image",[],null]';
    const doc = bodyToTiptapDoc(persistedBody, 1);

    expect(doc.content).toHaveLength(3);
    const imgNode = doc.content[1];
    expect(imgNode.type).toBe('nbImageRef');
    expect(imgNode.attrs.key).toBe('k-99');
    expect(imgNode.attrs.alt).toBe('My Alt');
    expect(imgNode.attrs.width).toBe(750);

    // Re-serialize back to body
    const rehydrated = tiptapDocToBody(doc, 1);
    expect(rehydrated).toBe(persistedBody);
  });

  // -------------------------------------------------------------------------
  // TEST Q: Hydration/open still performs zero writes
  // -------------------------------------------------------------------------
  it('Requirement Q: Hydration/open performs zero writes (onUserEdit not called on mount)', async () => {
    const v1Body = '~nb1:["paragraph","Static text",[],null]\n::img::img-static::"Static"::500::';
    const onUserEditSpy = vi.fn();

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: v1Body,
        sourceBodyCodecVersion: 1,
        pageKey: 'req-q',
        onUserEdit: onUserEditSpy,
      }),
    );

    // Wait for mount and editor ready
    await new Promise(r => setTimeout(r, 100));

    // Zero writes on mount!
    expect(onUserEditSpy).not.toHaveBeenCalled();
  });
});

describe('M6.1 NodeSelection Typing Safety Suite (Requirements A through J)', () => {
  // -------------------------------------------------------------------------
  // TEST A: Image selected + type "a" (no paragraph after image)
  // -------------------------------------------------------------------------
  it('Requirement A: Image selected + type "a" preserves image and creates paragraph after it with "a"', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const imgPos = p1.nodeSize;

    // Select the image via NodeSelection
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    // User types "a"
    const handled = pressKey(editor, 'a');
    expect(handled).toBe(true);

    // Image remains intact; a new paragraph after image contains "a"
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Text above');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(1).attrs.key).toBe('img-1');
    expect(editor.state.doc.child(2).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(2).textContent).toBe('a');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST B: Image selected + existing paragraph after it + type "a"
  // -------------------------------------------------------------------------
  it('Requirement B: Image selected + existing paragraph after it + type "a" preserves image and inserts into following paragraph', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::\n~nb1:["paragraph","Existing below",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const imgPos = p1.nodeSize;

    // Select the image via NodeSelection
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    // User types "a"
    const handled = pressKey(editor, 'a');
    expect(handled).toBe(true);

    // Image remains intact; text is prepended to existing following paragraph
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Text above');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(2).textContent).toBe('aExisting below');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST C: Handwriting selected + typing
  // -------------------------------------------------------------------------
  it('Requirement C: Handwriting selected + typing preserves handwriting object and writes to adjacent paragraph', () => {
    const body = '~nb1:["paragraph","Notes above",[],null]\n::hw::hw-1::';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const hwPos = p1.nodeSize;

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, hwPos)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    const handled = pressKey(editor, 'z');
    expect(handled).toBe(true);

    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Notes above');
    expect(editor.state.doc.child(1).type.name).toBe('nbHandwriting');
    expect(editor.state.doc.child(2).textContent).toBe('z');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST D: Divider selected + typing
  // -------------------------------------------------------------------------
  it('Requirement D: Divider selected + typing preserves divider and writes to adjacent paragraph', () => {
    const body = '~nb1:["paragraph","Above divider",[],null]\n---';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const divPos = p1.nodeSize;

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, divPos)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    const handled = pressKey(editor, 'x');
    expect(handled).toBe(true);

    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Above divider');
    expect(editor.state.doc.child(1).type.name).toBe('nbDivider');
    expect(editor.state.doc.child(2).textContent).toBe('x');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST E: Block math selected + typing
  // -------------------------------------------------------------------------
  it('Requirement E: Block math selected + typing preserves math object and writes to adjacent paragraph', () => {
    const body = '~nb1:["paragraph","Above math",[],null]\n~nb1:["math","E=mc^2",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const mathPos = p1.nodeSize;

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, mathPos)));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    const handled = pressKey(editor, 'm');
    expect(handled).toBe(true);

    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Above math');
    expect(editor.state.doc.child(1).type.name).toBe('nbMath');
    expect(editor.state.doc.child(2).textContent).toBe('m');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST F: Explicit Delete on NodeSelection still deletes the object
  // -------------------------------------------------------------------------
  it('Requirement F: Explicit Delete on NodeSelection still deletes the object', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::\n~nb1:["paragraph","Text below",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p1.nodeSize)));

    const handled = pressKey(editor, 'Delete');
    expect(handled).toBe(true);

    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('Text above');
    expect(editor.state.doc.child(1).textContent).toBe('Text below');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST G: Explicit Backspace on NodeSelection still deletes the object
  // -------------------------------------------------------------------------
  it('Requirement G: Explicit Backspace on NodeSelection still deletes the object', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::\n~nb1:["paragraph","Text below",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p1.nodeSize)));

    const handled = pressKey(editor, 'Backspace');
    expect(handled).toBe(true);

    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('Text above');
    expect(editor.state.doc.child(1).textContent).toBe('Text below');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST H: Enter on selected image still creates/focuses paragraph below
  // -------------------------------------------------------------------------
  it('Requirement H: Enter on selected image still creates/focuses paragraph below', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p1.nodeSize)));

    const handled = pressKey(editor, 'Enter');
    expect(handled).toBe(true);

    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Text above');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(2).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(2).textContent).toBe('');
    expect(editor.state.selection instanceof TextSelection).toBe(true);

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST I: Typing after resize does not delete image
  // -------------------------------------------------------------------------
  it('Requirement I: Typing after resize does not delete image', () => {
    const body = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::400::';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    const imgPos = p1.nodeSize;

    // Select image and update width (simulating resize completion)
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)));
    editor.commands.updateAttributes('nbImageRef', { width: 650 });

    expect(editor.state.doc.child(1).attrs.width).toBe(650);
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    // User types "w"
    const handled = pressKey(editor, 'w');
    expect(handled).toBe(true);

    // Image survives with its resized width! Text appears in paragraph below
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(1).attrs.width).toBe(650);
    expect(editor.state.doc.child(2).textContent).toBe('w');

    editor.destroy();
  });

  // -------------------------------------------------------------------------
  // TEST J: Persistence/reload preserves object + typed text
  // -------------------------------------------------------------------------
  it('Requirement J: Persistence/reload preserves object + typed text', () => {
    const initialBody = '~nb1:["paragraph","Text above",[],null]\n::img::img-1::"Alt"::550::';
    const doc = bodyToTiptapDoc(initialBody, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const p1 = editor.state.doc.child(0);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p1.nodeSize)));

    // Type character "p"
    pressKey(editor, 'p');

    // Serialize to canonical body
    const savedBody = tiptapDocToBody(editor.getJSON(), 1);
    expect(savedBody).toContain('::img::img-1::"Alt"::550::');
    expect(savedBody).toContain('Text above');
    expect(savedBody).toContain('p');

    // Rehydrate into a new editor
    const reloadedDoc = bodyToTiptapDoc(savedBody, 1);
    const reloadedEditor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: reloadedDoc,
    });

    expect(reloadedEditor.state.doc.childCount).toBe(3);
    expect(reloadedEditor.state.doc.child(0).textContent).toBe('Text above');
    expect(reloadedEditor.state.doc.child(1).type.name).toBe('nbImageRef');
    expect(reloadedEditor.state.doc.child(1).attrs.width).toBe(550);
    expect(reloadedEditor.state.doc.child(2).textContent).toBe('p');

    editor.destroy();
    reloadedEditor.destroy();
  });
});
