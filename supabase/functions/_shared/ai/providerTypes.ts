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
  endpoint: 'chat_completions';
  requestId?: string;
};

export type ProviderFailure = {
  ok: false;
  code: 'provider_unavailable' | 'provider_timeout' | 'rate_limited' | 'bad_response';
  message: string;
  status?: number;
  latencyMs: number;
  /** Server-only; must not be forwarded to the client response. */
  diagnostics?: ProviderFailureDiagnostics;
  providerRequestId?: string;
};

export type ProviderResult = ProviderSuccess | ProviderFailure;

export type ProviderCompleteInput = {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
};

export interface AiProvider {
  complete(input: ProviderCompleteInput): Promise<ProviderResult>;
}
