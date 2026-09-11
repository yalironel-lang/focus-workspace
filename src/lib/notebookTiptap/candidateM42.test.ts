/**
 * M4.2 — font size, academic block morph, no typed-prefix auto-convert.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import {
  applyCandidateFontSize,
  readCandidateFormatState,
  runCandidateFormatCommand,
} from './candidateFormatCommands';
import {
  runCandidateBlockCommand,
  textLooksLikeAcademicTypedLabel,
} from './candidateBlockCommands';
import { hasBidiControlChars } from './direction';
import { GOLDEN_BODIES } from './fixtures';
import { serializeRichLine } from '../notebookInlineMarks';

function makeEditor(body: string) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: bodyToTiptapDoc(body),
    editable: true,
  });
}

function selectAllText(ed: Editor) {
  const { doc } = ed.state;
  ed.chain().focus().setTextSelection({ from: 1, to: doc.content.size - 1 }).run();
}

describe('M4.2 font size', () => {
  it('applies font size to selected text and serializes', () => {
    const ed = makeEditor('This is an important concept');
    ed.chain().focus().setTextSelection({ from: 12, to: 29 }).run();
    expect(applyCandidateFontSize(ed, 24)).toBe(true);
    expect(readCandidateFormatState(ed).fontSizePx).toBe(24);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('"t":"fs"');
    expect(body).toContain('"v":"24"');
    expect(body).toContain('important concept');
    ed.destroy();
  });

  it('changing font size replaces previous size (no stacked garbage)', () => {
    const ed = makeEditor('Sized text');
    selectAllText(ed);
    applyCandidateFontSize(ed, 14);
    applyCandidateFontSize(ed, 28);
    const st = readCandidateFormatState(ed);
    expect(st.fontSizePx).toBe(28);
    expect(st.fontSizeMixed).toBe(false);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('"v":"28"');
    expect(body).not.toContain('"v":"14"');
    ed.destroy();
  });

  it('default 18 clears explicit font-size mark', () => {
    const ed = makeEditor('Hello');
    selectAllText(ed);
    applyCandidateFontSize(ed, 20);
    expect(readCandidateFormatState(ed).fontSizePx).toBe(20);
    applyCandidateFontSize(ed, 18);
    expect(readCandidateFormatState(ed).fontSizePx).toBeNull();
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).not.toContain('"t":"fs"');
    ed.destroy();
  });

  it('existing font-size body round-trips body → TipTap → body', () => {
    const line = serializeRichLine({
      plain: 'Legacy size',
      marks: [{ s: 0, e: 11, t: 'fs', v: '20' }],
    });
    const back = tiptapDocToBody(bodyToTiptapDoc(line));
    expect(back).toContain('"t":"fs"');
    expect(back).toContain('"v":"20"');
  });

  it('mixed font sizes report mixed state without corruption', () => {
    const ed = makeEditor('Alpha Bravo');
    ed.chain().focus().setTextSelection({ from: 1, to: 6 }).run();
    applyCandidateFontSize(ed, 14);
    ed.chain().focus().setTextSelection({ from: 7, to: 12 }).run();
    applyCandidateFontSize(ed, 24);
    ed.chain().focus().setTextSelection({ from: 1, to: 12 }).run();
    const st = readCandidateFormatState(ed);
    expect(st.fontSizeMixed).toBe(true);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toContain('Alpha');
    expect(body).toContain('Bravo');
    ed.destroy();
  });

  it('undo/redo font size', () => {
    const ed = makeEditor('Undo me');
    selectAllText(ed);
    applyCandidateFontSize(ed, 32);
    expect(readCandidateFormatState(ed).fontSizePx).toBe(32);
    ed.commands.undo();
    expect(readCandidateFormatState(ed).fontSizePx).toBeNull();
    ed.commands.redo();
    // re-select after redo if needed
    selectAllText(ed);
    expect(readCandidateFormatState(ed).fontSizePx).toBe(32);
    ed.destroy();
  });

  it('Hebrew + mixed Hebrew/English font size', () => {
    const ed = makeEditor('זה רעיון חשוב');
    selectAllText(ed);
    expect(applyCandidateFontSize(ed, 20)).toBe(true);
    expect(hasBidiControlChars(tiptapDocToBody(ed.getJSON()))).toBe(false);
    ed.destroy();

    const ed2 = makeEditor('המודל predicts demand');
    ed2.chain().focus().setTextSelection({ from: 8, to: 16 }).run();
    expect(applyCandidateFontSize(ed2, 16)).toBe(true);
    const body = tiptapDocToBody(ed2.getJSON());
    expect(body).toContain('המודל');
    expect(body).toContain('predicts');
    expect(hasBidiControlChars(body)).toBe(false);
    ed2.destroy();
  });

  it('clear formatting removes font size', () => {
    const ed = makeEditor('Clear size');
    selectAllText(ed);
    applyCandidateFontSize(ed, 24);
    runCandidateFormatCommand(ed, { type: 'toggleBold' });
    expect(runCandidateFormatCommand(ed, { type: 'clearFormatting' })).toBe(true);
    const st = readCandidateFormatState(ed);
    expect(st.fontSizePx).toBeNull();
    expect(st.bold).toBe(false);
    ed.destroy();
  });
});

describe('M4.2 academic block morph (explicit only)', () => {
  const tones = [
    'definition',
    'concept',
    'theorem',
    'example',
    'mistake',
    'summary',
    'review',
  ] as const;

  it('paragraph → each academic callout and back', () => {
    for (const tone of tones) {
      const ed = makeEditor('Academic body text');
      selectAllText(ed);
      expect(runCandidateBlockCommand(ed, `callout:${tone}`)).toBe(true);
      expect(ed.state.selection.$from.parent.type.name).toBe('nbCallout');
      expect(ed.state.selection.$from.parent.attrs.tone).toBe(tone);
      const body = tiptapDocToBody(ed.getJSON());
      expect(body.startsWith(`!${tone} `)).toBe(true);
      expect(runCandidateBlockCommand(ed, 'paragraph')).toBe(true);
      expect(ed.state.selection.$from.parent.type.name).toBe('nbParagraph');
      ed.destroy();
    }
  });

  it('existing stored callouts still load', () => {
    for (const tone of tones) {
      const key = `callout_${tone}`;
      const src = GOLDEN_BODIES[key];
      expect(src).toBeTruthy();
      const ed = makeEditor(src!);
      expect(ed.state.doc.firstChild?.type.name).toBe('nbCallout');
      expect(ed.state.doc.firstChild?.attrs.tone).toBe(tone);
      expect(tiptapDocToBody(ed.getJSON()).startsWith(`!${tone}`)).toBe(true);
      ed.destroy();
    }
  });

  it('typing Definition: / Theorem: / Key Concept: does NOT auto-transform', () => {
    for (const label of ['Definition: text', 'Theorem: text', 'Key Concept: text']) {
      expect(textLooksLikeAcademicTypedLabel(label)).toBe(true);
      const ed = makeEditor(label);
      // Still a paragraph — no Enter auto-morph exists in sandbox keymap
      expect(ed.state.doc.firstChild?.type.name).toBe('nbParagraph');
      expect(tiptapDocToBody(ed.getJSON())).toContain(label.split(':')[0]!);
      expect(tiptapDocToBody(ed.getJSON()).startsWith('!')).toBe(false);
      // Simulate Enter — still should not become callout
      ed.commands.focus('end');
      ed.commands.keyboardShortcut('Enter');
      const body = tiptapDocToBody(ed.getJSON());
      expect(body.split('\n').some(l => l.startsWith('!definition') || l.startsWith('!theorem') || l.startsWith('!concept'))).toBe(
        false,
      );
      ed.destroy();
    }
  });

  it('undo academic transformation', () => {
    const ed = makeEditor('Back to paragraph');
    selectAllText(ed);
    runCandidateBlockCommand(ed, 'callout:definition');
    expect(ed.state.selection.$from.parent.type.name).toBe('nbCallout');
    ed.commands.undo();
    expect(ed.state.selection.$from.parent.type.name).toBe('nbParagraph');
    ed.destroy();
  });

  it('Hebrew + mixed + inline math academic blocks stay source-safe', () => {
    const ed = makeEditor('הגדרה $a^2+b^2$ חשובה');
    selectAllText(ed);
    expect(runCandidateBlockCommand(ed, 'callout:definition')).toBe(true);
    const body = tiptapDocToBody(ed.getJSON());
    expect(body.startsWith('!definition ')).toBe(true);
    expect(body).toContain('$a^2+b^2$');
    expect(hasBidiControlChars(body)).toBe(false);
    ed.destroy();

    const ed2 = makeEditor('המודל predicts higher demand');
    selectAllText(ed2);
    runCandidateBlockCommand(ed2, 'callout:concept');
    const body2 = tiptapDocToBody(ed2.getJSON());
    expect(body2.startsWith('!concept ')).toBe(true);
    expect(body2).toContain('predicts');
    expect(hasBidiControlChars(body2)).toBe(false);
    ed2.destroy();
  });

  it('basic block morphs work', () => {
    const ed = makeEditor('Hello');
    selectAllText(ed);
    expect(runCandidateBlockCommand(ed, 'title')).toBe(true);
    expect(tiptapDocToBody(ed.getJSON()).startsWith('# ')).toBe(true);
    expect(runCandidateBlockCommand(ed, 'bullet')).toBe(true);
    expect(tiptapDocToBody(ed.getJSON()).startsWith('- ')).toBe(true);
    expect(runCandidateBlockCommand(ed, 'quote')).toBe(true);
    expect(tiptapDocToBody(ed.getJSON()).startsWith('> ')).toBe(true);
    ed.destroy();
  });
});
