/**
 * Minimal server-side model router. Client never selects provider/model.
 */

import type { ZikukAiCapability } from './requestTypes.ts';

export type RouteInput = {
  capability: ZikukAiCapability;
  modality: 'text';
};

export type RouteDecision = {
  providerId: 'openai_compatible';
  model: string;
};

export type RouterConfig = {
  /** From server env AI_MODEL — never from the client. */
  model: string;
};

/**
 * M0.2: single configured OpenAI-compatible model.
 * Future: branch on capability / modality without changing the client.
 */
export function routeModel(input: RouteInput, config: RouterConfig): RouteDecision {
  void input;
  const model = config.model.trim();
  if (!model) {
    throw new Error('AI_MODEL is not configured');
  }
  return {
    providerId: 'openai_compatible',
    model,
  };
}
