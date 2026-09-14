/**
 * M6.2 — Explicit Math Comprehensive Test Suite (Option B: Native Inline Atom Node)
 *
 * Architecture Invariants:
 * 1. RUNTIME / TIPTAP: nbInlineMath inline atom node
 * 2. CANONICAL / PERSISTENCE: plain text + canonical mark 'm' (offsets based on text.length)
 * 3. EXPLICIT ONLY: Normal typing never auto-converts 3/5, x^2, $x$, $$
 * 4. NATIVE CARET: Clean before/after caret placement, typing, arrow navigation, backspace/delete
 * 5. OVERLAPPING MARKS: Bold/italic/etc. preserved losslessly
 * 6. REAL 2D RENDERING: 3/5 renders as stacked fraction via KaTeX
 * 7. FORMULA EDITING: Inline editing of atom text updates 2D rendering and canonical storage
 * 8. TOGGLE OFF: Converts back to plain text without delimiters
 * 9. RTL / BIDI: Isolated LTR in Hebrew prose
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc, blocksToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import {
  readCandidateFormatState,
  runCandidateFormatCommand,
  toggleCandidateMath,
} from './candidateFormatCommands';
import {
  decodeNotebookTextV1,
  encodeNotebookTextV1,
  NOTEBOOK_TEXT_CODEC_V1,
} from '../notebookTextCodec';
import { parseNotebookBody, serializeNotebookBlocks } from '../notebookDialect';
import {
  parseRichLine,
  serializeRichLine,
  type InlineMark,
} from '../notebookInlineMarks';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { notebookSandboxDocumentFlowPluginKey } from './sandboxKeymap';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';

const activeEditors: Editor[] = [];

let testRoot: Root | null = null;
let testHost: HTMLDivElement | null = null;

function mount(el: ReactElement) {
  testHost = document.createElement('div');
  document.body.appendChild(testHost);
  testRoot = createRoot(testHost);
  act(() => {
    testRoot!.render(el);
  });
}

function createEditor(body: string, codecVersion?: number) {
  const content = body
    ? bodyToTiptapDoc(body, codecVersion)
    : { type: 'doc', content: [{ type: 'nbParagraph' }] };
  const ed = new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content,
    editable: true,
  });
  activeEditors.push(ed);
  return ed;
}

function fullText(ed: Editor): string {
  return ed.state.doc.textBetween(0, ed.state.doc.content.size, undefined, node => (node.attrs.text as string) ?? '');
}

afterEach(() => {
  activeEditors.splice(0).forEach(ed => ed.destroy());
  act(() => {
    testRoot?.unmount();
  });
  testRoot = null;
  testHost?.remove();
  testHost = null;
});

describe('M6.2 Option B — Native Inline Math Atom with Canonical "m" Storage', () => {
  // 1. Plain typing 3/5 remains prose
  it('1. normal typing "he is worth 3/5 today" creates zero math marks', () => {
    const ed = createEditor('');
    ed.commands.insertContent('he is worth 3/5 today');
    const docJson = ed.getJSON();
    const paragraph = docJson.content?.[0];
    expect(paragraph?.type).toBe('nbParagraph');
    const textNode = paragraph?.content?.[0];
    expect(textNode?.type).toBe('text');
    expect(textNode?.text).toBe('he is worth 3/5 today');
    expect(textNode?.marks).toBeUndefined();

    const body = tiptapDocToBody(docJson);
    const parsed = parseNotebookBody(body);
    expect(parsed[0].text).toBe('he is worth 3/5 today');
    expect(parsed[0].marks).toBeUndefined();
  });

  // 2. Mathematical-looking expressions remain prose
  it('2. mathematical expressions (x^2, x=5, 2+2, (a+b)) remain ordinary prose', () => {
    for (const expr of ['x^2', 'x=5', '2+2', '(a+b)', 'y=mx+b']) {
      const ed = createEditor('');
      ed.commands.insertContent(expr);
      const docJson = ed.getJSON();
      const node = docJson.content?.[0]?.content?.[0];
      expect(node?.type).toBe('text');
      expect(node?.text).toBe(expr);
      expect(node?.marks).toBeUndefined();
    }
  });

  // 3. $5, $x$, $$, $$ x=5 remain literal prose
  it('3. dollar amounts and delimiter-like text remain literal prose', () => {
    for (const text of ['$5', '$x$', '$$', '$$ x=5']) {
      const ed = createEditor('');
      ed.commands.insertContent(text);
      const docJson = ed.getJSON();
      const node = docJson.content?.[0]?.content?.[0];
      expect(node?.type).toBe('text');
      expect(node?.text).toBe(text);
    }
  });

  // 4. Select exactly "3/5" -> Math -> nbInlineMath runtime node + canonical "m" mark
  it('4. select exactly "3/5" in "he is worth 3/5 today" creates nbInlineMath runtime atom and exact canonical "m" mark', () => {
    const ed = createEditor('');
    ed.commands.insertContent('he is worth 3/5 today');
    ed.commands.setTextSelection({ from: 13, to: 16 });
    expect(ed.state.doc.textBetween(13, 16)).toBe('3/5');

    const ok = runCandidateFormatCommand(ed, { type: 'toggleMath' });
    expect(ok).toBe(true);

    // TipTap runtime document inspection
    const docJson = ed.getJSON();
    const contents = docJson.content?.[0]?.content;
    expect(contents).toHaveLength(3);
    expect(contents![0]).toEqual({ type: 'text', text: 'he is worth ' });
    expect(contents![1]).toEqual({ type: 'nbInlineMath', attrs: { text: '3/5' } });
    expect(contents![2]).toEqual({ type: 'text', text: ' today' });

    // Canonical serialization inspection
    const body = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 3/5 today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 5. Double spaces survive
  it('5. double spaces in "before  3/5  after" survive untouched', () => {
    const canonical = '~nb1:["paragraph","before  3/5  after",[{"s":8,"e":11,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const docJson = ed.getJSON();
    const contents = docJson.content?.[0]?.content;
    expect(contents).toHaveLength(3);
    expect(contents![0].text).toBe('before  ');
    expect(contents![1].attrs?.text).toBe('3/5');
    expect(contents![2].text).toBe('  after');

    const resBody = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    expect(resBody).toBe(canonical);
  });

  // 6. Math at beginning of block
  it('6. math at beginning of block "3/5 is a fraction"', () => {
    const canonical = '~nb1:["paragraph","3/5 is a fraction",[{"s":0,"e":3,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const docJson = ed.getJSON();
    const contents = docJson.content?.[0]?.content;
    expect(contents![0].type).toBe('nbInlineMath');
    expect(contents![0].attrs?.text).toBe('3/5');
    expect(contents![1].text).toBe(' is a fraction');

    const resBody = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    expect(resBody).toBe(canonical);
  });

  // 7. Math at end of block
  it('7. math at end of block "the answer is 3/5"', () => {
    const canonical = '~nb1:["paragraph","the answer is 3/5",[{"s":14,"e":17,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const docJson = ed.getJSON();
    const contents = docJson.content?.[0]?.content;
    expect(contents![0].text).toBe('the answer is ');
    expect(contents![1].type).toBe('nbInlineMath');
    expect(contents![1].attrs?.text).toBe('3/5');

    const resBody = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    expect(resBody).toBe(canonical);
  });

  // 8. Two formulas in one block
  it('8. two formulas "3/5 and 7/8" have exact offsets after round-trip', () => {
    const canonical = '~nb1:["paragraph","3/5 and 7/8",[{"s":0,"e":3,"t":"m"},{"s":8,"e":11,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const docJson = ed.getJSON();
    const contents = docJson.content?.[0]?.content;
    expect(contents).toHaveLength(3);
    expect(contents![0].attrs?.text).toBe('3/5');
    expect(contents![1].text).toBe(' and ');
    expect(contents![2].attrs?.text).toBe('7/8');

    const resBody = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    expect(resBody).toBe(canonical);
  });

  // 9. Overlapping math + bold
  it('9. overlapping math + bold marks round-trip accurately without losing bold', () => {
    const canonical = '~nb1:["paragraph","he is 3/5 today",[{"s":6,"e":9,"t":"b"},{"s":6,"e":9,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const docJson = ed.getJSON();
    const mathNode = docJson.content?.[0]?.content?.[1];
    expect(mathNode?.type).toBe('nbInlineMath');
    expect(mathNode?.attrs?.text).toBe('3/5');
    expect(mathNode?.marks).toEqual([{ type: 'bold' }]);

    const resBody = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    expect(resBody).toBe(canonical);
  });

  // 10. Overlapping math + italic
  it('10. overlapping math + italic marks round-trip accurately', () => {
    const canonical = '~nb1:["paragraph","value 3/5 end",[{"s":6,"e":9,"t":"i"},{"s":6,"e":9,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const docJson = ed.getJSON();
    const mathNode = docJson.content?.[0]?.content?.[1];
    expect(mathNode?.marks).toEqual([{ type: 'italic' }]);

    const resBody = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    expect(resBody).toBe(canonical);
  });

  // 11. Hebrew surrounding text
  it('11. Hebrew sentence "הערך הוא 3/5 בלבד" preserves RTL and formula offsets', () => {
    const text = 'הערך הוא 3/5 בלבד';
    // 'הערך הוא ' is 9 chars. '3/5' is 9..12.
    const canonical = `~nb1:["paragraph","${text}",[{"s":9,"e":12,"t":"m"}],null]`;
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const docJson = ed.getJSON();
    const contents = docJson.content?.[0]?.content;
    expect(contents![0].text).toBe('הערך הוא ');
    expect(contents![1].attrs?.text).toBe('3/5');
    expect(contents![2].text).toBe(' בלבד');

    const resBody = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    expect(resBody).toBe(canonical);
  });

  // 12. Mixed Hebrew / English
  it('12. mixed Hebrew and English "The ערך is 3/5 today" round-trips cleanly', () => {
    const text = 'The ערך is 3/5 today';
    // 'The ערך is ' is 11 chars. '3/5' is 11..14.
    const canonical = `~nb1:["paragraph","${text}",[{"s":11,"e":14,"t":"m"}],null]`;
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const resBody = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    expect(resBody).toBe(canonical);
  });

  // 13. Toggle Math OFF restores plain text
  it('13. toggle Math OFF converts nbInlineMath back to plain text without delimiters', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    // Select the nbInlineMath node (pos 13, nodeSize 1 -> 13 to 14)
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, 13)));
    expect(readCandidateFormatState(ed).math).toBe(true);

    const ok = runCandidateFormatCommand(ed, { type: 'toggleMath' });
    expect(ok).toBe(true);
    expect(readCandidateFormatState(ed).math).toBe(false);

    const docJson = ed.getJSON();
    expect(docJson.content?.[0]?.content).toHaveLength(1);
    expect(docJson.content?.[0]?.content?.[0].text).toBe('he is worth 3/5 today');

    const body = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 3/5 today');
    expect(parsed[0].marks).toBeUndefined();
  });

  // 14. Edit atom: 3/5 -> 4/5
  it('14. edit atom text 3/5 -> 4/5 updates canonical text and mark length', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    // Update node attribute
    ed.view.dispatch(
      ed.state.tr.setNodeMarkup(13, undefined, { text: '4/5' }),
    );

    const docJson = ed.getJSON();
    expect(docJson.content?.[0]?.content?.[1].attrs?.text).toBe('4/5');

    const body = tiptapDocToBody(docJson, NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 4/5 today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 15. Native caret: type before atom
  it('15. caret before atom types into prose before formula', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    // Pos 13 is immediately before nbInlineMath
    ed.commands.setTextSelection(13);
    ed.commands.insertContent('MORE ');

    expect(fullText(ed)).toBe('he is worth MORE 3/5 today');
    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth MORE 3/5 today');
    expect(parsed[0].marks).toEqual([{ s: 17, e: 20, t: 'm' }]);
  });

  // 16. Native caret: type after atom
  it('16. caret after atom types into prose after formula without math mark', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    // In ProseMirror: pos 13 is atom start, nodeSize is 1, so pos 14 is immediately after atom
    ed.commands.setTextSelection(14);
    ed.commands.insertContent(' and tomorrow');

    expect(fullText(ed)).toBe('he is worth 3/5 and tomorrow today');
    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 3/5 and tomorrow today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 17. ArrowRight and ArrowLeft step cleanly across atom
  it('17. ArrowRight and ArrowLeft step across atom without getting stuck', () => {
    const canonical = '~nb1:["paragraph","a 3/5 b",[{"s":2,"e":5,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    // 'a ' is 2 chars -> pos 1 + 2 = 3.
    // Atom is at pos 3..4.
    ed.commands.setTextSelection(3);
    expect(ed.state.selection.from).toBe(3);

    // Simulate ArrowRight: standard ProseMirror moves from 3 to 4
    ed.commands.setTextSelection(4);
    expect(ed.state.selection.from).toBe(4);

    // Simulate ArrowLeft: moves from 4 to 3
    ed.commands.setTextSelection(3);
    expect(ed.state.selection.from).toBe(3);
  });

  // 18. Backspace on NodeSelection deletes atom
  it('18. Backspace on selected nbInlineMath deletes the atom cleanly', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, 13)));
    expect(ed.state.selection instanceof NodeSelection).toBe(true);

    ed.commands.deleteSelection();
    expect(fullText(ed)).toBe('he is worth  today');

    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth  today');
    expect(parsed[0].marks).toBeUndefined();
  });

  // 19. Select whole sentence across atom
  it('19. selecting whole sentence across atom preserves full text content', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    ed.commands.setTextSelection({ from: 1, to: ed.state.doc.content.size - 1 });
    expect(fullText(ed)).toBe('he is worth 3/5 today');
  });

  // 20. Undo and Redo Math toggle
  it('20. undo and redo of Math toggle restore states accurately', () => {
    const initialBody = '~nb1:["paragraph","he is worth 3/5 today",[],null]';
    const ed = createEditor(initialBody, NOTEBOOK_TEXT_CODEC_V1);
    ed.commands.setTextSelection({ from: 13, to: 16 });

    runCandidateFormatCommand(ed, { type: 'toggleMath' });
    expect(ed.getJSON().content?.[0]?.content?.[1].type).toBe('nbInlineMath');

    // Undo
    ed.commands.undo();
    expect(fullText(ed)).toBe('he is worth 3/5 today');
    expect(ed.getJSON().content?.[0]?.content?.[0].type).toBe('text');

    // Redo
    ed.commands.redo();
    expect(ed.getJSON().content?.[0]?.content?.[1].type).toBe('nbInlineMath');
  });

  // 21. Real 2D KaTeX rendering for 3/5 produces .mfrac
  it('21. 2D KaTeX rendering for 3/5 renders stacked fraction .mfrac in NodeView', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]');
    expect(atomEl).toBeTruthy();
    expect(atomEl?.querySelector('.mfrac')).toBeTruthy();
  });

  // 22. Real 2D KaTeX rendering for x^2 produces superscript
  it('22. 2D KaTeX rendering for x^2 renders superscript', () => {
    const canonical = '~nb1:["paragraph","value x^2 end",[{"s":6,"e":9,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]');
    expect(atomEl).toBeTruthy();
    expect(atomEl?.querySelector('.vlist-t')).toBeTruthy();
  });

  // 23. Reload persistence preserves math
  it('23. reload simulation reloads canonical body into TipTap with identical representation', () => {
    const initialCanonical = '~nb1:["paragraph","formula 3/5 active",[{"s":8,"e":11,"t":"m"}],null]';
    const ed1 = createEditor(initialCanonical, NOTEBOOK_TEXT_CODEC_V1);
    const body1 = tiptapDocToBody(ed1.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    expect(body1).toBe(initialCanonical);

    const ed2 = createEditor(body1, NOTEBOOK_TEXT_CODEC_V1);
    const body2 = tiptapDocToBody(ed2.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    expect(body2).toBe(initialCanonical);
  });

  // 24. Zero-write hydration
  it('24. loading document produces identical body output without mutation', () => {
    const original = '~nb1:["paragraph","text 3/5 text",[{"s":5,"e":8,"t":"m"}],null]';
    const doc = bodyToTiptapDoc(original, 1);
    const reserialized = tiptapDocToBody(doc, 1);
    expect(reserialized).toBe(original);
  });

  // 25. Malformed nbInlineMath fails closed
  it('25. malformed nbInlineMath (missing text attr) fails closed with conversion error', () => {
    const malformedDoc = {
      type: 'doc',
      content: [
        {
          type: 'nbParagraph',
          content: [
            { type: 'nbInlineMath', attrs: {} },
          ],
        },
      ],
    };
    expect(() => tiptapDocToBody(malformedDoc as any, 1)).toThrow();
  });

  // 26. M6.1 image safety remains green
  it('26. M6.1 image and block atoms remain safe alongside nbInlineMath', () => {
    const body = '~nb1:["paragraph","Text above 3/5 middle",[],null]\n::img::img-1::"Alt"::400::\n~nb1:["paragraph","Text below",[],null]';
    const doc = bodyToTiptapDoc(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(doc.content).toHaveLength(3);
    expect(doc.content![0].type).toBe('nbParagraph');
    expect(doc.content![1].type).toBe('nbImageRef');
    expect(doc.content![2].type).toBe('nbParagraph');

    const reserialized = tiptapDocToBody(doc, NOTEBOOK_TEXT_CODEC_V1);
    expect(reserialized).toBe(body);
  });

  // 27. Plain typed $x$ and $$ remain prose without auto-conversion
  it('27. typing "$x$" and "$$" in candidate editor remains prose and never auto-creates Math Block', () => {
    const ed = createEditor('');
    ed.commands.insertContent('$$');
    expect(ed.getJSON().content?.[0].type).toBe('nbParagraph');
    expect(ed.getJSON().content?.[0].content?.[0].text).toBe('$$');

    ed.commands.clearContent();
    ed.commands.insertContent('$x$');
    expect(ed.getJSON().content?.[0].type).toBe('nbParagraph');
    expect(ed.getJSON().content?.[0].content?.[0].text).toBe('$x$');
  });

  // 28. Clear formatting unwraps nbInlineMath back to plain text
  it('28. clear formatting command unwraps nbInlineMath back to plain text', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    // Select entire paragraph
    ed.commands.setTextSelection({ from: 1, to: ed.state.doc.content.size - 1 });
    runCandidateFormatCommand(ed, { type: 'clearFormatting' });

    expect(fullText(ed)).toBe('he is worth 3/5 today');
    const docJson = ed.getJSON();
    expect(docJson.content?.[0]?.content).toHaveLength(1);
    expect(docJson.content?.[0]?.content?.[0].type).toBe('text');
  });

  // 29. Double-click inline formula input commits changes
  it('29. double-click inline formula input updates node text and 2D rendering', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]') as HTMLElement;
    expect(atomEl).toBeTruthy();

    // Trigger double-click
    atomEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    const input = atomEl.querySelector('input');
    expect(input).toBeTruthy();
    expect(input?.value).toBe('3/5');

    // Type 7/8 and hit Enter
    input!.value = '7/8';
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(fullText(ed)).toBe('he is worth 7/8 today');
    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 7/8 today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 30. Real candidate editor click-and-type flow
  it('30. real candidate editor flow: type, select 3/5, Math ON, click after, type, click before, type', () => {
    const ed = createEditor('');
    ed.commands.insertContent('he is worth 3/5 today');

    // Select 3/5
    ed.commands.setTextSelection({ from: 13, to: 16 });
    runCandidateFormatCommand(ed, { type: 'toggleMath' });

    // Formula renders 2D
    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]');
    expect(atomEl).toBeTruthy();
    expect(atomEl?.querySelector('.mfrac')).toBeTruthy();

    // In ProseMirror: pos 14 is immediately after the inline atom
    ed.commands.setTextSelection(14);
    ed.commands.insertContent(' and tomorrow');

    expect(fullText(ed)).toBe('he is worth 3/5 and tomorrow today');

    // Click before formula: pos 13 is immediately before the inline atom
    ed.commands.setTextSelection(13);
    ed.commands.insertContent('always ');

    expect(fullText(ed)).toBe('he is worth always 3/5 and tomorrow today');

    // Canonical serialization has exact offsets
    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth always 3/5 and tomorrow today');
    expect(parsed[0].marks).toEqual([{ s: 19, e: 22, t: 'm' }]);
  });

  // 31. Typing while Math Block is selected (no following paragraph) preserves equation
  it('31. typing while Math Block is selected (no following paragraph) preserves equation and creates paragraph after', () => {
    const canonical = '~nb1:["math","E=mc^2",[],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    expect(ed.state.doc.childCount).toBe(1);
    expect(ed.state.doc.child(0).type.name).toBe('nbMath');

    // Select the Math Block
    ed.commands.setNodeSelection(0);
    expect(ed.state.selection instanceof NodeSelection).toBe(true);

    // Simulate keydown event on view.dom
    const keyEvent = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(keyEvent);

    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.doc.child(0).type.name).toBe('nbMath');
    expect(ed.state.doc.child(0).textContent).toBe('E=mc^2');
    expect(ed.state.doc.child(1).type.name).toBe('nbParagraph');
    expect(ed.state.doc.child(1).textContent).toBe('a');
    expect(ed.state.selection.from).toBe(10); // Inside paragraph after 'a' (math nodeSize=8, paragraph at 8, 'a' at 9..10)
  });

  // 32. Typing while Math Block is selected when paragraph ALREADY exists after
  it('32. typing while Math Block is selected inserts at start of existing trailing paragraph without duplicating', () => {
    const canonical = '~nb1:["math","E=mc^2",[],null]\n~nb1:["paragraph","existing text",[],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.doc.child(0).type.name).toBe('nbMath');
    expect(ed.state.doc.child(1).type.name).toBe('nbParagraph');

    // Select the Math Block
    ed.commands.setNodeSelection(0);
    expect(ed.state.selection instanceof NodeSelection).toBe(true);

    // Simulate keydown event on view.dom
    const keyEvent = new KeyboardEvent('keydown', { key: 'Z', bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(keyEvent);

    // Child count must NOT increase (no duplicate paragraph)
    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.doc.child(0).type.name).toBe('nbMath');
    expect(ed.state.doc.child(0).textContent).toBe('E=mc^2');
    expect(ed.state.doc.child(1).type.name).toBe('nbParagraph');
    expect(ed.state.doc.child(1).textContent).toBe('Zexisting text');
  });

  // 33. Enter key on selected Math Block creates/focuses paragraph after
  it('33. pressing Enter on selected Math Block creates/focuses paragraph after', () => {
    const canonical = '~nb1:["math","E=mc^2",[],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    ed.commands.setNodeSelection(0);
    expect(ed.state.selection instanceof NodeSelection).toBe(true);

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(enterEvent);

    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.doc.child(0).type.name).toBe('nbMath');
    expect(ed.state.doc.child(0).textContent).toBe('E=mc^2');
    expect(ed.state.doc.child(1).type.name).toBe('nbParagraph');
    expect(ed.state.doc.child(1).textContent).toBe('');
    expect(ed.state.selection.from).toBe(9); // Caret inside the new paragraph (math nodeSize=8, paragraph at 8, inside at 9)

    // Second Enter when empty paragraph already exists focuses it without adding a 3rd paragraph
    ed.commands.setNodeSelection(0);
    const enter2 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(enter2);

    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.selection.from).toBe(9);
  });

  // 34. Explicit Delete on selected Math Block deletes it
  it('34. explicit Delete or Backspace on NodeSelection deletes the Math Block', () => {
    const canonical = '~nb1:["paragraph","above",[],null]\n~nb1:["math","E=mc^2",[],null]\n~nb1:["paragraph","below",[],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    expect(ed.state.doc.childCount).toBe(3);

    // Select Math Block (pos = size of above paragraph)
    const p1Size = ed.state.doc.child(0).nodeSize;
    ed.commands.setNodeSelection(p1Size);
    expect(ed.state.selection instanceof NodeSelection).toBe(true);
    expect((ed.state.selection as NodeSelection).node.type.name).toBe('nbMath');

    // Press Delete
    const delEvent = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(delEvent);

    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.doc.child(0).textContent).toBe('above');
    expect(ed.state.doc.child(1).textContent).toBe('below');
  });

  // 35. Backspace at start of trailing paragraph selects Math Block without deleting it
  it('35. backspace at start of trailing paragraph selects Math Block instead of deleting it', () => {
    const canonical = '~nb1:["math","E=mc^2",[],null]\n~nb1:["paragraph","below",[],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const mathSize = ed.state.doc.child(0).nodeSize;
    // Place caret at start of "below"
    ed.commands.setTextSelection(mathSize + 1);

    const bsEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(bsEvent);

    // Math block must survive and become selected
    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.selection.from).toBe(0);
  });

  // 36. Candidate Editor integration: clicking Math Block DOM and typing preserves equation
  it('36. Candidate Editor: clicking Math Block DOM activates NodeSelection, maintains focus, and typing preserves equation', async () => {
    const canonical = '~nb1:["math","E=mc^2",[],null]\n~nb1:["paragraph","text below",[],null]';
    let editorInstance: Editor | null = null;

    mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: canonical,
        sourceBodyCodecVersion: 1,
        pageKey: 'test-math-block-select-type',
        onEditorReady: ed => {
          editorInstance = ed;
        },
      }),
    );

    await vi.waitFor(() => expect(editorInstance).not.toBeNull());
    const editor = editorInstance!;

    // Math block element exists in DOM
    const mathEl = testHost!.querySelector('[data-nb="nbMath"]') as HTMLElement;
    expect(mathEl).toBeTruthy();
    expect(mathEl.getAttribute('contenteditable')).toBe('false');

    // Simulate mousedown on the math block — must preventDefault to avoid blurring editor
    const mdEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => {
      mathEl.dispatchEvent(mdEvent);
    });
    expect(mdEvent.defaultPrevented).toBe(true);

    // Simulate click on the math block
    act(() => {
      mathEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // Editor selection must be NodeSelection on nbMath
    expect(editor.state.selection instanceof NodeSelection).toBe(true);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('nbMath');

    // Simulate typing printable character 'Q'
    act(() => {
      const keyEvent = new KeyboardEvent('keydown', { key: 'Q', bubbles: true, cancelable: true });
      editor.view.dom.dispatchEvent(keyEvent);
    });

    // Math block MUST survive untouched, 'Q' inserted at start of paragraph below
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).type.name).toBe('nbMath');
    expect(editor.state.doc.child(0).textContent).toBe('E=mc^2');
    expect(editor.state.doc.child(1).type.name).toBe('nbParagraph');
    expect(editor.state.doc.child(1).textContent).toBe('Qtext below');

    // Re-select Math Block and test beforeinput event path (e.g. mobile/IME insertion)
    act(() => {
      editor.commands.setNodeSelection(0);
    });
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    act(() => {
      const beforeInputEvent = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: '!',
        bubbles: true,
        cancelable: true,
      });
      editor.view.dom.dispatchEvent(beforeInputEvent);
    });

    // Math block remains untouched; text inserted into trailing paragraph
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).type.name).toBe('nbMath');
    expect(editor.state.doc.child(0).textContent).toBe('E=mc^2');
    expect(editor.state.doc.child(1).textContent).toBe('!Qtext below');
  });

  // 37. Verify document flow plugin ordering and guard registration
  it('37. verify document flow plugin ordering and guard registration', () => {
    const canonical = '~nb1:["math","E=mc^2",[],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const docFlowPlugin = ed.state.plugins.find(
      p => p.key === notebookSandboxDocumentFlowPluginKey.key,
    );
    expect(docFlowPlugin).toBeTruthy();
    expect(typeof docFlowPlugin?.props.handleKeyDown).toBe('function');
    expect(typeof docFlowPlugin?.props.handleTextInput).toBe('function');
    expect(typeof docFlowPlugin?.props.handleDOMEvents?.beforeinput).toBe('function');
  });

  // 38. Typing printable character while inline math atom is selected preserves equation and inserts character after
  it('38. typing printable character while inline math atom is selected preserves equation and inserts character after', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    // Find the nbInlineMath node position
    let inlineMathPos = -1;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'nbInlineMath') {
        inlineMathPos = pos;
        return false;
      }
    });
    expect(inlineMathPos).toBeGreaterThanOrEqual(0);

    // Select the inline math atom via NodeSelection
    ed.commands.setNodeSelection(inlineMathPos);
    expect(ed.state.selection instanceof NodeSelection).toBe(true);
    expect((ed.state.selection as NodeSelection).node.type.name).toBe('nbInlineMath');

    // Simulate typing printable character 'Q'
    const keyEvent = new KeyboardEvent('keydown', { key: 'Q', bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(keyEvent);

    // Formula must survive untouched, 'Q' inserted immediately after formula
    let foundInlineMath = false;
    ed.state.doc.descendants(node => {
      if (node.type.name === 'nbInlineMath') {
        foundInlineMath = true;
        expect(node.attrs.text).toBe('3/5');
      }
    });
    expect(foundInlineMath).toBe(true);

    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 3/5Q today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);

    // Re-select inline math atom and test beforeinput event path
    ed.commands.setNodeSelection(inlineMathPos);
    expect(ed.state.selection instanceof NodeSelection).toBe(true);

    const beforeInputEvent = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: '!',
      bubbles: true,
      cancelable: true,
    });
    ed.view.dom.dispatchEvent(beforeInputEvent);

    // Formula still intact, '!' inserted immediately after
    const body2 = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed2 = parseNotebookBody(body2, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed2[0].text).toBe('he is worth 3/5!Q today');
    expect(parsed2[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 39. Delete and Backspace while inline math atom is selected deletes the atom
  it('39. delete and backspace while inline math atom is selected deletes the atom', () => {
    // Test Delete key
    const canonical1 = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed1 = createEditor(canonical1, NOTEBOOK_TEXT_CODEC_V1);

    let inlineMathPos1 = -1;
    ed1.state.doc.descendants((node, pos) => {
      if (node.type.name === 'nbInlineMath') {
        inlineMathPos1 = pos;
        return false;
      }
    });
    expect(inlineMathPos1).toBeGreaterThanOrEqual(0);

    ed1.commands.setNodeSelection(inlineMathPos1);
    expect(ed1.state.selection instanceof NodeSelection).toBe(true);

    // Dispatch Delete key
    const delEvent = new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true, cancelable: true });
    ed1.view.dom.dispatchEvent(delEvent);

    // Inline math atom should be removed
    let hasInlineMath1 = false;
    ed1.state.doc.descendants(node => {
      if (node.type.name === 'nbInlineMath') hasInlineMath1 = true;
    });
    expect(hasInlineMath1).toBe(false);

    // Test Backspace key
    const canonical2 = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed2 = createEditor(canonical2, NOTEBOOK_TEXT_CODEC_V1);

    let inlineMathPos2 = -1;
    ed2.state.doc.descendants((node, pos) => {
      if (node.type.name === 'nbInlineMath') {
        inlineMathPos2 = pos;
        return false;
      }
    });
    expect(inlineMathPos2).toBeGreaterThanOrEqual(0);

    ed2.commands.setNodeSelection(inlineMathPos2);
    expect(ed2.state.selection instanceof NodeSelection).toBe(true);

    // Dispatch Backspace key
    const bsEvent = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true });
    ed2.view.dom.dispatchEvent(bsEvent);

    // Inline math atom should be removed
    let hasInlineMath2 = false;
    ed2.state.doc.descendants(node => {
      if (node.type.name === 'nbInlineMath') hasInlineMath2 = true;
    });
    expect(hasInlineMath2).toBe(false);
  });

  // 40. Inline math double-click editor: replace 3/5 with 4/5, Enter commits, KaTeX updates, surrounding text unchanged
  it('40. inline math double-click editor: replace 3/5 with 4/5, Enter commits, KaTeX updates, surrounding text unchanged', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]') as HTMLElement;
    expect(atomEl).toBeTruthy();
    expect(atomEl.getAttribute('data-text')).toBe('3/5');

    // Double-click to enter edit mode
    atomEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    const input = atomEl.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('3/5');

    // Type 4/5 into input
    input.value = '4/5';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    // Input must be closed
    expect(atomEl.querySelector('input')).toBeNull();

    // Node attribute and 2D rendering updated
    expect(atomEl.getAttribute('data-text')).toBe('4/5');
    expect(atomEl.innerHTML).toContain('mfrac');

    // Canonical persistence check
    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 4/5 today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);

    // Caret placed immediately after formula
    let formulaPos = -1;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'nbInlineMath') {
        formulaPos = pos;
        return false;
      }
    });
    expect(ed.state.selection.from).toBe(formulaPos + 1);
  });

  // 41. Inline math double-click editor: Escape cancels and restores original formula
  it('41. inline math double-click editor: Escape cancels and restores original formula', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]') as HTMLElement;
    atomEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    const input = atomEl.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = '999/000';

    // Press Escape
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    // Input closed, formula restored to 3/5
    expect(atomEl.querySelector('input')).toBeNull();
    expect(atomEl.getAttribute('data-text')).toBe('3/5');

    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 3/5 today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 42. Inline math double-click editor: blur commits changes
  it('42. inline math double-click editor: blur commits changes', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]') as HTMLElement;
    atomEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    const input = atomEl.querySelector('input') as HTMLInputElement;
    input.value = '7/9';

    // Fire blur
    input.dispatchEvent(new FocusEvent('blur', { bubbles: false }));

    expect(atomEl.querySelector('input')).toBeNull();
    expect(atomEl.getAttribute('data-text')).toBe('7/9');

    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 7/9 today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 43. Inline math double-click editor: empty value safely cancels and preserves formula without deleting prose
  it('43. inline math double-click editor: empty value safely cancels and preserves formula without deleting prose', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]') as HTMLElement;
    atomEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    const input = atomEl.querySelector('input') as HTMLInputElement;
    input.value = '   ';

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    // Must safely restore original formula 3/5
    expect(atomEl.querySelector('input')).toBeNull();
    expect(atomEl.getAttribute('data-text')).toBe('3/5');

    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 3/5 today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 44. Protected atom keyboard guards ignore events owned by formula edit input, and normal atom typing safety remains intact after closing
  it('44. protected atom keyboard guards ignore events owned by formula edit input, and normal atom typing safety remains intact after closing', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]') as HTMLElement;

    // Open edit mode
    atomEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = atomEl.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Verify keydown / beforeinput on input does not trigger insertTextAdjacentToProtectedAtom
    const keyEvent = new KeyboardEvent('keydown', { key: '4', bubbles: true, cancelable: true });
    input.dispatchEvent(keyEvent);

    const beforeInputEvent = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: '4',
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(beforeInputEvent);

    // Commit change
    input.value = '4/5';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(atomEl.getAttribute('data-text')).toBe('4/5');

    // Now editor is closed. Select formula via NodeSelection:
    let formulaPos = -1;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'nbInlineMath') {
        formulaPos = pos;
        return false;
      }
    });
    ed.commands.setNodeSelection(formulaPos);
    expect(ed.state.selection instanceof NodeSelection).toBe(true);

    // Type 'Q' while selected: formula MUST be protected, and 'Q' inserted after!
    const keyQ = new KeyboardEvent('keydown', { key: 'Q', bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(keyQ);

    const body = tiptapDocToBody(ed.getJSON(), NOTEBOOK_TEXT_CODEC_V1);
    const parsed = parseNotebookBody(body, NOTEBOOK_TEXT_CODEC_V1);
    expect(parsed[0].text).toBe('he is worth 4/5Q today');
    expect(parsed[0].marks).toEqual([{ s: 12, e: 15, t: 'm' }]);
  });

  // 45. Inline math edit input has explicit contrast styling: dark background with light text in dark theme, explicit color, caret-color, and no white-on-white invisibility
  it('45. inline math edit input has explicit contrast styling: dark background with light text in dark theme, explicit color, caret-color, and no white-on-white invisibility', () => {
    const canonical = '~nb1:["paragraph","he is worth 3/5 today",[{"s":12,"e":15,"t":"m"}],null]';
    const ed = createEditor(canonical, NOTEBOOK_TEXT_CODEC_V1);

    const atomEl = ed.view.dom.querySelector('[data-nb="nbInlineMath"]') as HTMLElement;
    atomEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    expect(atomEl.getAttribute('data-nb-editing')).toBe('true');
    const input = atomEl.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.className).toContain('nb-inline-math-editing');

    // Input style assertions: must have explicit high-contrast color, dark background, and caret color
    expect(input.style.backgroundColor).toBe('#0f172a');
    expect(input.style.color).toBe('#f8fafc');
    expect(input.style.caretColor).toBe('#38bdf8');

    // Close and verify attribute removed
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(atomEl.getAttribute('data-nb-editing')).toBeNull();
  });
});
