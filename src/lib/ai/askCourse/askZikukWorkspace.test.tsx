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
});

afterEach(() => {
  cleanup();
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
      version: 1,
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
