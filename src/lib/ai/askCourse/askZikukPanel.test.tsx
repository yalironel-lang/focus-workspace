/**
 * @vitest-environment happy-dom
 *
 * M0.6 Ask ZIKUK panel UI — idle, loading, success, sources privacy, Escape.
 */

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { ZikukAiResponse } from '../gatewayClient';
import { formatAskCourseSourceLabel } from '../../../components/ai/AskZikukSources';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zikukAiRequest = vi.hoisted(() => vi.fn());

vi.mock('../gatewayClient', async () => {
  const actual = await vi.importActual<typeof import('../gatewayClient')>('../gatewayClient');
  return {
    ...actual,
    zikukAiRequest: (...args: unknown[]) => zikukAiRequest(...args),
  };
});

const { AskZikukPanel } = await import('../../../components/ai/AskZikukPanel');
const { AskZikukSources } = await import('../../../components/ai/AskZikukSources');
const { AskZikukAnswer } = await import('../../../components/ai/AskZikukAnswer');

const TOKENS = {
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  cardBg: '#1e293b',
  wellBg: '#0f172a',
  cardBorder: '#334155',
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function typeQuestion(value: string) {
  const input = host!.querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
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
  it('falls back when filename missing', () => {
    expect(
      formatAskCourseSourceLabel({
        index: 1,
        sourceObjectId: 'secret-uuid',
        fileName: null,
        pageNumber: 3,
      }),
    ).toBe('Course material · p. 3');
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
    expect(text).toContain('Lecture.pdf · p. 2');
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
});

describe('AskZikukPanel', () => {
  it('renders idle helper and blocks empty submit', () => {
    mount(
      createElement(AskZikukPanel, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    expect(host!.textContent).toContain('Ask ZIKUK');
    expect(host!.textContent).toContain('Ask your course');
    const input = host!.querySelector('[data-ask-zikuk-input]') as HTMLTextAreaElement;
    expect(input.placeholder).toContain('Ask a specific question about your course material.');
    const submit = host!.querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(zikukAiRequest).not.toHaveBeenCalled();
  });

  it('shows loading then success answer and sources', async () => {
    let resolve!: (v: ZikukAiResponse) => void;
    zikukAiRequest.mockImplementation(
      () =>
        new Promise<ZikukAiResponse>(r => {
          resolve = r;
        }),
    );

    mount(
      createElement(AskZikukPanel, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );

    await typeQuestion('What is natural law?');

    await act(async () => {
      (host!.querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });

    expect(host!.textContent).toContain('Searching your course…');
    expect(host!.querySelector('[data-ask-zikuk-status]')?.getAttribute('aria-busy')).toBe(
      'true',
    );

    await act(async () => {
      resolve({
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'Natural law is … [1]',
          sources: [
            {
              index: 1,
              sourceObjectId: 'pdf-hidden',
              fileName: 'Course.pdf',
              pageNumber: 5,
            },
          ],
        },
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(host!.textContent).toContain('Natural law is');
    });

    expect(host!.textContent).toContain('Sources');
    expect(host!.textContent).toContain('Course.pdf · p. 5');
    expect(host!.textContent).not.toContain('pdf-hidden');
  });

  it('shows knowledge_not_found guidance without aggressive retry', async () => {
    zikukAiRequest.mockResolvedValue({
      version: 1,
      ok: false,
      error: { code: 'knowledge_not_found', message: 'raw provider' },
    });
    mount(
      createElement(AskZikukPanel, {
        open: true,
        onClose: () => {},
        sectionId: 'sec-1',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    await typeQuestion('obscure thing');
    await act(async () => {
      (host!.querySelector('[data-ask-zikuk-submit]') as HTMLButtonElement).click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(host!.textContent).toContain("couldn't find enough support");
    });
    expect(host!.textContent).not.toContain('raw provider');
    expect(host!.querySelector('[data-ask-zikuk-retry]')).toBeNull();
  });

  it('Escape closes the panel', () => {
    const onClose = vi.fn();
    mount(
      createElement(AskZikukPanel, {
        open: true,
        onClose,
        sectionId: 'sec-1',
        tokens: TOKENS,
        accent: '#38bdf8',
        onOpenSource: () => {},
      }),
    );
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
