/**
 * Editable inline-math source BiDi isolate (sandbox decorations).
 *
 * @vitest-environment happy-dom
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import {
  findDelimitedMathSourceRanges,
  buildInlineMathSourceDecorations,
} from './sandboxInlineMathIsolate';
import { hasBidiControlChars } from './direction';
import { roundTripBody } from './index';
import { BIDI_CONTROL_CHARS_RE } from './direction';

const HE_INLINE =
  'הפונקציה $f(x) = x^2 + 2x + 1$ היא רציפה';

const { NotebookTiptapSandboxEditor } = await import(
  '../../components/notebook/tiptap/NotebookTiptapSandboxEditor'
);
const { NotebookTiptapReadonlyViewer } = await import(
  '../../components/notebook/tiptap/NotebookTiptapReadonlyViewer'
);
const { KatexPreview } = await import('../../components/notebook/KatexPreview');
const { MathRichText } = await import('../../components/notebook/MathRichText');

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

describe('findDelimitedMathSourceRanges', () => {
  it('includes $ delimiters for Hebrew + inline math', () => {
    const ranges = findDelimitedMathSourceRanges(HE_INLINE);
    expect(ranges).toHaveLength(1);
    expect(HE_INLINE.slice(ranges[0]!.from, ranges[0]!.to)).toBe('$f(x) = x^2 + 2x + 1$');
  });

  it('ignores incomplete open $', () => {
    expect(findDelimitedMathSourceRanges('שלום $f(x)')).toEqual([]);
  });
});

describe('Hebrew + inline math source safety', () => {
  it('round-trips byte-stable without bidi controls', () => {
    expect(roundTripBody(HE_INLINE)).toBe(HE_INLINE);
    expect(hasBidiControlChars(HE_INLINE)).toBe(false);
    expect(hasBidiControlChars(roundTripBody(HE_INLINE))).toBe(false);
  });

  it('sandbox serialize keeps exact source after load', () => {
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(HE_INLINE),
      editable: true,
    });
    const body = tiptapDocToBody(ed.getJSON());
    expect(body).toBe(HE_INLINE);
    expect(hasBidiControlChars(body)).toBe(false);
    // Decorations exist for the $...$ span
    const decos = buildInlineMathSourceDecorations(ed.state.doc);
    expect(decos.find().length).toBeGreaterThan(0);
    ed.destroy();
  });

  it('DOM shows math-src isolate span; body unchanged', async () => {
    const onReady = vi.fn();
    const onSerializeAttempt = vi.fn();
    mount(
      createElement(NotebookTiptapSandboxEditor, {
        initialDocumentBody: HE_INLINE,
        onReady,
        onSerializeAttempt,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-math-src-isolate="1"]')).toBeTruthy();
    });
    const span = host!.querySelector('[data-nb-math-src-isolate="1"]') as HTMLElement;
    expect(span.getAttribute('dir')).toBe('ltr');
    expect(span.textContent).toBe('$f(x) = x^2 + 2x + 1$');
    const snap = onSerializeAttempt.mock.calls.at(-1)?.[0];
    expect(snap?.status).toBe('SAFE');
    expect(snap?.body).toBe(HE_INLINE);
  });
});

describe('shared KatexPreview / MathRichText LTR isolation audit', () => {
  it('KatexPreview emits data-nb-math-isolate', () => {
    mount(createElement(KatexPreview, { latex: 'f(x)=x^2', displayMode: false }));
    const el = host!.querySelector('[data-nb-math-isolate="1"]') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('dir')).toBe('ltr');
  });

  it('MathRichText isolates inline katex runs inside Hebrew', () => {
    mount(
      createElement(MathRichText, {
        text: HE_INLINE,
        textColor: '#fff',
        mutedColor: '#888',
      }),
    );
    const iso = host!.querySelector('[data-nb-math-isolate="1"]') as HTMLElement;
    expect(iso).toBeTruthy();
    expect(iso.getAttribute('dir')).toBe('ltr');
    // Source dollars are consumed by MathRichText segments (rendered KaTeX, not $ glyphs)
    expect(host!.textContent).not.toContain('$f(x)');
  });

  it('readonly viewer uses MathRichText path for Hebrew+math (rendered isolate)', async () => {
    const onReady = vi.fn();
    mount(
      createElement(NotebookTiptapReadonlyViewer, {
        documentBody: HE_INLINE,
        onReady,
      }),
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-math-isolate="1"]')).toBeTruthy();
    });
  });
});

describe('sandboxPaste bidi policy audit', () => {
  it('preserves user-provided bidi controls (no silent strip)', () => {
    const dirty = `\u202Eשלום\u202C $a+b$`;
    expect(hasBidiControlChars(dirty)).toBe(true);
    expect(roundTripBody(dirty)).toBe(dirty);
  });

  it('preserves normal Hebrew and mixed paste without injection', () => {
    expect(roundTripBody('שלום עולם')).toBe('שלום עולם');
    expect(roundTripBody('Hello שלום')).toBe('Hello שלום');
    expect(hasBidiControlChars('שלום עולם')).toBe(false);
    // Detection helper still available; BIDI_CONTROL_CHARS_RE is detect-only
    BIDI_CONTROL_CHARS_RE.lastIndex = 0;
    expect(BIDI_CONTROL_CHARS_RE.test('שלום')).toBe(false);
  });
});
