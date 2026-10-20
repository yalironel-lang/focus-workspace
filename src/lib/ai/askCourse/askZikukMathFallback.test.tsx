/**
 * @vitest-environment happy-dom
 *
 * SKE1.2 — malformed model math must not show a KaTeX error in student answers.
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dollarSpanIsMath,
  parseAiExplanationSegments,
  type AiExplanationSegment,
} from '../explainSelection/parseAiExplanationSegments';

type AiSeg = AiExplanationSegment;
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { AskZikukAnswer } = await import('../../../components/ai/AskZikukAnswer');
const { AskZikukResult } = await import('../../../components/ai/AskZikukResult');
const { AiExplanationContent } = await import('../../../components/notebook/tiptap/AiExplanationContent');
const { KatexPreview } = await import('../../../components/notebook/KatexPreview');

const TOKENS = {
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  cardBorder: '#334155',
  wellBg: '#0f172a',
} as unknown as AtmosphereTokens;

const GDP =
  'Real GDP divided by trend real GDP. If real GDP is $20 trillion and trend real GDP is \\$21 trillion, then $20 / 21 \\approx 0.952$. 产出保持稳定。';

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
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe('dollar spans that are not mathematics', () => {
  it('keeps the currency sentence as text and the ratio as math', () => {
    const segments = parseAiExplanationSegments(GDP);
    const math = segments.filter(seg => seg.type !== 'text');
    expect(math).toEqual([{ type: 'inline', latex: '20 / 21 \\approx 0.952' }]);
    const prose = segments.filter(seg => seg.type === 'text').map(seg => seg.value).join('');
    expect(prose).toContain('$20 trillion');
    expect(prose).toContain('$21 trillion');
    expect(prose).toContain('产出保持稳定');
    expect(dollarSpanIsMath('20 trillion and trend real GDP is \\')).toBe(false);
    expect(dollarSpanIsMath('20 / 21 \\approx 0.952')).toBe(true);
    expect(dollarSpanIsMath('sin x')).toBe(true);
    expect(dollarSpanIsMath('x^2')).toBe(true);
  });

  it('keeps common formulas as math and currency escapes as text', () => {
    const cases: Array<[string, AiSeg[]]> = [
      ['$x+y$', [{ type: 'inline', latex: 'x+y' }]],
      ['$xy$', [{ type: 'inline', latex: 'xy' }]],
      ['$sin x$', [{ type: 'inline', latex: 'sin x' }]],
      ['$x^2$', [{ type: 'inline', latex: 'x^2' }]],
      ['\\(\\frac{a}{b}\\)', [{ type: 'inline', latex: '\\frac{a}{b}' }]],
      ['cost is \\$20 today', [{ type: 'text', value: 'cost is $20 today' }]],
    ];
    for (const [src, expected] of cases) {
      expect(parseAiExplanationSegments(src)).toEqual(expected);
    }
    const broken = parseAiExplanationSegments('see \\(\\frac{a{b\\) end');
    expect(broken.some(seg => seg.type !== 'text')).toBe(true);
    const brokenLatex = broken.find(seg => seg.type !== 'text');
    expect(brokenLatex && brokenLatex.type !== 'text' ? brokenLatex.latex : '').toBe('\\frac{a{b');
  });
});

describe('student answer math rendering', () => {
  it('renders valid inline math, display math, fractions, and percents', () => {
    const text = [
      'Inline $x^2$ and \\(\\frac{20}{21}\\).',
      '',
      '$$',
      '\\frac{20}{21}\\approx 0.952',
      '$$',
      '',
      'Share \\(20\\%\\).',
    ].join('\n');
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    expect(host!.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
    expect(host!.querySelector('[data-ask-zikuk-math="display"]')).toBeTruthy();
    expect(host!.textContent).not.toContain('Could not render this expression');
  });

  it('shows the GDP sentence without a renderer error', () => {
    mount(createElement(AskZikukAnswer, { text: GDP, sources: [] }));
    expect(host!.textContent).not.toContain('Could not render this expression');
    expect(host!.textContent).toContain('20 trillion');
    expect(host!.textContent).toContain('21 trillion');
    expect(host!.textContent).toContain('产出保持稳定');
    expect(host!.querySelector('.katex')).toBeTruthy();
    expect(host!.querySelector('[data-math-fallback]')).toBeNull();
  });

  it('degrades malformed explicit LaTeX to source text', () => {
    const text = 'Broken \\(\\frac{a{b\\) and **still** readable.';
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    expect(host!.textContent).not.toContain('Could not render this expression');
    expect(host!.textContent).toContain('\\frac{a{b');
    expect(host!.textContent).toContain('still');
    expect(host!.querySelector('[data-math-fallback]')).toBeTruthy();
  });

  it('keeps citations and the provenance label beside the explanation', () => {
    const text = `${GDP} [PDF selection] [1]`;
    mount(
      createElement(AskZikukResult, {
        question: 'What is the output gap?',
        text,
        knowledgeTier: 'mixed',
        contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
        sources: [
          {
            index: 1,
            sourceKind: 'free_space_pdf',
            sourceObjectId: 'pdf-1',
            fileName: 'notes.pdf',
            pageNumber: 4,
          },
        ],
        tokens: TOKENS,
        accent: '#38bdf8',
        mode: 'explain',
      }),
    );
    expect(host!.textContent).toContain('Mixed or uncertain');
    expect(host!.textContent).toContain('[PDF selection]');
    expect(host!.textContent).toContain('[1]');
    expect(host!.textContent).not.toContain('Could not render this expression');
    expect(host!.querySelector('[data-ask-zikuk-turn-mode-badge]')).toBeTruthy();
  });

  it('matches the explanation renderer used outside Ask ZIKUK', () => {
    mount(createElement(AiExplanationContent, { text: GDP }));
    expect(host!.textContent).not.toContain('Could not render this expression');
    expect(host!.textContent).toContain('20 trillion');
    expect(host!.querySelector('.katex')).toBeTruthy();
  });

  it('still shows the editor error when a person is typing math', () => {
    mount(createElement(KatexPreview, { latex: '\\frac{a{b', displayMode: false }));
    expect(host!.textContent).toContain('Could not render this expression');
  });
});
