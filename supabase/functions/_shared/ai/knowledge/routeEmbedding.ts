/**
 * Server-side embedding model router. Client never selects model/dimensions.
 */

import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
} from './bounds.ts';

export type EmbeddingRouteDecision = {
  providerId: 'openai_compatible';
  model: string;
  dimensions: typeof KNOWLEDGE_EMBEDDING_DIMENSIONS;
};

export type EmbeddingRouterConfig = {
  /** From AI_EMBEDDING_MODEL env; falls back to V1 default. */
  model?: string | null;
  /**
   * From AI_EMBEDDING_DIMENSIONS env when set.
   * Non-1536 values are rejected (schema contract).
   */
  dimensions?: number | null;
};

/**
 * Resolve server embedding contract.
 * Dimensions must equal KNOWLEDGE_EMBEDDING_DIMENSIONS (1536).
 */
export function routeEmbeddingModel(config: EmbeddingRouterConfig = {}): EmbeddingRouteDecision {
  const model = (config.model ?? KNOWLEDGE_EMBEDDING_MODEL_DEFAULT).trim();
  if (!model) {
    throw new Error('AI_EMBEDDING_MODEL is not configured');
  }
  const dims =
    typeof config.dimensions === 'number' && Number.isFinite(config.dimensions)
      ? config.dimensions
      : KNOWLEDGE_EMBEDDING_DIMENSIONS;
  if (dims !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    throw new Error('AI_EMBEDDING_DIMENSIONS must be 1536 for V1');
  }
  return {
    providerId: 'openai_compatible',
    model,
    dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
  };
}
