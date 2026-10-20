/**
 * @vitest-environment happy-dom
 *
 * Tutor answer layout: headings, lists, emphasis, math, citations, both surfaces.
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareAskAcademicMarkdown } from './prepareAskAcademicMarkdown';
import { applyClaimLevelGrounding } from '../../../../supabase/functions/_shared/ai/askCourse/evaluateGroundingProvenance';
import { writeAskSession, readAskSession } from './askSessionStorage';
import { writeTutorSession } from '../tutor/tutorSessionStorage';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import * as gatewayClient from '../gatewayClient';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { AskZikukAnswer } = await import('../../../components/ai/AskZikukAnswer');
const { AskZikukResult } = await import('../../../components/ai/AskZikukResult');
const { ContextualTutorCard } = await import('../../../components/project-space/ContextualTutorCard');

const TOKENS = {
  pageBg: '#14100c',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textGhost: '#64748b',
  cardBg: '#1e293b',
  wellBg: '#0f172a',
  cardBorder: '#334155',
  divider: 'rgba(255,255,255,0.08)',
  focusBorder: '#38bdf8',
  accent: '#38bdf8',
  accentPrimary: '#6366f1',
} as unknown as AtmosphereTokens;

const SOURCE = {
  index: 1,
  sourceKind: 'free_space_pdf' as const,
  sourceObjectId: 'pdf-law',
  fileName: 'Torts.pdf',
  pageNumber: 4,
};

const LESSON = [
  '**Divergence theorem**',
  'The divergence theorem relates the flux of a vector field through a closed surface to the triple integral of the divergence.',
  'It is also called Gauss\'s theorem.',
  '**What to notice**',
  '- The surface must be closed.',
  '- The field must be smooth.',
  'Steps: 1. Identify the surface 2. Compute the divergence',
  'The slope is $x^2$.',
  'Then',
  '$$',
  '\\int_V \\nabla \\cdot F \\, dV',
  '$$',
  'A **closed** surface is *orientable*. See [1].',
].join('\n');

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

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(gatewayClient, 'zikukAiRequest').mockResolvedValue({
    ok: false,
    response: { error: { code: 'internal_error', message: 'unused' } },
  } as never);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('tutor answer layout', () => {
  it('separates headings, paragraphs, and both list types', () => {
    mount(createElement(AskZikukAnswer, { text: LESSON, sources: [SOURCE] }));
    const headings = [...host!.querySelectorAll('h3')].map(node => node.textContent);
    expect(headings).toEqual(['Divergence theorem', 'What to notice']);
    const paragraphs = [...host!.querySelectorAll('[data-ask-zikuk-md="p"]')].map(node => node.textContent ?? '');
    expect(paragraphs.some(text => text.includes('triple integral'))).toBe(true);
    expect(paragraphs.some(text => text.includes("Gauss's theorem"))).toBe(true);
    expect(paragraphs.find(text => text.includes('triple integral'))).not.toContain('Divergence theorem');
    const bullets = host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]');
    expect(bullets).toHaveLength(2);
    expect(bullets[0]?.textContent).toContain('closed');
    const steps = host!.querySelectorAll('[data-ask-zikuk-md="ol"] [data-ask-zikuk-md="li"]');
    expect(steps).toHaveLength(2);
    expect(steps[1]?.textContent).toContain('divergence');
  });

  it('shows an incomplete-answer note without changing the answer text', () => {
    mount(createElement(AskZikukAnswer, {
      text: 'Capital grows until',
      sources: [],
      generationIncomplete: true,
    }));
    expect(host!.querySelector('[data-answer-incomplete="1"]')?.textContent).toBe(
      'This answer stopped before it was finished.',
    );
    expect(host!.textContent).toContain('Capital grows until');
  });

  it('keeps bold and italic inside a paragraph', () => {
    mount(createElement(AskZikukAnswer, { text: LESSON, sources: [SOURCE] }));
    expect(host!.querySelector('[data-ask-zikuk-md="strong"]')?.textContent).toBe('closed');
    expect(host!.querySelector('[data-ask-zikuk-md="em"]')?.textContent).toBe('orientable');
  });

  it('renders inline and display math beside markdown', () => {
    mount(createElement(AskZikukAnswer, { text: LESSON, sources: [SOURCE] }));
    expect(host!.querySelector('[data-ask-zikuk-math="inline"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-math="display"]')).toBeTruthy();
    expect(host!.querySelectorAll('.katex').length).toBeGreaterThan(0);
    expect(host!.textContent).toContain('The slope is');
  });

  it('does not turn a numbered theorem sentence into a list', () => {
    const text = 'Theorem 1. The result holds for case 2. A larger domain remains valid.';
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    expect(host!.querySelector('[data-ask-zikuk-md="ol"]')).toBeNull();
    expect(host!.textContent).toContain('Theorem 1. The result holds');
  });

  it('stops an unclosed bold title from swallowing the next paragraph', () => {
    const text = [
      '**Flux form',
      'The flux equals the integral of the divergence.',
    ].join('\n');
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    expect(host!.querySelector('h3')?.textContent).toBe('Flux form');
    const body = host!.querySelector('[data-ask-zikuk-md="p"]');
    expect(body?.textContent).toContain('flux equals');
    expect(body?.querySelector('strong')).toBeNull();
  });

  it('keeps a deliberately bold sentence as emphasis', () => {
    const text = '**The divergence theorem relates flux to the triple integral.**';
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    expect(host!.querySelector('h3')).toBeNull();
    expect(host!.querySelector('[data-ask-zikuk-md="strong"]')?.textContent).toContain('triple integral');
  });

  it('renders glyph bullets and keeps currency prose out of math', () => {
    const text = [
      '• Closed surface',
      '• Smooth field',
      'Real GDP is $20 trillion and trend real GDP is \\$21 trillion.',
    ].join('\n');
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    expect(host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]')).toHaveLength(2);
    expect(host!.textContent).toContain('$20 trillion');
    expect(host!.textContent).toContain('$21 trillion');
  });

  it('keeps citation markers attached to the sentence', () => {
    mount(createElement(AskZikukAnswer, { text: LESSON, sources: [SOURCE] }));
    const button = host!.querySelector('[data-ask-zikuk-citation="1"]');
    expect(button).toBeTruthy();
    expect(button?.parentElement?.textContent).toContain('orientable');
  });

  it('renders the same structure on Ask ZIKUK and the floating tutor', () => {
    const answer = '## Witnesses\nA witness must be competent.\n- oath\n- presence';
    mount(
      createElement(AskZikukResult, {
        question: 'Who counts?',
        text: answer,
        sources: [SOURCE],
        knowledgeTier: 'course_material',
        tokens: TOKENS,
        accent: '#38bdf8',
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-result] [data-ask-zikuk-md="h2"]')?.textContent).toContain(
      'Witnesses',
    );
    expect(host!.querySelectorAll('[data-ask-zikuk-result] [data-ask-zikuk-md="li"]')).toHaveLength(2);

    act(() => {
      root?.unmount();
    });
    host?.remove();

    writeTutorSession('student-1', 'sec-law', 'pdf-law', {
      intent: {
        action: 'explain',
        attachment: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: 'pdf-law',
          sectionId: 'sec-law',
          pageNumber: 4,
          regionNorm: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 },
          attachmentType: 'text_selection',
          extractedText: 'A witness must be competent.',
        },
      },
      mode: 'explain',
      turns: [
        { id: 'u1', role: 'user', content: 'Who counts?', timestamp: 1 },
        {
          id: 'a1',
          role: 'assistant',
          content: answer,
          timestamp: 2,
          knowledgeTier: 'general_academic',
          sources: [SOURCE],
        },
      ],
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens: TOKENS,
          sectionId: 'sec-law',
          sourceObjectId: 'pdf-law',
          userId: 'student-1',
          intent: {
            action: 'explain',
            attachment: {
              sourceKind: 'free_space_pdf',
              sourceObjectId: 'pdf-law',
              sectionId: 'sec-law',
              pageNumber: 4,
              regionNorm: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 },
              attachmentType: 'text_selection',
              extractedText: 'A witness must be competent.',
            },
          },
          onClose: () => {},
        }),
      );
    });
    const tutor = host!.querySelector('[data-testid="tutor-assistant-turn"] [data-ask-zikuk-answer]');
    expect(tutor?.querySelector('[data-ask-zikuk-md="h2"]')?.textContent).toContain('Witnesses');
    expect(tutor?.querySelectorAll('[data-ask-zikuk-md="li"]')).toHaveLength(2);
    expect(tutor?.textContent).toContain('competent');
  });

  it('renders a persisted Ask session without rewriting the stored text', () => {
    writeAskSession('user-r', 'sec-r', {
      turns: [
        {
          id: 't1',
          question: 'Explain',
          answer: LESSON,
          sources: [SOURCE],
          status: 'success',
        },
      ],
      draft: '',
    });
    const stored = readAskSession('user-r', 'sec-r')!;
    expect(stored.turns[0]!.answer).toBe(LESSON);
    mount(
      createElement(AskZikukAnswer, {
        text: stored.turns[0]!.answer,
        sources: stored.turns[0]!.sources,
      }),
    );
    expect(host!.querySelector('h3')?.textContent).toBe('Divergence theorem');
    expect(host!.querySelector('[data-ask-zikuk-math="display"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-citation="1"]')).toBeTruthy();
  });

  it('lifts inline headings out of a multi-sentence bold opening and keeps math', () => {
    const text = [
      '**The Solow Growth Model explains how saving and population growth determine the steady state. Capital accumulates until investment equals break-even investment. ### Example Suppose $s = 0.3$ and $\\delta = 0.05$. ### Step 2 The change in capital is $\\dot{k} = sy - (n+\\delta)k$.**',
    ].join('\n');
    const stored = text;
    writeAskSession('user-solow', 'sec-solow', {
      turns: [
        {
          id: 't-solow',
          question: 'Explain the Solow Growth Model',
          answer: stored,
          sources: [SOURCE],
          status: 'success',
        },
      ],
      draft: '',
    });
    expect(readAskSession('user-solow', 'sec-solow')?.turns[0]?.answer).toBe(stored);

    const prepared = prepareAskAcademicMarkdown(text);
    expect(prepared.markdown).toMatch(/^### Example$/m);
    expect(prepared.markdown).toMatch(/^### Step 2$/m);
    expect(
      prepared.markdown.split('\n').filter(line => line.includes('#')).every(line => /^\s*#{2,6}\s+\S/.test(line)),
    ).toBe(true);
    expect(prepared.slots.filter(slot => slot.kind === 'inline_math').length).toBeGreaterThanOrEqual(2);
    expect(prepared.markdown).not.toContain('$s = 0.3$');

    mount(createElement(AskZikukAnswer, { text, sources: [SOURCE] }));
    expect(host!.textContent).not.toContain('###');
    expect([...host!.querySelectorAll('h3')].map(node => node.textContent)).toEqual(['Example', 'Step 2']);
    const opening = [...host!.querySelectorAll('[data-ask-zikuk-md="p"]')].map(node => node.textContent ?? '');
    expect(opening.some(paragraph => paragraph.includes('steady state') && paragraph.includes('break-even'))).toBe(true);
    expect(
      [...host!.querySelectorAll('[data-ask-zikuk-md="strong"]')].some(node =>
        (node.textContent ?? '').includes('steady state'),
      ),
    ).toBe(false);
    expect(opening.some(paragraph => paragraph.includes('Suppose'))).toBe(true);
    expect(host!.querySelectorAll('[data-ask-zikuk-math="inline"]').length).toBeGreaterThanOrEqual(2);
    expect(host!.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(host!.textContent).not.toContain('Could not render this expression');
  });

  it('splits headings that follow prose across inline and display math', () => {
    const text = [
      'Real GDP is $20 trillion. ### Example Suppose $s = 0.2$.',
      'The law of motion is',
      '$$',
      '\\dot{k} = s k^{\\alpha} - \\delta k',
      '$$',
      'Steady state sets investment equal to break-even investment. ### Step 2 Solve for $k^*$. See [1].',
    ].join('\n');
    mount(createElement(AskZikukAnswer, { text, sources: [SOURCE] }));
    expect(host!.textContent).not.toContain('###');
    expect([...host!.querySelectorAll('h3')].map(node => node.textContent)).toEqual(['Example', 'Step 2']);
    expect(host!.textContent).toContain('$20 trillion');
    expect(host!.querySelector('[data-ask-zikuk-math="inline"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-math="display"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-citation="1"]')?.parentElement?.textContent).toContain('Solve');
    expect(host!.textContent).not.toContain('Could not render this expression');
  });

  it('repairs the Solow answer shape from manual QA', () => {
    const text = [
      "**Solow Growth Model: Step-by-Step Explanation The Solow Growth Model explains how an economy's output and living standards are determined by: - Physical capital - Labour - Population growth - Saving and investment - Technological progress The model is mainly a theory of long-run economic growth. ---**",
      '1',
      'Start with the production function The economy produces output using capital and labour:',
      '$$',
      'Y = F(K, L)',
      '$$',
      'where $MPK$ is the marginal product of capital. Interpretation: - If $MPK > \\delta + n + g$, the economy has too little capital. - If $MPK < \\delta + n + g$, the economy has too much capital. See [1].',
    ].join('\n');
    writeAskSession('user-solow-v3', 'sec-solow', {
      turns: [
        {
          id: 't-solow-v3',
          question: 'Explain the Solow Growth Model',
          answer: text,
          sources: [SOURCE],
          status: 'success',
          knowledgeTier: 'mixed',
        },
      ],
      draft: '',
    });
    expect(readAskSession('user-solow-v3', 'sec-solow')?.turns[0]?.answer).toBe(text);

    mount(createElement(AskZikukAnswer, { text, sources: [SOURCE] }));
    const headings = [...host!.querySelectorAll('h3')].map(node => node.textContent ?? '');
    expect(headings.some(title => title.includes('Step-by-Step'))).toBe(true);
    expect(headings.some(title => title.includes('production function'))).toBe(true);
    const bullets = [...host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]')].map(
      node => node.textContent ?? '',
    );
    expect(bullets.some(item => item.includes('Physical capital'))).toBe(true);
    expect(bullets.some(item => item.includes('Technological progress') && !item.includes('long-run'))).toBe(true);
    expect(bullets.some(item => item.includes('too little capital'))).toBe(true);
    expect(bullets.some(item => item.includes('too much capital'))).toBe(true);
    expect(host!.querySelector('[data-ask-zikuk-md="hr"]')).toBeTruthy();
    expect(host!.textContent).not.toContain('---');
    const paragraphs = [...host!.querySelectorAll('[data-ask-zikuk-md="p"]')].map(node => node.textContent ?? '');
    expect(paragraphs.some(paragraph => paragraph.trim() === '1')).toBe(false);
    expect(paragraphs.some(paragraph => paragraph.includes('long-run economic growth'))).toBe(true);
    expect(paragraphs.some(paragraph => paragraph.includes('capital and labour'))).toBe(true);
    expect(
      [...host!.querySelectorAll('[data-ask-zikuk-md="strong"]')].some(node =>
        (node.textContent ?? '').includes('Physical capital'),
      ),
    ).toBe(false);
    expect(host!.querySelector('[data-ask-zikuk-math="display"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-math="inline"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-citation="1"]')).toBeTruthy();
    expect(host!.textContent).not.toContain('Could not render this expression');
  });

  it('repairs a multi-line bold opening that contains an inline list', () => {
    const text = [
      '**Growth accounting overview',
      'Output in the long run is determined by: * Physical capital * Labour * Technical ideas',
      'The account itself is a theory of the long run.**',
    ].join('\n');
    mount(createElement(AskZikukAnswer, { text, sources: [SOURCE] }));
    const bullets = [...host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]')].map(
      node => node.textContent ?? '',
    );
    expect(bullets.some(item => item.includes('Physical capital'))).toBe(true);
    expect(bullets.some(item => item.includes('Technical ideas'))).toBe(true);
    expect(bullets.some(item => item.includes('long run'))).toBe(false);
    const paragraphs = [...host!.querySelectorAll('[data-ask-zikuk-md="p"]')].map(node => node.textContent ?? '');
    expect(paragraphs.some(paragraph => paragraph.includes('theory of the long run'))).toBe(true);
    expect(
      [...host!.querySelectorAll('[data-ask-zikuk-md="strong"]')].some(node =>
        (node.textContent ?? '').includes('Physical capital'),
      ),
    ).toBe(false);
  });

  it('separates a heading from the following sentence without a starter word list', () => {
    const text = '### Capital accumulation Saving adds to the capital stock each year.';
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    expect(host!.querySelector('h3')?.textContent).toBe('Capital accumulation');
    const paragraphs = [...host!.querySelectorAll('[data-ask-zikuk-md="p"]')].map(node => node.textContent ?? '');
    expect(paragraphs.some(paragraph => paragraph.includes('Saving adds'))).toBe(true);
    expect(host!.querySelector('h3')?.textContent).not.toContain('Saving');
  });

  it('keeps a bare step number with its heading and peels the next sentence', () => {
    const text = [
      '1',
      '',
      '### Start with the production function The economy produces output using capital and labour.',
    ].join('\n');
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    const headings = [...host!.querySelectorAll('h3')].map(node => node.textContent ?? '');
    expect(headings.some(title => title.includes('1.') && title.includes('production function'))).toBe(true);
    expect(headings.some(title => title.includes('economy produces'))).toBe(false);
    const paragraphs = [...host!.querySelectorAll('[data-ask-zikuk-md="p"]')].map(node => node.textContent ?? '');
    expect(paragraphs.some(paragraph => paragraph.trim() === '1')).toBe(false);
    expect(paragraphs.some(paragraph => paragraph.includes('economy produces'))).toBe(true);
  });

  it('turns a repeated inline list into items instead of one paragraph', () => {
    const text = 'The inputs are - Physical capital - Labour - Technical ideas in the long run.';
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    const bullets = [...host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]')].map(
      node => node.textContent ?? '',
    );
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toContain('Physical capital');
    expect(bullets[2]).toContain('Technical ideas');
    expect(bullets[2]).not.toContain('The inputs are');
  });

  it('keeps the text after an inequality instead of ending at the comparison', () => {
    const text = [
      'Compare the two cases.',
      'If (MPK > \\delta + n + g), investment exceeds break-even.',
      'If (MPK < \\delta + n + g), the opposite holds. See [1].',
      'If $MPK > \\delta + n + g$, the same comparison stays visible.',
    ].join('\n');
    mount(createElement(AskZikukAnswer, { text, sources: [SOURCE] }));
    expect(host!.textContent).toContain('investment exceeds break-even');
    expect(host!.textContent).toContain('the opposite holds');
    expect(host!.textContent).toContain('same comparison stays visible');
    expect(host!.querySelector('[data-ask-zikuk-math="inline"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-citation="1"]')).toBeTruthy();
    expect(host!.textContent).not.toContain('Could not render this expression');
  });

  it('renders the repaired opening on Ask ZIKUK as well as the tutor answer', () => {
    const text = [
      '**Growth accounting overview',
      'Output in the long run is determined by: * Physical capital * Labour * Technical ideas',
      'The account itself is a theory of the long run.**',
      '### Capital accumulation Saving adds to the capital stock each year.',
    ].join('\n');
    mount(
      createElement(AskZikukResult, {
        question: 'How does the model work?',
        text,
        sources: [SOURCE],
        knowledgeTier: 'mixed',
        tokens: TOKENS,
        accent: '#38bdf8',
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-result] h3')?.textContent).toContain('Capital accumulation');
    expect(host!.querySelectorAll('[data-ask-zikuk-result] [data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]').length).toBeGreaterThanOrEqual(3);
    expect(host!.textContent).toContain('theory of the long run');
    expect(host!.textContent).toContain('Saving adds');
  });

  it('keeps nested lists and does not flatten a bullet that follows an equation', () => {
    const text = [
      '- Closed surface',
      '  - Smooth field',
      '1. Identify the boundary',
      '2. Compute the flux',
      'Interpretation: \u2013 If $x^2$ is positive, keep it. \u2013 If $x^2$ is zero, stop.',
    ].join('\n');
    mount(createElement(AskZikukAnswer, { text, sources: [] }));
    expect(host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]').length).toBeGreaterThanOrEqual(4);
    expect(host!.querySelectorAll('[data-ask-zikuk-md="ol"] [data-ask-zikuk-md="li"]')).toHaveLength(2);
    expect(host!.querySelectorAll('[data-ask-zikuk-math="inline"]')).toHaveLength(2);
  });

  it('keeps completed blocks stable as a response grows', () => {
    const completed = '## Theorem\n\nThe flux is $x^2$.\n\n- closed\n- smooth\n';
    const growing = `${completed}1. Integrate\n2. Compare`;
    for (const cut of [12, 28, completed.length, growing.length]) {
      act(() => {
        root?.unmount();
      });
      host?.remove();
      mount(createElement(AskZikukAnswer, { text: growing.slice(0, cut), sources: [] }));
      expect(host!.querySelector('[data-ask-zikuk-answer]')).toBeTruthy();
    }
    expect(host!.querySelector('[data-ask-zikuk-md="h2"]')?.textContent).toContain('Theorem');
    expect(host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]')).toHaveLength(2);
    expect(host!.querySelector('[data-ask-zikuk-math="inline"]')).toBeTruthy();
    expect(host!.querySelectorAll('[data-ask-zikuk-md="ol"] [data-ask-zikuk-md="li"]')).toHaveLength(2);
    const { markdown } = prepareAskAcademicMarkdown(completed);
    expect(markdown).toContain('## Theorem');
    expect(markdown).not.toContain('$x^2$');
  });

  it('renders grounded academic Markdown without rebuilding it', () => {
    const quoted = 'Saving adds to the capital stock.';
    const answer = [
      '**Growth model**',
      '',
      `${quoted} [1]`,
      '',
      '### Step 1. Define the production function',
      '',
      'The economy produces output from capital and labour.',
      '',
      '- Physical capital',
      '- Labour',
      '',
      'If f\'(k) > n + g + δ, the economy has too little capital.',
      '',
      '$$',
      '\\dot{k} = sf(k) - (n+g+\\delta)k',
      '$$',
      '',
      '```',
      'k = 1',
      '```',
    ].join('\n');
    const grounded = applyClaimLevelGrounding({
      question: 'Explain the model step by step.',
      answerText: answer,
      chunks: [{ citationIndex: 1, text: quoted }],
      captureText: '',
      contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false },
    });
    expect(grounded.knowledgeTier).toBe('course_material');
    expect(grounded.text).toBe(answer);

    const prepared = prepareAskAcademicMarkdown(grounded.text);
    expect(prepared.markdown).toContain('### Step 1. Define the production function');
    expect(prepared.markdown).not.toMatch(/^### Step 1\.$/m);
    expect(prepared.markdown).toContain('n + g + δ');
    expect(prepared.markdown).not.toMatch(/^\+ g$/m);
    expect(prepared.slots.some(slot => slot.kind === 'display_math')).toBe(true);
    expect(prepared.slots.some(slot => slot.kind === 'fenced_code' && slot.code === 'k = 1')).toBe(true);

    mount(createElement(AskZikukAnswer, { text: grounded.text, sources: [SOURCE] }));
    const headings = [...host!.querySelectorAll('h3')].map(node => node.textContent ?? '');
    expect(headings).toContain('Growth model');
    expect(headings).toContain('Step 1. Define the production function');
    expect(headings.some(title => title === 'Step 1.')).toBe(false);
    const paragraphs = [...host!.querySelectorAll('[data-ask-zikuk-md="p"]')].map(node => node.textContent ?? '');
    expect(paragraphs.some(paragraph => paragraph.includes('Saving adds'))).toBe(true);
    expect(paragraphs.some(paragraph => paragraph.includes('produces output'))).toBe(true);
    expect(
      [...host!.querySelectorAll('[data-ask-zikuk-md="strong"]')].some(node =>
        (node.textContent ?? '').includes('Saving adds'),
      ),
    ).toBe(false);
    const bullets = [...host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]')].map(
      node => node.textContent ?? '',
    );
    expect(bullets).toEqual(['Physical capital', 'Labour']);
    expect(host!.textContent).toContain('n + g + δ');
    expect(host!.textContent).toContain('too little capital');
    expect(host!.querySelector('[data-ask-zikuk-math="display"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-code-block]')?.textContent).toBe('k = 1');
    expect(host!.querySelector('[data-ask-zikuk-citation="1"]')).toBeTruthy();

    act(() => {
      root?.unmount();
    });
    host?.remove();
    mount(
      createElement(AskZikukResult, {
        question: 'Explain the model step by step.',
        text: grounded.text,
        sources: [SOURCE],
        knowledgeTier: grounded.knowledgeTier,
        tokens: TOKENS,
        accent: '#38bdf8',
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-result] h3')?.textContent).toContain('Growth model');
    expect(
      [...host!.querySelectorAll('[data-ask-zikuk-result] h3')].some(node =>
        (node.textContent ?? '').includes('Step 1. Define the production function'),
      ),
    ).toBe(true);
    expect(host!.querySelectorAll('[data-ask-zikuk-result] [data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]')).toHaveLength(2);
  });
});
