/**
 * M0.5C — Embedding provider types (server-only).
 * Separate from chat AiProvider — generation and embedding evolve independently.
 */

export type EmbeddingProviderUsage = {
  inputTokens?: number;
  totalTokens?: number;
};

export type EmbeddingProviderErrorCode =
  | 'embedding_rate_limited'
  | 'embedding_timeout'
  | 'embedding_provider_unavailable'
  | 'embedding_invalid_response'
  | 'embedding_quota_exceeded'
  | 'embedding_internal_error';

export type EmbeddingProviderSuccess = {
  ok: true;
  /** Ordered by request index; length === inputs.length */
  embeddings: number[][];
  model: string;
  dimensions: number;
  usage?: EmbeddingProviderUsage;
  latencyMs: number;
  providerRequestId?: string;
  /** Explicit: caller may retry this request. */
  retryable: false;
};

export type EmbeddingProviderFailure = {
  ok: false;
  code: EmbeddingProviderErrorCode;
  message: string;
  latencyMs: number;
  retryable: boolean;
  providerHttpStatus?: number;
  providerRequestId?: string;
};

export type EmbeddingProviderResult = EmbeddingProviderSuccess | EmbeddingProviderFailure;

export type EmbeddingProviderEmbedInput = {
  model: string;
  dimensions: number;
  /** Chunk texts only — never ids/paths/JWT. */
  inputs: string[];
  signal?: AbortSignal;
};

export interface AiEmbeddingProvider {
  embed(input: EmbeddingProviderEmbedInput): Promise<EmbeddingProviderResult>;
}

/** Map adapter failure → finalize_index_failure error_code (SQL allowlist). */
export function mapEmbeddingErrorToIndexFailureCode(
  code: EmbeddingProviderErrorCode,
):
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'rate_limited'
  | 'internal_error' {
  switch (code) {
    case 'embedding_rate_limited':
    case 'embedding_quota_exceeded':
      return 'rate_limited';
    case 'embedding_timeout':
      return 'provider_timeout';
    case 'embedding_provider_unavailable':
      return 'provider_unavailable';
    case 'embedding_invalid_response':
    case 'embedding_internal_error':
    default:
      return 'internal_error';
  }
}
