/**
 * @vitest-environment happy-dom
 *
 * M0.9B / M0.9B.1 Ask ZIKUK course workspace — context, composer, presentation.
 */

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { ZikukAiResponse } from '../gatewayClient';
import { formatAskCourseSourceLabel } from '../../../components/ai/AskZikukSources';
import { FloatingWorkspaceShell } from '../../../components/workspace-shell/FloatingWorkspaceShell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zikukAiRequest = vi.hoisted(() => vi.fn());

vi.mock('../gatewayClient', async () => {
  const actual = await vi.importActual<typeof import('../gatewayClient')>('../gatewayClient');
  return {
    ...actual,
    zikukAiRequest: (...args: unknown[]) => zikukAiRequest(...args),
  };
});

const { AskZikukWorkspace } = await import('../../../components/ai/AskZikukWorkspace');
const { AskZikukSources } = await import('../../../components/ai/AskZikukSources');
const { AskZikukAnswer } = await import('../../../components/ai/AskZikukAnswer');

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
  document.body.querySelectorAll('[data-ask-zikuk-workspace]').forEach(n => n.remove());
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function workspaceRoot(): HTMLElement {
  const el = document.body.querySelector('[data-ask-zikuk-workspace]') as HTMLElement | null;
  if (!el) throw new Error('Ask workspace not mounted');
  return el;
}

async function typeQuestion(value: string) {
  const input = workspaceRoot().querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  zikukAiRequest.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('formatAskCourseSourceLabel', () => {
  it('formats PDF sources compactly', () => {
    expect(
      formatAskCourseSourceLabel({
        index: 1,
        sourceKind: 'free_space_pdf',
        sourceObjectId: 'secret-uuid',
        fileName: null,
        pageNumber: 3,
      }),
    ).toBe('PDF · Course material · Page 3');
  });

  it('formats Notebook citations distinctly', () => {
    expect(
      formatAskCourseSourceLabel({
        index: 2,
        sourceKind: 'notebook_page',
        notebookObjectId: 'nb-1',
        pageId: 'page-1',
        notebookTitle: 'Legal Relationships',
        pageTitle: 'Capacity',
      }),
    ).toBe('Notebook · Legal Relationships · Capacity');
  });
});

describe('AskZikukSources privacy', () => {
  it('renders authoritative labels without leaking ids', () => {
    mount(
      createElement(AskZikukSources, {
        tokens: TOKENS,
        accent: '#38bdf8',
        sources: [
          {
            index: 1,
            sourceKind: 'free_space_pdf',
            sourceObjectId: 'uuid-should-not-leak',
            fileName: 'Lecture.pdf',
            pageNumber: 2,
          },
        ],
      }),
    );
    const text = host!.textContent ?? '';
    expect(text).toContain('Sources');
    expect(text).toContain('[1]');
    expect(text).toContain('PDF · Lecture.pdf · Page 2');
    expect(text).not.toContain('uuid-should-not-leak');
    expect(text).not.toContain('sourceObjectId');
  });
});

describe('AskZikukAnswer citations', () => {
  it('only authorizes interactive markers from sources[]', () => {
    const onCite = vi.fn();
    mount(
      createElement(AskZikukAnswer, {
        text: 'See [1] and fabricated [9].',
        sources: [
          {
            index: 1,
            sourceKind: 'free_space_pdf',
            sourceObjectId: 'pdf-1',
            fileName: 'A.pdf',
            pageNumber: 1,
          },
        ],
        onCitationActivate: onCite,
      }),
    );
    const buttons = host!.querySelectorAll('[data-ask-zikuk-citation]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('data-ask-zikuk-citation')).toBe('1');
    act(() => {
      (buttons[0] as HTMLButtonElement).click();
    });
    expect(onCite).toHaveBeenCalledWith(
      expect.objectContaining({ sourceObjectId: 'pdf-1', pageNumber: 1 }),
    );
  });

  it('keeps citation markers inline with prose (not block layout)', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: 'The Violet Doctrine requires three witnesses.[1]',
        sources: [
          {
            index: 1,
            sourceKind: 'notebook_page',
            notebookObjectId: 'nb-1',
            pageId: 'p-1',
            notebookTitle: 'Violet Doctrine',
            pageTitle: 'Overview',
          },
        ],
      }),
    );
    const answer = host!.querySelector('[data-ask-zikuk-answer]') as HTMLElement;
    const btn = answer.querySelector('[data-ask-zikuk-citation]') as HTMLButtonElement;
    expect(answer.textContent).toContain('witnesses.');
    expect(answer.textContent).toContain('[1]');
    expect(btn.style.display).toBe('inline');
    expect(btn.style.width).toBe('auto');
    // No forced line break between trailing prose and citation in the DOM order.
    const html = answer.innerHTML;
    expect(html).not.toMatch(/witnesses\.<\/span><br/i);
    expect(html.indexOf('witnesses.')).toBeLessThan(html.indexOf('data-ask-zikuk-citation'));
  });

  it('collapses newline before citation so marker stays with sentence', () => {
    mount(
      createElement(AskZikukAnswer, {
        text: 'Opened at the Silver Gate.\n[1]',
        sources: [
          {
            index: 1,
            sourceKind: 'free_space_pdf',
            sourceObjectId: 'pdf-1',
            fileName: 'Lecture.pdf',
            pageNumber: 14,
          },
        ],
      }),
    );
    const answer = host!.querySelector('[data-ask-zikuk-answer]') as HTMLElement;
    expect(answer.textContent).toMatch(/Silver Gate\.\s*\[1\]/);
    expect(answer.textContent).not.toMatch(/Gate\.\n\[1\]/);
  });
});

describe('AskZikukWorkspace', () => {
  it('shows course context and composer scope', () => {
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    const ws = workspaceRoot();
    expect(ws.textContent).toContain('Ask ZIKUK');
    const ctx = ws.querySelector('[data-ask-zikuk-course-context]')?.textContent ?? '';
    expect(ctx).toContain('Calculus II');
    expect(ctx).toContain('Course context active');
    expect(ws.querySelector('[data-ask-zikuk-composer-scope]')?.textContent).toContain(
      'Asking in Calculus II',
    );
    const input = ws.querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
    expect(input.placeholder).toContain('Ask anything about Calculus II');
    expect(ws.querySelector('[data-ask-zikuk-empty]')).toBeTruthy();
  });

  it('blocks empty submit', () => {
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    const submit = workspaceRoot().querySelector(
      '[data-ask-zikuk-submit]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(zikukAiRequest).not.toHaveBeenCalled();
  });

  it('Enter submits and Shift+Enter does not', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: {
        type: 'ask_course',
        text: 'ok',
        sources: [],
      },
    });
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-calc',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    await typeQuestion('Explain Euler');

    const input = workspaceRoot().querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(zikukAiRequest).not.toHaveBeenCalled();

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          shiftKey: false,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();
    expect(zikukAiRequest).toHaveBeenCalledTimes(1);
    expect(zikukAiRequest.mock.calls[0][0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-calc',
      question: 'Explain Euler',
    });
  });

  it('loading disables duplicate submission', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(r => {
          resolve = r;
        }),
    );
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    await typeQuestion('What is a limit?');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    expect(workspaceRoot().textContent).toContain('Searching your course materials…');
    expect(
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).disabled,
    ).toBe(true);

    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    expect(zikukAiRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({
        version: 1,
        ok: true,
        result: { type: 'ask_course', text: 'A limit is…', sources: [] },
      });
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('A limit is');
    });
  });

  it('shows submitted question, clears composer on success, sources beneath answer', async () => {
    const onOpen = vi.fn();
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Natural law is … [1] also notes [2]',
        sources: [
          {
            index: 1,
            sourceKind: 'free_space_pdf',
            sourceObjectId: 'pdf-hidden',
            fileName: 'Course.pdf',
            pageNumber: 5,
          },
          {
            index: 2,
            sourceKind: 'notebook_page',
            notebookObjectId: 'nb-hidden',
            pageId: 'page-hidden',
            notebookTitle: 'My Notes',
            pageTitle: 'Week 3',
          },
        ],
      },
    });
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: onOpen,
      }),
    );
    await typeQuestion('What is natural law?');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('Natural law is');
    });

    const ws = workspaceRoot();
    expect(ws.querySelector('[data-ask-zikuk-question]')?.textContent).toContain(
      'What is natural law?',
    );
    expect(ws.textContent).not.toMatch(/YOUR QUESTION/i);
    expect(ws.textContent).not.toMatch(/\bANSWER\b/);
    const input = ws.querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
    expect(input.value).toBe('');

    const answerCol = ws.querySelector('[data-ask-zikuk-answer-column]') as HTMLElement;
    const sourcesEl = answerCol.querySelector('[data-ask-zikuk-sources]') as HTMLElement;
    expect(sourcesEl).toBeTruthy();
    expect(
      answerCol
        .querySelector('[data-ask-zikuk-answer]')!
        .compareDocumentPosition(sourcesEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const text = ws.textContent ?? '';
    expect(text).toContain('PDF · Course.pdf · Page 5');
    expect(text).toContain('Notebook · My Notes · Week 3');
    expect(text).not.toContain('pdf-hidden');

    act(() => {
      (ws.querySelector('[data-ask-zikuk-citation="1"]') as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: 'free_space_pdf', pageNumber: 5 }),
    );
    act(() => {
      (ws.querySelector('[data-ask-zikuk-source-index="2"]') as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: 'notebook_page', pageTitle: 'Week 3' }),
    );
  });

  it('preserves composer text on error for retry', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: false,
      error: { code: 'provider_timeout', message: 'raw provider' },
    });
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    await typeQuestion('retry this question');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().querySelector('[data-ask-zikuk-error]')).toBeTruthy();
    });
    const input = workspaceRoot().querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
    expect(input.value).toBe('retry this question');
    expect(workspaceRoot().querySelector('[data-ask-zikuk-retry]')).toBeTruthy();
  });

  it('shows knowledge_not_found without aggressive retry', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: false,
      error: { code: 'knowledge_not_found', message: 'raw provider' },
    });
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    await typeQuestion('obscure thing');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain("couldn't find enough support");
    });
    expect(workspaceRoot().textContent).not.toContain('raw provider');
    expect(workspaceRoot().querySelector('[data-ask-zikuk-retry]')).toBeNull();
    const input = workspaceRoot().querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
    expect(input.value).toBe('obscure thing');
  });

  it('Escape and Back to course close the workspace', () => {
    const onClose = vi.fn();
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose,
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    act(() => {
      (workspaceRoot().querySelector('[data-ask-zikuk-close]') as HTMLButtonElement).click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('suggestion prefills composer without submitting', async () => {
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    const suggestion = workspaceRoot().querySelector(
      '[data-ask-zikuk-suggestion]',
    ) as HTMLButtonElement;
    await act(async () => {
      suggestion.click();
    });
    const input = workspaceRoot().querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
    expect(input.value.length).toBeGreaterThan(0);
    expect(zikukAiRequest).not.toHaveBeenCalled();
  });

  it('M0.9C2.2 Violet UI: Turn 2 must send non-empty recentTurns', async () => {
    const violetQ =
      'What is the Violet Doctrine, and what must happen before the Silver Gate may be opened?';
    const violetA =
      'The Violet Doctrine requires exactly three witnesses before the Silver Gate may be opened.';
    zikukAiRequest
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: violetA,
          sources: [
            {
              index: 1,
              sourceKind: 'notebook_page',
              notebookObjectId: 'nb-violet',
              pageId: 'page-violet',
              notebookTitle: 'Notebook',
              pageTitle: 'Violet Doctrine',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'In short: three witnesses are required.',
          sources: [
            {
              index: 1,
              sourceKind: 'notebook_page',
              notebookObjectId: 'nb-violet',
              pageId: 'page-violet',
              notebookTitle: 'Notebook',
              pageTitle: 'Violet Doctrine',
            },
          ],
        },
      });

    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-persist-test',
        sectionTitle: 'PERSIST_TEST_SECTION',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );

    await typeQuestion(violetQ);
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('three witnesses');
    });

    expect(zikukAiRequest.mock.calls[0][0]).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-persist-test',
      question: violetQ,
    });
    expect(zikukAiRequest.mock.calls[0][0]).not.toHaveProperty('recentTurns');

    // Exact Turn 2 on the live workspace session (one prior successful turn).
    await typeQuestion('Can you explain that more simply?');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(zikukAiRequest.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const turn2 = zikukAiRequest.mock.calls[1][0];
    expect(turn2.version).toBe(2);
    expect(turn2.capability).toBe('ask_course');
    expect(turn2.sectionId).toBe('sec-persist-test');
    expect(turn2.question).toBe('Can you explain that more simply?');
    expect(turn2.recentTurns).toBeDefined();
    expect(turn2.recentTurns).not.toEqual([]);
    expect(turn2.recentTurns).toEqual([
      { role: 'user', content: violetQ },
      { role: 'assistant', content: violetA },
    ]);
    expect(JSON.stringify(turn2.recentTurns)).not.toContain('source');
    expect(JSON.stringify(turn2.recentTurns)).not.toContain('nb-violet');
    expect(turn2.recentTurns.some((t: { content: string }) => t.content === turn2.question)).toBe(
      false,
    );
  });

  it.each([
    'What do you mean by that?',
    'Why?',
    'Can you give me an example?',
  ])('M0.9C2.2 follow-up %s carries prior recentTurns', async followUp => {
    const priorQ = 'What is the Violet Doctrine?';
    const priorA = 'It requires three witnesses.';
    zikukAiRequest
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: { type: 'ask_course', text: priorA, sources: [] },
      })
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: { type: 'ask_course', text: 'ok', sources: [] },
      });
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Course',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    await typeQuestion(priorQ);
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');
    });
    await typeQuestion(followUp);
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    const body = zikukAiRequest.mock.calls[1][0];
    expect(body.question).toBe(followUp);
    expect(body.recentTurns?.length).toBeGreaterThanOrEqual(2);
    expect(body.recentTurns[0]).toEqual({ role: 'user', content: priorQ });
    expect(body.recentTurns.some((t: { content: string }) => t.content === followUp)).toBe(false);
  });

  it('renders multi-turn thread with per-turn sources and local citation numbers', async () => {
    const onOpen = vi.fn();
    zikukAiRequest
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'First answer [1]',
          sources: [
            {
              index: 1,
              sourceKind: 'free_space_pdf',
              sourceObjectId: 'pdf-old',
              fileName: 'Old.pdf',
              pageNumber: 4,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'Second answer [1]',
          sources: [
            {
              index: 1,
              sourceKind: 'notebook_page',
              notebookObjectId: 'nb-new',
              pageId: 'p-new',
              notebookTitle: 'Euler',
              pageTitle: 'Notes',
            },
          ],
        },
      });
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: onOpen,
      }),
    );

    await typeQuestion('Q1');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('First answer');
    });

    await typeQuestion('Q2');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().textContent).toContain('Second answer');
    });

    const ws = workspaceRoot();
    expect(ws.getAttribute('data-ask-zikuk-turn-count')).toBe('2');
    const results = ws.querySelectorAll('[data-ask-zikuk-result]');
    expect(results).toHaveLength(2);
    expect(results[0].textContent).toContain('Q1');
    expect(results[0].textContent).toContain('First answer');
    expect(results[0].textContent).toContain('PDF · Old.pdf · Page 4');
    expect(results[1].textContent).toContain('Q2');
    expect(results[1].textContent).toContain('Second answer');
    expect(results[1].textContent).toContain('Notebook · Euler · Notes');

    expect(zikukAiRequest.mock.calls[1][0].question).toBe('Q2');
    expect(zikukAiRequest.mock.calls[1][0].recentTurns).toEqual([
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'First answer [1]' },
    ]);

    act(() => {
      (results[0].querySelector('[data-ask-zikuk-citation="1"]') as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ sourceObjectId: 'pdf-old', pageNumber: 4 }),
    );
    act(() => {
      (results[1].querySelector('[data-ask-zikuk-citation="1"]') as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ notebookObjectId: 'nb-new', pageTitle: 'Notes' }),
    );
  });

  it('New conversation returns empty state and clears prior context', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: { type: 'ask_course', text: 'A1', sources: [] },
    });
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    expect(workspaceRoot().querySelector('[data-ask-zikuk-new-conversation]')).toBeNull();

    await typeQuestion('Q1');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');
    });

    const newBtn = workspaceRoot().querySelector(
      '[data-ask-zikuk-new-conversation]',
    ) as HTMLButtonElement;
    expect(newBtn).toBeTruthy();
    await act(async () => {
      newBtn.click();
    });
    expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('0');
    expect(workspaceRoot().querySelector('[data-ask-zikuk-empty]')).toBeTruthy();
    expect(workspaceRoot().querySelector('[data-ask-zikuk-new-conversation]')).toBeNull();

    await typeQuestion('Fresh');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    expect(zikukAiRequest.mock.calls.at(-1)![0]).not.toHaveProperty('recentTurns');
  });

  it('close then reopen preserves the active conversation', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: { type: 'ask_course', text: 'A1', sources: [] },
    });
    const onClose = vi.fn();
    function Wrap({ open }: { open: boolean }) {
      return createElement(AskZikukWorkspace, {
        open,
        onClose,
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        userId: 'user-ws-1',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      });
    }
    mount(createElement(Wrap, { open: true }));
    await typeQuestion('Q1');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');
    });

    act(() => {
      root!.render(createElement(Wrap, { open: false }));
    });
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();

    act(() => {
      root!.render(createElement(Wrap, { open: true }));
    });
    expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');
    expect(workspaceRoot().textContent).toContain('A1');
  });

  it('restored session keeps PDF/Notebook source navigation via onOpenSource', async () => {
    const onOpen = vi.fn();
    zikukAiRequest
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'PDF answer [1]',
          sources: [
            {
              index: 1,
              sourceKind: 'free_space_pdf',
              sourceObjectId: 'pdf-restored',
              fileName: 'Restored.pdf',
              pageNumber: 5,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'NB answer [1]',
          sources: [
            {
              index: 1,
              sourceKind: 'notebook_page',
              notebookObjectId: 'nb-restored',
              pageId: 'pg-restored',
              notebookTitle: 'Restored NB',
              pageTitle: 'Page',
            },
          ],
        },
      });

    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-restore-nav',
        sectionTitle: 'Calculus II',
        userId: 'user-ws-nav',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: onOpen,
      }),
    );
    await typeQuestion('PDF q');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await typeQuestion('NB q');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('2');
    });

    cleanup();
    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-restore-nav',
        sectionTitle: 'Calculus II',
        userId: 'user-ws-nav',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: onOpen,
      }),
    );
    await vi.waitFor(() => {
      expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('2');
    });
    const results = workspaceRoot().querySelectorAll('[data-ask-zikuk-result]');
    act(() => {
      (results[0].querySelector('[data-ask-zikuk-citation="1"]') as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: 'free_space_pdf',
        sourceObjectId: 'pdf-restored',
        pageNumber: 5,
      }),
    );
    act(() => {
      (results[1].querySelector('[data-ask-zikuk-citation="1"]') as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: 'notebook_page',
        notebookObjectId: 'nb-restored',
        pageId: 'pg-restored',
      }),
    );
  });

  it('marks narrow layout attribute without overflow structure', () => {
    const mq = {
      matches: true,
      media: '(max-width: 820px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    };
    vi.stubGlobal('matchMedia', () => mq);

    mount(
      createElement(AskZikukWorkspace, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        sectionTitle: 'Calculus II',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    expect(workspaceRoot().getAttribute('data-ask-zikuk-narrow')).toBe('1');
    expect(workspaceRoot().querySelector('[data-ask-zikuk-composer]')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe('FloatingWorkspaceShell Ask trigger', () => {
  it('opens Ask workspace with course title from askZikuk props', () => {
    mount(
      createElement(FloatingWorkspaceShell, {
        title: 'Calculus II',
        accent: '#38bdf8',
        tokens: TOKENS,
        isCustomizing: false,
        onBack: () => {},
        onOpenSearch: () => {},
        onOpenAppearance: () => {},
        onCustomize: () => {},
        onExitCustomize: () => {},
        onResetCustomize: () => {},
        sectionViewMode: 'free-space',
        onViewModeChange: () => {},
        focusMode: null,
        askZikuk: {
          sectionId: 'sec-shell',
          sectionTitle: 'Calculus II',
          onOpenSource: () => {},
        },
      }),
    );
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();
    act(() => {
      (host!.querySelector('[data-ask-zikuk-trigger]') as HTMLButtonElement).click();
    });
    const ws = workspaceRoot();
    const ctx = ws.querySelector('[data-ask-zikuk-course-context]')?.textContent ?? '';
    expect(ctx).toContain('Calculus II');
    expect(ctx).toContain('Course context active');
  });
});

describe('M0.9C2.3.1 Ask visibility vs top-level navigation', () => {
  const USER = 'user-vis-1';
  const SEC = 'sec-vis-1';

  function ShellHarness(props: {
    sectionViewMode: 'free-space' | 'work-surface' | 'math-zone';
    onViewModeChange: (mode: 'free-space' | 'work-surface' | 'math-zone') => void;
  }) {
    return createElement(FloatingWorkspaceShell, {
      title: 'Calculus II',
      accent: '#38bdf8',
      tokens: TOKENS,
      isCustomizing: false,
      onBack: () => {},
      onOpenSearch: () => {},
      onOpenAppearance: () => {},
      onCustomize: () => {},
      onExitCustomize: () => {},
      onResetCustomize: () => {},
      sectionViewMode: props.sectionViewMode,
      onViewModeChange: props.onViewModeChange,
      focusMode: null,
      askZikuk: {
        sectionId: SEC,
        sectionTitle: 'Calculus II',
        userId: USER,
        onOpenSource: () => {},
      },
    });
  }

  async function openAskAndCompleteTurn(answer = 'Violet answer') {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: true,
      result: { type: 'ask_course', text: answer, sources: [] },
    });
    act(() => {
      (host!.querySelector('[data-ask-zikuk-trigger]') as HTMLButtonElement).click();
    });
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeTruthy();
    await typeQuestion('What is Violet Doctrine?');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');
    });
  }

  it('1–2. Workspace mode hides Ask but preserves session; reopen restores', async () => {
    const onViewModeChange = vi.fn();
    let mode: 'free-space' | 'work-surface' | 'math-zone' = 'free-space';
    function Wrap() {
      return ShellHarness({
        sectionViewMode: mode,
        onViewModeChange: next => {
          onViewModeChange(next);
          mode = next;
          root!.render(createElement(Wrap));
        },
      });
    }
    mount(createElement(Wrap));
    await openAskAndCompleteTurn();
    const { readAskSession } = await import('./askSessionStorage');
    expect(readAskSession(USER, SEC)?.turns).toHaveLength(1);

    act(() => {
      (host!.querySelector('[data-workspace-view-mode="free-space"]') as HTMLButtonElement).click();
    });
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();
    expect(onViewModeChange).toHaveBeenCalledWith('free-space');
    expect(readAskSession(USER, SEC)?.turns).toHaveLength(1);

    act(() => {
      (host!.querySelector('[data-ask-zikuk-trigger]') as HTMLButtonElement).click();
    });
    expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');
    expect(workspaceRoot().textContent).toContain('Violet answer');
  });

  it('3. Mission Control hides Ask and preserves session', async () => {
    const onViewModeChange = vi.fn();
    mount(
      ShellHarness({
        sectionViewMode: 'free-space',
        onViewModeChange,
      }),
    );
    await openAskAndCompleteTurn('MC answer');
    const { readAskSession } = await import('./askSessionStorage');

    act(() => {
      (host!.querySelector('[data-workspace-view-mode="work-surface"]') as HTMLButtonElement).click();
    });
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();
    expect(onViewModeChange).toHaveBeenCalledWith('work-surface');
    expect(readAskSession(USER, SEC)?.turns[0]?.answer).toBe('MC answer');
  });

  it('4. Σ Studio hides Ask and preserves session', async () => {
    const onViewModeChange = vi.fn();
    mount(
      ShellHarness({
        sectionViewMode: 'free-space',
        onViewModeChange,
      }),
    );
    await openAskAndCompleteTurn('Studio answer');
    const { readAskSession } = await import('./askSessionStorage');

    const studioBtn = host!.querySelector(
      '[data-workspace-view-mode="math-zone"]',
    ) as HTMLButtonElement | null;
    expect(studioBtn).toBeTruthy();
    act(() => {
      studioBtn!.click();
    });
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();
    expect(onViewModeChange).toHaveBeenCalledWith('math-zone');
    expect(readAskSession(USER, SEC)?.turns[0]?.answer).toBe('Studio answer');
  });

  it('5–6. Back to course and Escape hide Ask without clearing session', async () => {
    mount(
      ShellHarness({
        sectionViewMode: 'free-space',
        onViewModeChange: () => {},
      }),
    );
    await openAskAndCompleteTurn('Back answer');
    const { readAskSession } = await import('./askSessionStorage');

    act(() => {
      (workspaceRoot().querySelector('[data-ask-zikuk-close]') as HTMLButtonElement).click();
    });
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();
    expect(readAskSession(USER, SEC)?.turns).toHaveLength(1);

    act(() => {
      (host!.querySelector('[data-ask-zikuk-trigger]') as HTMLButtonElement).click();
    });
    expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();
    expect(readAskSession(USER, SEC)?.turns).toHaveLength(1);
  });

  it('7. New conversation still clears session intentionally', async () => {
    mount(
      ShellHarness({
        sectionViewMode: 'free-space',
        onViewModeChange: () => {},
      }),
    );
    await openAskAndCompleteTurn('Clear me');
    const { readAskSession } = await import('./askSessionStorage');
    expect(readAskSession(USER, SEC)?.turns).toHaveLength(1);

    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-new-conversation]') as HTMLButtonElement).click();
    });
    expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('0');
    expect(readAskSession(USER, SEC)).toBeNull();
  });

  it('8. Persisted session alone does not force Ask visible on Workspace', async () => {
    const { writeAskSession } = await import('./askSessionStorage');
    writeAskSession(USER, SEC, {
      turns: [
        {
          id: 't1',
          question: 'Q',
          answer: 'Persisted',
          sources: [],
          status: 'success',
        },
      ],
      draft: '',
    });
    mount(
      ShellHarness({
        sectionViewMode: 'free-space',
        onViewModeChange: () => {},
      }),
    );
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();
    act(() => {
      (host!.querySelector('[data-ask-zikuk-trigger]') as HTMLButtonElement).click();
    });
    expect(workspaceRoot().textContent).toContain('Persisted');
  });

  it('9. In-flight Ask → Workspace: stale result does not appear; prior turns remain', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest
      .mockResolvedValueOnce({
        version: 1,
        ok: true,
        result: { type: 'ask_course', text: 'Prior', sources: [] },
      })
      .mockImplementation(
        () =>
          new Promise<ZikukAiResponse>(r => {
            resolve = r;
          }),
      );

    const onViewModeChange = vi.fn();
    mount(
      ShellHarness({
        sectionViewMode: 'free-space',
        onViewModeChange,
      }),
    );

    act(() => {
      (host!.querySelector('[data-ask-zikuk-trigger]') as HTMLButtonElement).click();
    });
    await typeQuestion('Prior Q');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');
    });

    await typeQuestion('In flight');
    await act(async () => {
      (workspaceRoot().querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await vi.waitFor(() => {
      expect(workspaceRoot().querySelector('[data-ask-zikuk-thread]')?.getAttribute('aria-busy')).toBe(
        'true',
      );
    });

    act(() => {
      (host!.querySelector('[data-workspace-view-mode="free-space"]') as HTMLButtonElement).click();
    });
    expect(document.body.querySelector('[data-ask-zikuk-workspace]')).toBeNull();

    await act(async () => {
      resolve({
        version: 1,
        ok: true,
        result: { type: 'ask_course', text: 'Late stale', sources: [] },
      });
      await Promise.resolve();
    });

    act(() => {
      (host!.querySelector('[data-ask-zikuk-trigger]') as HTMLButtonElement).click();
    });
    expect(workspaceRoot().textContent).toContain('Prior');
    expect(workspaceRoot().textContent).not.toContain('Late stale');
    expect(workspaceRoot().getAttribute('data-ask-zikuk-turn-count')).toBe('1');
    const { readAskSession } = await import('./askSessionStorage');
    expect(readAskSession(USER, SEC)?.turns.map(t => t.answer)).toEqual(['Prior']);
  });
});
