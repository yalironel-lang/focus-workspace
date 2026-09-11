/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { applyCandidateFontSize, CANDIDATE_FONT_SIZE_PRESETS, readCandidateFormatState, runCandidateFormatCommand } from './candidateFormatCommands';
import { serializeRichLine } from '../notebookInlineMarks';
import { buildInlineMathSourceDecorations } from './sandboxInlineMathIsolate';

const editors: Editor[] = [];
function editor(body: string) {
  const ed = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: bodyToTiptapDoc(body) });
  editors.push(ed);
  return ed;
}
afterEach(() => editors.splice(0).forEach(ed => ed.destroy()));
function select(ed: Editor, from = 1, to = ed.state.doc.content.size - 1) { ed.commands.setTextSelection({ from, to }); }
function marksAt(ed: Editor, pos: number) { return ed.state.doc.nodeAt(pos)!.marks; }

const toggles = [
  ['toggleBold', 'bold'], ['toggleItalic', 'italic'], ['toggleUnderline', 'underline'], ['toggleStrike', 'strike'],
] as const;
describe('M4.1 selected range and state', () => {
  it.each(toggles)('%s affects only selected text and reports whole-range active state', (type, mark) => {
    const ed = editor('abc def ghi');
    select(ed, 5, 8);
    runCandidateFormatCommand(ed, { type });
    expect(marksAt(ed, 1)).toHaveLength(0);
    expect(marksAt(ed, 9)).toHaveLength(0);
    expect(readCandidateFormatState(ed)[mark]).toBe(true);
    select(ed, 1, 8);
    expect(readCandidateFormatState(ed)[mark]).toBe(false);
    select(ed, 5, 8);
    runCandidateFormatCommand(ed, { type });
    expect(marksAt(ed, 5)).toHaveLength(0);
  });

  it.each(['Hello world end', 'שלום עולם סוף', 'שלום world סוף'])('all sizes preserve exact range and other marks: %s', text => {
    const ed = editor(text);
    select(ed, 2, text.length);
    for (const [type] of toggles) runCandidateFormatCommand(ed, { type });
    runCandidateFormatCommand(ed, { type: 'setTextColor', color: '#fca5a5' });
    runCandidateFormatCommand(ed, { type: 'setHighlight', color: '#fef08a' });
    for (const px of CANDIDATE_FONT_SIZE_PRESETS) {
      expect(applyCandidateFontSize(ed, px)).toBe(true);
      expect(ed.state.selection.from).toBe(2);
      expect(ed.state.selection.to).toBe(text.length);
      expect(ed.state.doc.textContent).toBe(text);
      expect(marksAt(ed, 1)).toHaveLength(0);
      expect(marksAt(ed, text.length)).toHaveLength(0);
      const marks = marksAt(ed, 2);
      expect(marks.map(m => m.type.name).sort()).toEqual(['bold', 'highlight', 'italic', 'strike', 'textStyle', 'underline']);
      expect(marks.find(m => m.type.name === 'textStyle')!.attrs).toMatchObject({ color: '#fca5a5', fontSize: px === 18 ? null : `${px}px` });
      const body = tiptapDocToBody(ed.getJSON());
      expect(tiptapDocToBody(bodyToTiptapDoc(body))).toBe(body);
    }
    const final = ed.getJSON();
    ed.commands.undo();
    expect(ed.getJSON()).not.toEqual(final);
    ed.commands.redo();
    expect(ed.getJSON()).toEqual(final);
  });

  it.each([
    [{ type: 'setFontSize', px: 24 }, { type: 'setFontSize', px: 32 }, 'fontSizeMixed'],
    [{ type: 'setTextColor', color: '#fca5a5' }, { type: 'setTextColor', color: '#93c5fd' }, 'colorMixed'],
    [{ type: 'setHighlight', color: '#fef08a' }, { type: 'setHighlight', color: '#bbf7d0' }, 'highlightMixed'],
  ] as const)('reports mixed values, including marked plus plain', (first, second, mixed) => {
    const ed = editor('abc def');
    select(ed, 1, 4);
    runCandidateFormatCommand(ed, first);
    expect(readCandidateFormatState(ed)[mixed]).toBe(false);
    select(ed);
    expect(readCandidateFormatState(ed)[mixed]).toBe(true);
    select(ed, 5, 8);
    runCandidateFormatCommand(ed, second);
    select(ed);
    expect(readCandidateFormatState(ed)[mixed]).toBe(true);
    runCandidateFormatCommand(ed, first);
    expect(readCandidateFormatState(ed)[mixed]).toBe(false);
  });

  it('font size preserves different colors across a mixed selection', () => {
    const ed = editor('abc def');
    select(ed, 1, 4); runCandidateFormatCommand(ed, { type: 'setTextColor', color: '#fca5a5' });
    select(ed, 5, 8); runCandidateFormatCommand(ed, { type: 'setTextColor', color: '#93c5fd' });
    select(ed); applyCandidateFontSize(ed, 28);
    expect(marksAt(ed, 1)[0].attrs).toMatchObject({ color: '#fca5a5', fontSize: '28px' });
    expect(marksAt(ed, 5)[0].attrs).toMatchObject({ color: '#93c5fd', fontSize: '28px' });
  });

  it('clear preserves structures, direction, math and media; removes all inline presentation including bg', () => {
    const styled = serializeRichLine({ plain: 'שלום $x^2$ world', marks: [
      ...(['b', 'i', 'u', 's'] as const).map(t => ({ s: 0, e: 16, t })),
      { s: 0, e: 16, t: 'fs', v: '24' }, { s: 0, e: 16, t: 'fg', v: '#fca5a5' },
      { s: 0, e: 16, t: 'hl', v: '#fef08a' }, { s: 0, e: 16, t: 'bg', v: '#334155' },
    ] });
    const ed = editor(['# '+styled, '- '+styled, '- [x] '+styled, '!definition '+styled, '> '+styled, '$$ x^2', '::img::img-1::alt::', '::hw::hw-1::'].join('\n'));
    ed.commands.updateAttributes('nbTitle', { dir: 'rtl' });
    const before = ed.getJSON();
    const decorations = buildInlineMathSourceDecorations(ed.state.doc).find().map(d => [d.from, d.to]);
    ed.commands.selectAll();
    expect(runCandidateFormatCommand(ed, { type: 'clearFormatting' })).toBe(true);
    const after = ed.getJSON();
    const stripped = structuredClone(before);
    for (const block of stripped.content!) {
      if (block.type === 'nbMath') continue;
      for (const node of block.content ?? []) delete node.marks;
    }
    expect(after).toEqual(stripped);
    expect(buildInlineMathSourceDecorations(ed.state.doc).find().map(d => [d.from, d.to])).toEqual(decorations);
    ed.commands.undo(); expect(ed.getJSON()).toEqual(before);
  });

  it('clear only touches selected inline range', () => {
    const ed = editor('abc def ghi'); select(ed);
    runCandidateFormatCommand(ed, { type: 'toggleBold' });
    select(ed, 5, 8); runCandidateFormatCommand(ed, { type: 'clearFormatting' });
    expect(marksAt(ed, 1)[0].type.name).toBe('bold');
    expect(marksAt(ed, 5)).toHaveLength(0);
    expect(marksAt(ed, 9)[0].type.name).toBe('bold');
  });

  it('rejects unsupported sizes and read-only commands without mutations', () => {
    const ed = editor('abc'); select(ed);
    const before = ed.getJSON();
    expect(applyCandidateFontSize(ed, NaN)).toBe(false);
    expect(applyCandidateFontSize(ed, 1000)).toBe(false);
    ed.setEditable(false);
    expect(runCandidateFormatCommand(ed, { type: 'toggleBold' })).toBe(false);
    expect(ed.getJSON()).toEqual(before);
  });
});
