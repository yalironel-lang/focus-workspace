/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Resolve Mod to Command before ProseMirror's keymap module is loaded.
vi.hoisted(() => { Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' }); });
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { runCandidateFormatCommand } from './candidateFormatCommands';
import { runCandidateBlockCommand } from './candidateBlockCommands';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { buildInlineMathSourceDecorations } from './sandboxInlineMathIsolate';

const editors: Editor[] = [];
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount()); root = undefined; host?.remove(); host = undefined;
  editors.splice(0).forEach(ed => { const dom = ed.view.dom; ed.destroy(); dom.remove(); });
  vi.unstubAllGlobals();
});
function make(body: string) {
  const ed = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: bodyToTiptapDoc(body) });
  document.body.append(ed.view.dom); editors.push(ed); return ed;
}
function select(ed: Editor, from: number, to = from) { ed.commands.setTextSelection({ from, to }); ed.view.focus(); }
function key(ed: Editor, key: string, metaKey = false, shiftKey = false) {
  const code = key === 'z' ? 'KeyZ' : key;
  const keyCode = key === 'z' ? 90 : key === 'Backspace' ? 8 : 46;
  const event = new KeyboardEvent('keydown', { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, metaKey, shiftKey });
  ed.view.dom.dispatchEvent(event); return event;
}
function texts(ed: Editor) { return ed.getJSON().content!.map(node => (node.content ?? []).map(text => text.text ?? '').join('')); }
function atBlock(ed: Editor, index: number, offset = 0) {
  let pos = 1; for (let i = 0; i < index; i++) pos += ed.state.doc.child(i).nodeSize;
  return pos + offset;
}
function paste(ed: Editor, plain: string, html = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? plain : type === 'text/html' ? html : '', types: ['text/plain', 'text/html'], files: [] } });
  ed.view.dom.dispatchEvent(event); return event;
}

for (const deletionKey of ['Delete', 'Backspace']) describe(`${deletionKey} selected ranges`, () => {
  it.each(['word', 'This is a sentence.', 'מילה', 'זה משפט בעברית.', 'שלום English עולם'])('deletes only %s', selected => {
    const ed = make(`before ${selected} after`); select(ed, 8, 8 + selected.length);
    expect(key(ed, deletionKey).defaultPrevented).toBe(true);
    expect(texts(ed)).toEqual(['before  after']);
    expect(ed.state.selection.empty).toBe(true); expect(ed.state.selection.from).toBe(8);
  });
  it('deletes across overlapping inline marks without deleting surroundings', () => {
    const ed = make('before marked words after'); select(ed, 8, 14); runCandidateFormatCommand(ed, { type: 'toggleBold' });
    select(ed, 11, 20); runCandidateFormatCommand(ed, { type: 'setFontSize', px: 24 });
    select(ed, 8, 20); key(ed, deletionKey);
    expect(texts(ed)).toEqual(['before  after']); expect(ed.state.doc.firstChild!.childCount).toBe(1);
  });
  it.each(['', '- ', '- [x] ', '!definition '])('deletes within %s block without changing its type', prefix => {
    const ed = make(`${prefix}before word after\nuntouched`); const type = ed.state.doc.firstChild!.type;
    select(ed, 8, 12); key(ed, deletionKey);
    expect(texts(ed)).toEqual(['before  after', 'untouched']); expect(ed.state.doc.firstChild!.type).toBe(type);
  });
  it('merges only the selected paragraph boundary', () => {
    const ed = make('left ONE\nTWO right\nuntouched'); select(ed, 6, atBlock(ed, 1, 3)); key(ed, deletionKey);
    expect(texts(ed)).toEqual(['left  right', 'untouched']); expect(ed.state.selection.from).toBe(6);
  });
  it.each(['- ', '- [ ] ', '!definition '])('deletes selection starting in an empty %s block', prefix => {
    const ed = make(`keep\n${prefix}\nremove rest\nuntouched`);
    select(ed, atBlock(ed, 1), atBlock(ed, 2, 6)); key(ed, deletionKey);
    expect(texts(ed)).toEqual(['keep', ' rest', 'untouched']); expect(ed.state.selection.empty).toBe(true);
  });
});

describe('single-key boundary safety', () => {
  it.each(['Delete', 'Backspace'])('%s joins adjacent paragraphs without losing text', deletionKey => {
    const ed = make('left\nright\nuntouched');
    select(ed, deletionKey === 'Delete' ? 5 : atBlock(ed, 1)); key(ed, deletionKey);
    expect(texts(ed)).toEqual(['leftright', 'untouched']); expect(ed.state.selection.from).toBe(5);
  });
  it.each(['Delete', 'Backspace'])('%s at document edge does not remove content', deletionKey => {
    const ed = make('שלום $x$ world'); const before = ed.getJSON();
    select(ed, deletionKey === 'Backspace' ? 1 : ed.state.doc.content.size - 1); key(ed, deletionKey);
    expect(ed.getJSON()).toEqual(before);
  });
  it.each(['Delete', 'Backspace'])('%s removes only the adjacent empty paragraph', deletionKey => {
    const ed = make('left\n\nright'); select(ed, deletionKey === 'Delete' ? 5 : atBlock(ed, 2)); key(ed, deletionKey);
    expect(texts(ed)).toEqual(['left', 'right']);
  });
  it.each(['- ', '- [ ] ', '!definition '])('empty %s Backspace converts only that block', prefix => {
    const ed = make(`left\n${prefix}\nright`); select(ed, atBlock(ed, 1)); key(ed, 'Backspace');
    expect(texts(ed)).toEqual(['left', '', 'right']); expect(ed.state.doc.child(1).type.name).toBe('nbParagraph');
  });
  it.each(['- Item', '- [x] Task', '!definition Concept'])('paragraph → %s transition preserves every character', block => {
    for (const deletionKey of ['Delete', 'Backspace']) {
      const ed = make(`left\n${block}\nuntouched`); const second = ed.state.doc.child(1).textContent;
      select(ed, deletionKey === 'Delete' ? 5 : atBlock(ed, 1)); key(ed, deletionKey);
      expect(texts(ed)).toEqual([`left${second}`, 'untouched']);
    }
  });
  it.each(['- Item', '- [x] Task', '!definition Concept'])('%s → paragraph transition preserves every character', block => {
    for (const deletionKey of ['Delete', 'Backspace']) {
      const ed = make(`${block}\nright\nuntouched`); const first = ed.state.doc.firstChild!.textContent;
      select(ed, deletionKey === 'Delete' ? first.length + 1 : atBlock(ed, 1)); key(ed, deletionKey);
      expect(texts(ed)).toEqual([`${first}right`, 'untouched']);
    }
  });
  it.each(['Delete', 'Backspace'])('%s at RTL/math boundary retains source and direction', deletionKey => {
    const ed = make('שלום $x^2$\nעולם English'); ed.commands.updateAttributes('nbParagraph', { dir: 'rtl' });
    select(ed, deletionKey === 'Delete' ? ed.state.doc.firstChild!.textContent.length + 1 : atBlock(ed, 1)); key(ed, deletionKey);
    expect(texts(ed)).toEqual(['שלום $x^2$עולם English']); expect(ed.state.doc.firstChild!.attrs.dir).toBe('rtl');
    expect(buildInlineMathSourceDecorations(ed.state.doc).find()).toHaveLength(1);
  });
});

describe('keyboard Command undo/redo', () => {
  const operations: [string, (ed: Editor) => void][] = [
    ['typing', ed => { ed.commands.insertContent('typed'); }],
    ['bold', ed => { runCandidateFormatCommand(ed, { type: 'toggleBold' }); }],
    ['font size', ed => { runCandidateFormatCommand(ed, { type: 'setFontSize', px: 28 }); }],
    ['color', ed => { runCandidateFormatCommand(ed, { type: 'setTextColor', color: '#fca5a5' }); }],
    ['highlight', ed => { runCandidateFormatCommand(ed, { type: 'setHighlight', color: '#fef08a' }); }],
    ['block conversion', ed => { runCandidateBlockCommand(ed, 'callout:theorem'); }],
    ['Delete', ed => { key(ed, 'Delete'); }], ['Backspace', ed => { key(ed, 'Backspace'); }],
  ];
  it.each(operations)('Cmd+Z / Cmd+Shift+Z after %s', (_name, operation) => {
    const ed = make('before שלום after'); select(ed, 8, 12); const before = ed.getJSON();
    operation(ed); const after = ed.getJSON(); expect(after).not.toEqual(before);
    expect(key(ed, 'z', true).defaultPrevented).toBe(true); expect(ed.getJSON()).toEqual(before);
    expect(key(ed, 'z', true, true).defaultPrevented).toBe(true); expect(ed.getJSON()).toEqual(after);
  });
  it('rapid distinct formatting actions undo separately from typing', () => {
    const ed = make('word'); select(ed, 5); ed.commands.insertContent('!'); const typed = ed.getJSON();
    select(ed, 1, 5); runCandidateFormatCommand(ed, { type: 'toggleBold' }); const bold = ed.getJSON();
    runCandidateFormatCommand(ed, { type: 'setFontSize', px: 24 });
    key(ed, 'z', true); expect(ed.getJSON()).toEqual(bold);
    key(ed, 'z', true); expect(ed.getJSON()).toEqual(typed);
    key(ed, 'z', true); expect(texts(ed)).toEqual(['word']);
  });
});

describe('existing paste policy', () => {
  it.each(['English', 'שלום', 'שלום English', 'one\ntwo', 'אחד\r\nשניים', 'bold'])('pastes %s exactly once into the selection', text => {
    const ed = make('before TARGET after'); select(ed, 8, 14);
    expect(paste(ed, text, '<b style="font-size:999px">bold</b>').defaultPrevented).toBe(true);
    expect(texts(ed)).toEqual(('before ' + text.replace(/\r\n/g, '\n') + ' after').split('\n'));
    expect(tiptapDocToBody(ed.getJSON())).not.toContain('999');
  });
  it('HTML-only paste is refused without changing the document', () => {
    const ed = make('keep'); select(ed, 3); const before = ed.getJSON(); paste(ed, '', '<b>ignored</b>'); expect(ed.getJSON()).toEqual(before);
  });
});

it('real candidate key handlers and paste remain memory-only', async () => {
  let ed: Editor | null = null;
  const write = vi.fn(); const network = vi.fn(); const db = vi.fn();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: write }); vi.stubGlobal('fetch', network); vi.stubGlobal('indexedDB', { open: db });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root!.render(createElement(NotebookTiptapCandidateEditor, { sourceDocumentBody: 'before word after', pageKey: 'safety', onEditorReady: next => { ed = next; } })));
  await vi.waitFor(() => expect(ed).toBeTruthy());
  act(() => { select(ed!, 8, 12); key(ed!, 'Backspace'); }); expect(texts(ed!)).toEqual(['before  after']);
  act(() => { key(ed!, 'z', true); }); expect(texts(ed!)).toEqual(['before word after']);
  act(() => { key(ed!, 'z', true, true); paste(ed!, 'שלום'); });
  expect(ed!.state.doc.textContent).toBe('before שלום after');
  expect(write).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(db).not.toHaveBeenCalled();
});

describe('cross-block and clipboard edge regressions', () => {
  it.each(['- ', '- [x] ', '!definition '])('selected %s range across paragraphs deletes only selected text', prefix => {
    for (const deletionKey of ['Backspace', 'Delete']) {
      const ed = make(`${prefix}left remove\nremove right\nkeep`);
      select(ed, 6, atBlock(ed, 1, 6)); key(ed, deletionKey);
      expect(texts(ed)).toEqual(['left  right', 'keep']);
      expect(ed.state.selection.empty).toBe(true);
    }
  });
  it.each(['- ', '- [ ] ', '!definition '])('Delete next to empty %s block preserves neighboring text', prefix => {
    const ed = make(`left\n${prefix}\nright`); select(ed, 5); key(ed, 'Delete');
    expect(texts(ed)).toEqual(['left', 'right']);
  });
  it.each(['- ', '- [x] ', '!definition '])('plain paste inside %s preserves existing block type and direction', prefix => {
    const ed = make(`${prefix}before TARGET after`);
    const type = ed.state.doc.firstChild!.type.name;
    ed.commands.updateAttributes(type, { dir: 'rtl' }); select(ed, 8, 14); paste(ed, 'שלום $x$');
    expect(texts(ed)).toEqual(['before שלום $x$ after']);
    expect(ed.state.doc.firstChild!.type.name).toBe(type);
    expect(ed.state.doc.firstChild!.attrs.dir).toBe('rtl');
    expect(buildInlineMathSourceDecorations(ed.state.doc).find()).toHaveLength(1);
  });
  it.each(['- Item', '- [x] Task', '!definition Concept'])('pasted explicit dialect block %s retains its mapping', plain => {
    const ed = make('before after'); select(ed, 8); paste(ed, plain);
    const expected = bodyToTiptapDoc(plain).content![0];
    expect(ed.getJSON().content![1].type).toBe(expected.type);
    expect(texts(ed)).toEqual(['before ', expected.content![0].text!, 'after']);
  });
  it('multiline paste undo/redo is one logical operation', () => {
    const ed = make('before TARGET after'); select(ed, 8, 14); const before = ed.getJSON();
    paste(ed, 'one\ntwo'); const after = ed.getJSON();
    key(ed, 'z', true); expect(ed.getJSON()).toEqual(before);
    key(ed, 'z', true, true); expect(ed.getJSON()).toEqual(after);
  });
  it('consecutive typed characters undo as one typing group', () => {
    const ed = make('before'); select(ed, 7);
    for (const character of 'abc') ed.commands.insertContent(character);
    expect(texts(ed)).toEqual(['beforeabc']); key(ed, 'z', true); expect(texts(ed)).toEqual(['before']);
    key(ed, 'z', true, true); expect(texts(ed)).toEqual(['beforeabc']);
  });
  it('block conversion and subsequent range deletion have independent undo steps', () => {
    const ed = make('before word after'); select(ed, 8, 12);
    const before = ed.getJSON(); runCandidateBlockCommand(ed, 'callout:definition'); const converted = ed.getJSON();
    key(ed, 'Backspace'); const deleted = ed.getJSON();
    key(ed, 'z', true); expect(ed.getJSON()).toEqual(converted);
    key(ed, 'z', true); expect(ed.getJSON()).toEqual(before);
    key(ed, 'z', true, true); expect(ed.getJSON()).toEqual(converted);
    key(ed, 'z', true, true); expect(ed.getJSON()).toEqual(deleted);
  });
});

it.each(['¶ muted', '¶¶ fine'])('paste retains the existing explicit paragraph variant: %s', plain => {
  const ed = make('before after'); select(ed, 8); paste(ed, plain);
  const expected = bodyToTiptapDoc(plain).content![0];
  expect(ed.getJSON().content![1]).toEqual(ed.schema.nodeFromJSON(expected).toJSON());
  expect(texts(ed)).toEqual(['before ', expected.content![0].text!, 'after']);
});
