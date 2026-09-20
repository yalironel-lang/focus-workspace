/**
 * Deterministic fake embedding provider for unit tests (no network).
 */

import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from './bounds.ts';
import type {
  AiEmbeddingProvider,
  EmbeddingProviderEmbedInput,
  EmbeddingProviderResult,
} from './embeddingTypes.ts';

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable pseudo-vector from text (finite floats, length 1536). */
export function fakeEmbeddingForText(text: string, dimensions = KNOWLEDGE_EMBEDDING_DIMENSIONS): number[] {
  const seed = hashString(text);
  const out = new Array<number>(dimensions);
  let x = seed || 1;
  for (let i = 0; i < dimensions; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = ((x % 10000) / 10000) * 2 - 1;
  }
  return out;
}

export type FakeEmbeddingBehavior =
  | { kind: 'ok' }
  | { kind: 'http'; status: number }
  | { kind: 'timeout' }
  | { kind: 'malformed' }
  | { kind: 'wrong_dimensions'; dimensions: number }
  | { kind: 'nan' }
  | { kind: 'duplicate_index' }
  | { kind: 'missing_index' }
  | { kind: 'extra_vector' }
  | { kind: 'custom'; handler: (input: EmbeddingProviderEmbedInput) => Promise<EmbeddingProviderResult> };

export function createFakeEmbeddingProvider(
  behavior: FakeEmbeddingBehavior = { kind: 'ok' },
): AiEmbeddingProvider & { calls: EmbeddingProviderEmbedInput[] } {
  const calls: EmbeddingProviderEmbedInput[] = [];
  return {
    calls,
    async embed(input) {
      calls.push({
        model: input.model,
        dimensions: input.dimensions,
        inputs: [...input.inputs],
      });
      if (behavior.kind === 'custom') return behavior.handler(input);
      if (behavior.kind === 'timeout') {
        return {
          ok: false,
          code: 'embedding_timeout',
          message: 'timeout',
          latencyMs: 1,
          retryable: true,
        };
      }
      if (behavior.kind === 'http') {
        if (behavior.status === 429) {
          return {
            ok: false,
            code: 'embedding_rate_limited',
            message: 'rate',
            latencyMs: 1,
            retryable: true,
            providerHttpStatus: 429,
          };
        }
        return {
          ok: false,
          code: 'embedding_provider_unavailable',
          message: 'http',
          latencyMs: 1,
          retryable: behavior.status >= 500,
          providerHttpStatus: behavior.status,
        };
      }

      // Build a synthetic OpenAI-shaped payload then validate path via direct result
      if (behavior.kind === 'malformed') {
        return {
          ok: false,
          code: 'embedding_invalid_response',
          message: 'malformed',
          latencyMs: 1,
          retryable: false,
        };
      }

      const dims =
        behavior.kind === 'wrong_dimensions' ? behavior.dimensions : input.dimensions;
      const embeddings: number[][] = [];
      for (let i = 0; i < input.inputs.length; i++) {
        let vec = fakeEmbeddingForText(input.inputs[i]!, dims === input.dimensions ? dims : input.dimensions);
        if (behavior.kind === 'wrong_dimensions') {
          vec = fakeEmbeddingForText(input.inputs[i]!, dims);
        }
        if (behavior.kind === 'nan') {
          vec = vec.map((n, j) => (j === 0 ? Number.NaN : n));
        }
        embeddings.push(vec);
      }

      if (behavior.kind === 'wrong_dimensions' || behavior.kind === 'nan') {
        return {
          ok: false,
          code: 'embedding_invalid_response',
          message: 'invalid vector',
          latencyMs: 1,
          retryable: false,
        };
      }
      if (behavior.kind === 'duplicate_index' || behavior.kind === 'missing_index' || behavior.kind === 'extra_vector') {
        return {
          ok: false,
          code: 'embedding_invalid_response',
          message: 'index error',
          latencyMs: 1,
          retryable: false,
        };
      }

      return {
        ok: true,
        embeddings,
        model: input.model,
        dimensions: input.dimensions,
        usage: { inputTokens: input.inputs.reduce((s, t) => s + Math.ceil(t.length / 4), 0) },
        latencyMs: 1,
        retryable: false,
      };
    },
  };
}
