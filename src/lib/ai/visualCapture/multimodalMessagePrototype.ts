/**
 * Spike: discriminated multimodal messages for Gateway → provider.
 * Current production `ChatMessage.content: string` remains the text-only path.
 */

import {
  buildOpenAiVisionUserContent,
  type OpenAiVisionChatMessage,
  type OpenAiVisionContentPart,
} from './visionModelCompatibility';

/** Mirrors production ChatMessage (string content only). */
export type TextOnlyGatewayMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type MultimodalGatewayMessage = OpenAiVisionChatMessage;

export type GatewayOutboundMessage = TextOnlyGatewayMessage | MultimodalGatewayMessage;

/**
 * Preserve text-only requests unchanged (string content).
 */
export function asTextOnlyMessages(messages: TextOnlyGatewayMessage[]): TextOnlyGatewayMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Build a multimodal user message for visual_selection.
 * Must only be used after vision model route succeeds.
 */
export function buildVisualSelectionUserMessage(input: {
  instructionJson: string;
  imageDataUrl: string;
  detail?: 'low' | 'high' | 'auto';
}): MultimodalGatewayMessage {
  const content: OpenAiVisionContentPart[] = buildOpenAiVisionUserContent({
    instruction: input.instructionJson,
    imageDataUrl: input.imageDataUrl,
    detail: input.detail,
  });
  return { role: 'user', content };
}

/**
 * Serialize for OpenAI-compatible Chat Completions.
 * Text-only messages stay `{role, content: string}`.
 * Vision messages use content part arrays.
 */
export function serializeMessagesForProvider(
  messages: GatewayOutboundMessage[],
): Array<{ role: string; content: string | OpenAiVisionContentPart[] }> {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/** Detect if current production ChatMessage type can carry images (it cannot). */
export function productionChatMessageSupportsImages(): false {
  return false;
}
