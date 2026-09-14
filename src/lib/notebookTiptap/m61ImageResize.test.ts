/**
 * M6.1 — Professional Image Objects Tests.
 *
 * Tests:
 * A. Existing image without width loads normally.
 * B. Resized image round-trips: canonical body → TipTap → resize attr → canonical body.
 * C. Width survives encode/decode.
 * D. Width survives reload boundary.
 * E. Image resize does not modify alt/key.
 * F. Resize does not alter text before/after image.
 * G. Delete after resize still deletes only image.
 * H. Enter/click-below M6.0 behavior still works with resized image.
 * I. Immediate page switch after resize does not lose width/content.
 * J. Section switch preserves resized image.
 * K. Hydration/open does not write merely because image has/hasn't width.
 * L. Invalid width is rejected or normalized safely without document corruption.
 */

import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { encodeNotebookTextV1, decodeNotebookTextV1 } from '../notebookTextCodec';
import { parseNotebookLine, serializeNotebookBlocks, type NotebookDialectBlock } from '../notebookDialect';
import {
  applyNotebookPersist,
  switchNotebookPage,
  setActiveNotebookSection,
  type NotebookContentWithPages,
} from '../notebookPages';

function pressKey(editor: Editor, key: string): boolean | undefined {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  return editor.view.someProp('handleKeyDown', f => f(editor.view, event));
}

describe('M6.1 — Professional Image Objects', () => {
  it('A: Existing image without width loads normally', () => {
    // V1 line without width
    const v1BodyWithoutWidth = '::img::legacy-photo::"Historical photo"::';
    const doc = bodyToTiptapDoc(v1BodyWithoutWidth, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    expect(editor.state.doc.childCount).toBe(1);
    const node = editor.state.doc.child(0);
    expect(node.type.name).toBe('nbImageRef');
    expect(node.attrs.key).toBe('legacy-photo');
    expect(node.attrs.alt).toBe('Historical photo');
    expect(node.attrs.width).toBeNull();

    // Re-serializing without width modification must be byte-for-byte identical
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toBe(v1BodyWithoutWidth);

    editor.destroy();
  });

  it('B: Resized image round-trips: canonical body → TipTap → resize attr → canonical body', () => {
    const originalBody = '::img::sample-graph::"Chart"::';
    const doc = bodyToTiptapDoc(originalBody, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    // Update width attribute to 480px
    const sel = NodeSelection.create(editor.state.doc, 0);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    editor.commands.updateAttributes('nbImageRef', { width: 480 });

    expect(editor.state.doc.child(0).attrs.width).toBe(480);

    // Canonical serialization must produce ::img::key::"alt"::480::
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toBe('::img::sample-graph::"Chart"::480::');

    editor.destroy();
  });

  it('C: Width survives encode/decode in both V1 codec and dialect', () => {
    // V1 codec
    const blocksWithWidth: NotebookDialectBlock[] = [
      { id: 'img-1', kind: 'image-ref', key: 'diagram-alpha', alt: 'Alpha Flow', width: 640 },
    ];
    const encodedV1 = encodeNotebookTextV1(blocksWithWidth);
    expect(encodedV1).toBe('::img::diagram-alpha::"Alpha Flow"::640::');

    const decodedV1 = decodeNotebookTextV1(encodedV1);
    expect(decodedV1.length).toBe(1);
    expect(decodedV1[0]).toMatchObject({
      kind: 'image-ref',
      key: 'diagram-alpha',
      alt: 'Alpha Flow',
      width: 640,
    });

    // Legacy dialect
    const parsedLegacy = parseNotebookLine('::img::diagram-alpha::Alpha Flow::640::');
    expect(parsedLegacy).toMatchObject({
      kind: 'image-ref',
      key: 'diagram-alpha',
      alt: 'Alpha Flow',
      width: 640,
    });
    const serializedLegacy = serializeNotebookBlocks([
      { kind: 'image-ref', key: 'diagram-alpha', alt: 'Alpha Flow', width: 640 },
    ]);
    expect(serializedLegacy).toBe('::img::diagram-alpha::Alpha Flow::640::');
  });

  it('D: Width survives reload boundary', () => {
    const v1Body = '::img::saved-chart::"Quarterly Results"::520::';

    // First session: open and verify width
    const doc1 = bodyToTiptapDoc(v1Body, 1);
    const editor1 = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc1,
    });
    expect(editor1.state.doc.child(0).attrs.width).toBe(520);
    const persistedBody = tiptapDocToBody(editor1.getJSON(), 1);
    editor1.destroy();

    // Reload boundary simulation: fresh editor mounted from persisted body
    const doc2 = bodyToTiptapDoc(persistedBody, 1);
    const editor2 = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc2,
    });
    expect(editor2.state.doc.child(0).attrs.width).toBe(520);
    expect(editor2.state.doc.child(0).attrs.key).toBe('saved-chart');
    expect(editor2.state.doc.child(0).attrs.alt).toBe('Quarterly Results');
    editor2.destroy();
  });

  it('E: Image resize does not modify alt or key', () => {
    const v1Body = '::img::exact-key-123::"Exact Alt Description"::';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    editor.commands.updateAttributes('nbImageRef', { width: 350 });
    const node = editor.state.doc.child(0);
    expect(node.attrs.key).toBe('exact-key-123');
    expect(node.attrs.alt).toBe('Exact Alt Description');
    expect(node.attrs.width).toBe(350);

    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toBe('::img::exact-key-123::"Exact Alt Description"::350::');

    editor.destroy();
  });

  it('F: Resize does not alter text before or after image', () => {
    const originalBody =
      '~nb1:["paragraph","Lead text before the diagram",[],null]\n::img::flowchart::"Process Diagram"::\n~nb1:["paragraph","Follow-up text after the diagram",[],null]';
    const doc = bodyToTiptapDoc(originalBody, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    // Select the image at index 1 and resize it
    const sel = NodeSelection.create(editor.state.doc, editor.state.doc.child(0).nodeSize);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    editor.commands.updateAttributes('nbImageRef', { width: 720 });

    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('Lead text before the diagram');
    expect(editor.state.doc.child(1).attrs.width).toBe(720);
    expect(editor.state.doc.child(2).textContent).toBe('Follow-up text after the diagram');

    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('~nb1:["paragraph","Lead text before the diagram",[],null]');
    expect(serialized).toContain('::img::flowchart::"Process Diagram"::720::');
    expect(serialized).toContain('~nb1:["paragraph","Follow-up text after the diagram",[],null]');

    editor.destroy();
  });

  it('G: Delete after resize still deletes only image', () => {
    const body =
      '~nb1:["paragraph","Paragraph One",[],null]\n::img::to-delete::"Delete Me"::400::\n~nb1:["paragraph","Paragraph Two",[],null]';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    // Select the resized image
    const imgPos = editor.state.doc.child(0).nodeSize;
    const sel = NodeSelection.create(editor.state.doc, imgPos);
    editor.view.dispatch(editor.state.tr.setSelection(sel));

    // Press Delete
    pressKey(editor, 'Delete');

    // Resized image must be removed, surrounding paragraphs intact
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('Paragraph One');
    expect(editor.state.doc.child(1).textContent).toBe('Paragraph Two');

    editor.destroy();
  });

  it('H: Enter and click-below M6.0 behavior still works with resized image', () => {
    const body = '::img::resized-trailing::"Trailing Image"::450::';
    const doc = bodyToTiptapDoc(body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    // Select the image and press Enter
    const sel = NodeSelection.create(editor.state.doc, 0);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    pressKey(editor, 'Enter');

    // New editable paragraph created below
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(0).attrs.width).toBe(450);
    expect(editor.state.doc.child(1).type.name).toBe('nbParagraph');

    // Type text into the new paragraph
    editor.commands.insertContent('Continuing after resized image');
    expect(editor.state.doc.child(1).textContent).toBe('Continuing after resized image');

    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('::img::resized-trailing::"Trailing Image"::450::');
    expect(serialized).toContain('Continuing after resized image');

    editor.destroy();
  });

  it('I: Immediate page switch after resize does not lose width or content', () => {
    const page1Body = '::img::page1-art::"Page 1 Illustration"::';
    const page2Body = '~nb1:["paragraph","Page 2 text",[],null]';

    const initialContent: NotebookContentWithPages = {
      type: 'notebook',
      body: page1Body,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      activeSectionId: 'sec-1',
      activePageId: 'page-1',
      sections: [{ id: 'sec-1', title: 'Section', pageIds: ['page-1', 'page-2'] }],
      pages: [
        { id: 'page-1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: page1Body, documentBodyCodecVersion: 1 },
        { id: 'page-2', sectionId: 'sec-1', kind: 'document', title: 'P2', documentBody: page2Body, documentBodyCodecVersion: 1 },
      ],
    };

    // User resizes image on Page 1 to 550
    const doc1 = bodyToTiptapDoc(page1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc1,
    });
    editor.commands.updateAttributes('nbImageRef', { width: 550 });
    const liveRep = {
      body: tiptapDocToBody(editor.getJSON(), 1),
      codecVersion: 1,
    };
    editor.destroy();

    // Immediate save/flush before switching page
    const flushed = applyNotebookPersist(initialContent, liveRep);
    expect(flushed.pages![0]!.documentBody).toBe('::img::page1-art::"Page 1 Illustration"::550::');
    expect(flushed.pages![0]!.documentBodyCodecVersion).toBe(1);

    // Switch to Page 2
    const onPage2 = switchNotebookPage(flushed, 'page-2', liveRep.body, liveRep.codecVersion);
    expect(onPage2.activePageId).toBe('page-2');

    // Switch back to Page 1
    const backOnPage1 = switchNotebookPage(onPage2, 'page-1', page2Body, 1);
    const p1 = backOnPage1.pages!.find(p => p.id === 'page-1')!;
    expect(p1.documentBody).toBe('::img::page1-art::"Page 1 Illustration"::550::');
    expect(p1.documentBodyCodecVersion).toBe(1);
    expect(backOnPage1.body).toBe('::img::page1-art::"Page 1 Illustration"::550::');

    // Rehydrate back on Page 1 into TipTap
    const docReloaded = bodyToTiptapDoc(p1.documentBody!, p1.documentBodyCodecVersion);
    const edReloaded = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: docReloaded,
    });
    expect(edReloaded.state.doc.child(0).attrs.width).toBe(550);
    edReloaded.destroy();
  });

  it('J: Section switch preserves resized image', () => {
    const sec1Body = '::img::sec1-photo::"Section 1 Image"::380::';
    const sec2Body = '~nb1:["paragraph","Section 2 notes",[],null]';

    const notebook: NotebookContentWithPages = {
      type: 'notebook',
      body: sec1Body,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      activeSectionId: 's1',
      activePageId: 'p1',
      sections: [
        { id: 's1', title: 'Sec 1', pageIds: ['p1'] },
        { id: 's2', title: 'Sec 2', pageIds: ['p2'] },
      ],
      pages: [
        { id: 'p1', sectionId: 's1', kind: 'document', title: 'P1', documentBody: sec1Body, documentBodyCodecVersion: 1 },
        { id: 'p2', sectionId: 's2', kind: 'document', title: 'P2', documentBody: sec2Body, documentBodyCodecVersion: 1 },
      ],
    };

    // Switch section to s2
    const inSec2 = setActiveNotebookSection(notebook, 's2', sec1Body, 1);
    expect(inSec2.activeSectionId).toBe('s2');

    // Switch back to s1
    const inSec1 = setActiveNotebookSection(inSec2, 's1', sec2Body, 1);
    expect(inSec1.activeSectionId).toBe('s1');
    const p1 = inSec1.pages!.find(p => p.id === 'p1')!;
    expect(p1.documentBody).toBe(sec1Body);

    const doc = bodyToTiptapDoc(p1.documentBody!, p1.documentBodyCodecVersion);
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });
    expect(ed.state.doc.child(0).attrs.width).toBe(380);
    ed.destroy();
  });

  it('K: Hydration/open does not write merely because image has or hasn\'t width', () => {
    const v1WithWidth = '::img::standalone::"My Art"::420::';
    const doc = bodyToTiptapDoc(v1WithWidth, 1);

    let updateCount = 0;
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
      onUpdate: () => {
        updateCount++;
      },
    });

    // Opening must NOT dispatch transactions or trigger updates
    expect(updateCount).toBe(0);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).attrs.width).toBe(420);

    // Re-serializing must be exact
    expect(tiptapDocToBody(editor.getJSON(), 1)).toBe(v1WithWidth);
    editor.destroy();
  });

  it('L: Invalid width is rejected or normalized safely without document corruption', () => {
    // 1. Negative or zero width in V1 line fails closed
    expect(() => decodeNotebookTextV1('::img::invalid::"Bad"::0::')).toThrow();
    expect(() => decodeNotebookTextV1('::img::invalid::"Bad"::-100::')).toThrow();

    // 2. Extreme width (> 3000) in V1 line fails closed
    expect(() => decodeNotebookTextV1('::img::invalid::"Bad"::99999::')).toThrow();

    // 3. Floating or non-integer width in encode throws
    expect(() =>
      encodeNotebookTextV1([
        { kind: 'image-ref', key: 'img-1', alt: 'Float', width: 450.5 },
      ]),
    ).toThrow();

    // 4. TipTap node with invalid width attr is safely normalized in tiptapDocToBody
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'nbImageRef',
            attrs: { key: 'clean-key', alt: 'Alt', width: -50 },
          },
        ],
      },
    });
    // Negative width is ignored / normalized to un-sized instead of creating a corrupt body
    const body = tiptapDocToBody(ed.getJSON(), 1);
    expect(body).toBe('::img::clean-key::"Alt"::');
    ed.destroy();
  });
});
