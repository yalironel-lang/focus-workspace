/**
 * @vitest-environment happy-dom
 *
 * M0.9C2.2.6 — prove ask_course v2 + recentTurns survive to functions.invoke body.
 * Regression for the hardcoded v1 downgrade that caused real browser Network payloads
 * to lose conversational context.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}));

const { zikukAiRequest, serializeAskCourseGatewayBody } = await import('./client');
const { AI_GATEWAY_FUNCTION_NAME } = await import('./types');

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({
    data: {
      version: 1,
      ok: true,
      result: { type: 'ask_course', text: 'ok', sources: [] },
      meta: { capability: 'ask_course', retrievalHitCount: 1 },
    },
    error: null,
  });
});

describe('serializeAskCourseGatewayBody', () => {
  it('preserves v2 follow-up recentTurns', () => {
    const body = serializeAskCourseGatewayBody({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Can you explain that more simply?',
      recentTurns: [
        {
          role: 'user',
          content:
            'What is the Violet Doctrine, and what must happen before the Silver Gate may be opened?',
        },
        {
          role: 'assistant',
          content:
            'The Violet Doctrine requires exactly three witnesses before the Silver Gate may be opened.',
        },
      ],
    });
    expect(body).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Can you explain that more simply?',
      recentTurns: [
        {
          role: 'user',
          content:
            'What is the Violet Doctrine, and what must happen before the Silver Gate may be opened?',
        },
        {
          role: 'assistant',
          content:
            'The Violet Doctrine requires exactly three witnesses before the Silver Gate may be opened.',
        },
      ],
    });
    expect(body).not.toEqual(expect.objectContaining({ version: 1 }));
  });

  it('omits empty recentTurns on v2 first turn', () => {
    expect(
      serializeAskCourseGatewayBody({
        version: 2,
        capability: 'ask_course',
        sectionId: 'sec-1',
        question: 'What is the Violet Doctrine?',
      }),
    ).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'What is the Violet Doctrine?',
    });
  });

  it('preserves legacy v1 shape', () => {
    expect(
      serializeAskCourseGatewayBody({
        version: 1,
        capability: 'ask_course',
        sectionId: 'sec-1',
        question: 'Standalone',
      }),
    ).toEqual({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Standalone',
    });
  });
});

describe('zikukAiRequest invoke body (transport boundary)', () => {
  it('does not downgrade v2 + recentTurns to v1 on the wire', async () => {
    const recentTurns = [
      { role: 'user' as const, content: 'Prior topical question' },
      { role: 'assistant' as const, content: 'Prior grounded answer' },
    ];
    await zikukAiRequest({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-persist',
      question: 'Can you explain that more simply?',
      recentTurns,
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe(AI_GATEWAY_FUNCTION_NAME);
    const opts = invoke.mock.calls[0][1] as { body: Record<string, unknown> };
    expect(opts.body).toEqual({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-persist',
      question: 'Can you explain that more simply?',
      recentTurns,
    });
    expect(opts.body.version).toBe(2);
    expect(Array.isArray(opts.body.recentTurns)).toBe(true);
    expect((opts.body.recentTurns as unknown[]).length).toBe(2);
    expect(opts.body).not.toHaveProperty('sources');
  });

  it('keeps v2 first turn as version 2 without recentTurns', async () => {
    await zikukAiRequest({
      version: 2,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'What is the Violet Doctrine?',
    });
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.version).toBe(2);
    expect(body).not.toHaveProperty('recentTurns');
  });

  it('keeps legacy v1 callers on version 1', async () => {
    await zikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Legacy ask',
    });
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body).toEqual({
      version: 1,
      capability: 'ask_course',
      sectionId: 'sec-1',
      question: 'Legacy ask',
    });
  });
});
