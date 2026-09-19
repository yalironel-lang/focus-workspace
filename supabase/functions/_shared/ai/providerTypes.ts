/**
 * Provider-neutral interface — adapters live only on the server.
 */

import type { ChatMessage } from './promptExplainSelection.ts';

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type ProviderSuccess = {
  ok: true;
  text: string;
  usage?: ProviderUsage;
  rawModel: string;
  latencyMs: number;
};

export type ProviderFailure = {
  ok: false;
  code: 'provider_unavailable' | 'provider_timeout' | 'rate_limited' | 'bad_response';
  message: string;
  status?: number;
  latencyMs: number;
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
