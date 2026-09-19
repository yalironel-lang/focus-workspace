/**
 * Server-only OpenAI-compatible chat completions adapter.
 * Do not import this into the browser bundle.
 */

import type {
  AiProvider,
  ProviderFailureDiagnostics,
  ProviderResult,
} from './providerTypes.ts';
import { buildChatCompletionsBody } from './chatCompletionsRequestPolicy.ts';
import { normalizeProviderUsage } from './normalizeProviderUsage.ts';
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
  usage?: unknown;
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
};

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Build safe server-only diagnostics from a provider HTTP response.
 * Never copies error.message, bodies, or Authorization material.
 */
export function buildProviderFailureDiagnostics(input: {
  status: number;
  model: string;
  requestId?: string | null;
  errorType?: unknown;
  errorCode?: unknown;
}): ProviderFailureDiagnostics {
  const diagnostics: ProviderFailureDiagnostics = {
    providerHttpStatus: input.status,
    model: input.model,
    endpoint: 'chat_completions',
  };
  const type = asNonEmptyString(input.errorType);
  const code = asNonEmptyString(input.errorCode);
  const requestId = asNonEmptyString(input.requestId ?? undefined);
  if (type) diagnostics.providerErrorType = type;
  if (code) diagnostics.providerErrorCode = code;
  if (requestId) diagnostics.requestId = requestId;
  return diagnostics;
}

/** Privacy-safe structured log line for Edge Function console. */
export function formatProviderDiagnosticLog(d: ProviderFailureDiagnostics): string {
  const line: Record<string, unknown> = {
    event: 'zikuk_ai_gateway_provider',
    ok: false,
    providerHttpStatus: d.providerHttpStatus,
    model: d.model,
    endpoint: d.endpoint,
  };
  if (d.providerErrorType) line.providerErrorType = d.providerErrorType;
  if (d.providerErrorCode) line.providerErrorCode = d.providerErrorCode;
  if (d.requestId) line.requestId = d.requestId;
  return JSON.stringify(line);
}

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
          body: JSON.stringify(
            buildChatCompletionsBody({
              model: input.model,
              messages: input.messages as ChatMessage[],
              maxTokens: input.maxTokens,
            }),
          ),
        });
        const latencyMs = Date.now() - started;
        const requestId = res.headers.get('x-request-id');

        let json: RawResponse = {};
        let jsonOk = true;
        try {
          json = (await res.json()) as RawResponse;
        } catch {
          jsonOk = false;
        }

        if (!jsonOk) {
          return {
            ok: false,
            code: 'bad_response',
            message: 'Invalid response from model provider.',
            status: res.status,
            latencyMs,
            providerRequestId: requestId ?? undefined,
            diagnostics: buildProviderFailureDiagnostics({
              status: res.status,
              model: input.model,
              requestId,
            }),
          };
        }

        if (res.status === 429) {
          return {
            ok: false,
            code: 'rate_limited',
            message: 'The model provider rate-limited this request.',
            status: 429,
            latencyMs,
            providerRequestId: requestId ?? undefined,
            diagnostics: buildProviderFailureDiagnostics({
              status: 429,
              model: input.model,
              requestId,
              errorType: json.error?.type,
              errorCode: json.error?.code,
            }),
          };
        }

        if (!res.ok) {
          return {
            ok: false,
            code: res.status >= 500 ? 'provider_unavailable' : 'bad_response',
            message: 'The model provider could not complete this request.',
            status: res.status,
            latencyMs,
            providerRequestId: requestId ?? undefined,
            diagnostics: buildProviderFailureDiagnostics({
              status: res.status,
              model: input.model,
              requestId,
              errorType: json.error?.type,
              errorCode: json.error?.code,
            }),
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
            providerRequestId: requestId ?? undefined,
          };
        }
        const usage = normalizeProviderUsage(json.usage);
        return {
          ok: true,
          text,
          usage,
          rawModel: input.model,
          latencyMs,
          providerRequestId: requestId ?? undefined,
        };
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
