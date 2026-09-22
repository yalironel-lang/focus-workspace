/**
 * @vitest-environment happy-dom
 *
 * M0.6 — preserve structured ZIKUK AI errors from non-2xx functions.invoke.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZikukAiContext } from '../context/types';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}));

const { zikukAiRequest } = await import('./client');

function httpError(status: number, body: unknown) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: response,
  };
}

const EXPLAIN_CONTEXT: ZikukAiContext = {
  version: 1,
  capturedAt: '2026-01-01T00:00:00.000Z',
  identity: { userId: 'user-1' },
  academic: { sectionId: 'section-1' },
  surface: {
    type: 'notebook',
    notebookObjectId: 'nb-1',
    pageId: 'page-1',
    pageKey: 'page-1',
  },
  focus: { kind: 'text', text: 'hello', from: 1, to: 6, blockKind: 'paragraph' },
  surroundings: { blocks: [], truncated: false },
};

beforeEach(() => {
  invoke.mockReset();
});

describe('zikukAiRequest non-2xx structured errors', () => {
  it('A. preserves knowledge_not_found from FunctionsHttpError context', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(404, {
        version: 1,
        ok: false,
        error: {
          code: 'knowledge_not_found',
          message: 'No matching course material was found for this question.',
        },
      }),
    });

    const res = await zikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'What is natural law?',
    });

    expect(res).toEqual({
      version: 1,
      ok: false,
      error: {
        code: 'knowledge_not_found',
        message: 'No matching course material was found for this question.',
      },
    });
  });

  it('B. preserves rate_limited', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(429, {
        version: 1,
        ok: false,
        error: { code: 'rate_limited', message: 'Too many requests.' },
      }),
    });
    const res = await zikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Q',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rate_limited');
  });

  it('C. preserves quota_exceeded', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(429, {
        version: 1,
        ok: false,
        error: { code: 'quota_exceeded', message: 'Daily AI limit reached.' },
      }),
    });
    const res = await zikukAiRequest({
      version: 1,
      capability: 'explain_selection',
      context: EXPLAIN_CONTEXT,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('quota_exceeded');
  });

  it('D. malformed / non-JSON context → provider_unavailable', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: new Response('<html>oops</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      },
    });
    const res = await zikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Q',
    });
    expect(res).toEqual({
      version: 1,
      ok: false,
      error: {
        code: 'provider_unavailable',
        message: 'AI Gateway is temporarily unavailable.',
      },
    });
  });

  it('E. missing error.context → provider_unavailable', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
      },
    });
    const res = await zikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Q',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('provider_unavailable');
  });

  it('F. 401 without structured body → unauthenticated', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 401 },
      },
    });
    const res = await zikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Q',
    });
    expect(res).toEqual({
      version: 1,
      ok: false,
      error: {
        code: 'unauthenticated',
        message: 'Sign in required to use ZIKUK AI.',
      },
    });
  });

  it('G. successful ask_course unchanged', async () => {
    invoke.mockResolvedValue({
      data: {
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: 'Answer [1]',
          sources: [
            {
              index: 1,
              sourceObjectId: 'pdf-1',
              fileName: 'Notes.pdf',
              pageNumber: 2,
            },
          ],
        },
        meta: { capability: 'ask_course', latencyMs: 12, retrievalHitCount: 1 },
      },
      error: null,
    });
    const res = await zikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Q',
    });
    expect(res).toEqual({
      version: 1,
      ok: true,
      result: {
        type: 'ask_course',
        text: 'Answer [1]',
        sources: [
          {
            index: 1,
            sourceKind: 'free_space_pdf',
            sourceObjectId: 'pdf-1',
            fileName: 'Notes.pdf',
            pageNumber: 2,
          },
        ],
      },
      meta: { capability: 'ask_course', latencyMs: 12, retrievalHitCount: 1 },
    });
  });

  it('H. successful explain_selection unchanged', async () => {
    invoke.mockResolvedValue({
      data: {
        version: 1,
        ok: true,
        result: { type: 'text', text: 'Explanation' },
        meta: { capability: 'explain_selection', latencyMs: 9 },
      },
      error: null,
    });
    const res = await zikukAiRequest({
      version: 1,
      capability: 'explain_selection',
      context: EXPLAIN_CONTEXT,
    });
    expect(res).toEqual({
      version: 1,
      ok: true,
      result: { type: 'text', text: 'Explanation' },
      meta: { capability: 'explain_selection', latencyMs: 9 },
    });
  });

  it('structured 401 body preserves authoritative gateway code', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(401, {
        version: 1,
        ok: false,
        error: { code: 'unauthenticated', message: 'Sign in required.' },
      }),
    });
    const res = await zikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Q',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('unauthenticated');
      expect(res.error.message).toBe('Sign in required.');
    }
  });
});
