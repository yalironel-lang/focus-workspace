/**
 * Tiny Chat Completions request-shape policy (server-only).
 *
 * Reasoning-capable OpenAI families reject `max_tokens` and often reject
 * non-default `temperature`. Legacy OpenAI-compatible targets keep the
 * historical body shape.
 *
 * Keep classification conservative and explicit — not a model registry.
 */

import type { ChatMessage } from './promptExplainSelection.ts';

export type ChatCompletionsRequestPolicy = {
  outputTokenField: 'max_tokens' | 'max_completion_tokens';
  /** When set, include `temperature` in the request body; otherwise omit. */
  temperature?: number;
};

/** Historical ZIKUK OpenAI-compatible defaults. */
export const LEGACY_CHAT_COMPLETIONS_TEMPERATURE = 0.4;

/**
 * True for OpenAI reasoning / GPT-5+ families that require
 * `max_completion_tokens` and should omit sampling `temperature`.
 *
 * Matches: o1, o3, o4-mini, gpt-5*, gpt-5.6-luna, gpt-6-astra, …
 * Does not match: gpt-4o, gpt-4o-mini, gpt-3.5-turbo, custom proxy ids.
 */
export function isReasoningCompatibleChatModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return false;
  // o-series: o1, o1-mini, o3, o3-mini, o4-mini, …
  if (/^o[0-9]/.test(id)) return true;
  // GPT-5 / GPT-6 families (incl. gpt-5.6-luna, gpt-5-mini, gpt-6-astra, …)
  if (/^gpt-[56](?:$|[^0-9])/.test(id)) return true;
  return false;
}

export function resolveChatCompletionsPolicy(model: string): ChatCompletionsRequestPolicy {
  if (isReasoningCompatibleChatModel(model)) {
    return { outputTokenField: 'max_completion_tokens' };
  }
  return {
    outputTokenField: 'max_tokens',
    temperature: LEGACY_CHAT_COMPLETIONS_TEMPERATURE,
  };
}

export type ChatCompletionsBodyInput = {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
};

/**
 * Build the JSON body for POST …/chat/completions.
 * Does not include Authorization or any secrets.
 */
export function buildChatCompletionsBody(
  input: ChatCompletionsBodyInput,
  policy: ChatCompletionsRequestPolicy = resolveChatCompletionsPolicy(input.model),
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  };
  if (policy.outputTokenField === 'max_completion_tokens') {
    body.max_completion_tokens = input.maxTokens;
  } else {
    body.max_tokens = input.maxTokens;
  }
  if (typeof policy.temperature === 'number') {
    body.temperature = policy.temperature;
  }
  return body;
}
