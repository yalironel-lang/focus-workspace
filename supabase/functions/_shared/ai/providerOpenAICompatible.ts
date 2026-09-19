/**
 * Server-only OpenAI-compatible chat completions adapter.
 * Do not import this into the browser bundle.
 */

import type { AiProvider, ProviderResult } from './providerTypes.ts';
import type { ChatMessage } from './promptExplainSelection.ts';

export type OpenAICompatibleConfig = {
  apiKey: string;
  baseUrl: string;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  if (/\/v1$/i.test(b)) return joinUrl(b, 'chat/completions');
  return joinUrl(b, 'v1/chat/completions');
}

type RawResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): AiProvider {
  return {
    async complete(input): Promise<ProviderResult> {
      const started = Date.now();
      const url = chatCompletionsUrl(config.baseUrl);
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: input.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: input.model,
            messages: input.messages as ChatMessage[],
            temperature: 0.4,
            max_tokens: input.maxTokens,
          }),
        });
        const latencyMs = Date.now() - started;
        let json: RawResponse = {};
        try {
          json = (await res.json()) as RawResponse;
        } catch {
          return {
            ok: false,
            code: 'bad_response',
            message: 'Invalid response from model provider.',
            status: res.status,
            latencyMs,
          };
        }
        if (res.status === 429) {
          return {
            ok: false,
            code: 'rate_limited',
            message: 'The model provider rate-limited this request.',
            status: 429,
            latencyMs,
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            code: res.status >= 500 ? 'provider_unavailable' : 'bad_response',
            message: 'The model provider could not complete this request.',
            status: res.status,
            latencyMs,
          };
        }
        const text = json.choices?.[0]?.message?.content?.trim() ?? '';
        if (!text) {
          return {
            ok: false,
            code: 'bad_response',
            message: 'Empty response from model provider.',
            status: res.status,
            latencyMs,
          };
        }
        const usage =
          json.usage &&
          (typeof json.usage.prompt_tokens === 'number' ||
            typeof json.usage.completion_tokens === 'number')
            ? {
                inputTokens: json.usage.prompt_tokens,
                outputTokens: json.usage.completion_tokens,
              }
            : undefined;
        return { ok: true, text, usage, rawModel: input.model, latencyMs };
      } catch (e) {
        const latencyMs = Date.now() - started;
        const name = e instanceof Error ? e.name : '';
        const msg = e instanceof Error ? e.message : String(e);
        if (name === 'AbortError' || /abort|timeout/i.test(msg)) {
          return {
            ok: false,
            code: 'provider_timeout',
            message: 'The model provider timed out.',
            latencyMs,
          };
        }
        return {
          ok: false,
          code: 'provider_unavailable',
          message: 'The model provider is unavailable.',
          latencyMs,
        };
      }
    },
  };
}
