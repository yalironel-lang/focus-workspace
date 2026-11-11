import { describe, expect, it } from 'vitest';
import {
  buildOpenAiVisionUserContent,
  isKnownVisionCapableChatModel,
  isVisionUnconfirmedOrRejectedChatModel,
  messageHasImageParts,
  routeVisionModel,
} from './visionModelCompatibility';

describe('visionModelCompatibility', () => {
  it('allowlists known vision Chat Completions models', () => {
    expect(isKnownVisionCapableChatModel('gpt-4o')).toBe(true);
    expect(isKnownVisionCapableChatModel('gpt-4o-mini')).toBe(true);
    expect(isKnownVisionCapableChatModel('gpt-4.1')).toBe(true);
    expect(isKnownVisionCapableChatModel('gpt-4-turbo')).toBe(true);
  });

  it('fail-closes ZIKUK reasoning / GPT-5 families as unconfirmed', () => {
    expect(isVisionUnconfirmedOrRejectedChatModel('gpt-5.6-luna')).toBe(true);
    expect(isVisionUnconfirmedOrRejectedChatModel('o3-mini')).toBe(true);
    expect(routeVisionModel({ configuredModel: 'gpt-5.6-luna' })).toEqual({
      ok: false,
      code: 'model_vision_unconfirmed',
    });
  });

  it('rejects unknown custom proxy ids without silent fallback', () => {
    expect(routeVisionModel({ configuredModel: 'custom-proxy-model' }).ok).toBe(false);
    expect(
      routeVisionModel({
        configuredModel: 'gpt-5.6-luna',
        visionModelOverride: 'gpt-4o-mini',
      }),
    ).toEqual({ ok: true, model: 'gpt-4o-mini', detail: 'auto' });
  });

  it('builds OpenAI image_url content parts (required wire format)', () => {
    const parts = buildOpenAiVisionUserContent({
      instruction: 'Explain the selected region.',
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      detail: 'low',
    });
    expect(parts[0]).toEqual({ type: 'text', text: 'Explain the selected region.' });
    expect(parts[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ', detail: 'low' },
    });
    expect(
      messageHasImageParts({
        role: 'user',
        content: parts,
      }),
    ).toBe(true);
    expect(messageHasImageParts({ role: 'user', content: 'text only' })).toBe(false);
  });
});
