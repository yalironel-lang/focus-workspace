/**
 * RTL Phase A — direction detection + serialization safety.
 */
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import {
  detectFirstStrongDirection,
  hasBidiControlChars,
  inheritDirForNewBlock,
  normalizeTextDir,
  resolveEffectiveDir,
  BIDI_CONTROL_CHARS_RE,
} from './direction';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { roundTripBody } from './index';
import { RTL_PHASE_A_FIXTURE_BODY } from './parityFixture';

describe('detectFirstStrongDirection', () => {
  it('Hebrew-first → rtl', () => {
    expect(detectFirstStrongDirection('שלום עולם')).toBe('rtl');
    expect(detectFirstStrongDirection('שלום world')).toBe('rtl');
  });

  it('English-first → ltr', () => {
    expect(detectFirstStrongDirection('Hello world')).toBe('ltr');
    expect(detectFirstStrongDirection('world שלום')).toBe('ltr');
    expect(detectFirstStrongDirection('Hello שלום world')).toBe('ltr');
  });

  it('numbers / punctuation alone → neutral', () => {
    expect(detectFirstStrongDirection('12345')).toBe('neutral');
    expect(detectFirstStrongDirection('15%')).toBe('neutral');
    expect(detectFirstStrongDirection('08/09/2026')).toBe('neutral');
  });

  it('Hebrew + numbers uses Hebrew as first strong', () => {
    expect(detectFirstStrongDirection('בשנת 2026 המחיר היה 15%')).toBe('rtl');
  });

  it('does not use naïve contains-Hebrew', () => {
    expect(detectFirstStrongDirection('English with עברית')).toBe('ltr');
  });

  it('academic mixed Hebrew-first', () => {
    expect(detectFirstStrongDirection('הפונקציה f(x) היא רציפה')).toBe('rtl');
    expect(detectFirstStrongDirection('אם f(x) = x² + 2x + 1 אז...')).toBe('rtl');
  });
});

describe('resolveEffectiveDir', () => {
  it('explicit overrides auto', () => {
    expect(resolveEffectiveDir('ltr', 'שלום')).toBe('ltr');
    expect(resolveEffectiveDir('rtl', 'Hello')).toBe('rtl');
  });

  it('auto uses first-strong; neutral → ltr fallback', () => {
    expect(resolveEffectiveDir('auto', 'שלום')).toBe('rtl');
    expect(resolveEffectiveDir('auto', 'Hello')).toBe('ltr');
    expect(resolveEffectiveDir('auto', '123')).toBe('ltr');
  });
});

describe('dir attrs vs documentBody', () => {
  it('default auto on body→doc does not rewrite body', () => {
    const body = 'שלום עולם\nHello';
    expect(roundTripBody(body)).toBe(body);
    const doc = bodyToTiptapDoc(body);
    for (const n of doc.content ?? []) {
      expect(n.attrs?.dir ?? 'auto').toBe('auto');
    }
  });

  it('explicit dir attrs do not mutate serialized body text', () => {
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc('שלום עולם'),
      editable: true,
    });
    ed.chain().focus().updateAttributes('nbParagraph', { dir: 'rtl' }).run();
    expect(ed.state.doc.firstChild?.attrs.dir).toBe('rtl');
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toBe('שלום עולם');
    expect(hasBidiControlChars(body)).toBe(false);
    ed.destroy();
  });

  it('RTL fixture round-trips without bidi controls', () => {
    const out = roundTripBody(RTL_PHASE_A_FIXTURE_BODY);
    expect(hasBidiControlChars(out)).toBe(false);
    expect(BIDI_CONTROL_CHARS_RE.test(out)).toBe(false);
  });

  it('normalizeTextDir + inherit rule', () => {
    expect(normalizeTextDir('rtl')).toBe('rtl');
    expect(normalizeTextDir('nope')).toBe('auto');
    expect(inheritDirForNewBlock('rtl')).toBe('rtl');
    expect(inheritDirForNewBlock('auto')).toBe('auto');
    expect(inheritDirForNewBlock('ltr', { inheritExplicit: false })).toBe('auto');
  });
});
