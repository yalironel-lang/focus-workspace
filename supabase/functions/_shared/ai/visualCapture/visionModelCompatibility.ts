/**
 * Vision model / provider compatibility (Edge).
 * Conservative allowlist — fail closed. Does not call external providers.
 */

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

export function isKnownVisionCapableChatModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return false;
  if (/^gpt-4o(?:$|[-.])/.test(id)) return true;
  if (/^gpt-4\.1(?:$|[-.])/.test(id)) return true;
  if (/^gpt-4-turbo(?:$|[-.])/.test(id)) return true;
  if (/^gpt-4-vision/.test(id)) return true;
  if (/^gemini-3(?:\.[0-9]+)?-flash/.test(id)) return true;
  return false;
}

export function isVisionUnconfirmedOrRejectedChatModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return true;
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

export function routeVisionModel(input: {
  configuredModel: string;
  visionModelOverride?: string | null;
  detail?: 'low' | 'high' | 'auto';
}): VisionRouteDecision {
  const candidate = (input.visionModelOverride?.trim() || input.configuredModel).trim();
  if (!candidate) return { ok: false, code: 'model_not_configured' };

  if (isKnownVisionCapableChatModel(candidate)) {
    return { ok: true, model: candidate, detail: input.detail ?? 'auto' };
  }

  if (isVisionUnconfirmedOrRejectedChatModel(candidate)) {
    const id = candidate.toLowerCase();
    if (/^gpt-[56]/.test(id) || /^o[0-9]/.test(id)) {
      return { ok: false, code: 'model_vision_unconfirmed' };
    }
    return { ok: false, code: 'model_not_vision_capable' };
  }

  return { ok: false, code: 'model_not_vision_capable' };
}

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
