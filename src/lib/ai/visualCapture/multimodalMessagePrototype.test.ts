import { describe, expect, it } from 'vitest';
import {
  asTextOnlyMessages,
  buildVisualSelectionUserMessage,
  productionChatMessageSupportsImages,
  serializeMessagesForProvider,
} from './multimodalMessagePrototype';

describe('multimodalMessagePrototype', () => {
  it('preserves text-only Gateway messages', () => {
    const msgs = asTextOnlyMessages([
      { role: 'system', content: 'sys' },
      { role: 'user', content: '{"instruction":"hi"}' },
    ]);
    expect(serializeMessagesForProvider(msgs)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: '{"instruction":"hi"}' },
    ]);
  });

  it('serializes visual user content as OpenAI image_url parts', () => {
    const visual = buildVisualSelectionUserMessage({
      instructionJson: '{"instruction":"explain","untrustedContext":{}}',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      detail: 'low',
    });
    const serialized = serializeMessagesForProvider([
      { role: 'system', content: 'sys' },
      visual,
    ]);
    expect(serialized[1]?.content).toEqual([
      { type: 'text', text: '{"instruction":"explain","untrustedContext":{}}' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,abc', detail: 'low' },
      },
    ]);
  });

  it('documents that production ChatMessage cannot carry images today', () => {
    expect(productionChatMessageSupportsImages()).toBe(false);
  });
});
