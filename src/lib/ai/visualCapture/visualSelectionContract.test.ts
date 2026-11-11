import { describe, expect, it } from 'vitest';
import { syntheticJpegBytes } from './syntheticJpeg';
import {
  assertVisualOwnershipIdentity,
  MAX_ASK_COURSE_VISUAL_BODY_BYTES,
  MAX_VISUAL_SELECTION_IMAGE_BYTES,
  parseVisualSelectionAttachment,
} from './visualSelectionContract';

function validVisualRaw(overrides: Record<string, unknown> = {}) {
  return {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 1,
    regionNorm: { x: 0.1, y: 0.1, w: 0.4, h: 0.3 },
    attachmentType: 'visual_selection',
    textKind: 'visual_selection',
    mime: 'image/jpeg',
    imageBytes: syntheticJpegBytes(),
    widthPx: 32,
    heightPx: 32,
    userConfirmedVisual: true,
    ...overrides,
  };
}

describe('visualSelectionContract', () => {
  it('accepts a valid synthetic visual_selection JPEG', () => {
    const parsed = parseVisualSelectionAttachment(validVisualRaw(), 'sec-1', {
      configuredModel: 'gpt-4o-mini',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.attachment.attachmentType).toBe('visual_selection');
      expect(parsed.attachment.mime).toBe('image/jpeg');
      expect(parsed.estimatedBodyBytes).toBeLessThanOrEqual(MAX_ASK_COURSE_VISUAL_BODY_BYTES);
    }
  });

  it('preserves text-only path by rejecting non-visual shapes here', () => {
    expect(
      parseVisualSelectionAttachment(
        {
          sourceKind: 'free_space_pdf',
          sourceObjectId: 'pdf-1',
          sectionId: 'sec-1',
          pageNumber: 1,
          text: 'native text',
        },
        'sec-1',
      ).ok,
    ).toBe(false);
  });

  it('rejects invalid MIME / non-allowed formats', () => {
    expect(
      parseVisualSelectionAttachment(validVisualRaw({ mime: 'image/gif' }), 'sec-1').ok,
    ).toBe(false);
    expect(
      parseVisualSelectionAttachment(validVisualRaw({ mime: 'text/plain' }), 'sec-1').ok,
    ).toBe(false);
    expect(
      parseVisualSelectionAttachment(
        validVisualRaw({ imageBytes: new Uint8Array([0x00, 0x00, 0x00, 0x00]) }),
        'sec-1',
      ).ok,
    ).toBe(false);
  });

  it('rejects oversized images and dimensions', () => {
    const huge = new Uint8Array(MAX_VISUAL_SELECTION_IMAGE_BYTES + 10);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    expect(parseVisualSelectionAttachment(validVisualRaw({ imageBytes: huge }), 'sec-1').ok).toBe(
      false,
    );
    expect(
      parseVisualSelectionAttachment(validVisualRaw({ widthPx: 5000, heightPx: 5000 }), 'sec-1')
        .ok,
    ).toBe(false);
  });

  it('rejects unsupported / unconfirmed models', () => {
    expect(
      parseVisualSelectionAttachment(validVisualRaw(), 'sec-1', {
        configuredModel: 'gpt-5.6-luna',
      }),
    ).toMatchObject({ ok: false, code: 'model_vision_unconfirmed' });
    expect(
      parseVisualSelectionAttachment(validVisualRaw(), 'sec-1', {
        configuredModel: 'custom-proxy-model',
      }),
    ).toMatchObject({ ok: false, code: 'model_not_vision_capable' });
  });

  it('rejects missing confirmation, section mismatch, bad region/page', () => {
    expect(
      parseVisualSelectionAttachment(validVisualRaw({ userConfirmedVisual: false }), 'sec-1'),
    ).toMatchObject({ ok: false, code: 'missing_confirmation' });
    expect(parseVisualSelectionAttachment(validVisualRaw(), 'other-sec')).toMatchObject({
      ok: false,
      code: 'section_mismatch',
    });
    expect(
      parseVisualSelectionAttachment(
        validVisualRaw({ regionNorm: { x: 0, y: 0, w: 0, h: 0.2 } }),
        'sec-1',
      ),
    ).toMatchObject({ ok: false, code: 'invalid_region' });
    expect(
      parseVisualSelectionAttachment(validVisualRaw({ pageNumber: 0 }), 'sec-1'),
    ).toMatchObject({ ok: false, code: 'invalid_page' });
  });

  it('rejects cross-user ownership identity mismatches', () => {
    expect(
      assertVisualOwnershipIdentity({
        authUserId: 'user-a',
        row: { id: 'pdf-1', user_id: 'user-b', section_id: 'sec-1' },
        capture: {
          userId: 'user-a',
          sectionId: 'sec-1',
          sourceObjectId: 'pdf-1',
          pageNumber: 1,
        },
      }),
    ).toMatchObject({ ok: false, code: 'unauthorized_identity' });

    expect(
      assertVisualOwnershipIdentity({
        authUserId: 'user-a',
        row: { id: 'pdf-1', user_id: 'user-a', section_id: 'sec-1' },
        capture: {
          userId: 'user-a',
          sectionId: 'sec-1',
          sourceObjectId: 'pdf-1',
          pageNumber: 1,
        },
      }),
    ).toEqual({ ok: true });
  });
});
