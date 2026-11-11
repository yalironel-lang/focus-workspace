/**
 * @vitest-environment node
 *
 * Chat Completions request-shape policy — reasoning vs legacy bodies.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SERVER_MAX_OUTPUT_TOKENS,
  SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS,
  SERVER_REASONING_MAX_OUTPUT_TOKENS,
} from '../../../../supabase/functions/_shared/ai/bounds.ts';
import {
  buildChatCompletionsBody,
  isReasoningCompatibleChatModel,
  resolveChatCompletionsPolicy,
  resolveServerMaxOutputTokens,
} from '../../../../supabase/functions/_shared/ai/chatCompletionsRequestPolicy.ts';
import { createOpenAICompatibleProvider } from '../../../../supabase/functions/_shared/ai/providerOpenAICompatible.ts';

const MESSAGES = [
  { role: 'system' as const, content: 'tutor' },
  { role: 'user' as const, content: 'explain' },
];

describe('resolveChatCompletionsPolicy', () => {
  it('classifies gpt-5.6-luna as reasoning-compatible', () => {
    expect(isReasoningCompatibleChatModel('gpt-5.6-luna')).toBe(true);
    expect(resolveChatCompletionsPolicy('gpt-5.6-luna')).toEqual({
      outputTokenField: 'max_completion_tokens',
    });
  });

  it('classifies representative reasoning-family IDs', () => {
    for (const model of ['gpt-5', 'gpt-5-mini', 'gpt-5.6-terra', 'gpt-6-astra', 'o3', 'o4-mini', 'o1-preview']) {
      expect(isReasoningCompatibleChatModel(model), model).toBe(true);
      expect(resolveChatCompletionsPolicy(model).outputTokenField).toBe('max_completion_tokens');
      expect(resolveChatCompletionsPolicy(model).temperature).toBeUndefined();
    }
  });

  it('classifies representative legacy-compatible IDs', () => {
    for (const model of ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'custom-proxy-model']) {
      expect(isReasoningCompatibleChatModel(model), model).toBe(false);
      expect(resolveChatCompletionsPolicy(model)).toEqual({
        outputTokenField: 'max_tokens',
        temperature: 0.4,
      });
    }
  });
});

describe('resolveServerMaxOutputTokens', () => {
  it('gives gpt-5.6-luna the reasoning budget and isolates ask_course (2048) from explain_selection (1200)', () => {
    expect(SERVER_MAX_OUTPUT_TOKENS).toBe(1200);
    expect(SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS).toBe(2048);
    expect(SERVER_REASONING_MAX_OUTPUT_TOKENS).toBe(8000);
    // Reasoning models always get reasoning budget across routes
    expect(resolveServerMaxOutputTokens('gpt-5.6-luna')).toBe(8000);
    expect(resolveServerMaxOutputTokens('gpt-5.6-luna', 'ask_course')).toBe(8000);
    expect(resolveServerMaxOutputTokens('gpt-5.6-luna', 'explain_selection')).toBe(8000);
    // Non-reasoning models get dedicated 2048 for ask_course and 1200 for explain_selection
    expect(resolveServerMaxOutputTokens('gpt-4.1-mini', 'ask_course')).toBe(2048);
    expect(resolveServerMaxOutputTokens('gpt-4.1-mini', 'explain_selection')).toBe(1200);
    expect(resolveServerMaxOutputTokens('gpt-4o-mini', 'ask_course')).toBe(2048);
    expect(resolveServerMaxOutputTokens('gpt-4o-mini', 'explain_selection')).toBe(1200);
    expect(resolveServerMaxOutputTokens('gpt-4o-mini')).toBe(1200);
  });

  it('gpt-5.6-luna request body uses the reasoning cap and omits max_tokens and temperature', () => {
    const maxTokens = resolveServerMaxOutputTokens('gpt-5.6-luna');
    const body = buildChatCompletionsBody({
      model: 'gpt-5.6-luna',
      messages: MESSAGES,
      maxTokens,
    });
    expect(body).toEqual({
      model: 'gpt-5.6-luna',
      messages: MESSAGES,
      max_completion_tokens: 8000,
    });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('reasoning_effort');
  });
});

describe('buildChatCompletionsBody', () => {
  it('gpt-5.6-luna: max_completion_tokens only (no max_tokens / temperature)', () => {
    const body = buildChatCompletionsBody({
      model: 'gpt-5.6-luna',
      messages: MESSAGES,
      maxTokens: 1200,
    });
    expect(body).toEqual({
      model: 'gpt-5.6-luna',
      messages: MESSAGES,
      max_completion_tokens: 1200,
    });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('legacy gpt-4o-mini: max_tokens + temperature 0.4', () => {
    const body = buildChatCompletionsBody({
      model: 'gpt-4o-mini',
      messages: MESSAGES,
      maxTokens: 1200,
    });
    expect(body).toEqual({
      model: 'gpt-4o-mini',
      messages: MESSAGES,
      temperature: 0.4,
      max_tokens: 1200,
    });
    expect(body).not.toHaveProperty('max_completion_tokens');
  });
});

describe('createOpenAICompatibleProvider serialized fetch body', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function captureBody(model: string): Promise<Record<string, unknown>> {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAICompatibleProvider({
      apiKey: 'sk-test-never-log',
      baseUrl: 'https://api.openai.com/v1',
    });
    await provider.complete({
      model,
      messages: MESSAGES,
      maxTokens: 1200,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  it('serializes reasoning body for gpt-5.6-luna without max_tokens or temperature', async () => {
    const body = await captureBody('gpt-5.6-luna');
    expect(body).toEqual({
      model: 'gpt-5.6-luna',
      messages: MESSAGES,
      max_completion_tokens: 1200,
    });
    expect(Object.keys(body).sort()).toEqual(['max_completion_tokens', 'messages', 'model']);
  });

  it('serializes legacy body for gpt-4o-mini', async () => {
    const body = await captureBody('gpt-4o-mini');
    expect(body).toEqual({
      model: 'gpt-4o-mini',
      messages: MESSAGES,
      temperature: 0.4,
      max_tokens: 1200,
    });
    expect(body).not.toHaveProperty('max_completion_tokens');
  });
});
