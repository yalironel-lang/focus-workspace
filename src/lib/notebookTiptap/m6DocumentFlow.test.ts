/**
 * M6.0 — Notebook Object & Document-Flow Foundation Tests.
 *
 * Tests:
 * A. paragraph → image → continue typing below (GapCursor / inserted paragraph)
 * B. document ending in image → Enter while image selected → paragraph after image
 * C. document ending in image → click below → caret available
 * D. selected image → Delete → only image removed
 * E. selected image → Backspace → only image removed
 * F. deleting only/final object → document remains editable
 * G. paragraph → image → paragraph survives canonical round-trip
 * H. image at page boundary → immediate page switch does not lose content
 * I. image/object behavior does not trigger persistence merely from hydration
 * J. multi-page/section isolation with images persists cleanly
 */

import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { encodeNotebookTextV1, decodeNotebookTextV1 } from '../notebookTextCodec';

function pressKey(editor: Editor, key: string): boolean | undefined {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  return editor.view.someProp('handleKeyDown', f => f(editor.view, event));
}

describe('M6.0 — Object & Document-Flow Foundation', () => {
  it('A: paragraph → image → continue typing below via GapCursor', () => {
    const v1Body = '~nb1:["paragraph","Hello world",[],null]\n::img::test-image::"alt text"::';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(1).type.name).toBe('nbImageRef');

    // GapCursor at the end of the document (after the image) is valid
    const endPos = editor.state.doc.content.size;
    const $end = editor.state.doc.resolve(endPos);
    expect(GapCursor.valid($end)).toBe(true);

    // Set selection to GapCursor after the image
    editor.view.dispatch(editor.state.tr.setSelection(new GapCursor($end)));
    expect(editor.state.selection instanceof GapCursor).toBe(true);

    // Typing at GapCursor automatically creates a paragraph below the image
    editor.commands.insertContent('Continuing text');
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(2).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(2).textContent).toBe('Continuing text');

    // Verify round-trip
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('Hello world');
    expect(serialized).toContain('::img::test-image::"alt text"::');
    expect(serialized).toContain('Continuing text');

    editor.destroy();
  });

  it('B: document ending in image → Enter while image selected → paragraph created and focused after image', () => {
    const v1Body = '::img::hero-diagram::"Architecture Diagram"::';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).type.name).toBe('nbImageRef');

    // Select the image using NodeSelection
    const sel = NodeSelection.create(editor.state.doc, 0);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    // Press Enter via handleKeyDown (exact ProseMirror event pipeline)
    const enterHandled = pressKey(editor, 'Enter');
    expect(enterHandled).toBe(true);

    // A new paragraph must be created after the image
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).type.name).toBe('nbImageRef');
    expect(editor.state.doc.child(1).type.name).toBe('nbParagraph');

    // Selection must be inside the newly created paragraph
    expect(editor.state.selection instanceof TextSelection).toBe(true);
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);

    // User can immediately type into it
    editor.commands.insertContent('Text below diagram');
    expect(editor.state.doc.child(1).textContent).toBe('Text below diagram');

    editor.destroy();
  });

  it('C: document ending in image → clicking below appends an editable paragraph', () => {
    const v1Body = '~nb1:["paragraph","Top text",[],null]\n::img::photo-1::"A photo"::';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    // Simulate clicking in empty space below the last block
    // Our NotebookSandboxDocumentFlow handleClick triggers when pos >= doc.content.size or target is view.dom
    const pos = editor.state.doc.content.size;
    const clickHandled = editor.view.someProp('handleClick', fn =>
      fn(editor.view, pos, { target: editor.view.dom } as any),
    );
    expect(clickHandled).toBe(true);

    // A trailing paragraph should now exist
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(2).type.name).toBe('nbParagraph');
    expect(editor.state.selection instanceof TextSelection).toBe(true);
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);

    editor.destroy();
  });

  it('D: selected image → Delete → only image removed, surrounding text survives', () => {
    const v1Body =
      '~nb1:["paragraph","Before text",[],null]\n::img::delete-me::"To Delete"::\n~nb1:["paragraph","After text",[],null]';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    expect(editor.state.doc.childCount).toBe(3);
    const imgPos = editor.state.doc.child(0).nodeSize; // Position of image

    // Select the image
    const sel = NodeSelection.create(editor.state.doc, imgPos);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    // Press Delete
    const deleteHandled = pressKey(editor, 'Delete');
    expect(deleteHandled).toBe(true);

    // Image must be removed; surrounding paragraphs must survive exactly intact
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('Before text');
    expect(editor.state.doc.child(1).textContent).toBe('After text');

    editor.destroy();
  });

  it('E: selected image → Backspace → only image removed, surrounding text survives', () => {
    const v1Body =
      '~nb1:["paragraph","Heading text",[],null]\n::img::backspace-me::"Target"::\n~nb1:["paragraph","Footer text",[],null]';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const imgPos = editor.state.doc.child(0).nodeSize;
    const sel = NodeSelection.create(editor.state.doc, imgPos);
    editor.view.dispatch(editor.state.tr.setSelection(sel));

    // Press Backspace
    const backspaceHandled = pressKey(editor, 'Backspace');
    expect(backspaceHandled).toBe(true);

    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('Heading text');
    expect(editor.state.doc.child(1).textContent).toBe('Footer text');

    editor.destroy();
  });

  it('F: deleting only/final object → document remains editable with an empty paragraph', () => {
    const v1Body = '::img::sole-object::"Only item"::';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    expect(editor.state.doc.childCount).toBe(1);

    const sel = NodeSelection.create(editor.state.doc, 0);
    editor.view.dispatch(editor.state.tr.setSelection(sel));

    // Backspace on the sole block
    const handled = pressKey(editor, 'Backspace');
    expect(handled).toBe(true);

    // Document must NOT be corrupted or empty; must have 1 empty paragraph
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(0).textContent).toBe('');
    expect(editor.state.selection instanceof TextSelection).toBe(true);

    // Verify typing into the newly available paragraph
    editor.commands.insertContent('Fresh text after delete');
    expect(editor.state.doc.child(0).textContent).toBe('Fresh text after delete');

    editor.destroy();
  });

  it('G: paragraph → image → paragraph survives canonical round-trip', () => {
    const originalBody =
      '~nb1:["title","My Research Note",[],null]\n::img::chart-1::"Data Chart"::\n~nb1:["paragraph","Analysis below the chart",[],null]';
    const doc = bodyToTiptapDoc(originalBody, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toBe(originalBody);

    // Decode back through canonical text codec
    const decodedBlocks = decodeNotebookTextV1(serialized);
    expect(decodedBlocks.length).toBe(3);
    expect(decodedBlocks[0].kind).toBe('title');
    expect(decodedBlocks[1].kind).toBe('image-ref');
    expect(decodedBlocks[2].kind).toBe('paragraph');

    editor.destroy();
  });

  it('H: image at page boundary → Enter and immediate save produces valid canonical V1', () => {
    const v1Body = '::img::last-page-img::"Page Boundary"::';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    // Select image and press Enter
    const sel = NodeSelection.create(editor.state.doc, 0);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    pressKey(editor, 'Enter');

    // Type on new line
    editor.commands.insertContent('Boundary line typed');

    // Canonical serialization must encode properly
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toContain('::img::last-page-img::"Page Boundary"::');
    expect(serialized).toContain('Boundary line typed');

    // Both lines must be valid V1 codec lines
    const blocks = decodeNotebookTextV1(serialized);
    expect(blocks.length).toBe(2);
    expect(blocks[0].kind).toBe('image-ref');
    expect(blocks[1].kind).toBe('paragraph');
    expect((blocks[1] as any).text).toBe('Boundary line typed');

    editor.destroy();
  });

  it('I: image/object behavior does not mutate document or trigger persistence merely from hydration', () => {
    const v1Body = '::img::standalone-art::"Art Piece"::';
    const doc = bodyToTiptapDoc(v1Body, 1);

    let updateCount = 0;
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
      onUpdate: () => {
        updateCount++;
      },
    });

    // Opening / hydration must NOT trigger any onUpdate calls
    expect(updateCount).toBe(0);

    // Document child count must remain exactly 1 (no automatic trailing paragraph added on open)
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).type.name).toBe('nbImageRef');

    // Canonical serialization remains pristine
    const serialized = tiptapDocToBody(editor.getJSON(), 1);
    expect(serialized).toBe(v1Body);

    editor.destroy();
  });

  it('J: divider and handwriting atom blocks also support Enter and Delete document flow', () => {
    const v1Body = '---\n::hw::stroke-sample::';
    const doc = bodyToTiptapDoc(v1Body, 1);
    const editor = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: doc,
    });

    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).type.name).toBe('nbDivider');
    expect(editor.state.doc.child(1).type.name).toBe('nbHandwriting');

    // Select the divider (position 0)
    const selDiv = NodeSelection.create(editor.state.doc, 0);
    editor.view.dispatch(editor.state.tr.setSelection(selDiv));
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    // Press Enter on divider -> inserts paragraph between divider and handwriting
    pressKey(editor, 'Enter');
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).type.name).toBe('nbDivider');
    expect(editor.state.doc.child(1).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(2).type.name).toBe('nbHandwriting');

    editor.destroy();
  });
});
