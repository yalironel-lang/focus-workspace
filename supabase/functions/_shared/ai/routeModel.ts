/**
 * Minimal server-side model router. Client never selects provider/model.
 */

import type { ZikukAiCapability } from './requestTypes.ts';
import { routeVisionModel } from './visualCapture/visionModelCompatibility.ts';

export type RouteInput = {
  capability: ZikukAiCapability;
  modality: 'text' | 'vision';
};

export type RouteDecision = {
  providerId: 'openai_compatible' | 'gemini';
  model: string;
};

export function inferProviderId(model: string): 'openai_compatible' | 'gemini' {
  if (model.trim().toLowerCase().startsWith('gemini-')) {
    return 'gemini';
  }
  return 'openai_compatible';
}

export type RouterConfig = {
  /** From server env AI_MODEL — never from the client. */
  model: string;
  /** Optional AI_VISION_MODEL override for visual_selection asks. */
  visionModel?: string | null;
};

export type VisionRouteFailure = {
  ok: false;
  code: 'model_not_configured' | 'model_not_vision_capable' | 'model_vision_unconfirmed';
};

/**
 * M0.2 + Visual Capture V1: text uses AI_MODEL; vision fail-closes unless
 * AI_VISION_MODEL or AI_MODEL is a known vision-capable chat model.
 */
export function routeModel(input: RouteInput, config: RouterConfig): RouteDecision {
  if (input.modality === 'vision') {
    const vision = routeVisionModel({
      configuredModel: config.model,
      visionModelOverride: config.visionModel,
    });
    if (!vision.ok) {
      throw new Error(`vision_route_${vision.code}`);
    }
    return {
      providerId: inferProviderId(vision.model),
      model: vision.model,
    };
  }

  const model = config.model.trim();
  if (!model) {
    throw new Error('AI_MODEL is not configured');
  }
  return {
    providerId: inferProviderId(model),
    model,
  };
}

/** Non-throwing vision check for ask_course preflight. */
export function tryRouteVisionModel(config: RouterConfig): RouteDecision | VisionRouteFailure {
  const vision = routeVisionModel({
    configuredModel: config.model,
    visionModelOverride: config.visionModel,
  });
  if (!vision.ok) return vision;
  return { providerId: inferProviderId(vision.model), model: vision.model };
}
