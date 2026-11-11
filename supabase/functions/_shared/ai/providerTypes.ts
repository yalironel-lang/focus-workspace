/**
 * Provider-neutral interface — adapters live only on the server.
 */

import type { ChatMessage } from './promptExplainSelection.ts';

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

export type ProviderSuccess = {
  ok: true;
  text: string;
  usage?: ProviderUsage;
  rawModel: string;
  latencyMs: number;
  /** Provider x-request-id when present (metadata only). */
  providerRequestId?: string;
  /** Visible text was cut off because the completion budget was spent. */
  generationIncomplete?: boolean;
  retryAttempts?: number;
  fallbackTriggered?: boolean;
  originalModel?: string;
};

/**
 * Server-only provider failure diagnostics.
 * Never include error.message, prompts, Authorization, or raw bodies.
 * Never copy this object into the public ZikukAiResponse.
 */
export type ProviderFailureDiagnostics = {
  providerHttpStatus: number;
  providerErrorType?: string;
  providerErrorCode?: string;
  model: string;
  endpoint: 'chat_completions' | 'gemini_generate_content';
  finishReason?: string;
  emptyText?: boolean;
  requestId?: string;
};

export type ProviderFailure = {
  ok: false;
  code:
    | 'provider_unavailable'
    | 'provider_timeout'
    | 'rate_limited'
    | 'bad_response'
    | 'output_budget_exhausted';
  message: string;
  status?: number;
  latencyMs: number;
  usage?: ProviderUsage;
  /** Server-only; must not be forwarded to the client response. */
  diagnostics?: ProviderFailureDiagnostics;
  providerRequestId?: string;
  retryAttempts?: number;
  fallbackTriggered?: boolean;
  originalModel?: string;
};

export type ProviderResult = ProviderSuccess | ProviderFailure;

export type ProviderCompleteInput = {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
  requestStartedAt?: number;
  deadlineMs?: number;
};

export interface AiProvider {
  complete(input: ProviderCompleteInput): Promise<ProviderResult>;
}
