/**
 * @vitest-environment happy-dom
 *
 * AI explanation math-aware rendering (M0.3 follow-up).
 */

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAiExplanationSegments } from './parseAiExplanationSegments';
import type { ExplainSelectionState } from './useExplainSelectionController';

const { AiExplanationContent } = await import(
  '../../../components/notebook/tiptap/AiExplanationContent'
);
const { NotebookExplainSelectionPanel } = await import(
  '../../../components/notebook/tiptap/NotebookExplainSelectionPanel'
);

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

function cleanup() {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.querySelectorAll('[data-nb-candidate-explain-panel]').forEach(el => el.remove());
}

afterEach(() => {
  cleanup();
});

describe('parseAiExplanationSegments', () => {
  it('1. plain explanation text stays a single text segment', () => {
    expect(parseAiExplanationSegments('Hello world.')).toEqual([
      { type: 'text', value: 'Hello world.' },
    ]);
  });

  it('2. inline \\( ... \\) math', () => {
    expect(parseAiExplanationSegments('Rate \\(x^n\\) grows.')).toEqual([
      { type: 'text', value: 'Rate ' },
      { type: 'inline', latex: 'x^n' },
      { type: 'text', value: ' grows.' },
    ]);
  });

  it('3. block \\[ ... \\] math', () => {
    const src = 'Then\n\\[\n\\frac{d}{dx}(x^2)=2x\n\\]\ndone.';
    expect(parseAiExplanationSegments(src)).toEqual([
      { type: 'text', value: 'Then\n' },
      { type: 'display', latex: '\\frac{d}{dx}(x^2)=2x' },
      { type: 'text', value: '\ndone.' },
    ]);
  });

  it('4. mixed text + multiple formulas', () => {
    const src = 'Derivative of \\(x^n\\) is \\(nx^{n-1}\\).\n\\[\n\\frac{d}{dx}(x^2)=2x\n\\]';
    expect(parseAiExplanationSegments(src)).toEqual([
      { type: 'text', value: 'Derivative of ' },
      { type: 'inline', latex: 'x^n' },
      { type: 'text', value: ' is ' },
      { type: 'inline', latex: 'nx^{n-1}' },
      { type: 'text', value: '.\n' },
      { type: 'display', latex: '\\frac{d}{dx}(x^2)=2x' },
    ]);
  });

  it('5. malformed/unclosed delimiters fail safely as text', () => {
    expect(parseAiExplanationSegments('Broken \\(x^n and more')).toEqual([
      { type: 'text', value: 'Broken \\(x^n and more' },
    ]);
    expect(parseAiExplanationSegments('Open \\[ no close')).toEqual([
      { type: 'text', value: 'Open \\[ no close' },
    ]);
  });
});

describe('AiExplanationContent', () => {
  it('6. model-supplied HTML is not executed/interpreted', () => {
    const payload = 'Hello <img src=x onerror="window.__xss=1"> <script>window.__xss=1</script> world';
    mount(createElement(AiExplanationContent, { text: payload }));
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    expect(host!.querySelector('img')).toBeNull();
    expect(host!.querySelector('script')).toBeNull();
    expect(host!.textContent).toContain('<img');
    expect(host!.textContent).toContain('<script>');
  });

  it('renders inline and display math via KatexPreview isolates', () => {
    const src = 'See \\(x^2\\) and\n\\[a+b\\]';
    mount(createElement(AiExplanationContent, { text: src }));
    expect(host!.querySelector('[data-ai-explanation-math="inline"]')).toBeTruthy();
    expect(host!.querySelector('[data-ai-explanation-math="display"]')).toBeTruthy();
    expect(host!.querySelectorAll('[data-nb-math-isolate="1"]').length).toBeGreaterThanOrEqual(2);
    // Delimiters consumed — not left as raw glyphs in the main text path
    expect(host!.textContent).not.toContain('\\(');
    expect(host!.textContent).not.toContain('\\[');
  });
});

describe('Explain panel success rendering', () => {
  it('7. loading/error behavior remains intact; success uses AiExplanationContent', () => {
    const onClose = vi.fn();
    const onRetry = vi.fn();
    const loading: ExplainSelectionState = {
      phase: 'loading',
      frozenContext: null,
      resultText: null,
      errorMessage: null,
      errorCode: null,
      localUnavailable: null,
    };
    mount(
      createElement(NotebookExplainSelectionPanel, {
        state: loading,
        anchor: { top: 10, left: 10, width: 320 },
        onClose,
        onRetry,
      }),
    );
    expect(document.querySelector('[data-nb-candidate-explain-loading]')).toBeTruthy();

    cleanup();

    const error: ExplainSelectionState = {
      phase: 'error',
      frozenContext: null,
      resultText: null,
      errorMessage: 'Safe error',
      errorCode: 'provider_unavailable',
      localUnavailable: null,
    };
    mount(
      createElement(NotebookExplainSelectionPanel, {
        state: error,
        anchor: { top: 10, left: 10, width: 320 },
        onClose,
        onRetry,
      }),
    );
    expect(document.querySelector('[data-nb-candidate-explain-error]')?.textContent).toContain(
      'The AI service is temporarily unavailable. Try again shortly.',
    );

    cleanup();

    const success: ExplainSelectionState = {
      phase: 'success',
      frozenContext: null,
      resultText: 'Power rule: \\(nx^{n-1}\\)',
      errorMessage: null,
      errorCode: null,
      localUnavailable: null,
    };
    mount(
      createElement(NotebookExplainSelectionPanel, {
        state: success,
        anchor: { top: 10, left: 10, width: 320 },
        onClose,
        onRetry,
      }),
    );
    expect(document.querySelector('[data-nb-candidate-explain-success]')).toBeTruthy();
    expect(document.querySelector('[data-ai-explanation-content]')).toBeTruthy();
    expect(document.querySelector('[data-ai-explanation-math="inline"]')).toBeTruthy();
  });
});
