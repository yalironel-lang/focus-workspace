/**
 * @vitest-environment happy-dom
 *
 * M0.9C3 — Ask academic Markdown / math / citation rendering.
 */

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askSlotToken,
  prepareAskAcademicMarkdown,
  splitAskInlinePieces,
} from './prepareAskAcademicMarkdown';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { AskZikukAnswer } = await import('../../../components/ai/AskZikukAnswer');
const { AskZikukResult } = await import('../../../components/ai/AskZikukResult');
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import { writeAskSession, readAskSession } from './askSessionStorage';

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
} as unknown as AtmosphereTokens;

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
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('prepareAskAcademicMarkdown', () => {
  it('protects fenced code and math as slots', () => {
    const src = [
      'Intro $x^2$',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '$$',
      '\\frac{a}{b}',
      '$$',
    ].join('\n');
    const { markdown, slots } = prepareAskAcademicMarkdown(src);
    expect(slots.some(s => s.kind === 'inline_math' && s.latex.includes('x^2'))).toBe(true);
    expect(slots.some(s => s.kind === 'display_math' && s.latex.includes('frac'))).toBe(true);
    expect(slots.some(s => s.kind === 'fenced_code' && s.code.includes('const a'))).toBe(true);
    expect(markdown).toContain(askSlotToken(0));
    expect(markdown).not.toContain('```');
    expect(markdown).not.toContain('$x^2$');
  });

  it('splits citations and slots in inline pieces', () => {
    const token = askSlotToken(2);
    const pieces = splitAskInlinePieces(`See ${token} and [1].`);
    expect(pieces).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'slot', index: 2 },
      { type: 'text', value: ' and ' },
      { type: 'citation', index: 1 },
      { type: 'text', value: '.' },
    ]);
  });
});

describe('AskZikukAnswer academic rendering (M0.9C3)', () => {
  it('1. plain paragraph', () => {
    mount(createElement(AskZikukAnswer, { text: 'Hello academic world.', sources: [] }));
    expect(host!.querySelector('[data-ask-zikuk-md="p"]')?.textContent).toContain(
      'Hello academic world.',
    );
  });

  it('2. headings', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: '## Witnesses\n\nBody.',
        sources: [],
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-md="h2"]')?.textContent).toContain('Witnesses');
  });

  it('3. bold and emphasis', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: 'The **Violet Doctrine** is *central*.',
        sources: [],
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-md="strong"]')?.textContent).toBe(
      'Violet Doctrine',
    );
    expect(host!.querySelector('[data-ask-zikuk-md="em"]')?.textContent).toBe('central');
  });

  it('4. unordered list', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: '- alpha\n- beta\n- gamma',
        sources: [],
      }),
    );
    const items = host!.querySelectorAll('[data-ask-zikuk-md="ul"] [data-ask-zikuk-md="li"]');
    expect(items).toHaveLength(3);
    expect(items[1]?.textContent).toContain('beta');
  });

  it('5. ordered list', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: '1. First\n2. Second',
        sources: [],
      }),
    );
    const items = host!.querySelectorAll('[data-ask-zikuk-md="ol"] [data-ask-zikuk-md="li"]');
    expect(items).toHaveLength(2);
  });

  it('6. inline code', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: 'Use `O(n)` carefully.',
        sources: [],
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-md="code"]')?.textContent).toBe('O(n)');
  });

  it('7. fenced code', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: 'Example:\n\n```js\nconst x = 1;\n```\n',
        sources: [],
      }),
    );
    const block = host!.querySelector('[data-ask-zikuk-code-block]');
    expect(block?.textContent).toContain('const x = 1;');
  });

  it('8. inline math', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: "Derivative $f'(x)=2x$.",
        sources: [],
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-math="inline"]')).toBeTruthy();
    expect(host!.querySelector('.katex')).toBeTruthy();
  });

  it('9. block math', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: 'See:\n\n$$\n\\frac{\\partial f}{\\partial x}=2x+y\n$$\n',
        sources: [],
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-math="display"]')).toBeTruthy();
    expect(host!.querySelector('.katex-display, .katex')).toBeTruthy();
  });

  it('10. malformed math fails safely without crashing Ask', () => {
    expect(() => {
      mount(
        createElement(AskZikukAnswer, {
          text: 'Broken $\\frac{a{b$ still ok.',
          sources: [],
        }),
      );
    }).not.toThrow();
    expect(host!.querySelector('[data-ask-zikuk-answer]')).toBeTruthy();
    expect(host!.textContent).toContain('still ok');
  });

  it('11. raw HTML / unsafe content does not execute', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: 'Safe <script>alert("xss")</script> and <img src=x onerror=alert(1)> done.',
        sources: [],
      }),
    );
    expect(host!.querySelector('script')).toBeNull();
    expect(host!.querySelector('img')).toBeNull();
    expect(host!.textContent).toContain('Safe');
    expect(host!.textContent).toContain('done');
  });

  it('11b. model links are not navigable', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: 'See [docs](javascript:alert(1)) please.',
        sources: [],
      }),
    );
    expect(host!.querySelector('a')).toBeNull();
    expect(host!.querySelector('[data-ask-zikuk-md="link-plain"]')?.textContent).toContain('docs');
  });

  it('12–13. PDF and Notebook sources stay with their turn answer', () => {
    const onOpen = vi.fn();
    mount(
      createElement('div', null, [
        createElement(AskZikukResult, {
          key: 't1',
          question: 'Q1',
          text: 'PDF claim [1].',
          sources: [
            {
              index: 1,
              sourceKind: 'free_space_pdf',
              sourceObjectId: 'pdf-a',
              fileName: 'A.pdf',
              pageNumber: 2,
            },
          ],
          tokens: TOKENS,
          accent: '#38bdf8',
          onOpenSource: onOpen,
          turnId: 'turn-pdf',
        }),
        createElement(AskZikukResult, {
          key: 't2',
          question: 'Q2',
          text: 'Notebook claim [1].',
          sources: [
            {
              index: 1,
              sourceKind: 'notebook_page',
              notebookObjectId: 'nb-a',
              pageId: 'p-a',
              notebookTitle: 'NB',
              pageTitle: 'Page',
            },
          ],
          tokens: TOKENS,
          accent: '#38bdf8',
          onOpenSource: onOpen,
          turnId: 'turn-nb',
        }),
      ]),
    );
    const turns = host!.querySelectorAll('[data-ask-zikuk-result]');
    expect(turns).toHaveLength(2);
    act(() => {
      (turns[0].querySelector('[data-ask-zikuk-citation="1"]') as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceKind: 'free_space_pdf', sourceObjectId: 'pdf-a' }),
    );
    act(() => {
      (turns[1].querySelector('[data-ask-zikuk-citation="1"]') as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceKind: 'notebook_page', notebookObjectId: 'nb-a' }),
    );
  });

  it('14–15. two turns retain independent rendering and sources', () => {
    mount(
      createElement('div', null, [
        createElement(AskZikukResult, {
          key: 'a',
          question: 'Define',
          text: '## Definition\n\n**Term** means $x$.[1]',
          sources: [
            {
              index: 1,
              sourceKind: 'free_space_pdf',
              sourceObjectId: 'pdf-1',
              fileName: 'L.pdf',
              pageNumber: 1,
            },
          ],
          tokens: TOKENS,
          accent: '#38bdf8',
          turnId: 'a',
        }),
        createElement(AskZikukResult, {
          key: 'b',
          question: 'Follow-up',
          text: '1. Step one\n2. Step two\n\nSee [1].',
          sources: [
            {
              index: 1,
              sourceKind: 'notebook_page',
              notebookObjectId: 'nb-1',
              pageId: 'p-1',
              notebookTitle: 'N',
              pageTitle: 'P',
            },
          ],
          tokens: TOKENS,
          accent: '#38bdf8',
          turnId: 'b',
        }),
      ]),
    );
    const turns = host!.querySelectorAll('[data-ask-zikuk-result]');
    expect(turns[0].querySelector('[data-ask-zikuk-md="h2"]')?.textContent).toContain(
      'Definition',
    );
    expect(turns[0].querySelector('[data-ask-zikuk-math="inline"]')).toBeTruthy();
    expect(turns[1].querySelectorAll('[data-ask-zikuk-md="ol"] [data-ask-zikuk-md="li"]')).toHaveLength(
      2,
    );
    expect(turns[0].textContent).toContain('PDF · L.pdf');
    expect(turns[1].textContent).toContain('Notebook · N · P');
  });

  it('16. restored persisted conversation text renders identically', () => {
    const academic = '## Restored\n\n- one\n- two\n\nFormula $a+b$.[1]';
    writeAskSession('user-r', 'sec-r', {
      turns: [
        {
          id: 't1',
          question: 'Q',
          answer: academic,
          sources: [
            {
              index: 1,
              sourceKind: 'free_space_pdf',
              sourceObjectId: 'pdf-r',
              fileName: 'R.pdf',
              pageNumber: 3,
            },
          ],
          status: 'success',
        },
      ],
      draft: '',
    });
    const stored = readAskSession('user-r', 'sec-r')!;
    mount(
      createElement(AskZikukAnswer, {
        text: stored.turns[0]!.answer,
        sources: stored.turns[0]!.sources,
      }),
    );
    expect(host!.querySelector('[data-ask-zikuk-md="h2"]')?.textContent).toContain('Restored');
    expect(host!.querySelectorAll('[data-ask-zikuk-md="li"]')).toHaveLength(2);
    expect(host!.querySelector('[data-ask-zikuk-math="inline"]')).toBeTruthy();
    expect(host!.querySelector('[data-ask-zikuk-citation="1"]')).toBeTruthy();
  });
});
