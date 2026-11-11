/**
 * Visual Capture spike — vision model / provider compatibility (local only).
 *
 * Does not call external providers. Classification is conservative and based on
 * known OpenAI-compatible chat model id patterns used by ZIKUK today.
 */

/** OpenAI Chat Completions multimodal content part (image via data URL). */
export type OpenAiVisionImagePart = {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
};

export type OpenAiVisionTextPart = {
  type: 'text';
  text: string;
};

export type OpenAiVisionContentPart = OpenAiVisionTextPart | OpenAiVisionImagePart;

export type OpenAiVisionChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAiVisionContentPart[];
};

/**
 * Models we treat as vision-capable for Chat Completions `image_url` parts.
 * Conservative allowlist — custom proxy ids are rejected until explicitly listed.
 *
 * NOT verified live against staging secrets in this spike.
 */
export function isKnownVisionCapableChatModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return false;
  // GPT-4o family (documented vision)
  if (/^gpt-4o(?:$|[-.])/.test(id)) return true;
  // GPT-4.1 / 4.1-mini (vision-capable Chat Completions)
  if (/^gpt-4\.1(?:$|[-.])/.test(id)) return true;
  // Legacy gpt-4-turbo / gpt-4-vision-preview
  if (/^gpt-4-turbo(?:$|[-.])/.test(id)) return true;
  if (/^gpt-4-vision/.test(id)) return true;
  return false;
}

/**
 * Models that are text-oriented in ZIKUK's current router docs / policy
 * (reasoning families). Vision support is unconfirmed — fail closed for V1.
 */
export function isVisionUnconfirmedOrRejectedChatModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return true;
  // Reasoning / GPT-5+ families used by ZIKUK today (e.g. gpt-5.6-luna)
  if (/^o[0-9]/.test(id)) return true;
  if (/^gpt-[56](?:$|[^0-9])/.test(id)) return true;
  if (/^gpt-3\.5/.test(id)) return true;
  return !isKnownVisionCapableChatModel(id);
}

export type VisionRouteDecision =
  | { ok: true; model: string; detail: 'low' | 'high' | 'auto' }
  | {
      ok: false;
      code: 'model_not_configured' | 'model_not_vision_capable' | 'model_vision_unconfirmed';
    };

/**
 * Fail-closed router for visual asks. Does not fall back to a different model
 * silently — caller must either use a confirmed vision model or reject.
 */
export function routeVisionModel(input: {
  configuredModel: string;
  /** Optional dedicated vision override (future env AI_VISION_MODEL). */
  visionModelOverride?: string | null;
  detail?: 'low' | 'high' | 'auto';
}): VisionRouteDecision {
  const candidate = (input.visionModelOverride?.trim() || input.configuredModel).trim();
  if (!candidate) return { ok: false, code: 'model_not_configured' };

  if (isKnownVisionCapableChatModel(candidate)) {
    return { ok: true, model: candidate, detail: input.detail ?? 'auto' };
  }

  // Known non-vision / unconfirmed families
  if (isVisionUnconfirmedOrRejectedChatModel(candidate)) {
    const id = candidate.toLowerCase();
    if (/^gpt-[56]/.test(id) || /^o[0-9]/.test(id)) {
      return { ok: false, code: 'model_vision_unconfirmed' };
    }
    return { ok: false, code: 'model_not_vision_capable' };
  }

  return { ok: false, code: 'model_not_vision_capable' };
}

/**
 * Required wire format for OpenAI-compatible Chat Completions image input.
 * Current ZIKUK `ChatMessage.content: string` cannot express this.
 */
export function buildOpenAiVisionUserContent(input: {
  instruction: string;
  imageDataUrl: string;
  detail?: 'low' | 'high' | 'auto';
}): OpenAiVisionContentPart[] {
  return [
    { type: 'text', text: input.instruction },
    {
      type: 'image_url',
      image_url: {
        url: input.imageDataUrl,
        detail: input.detail ?? 'auto',
      },
    },
  ];
}

/** True when a message already uses multimodal content parts. */
export function messageHasImageParts(message: OpenAiVisionChatMessage): boolean {
  if (typeof message.content === 'string') return false;
  return message.content.some((p) => p.type === 'image_url');
}

export function imageBytesToDataUrl(bytes: Uint8Array, mime: string = 'image/jpeg'): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

export function jpegBytesToDataUrl(bytes: Uint8Array): string {
  return imageBytesToDataUrl(bytes, 'image/jpeg');
}
