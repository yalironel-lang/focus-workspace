/**
 * Visual Capture V1 — Gateway pdfCapture parse + ownership (local, no provider calls).
 */
import { describe, expect, it } from 'vitest';
import {
  isOwnedPdfCaptureSource,
  parsePdfCapture,
  parsePdfCaptureResult,
} from './pdfCapture.ts';
import { isVisualSelectionCapture } from '../requestTypes.ts';

/** Minimal valid JPEG (1×1) — public-domain style fixture; not user content. */
const SYNTHETIC_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

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
    imageBase64: SYNTHETIC_JPEG_BASE64,
    widthPx: 32,
    heightPx: 32,
    userConfirmedVisual: true,
    ...overrides,
  };
}

describe('pdfCapture visual_selection', () => {
  it('parses a valid visual attachment and leaves text-only parse null', () => {
    const result = parsePdfCaptureResult(validVisualRaw(), 'sec-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isVisualSelectionCapture(result.capture)).toBe(true);
    expect(parsePdfCapture(validVisualRaw(), 'sec-1')).toBeNull();
  });

  it('preserves text-only capture regression', () => {
    const text = parsePdfCaptureResult(
      {
        sourceKind: 'free_space_pdf',
        sourceObjectId: 'pdf-1',
        sectionId: 'sec-1',
        pageNumber: 2,
        text: 'Let f(x) be continuous.',
        textKind: 'native_page',
      },
      'sec-1',
    );
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    expect(isVisualSelectionCapture(text.capture)).toBe(false);
    if (!isVisualSelectionCapture(text.capture)) {
      expect(text.capture.text).toContain('continuous');
      expect(text.capture.textKind).toBe('native_page');
    }
  });

  it('rejects missing confirmation and bad MIME', () => {
    expect(
      parsePdfCaptureResult(validVisualRaw({ userConfirmedVisual: false }), 'sec-1').ok,
    ).toBe(false);
    expect(parsePdfCaptureResult(validVisualRaw({ mime: 'image/png' }), 'sec-1').ok).toBe(false);
  });

  it('rejects cross-section and unauthorized ownership', () => {
    expect(parsePdfCaptureResult(validVisualRaw(), 'other-sec').ok).toBe(false);
    const parsed = parsePdfCaptureResult(validVisualRaw(), 'sec-1');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      isOwnedPdfCaptureSource(
        {
          id: 'pdf-1',
          user_id: 'user-a',
          section_id: 'sec-1',
          object: { type: 'pdf', pageCount: 10 },
        },
        'user-b',
        parsed.capture,
      ),
    ).toBe(false);
    expect(
      isOwnedPdfCaptureSource(
        {
          id: 'pdf-1',
          user_id: 'user-a',
          section_id: 'sec-1',
          object: { type: 'pdf', pageCount: 10 },
        },
        'user-a',
        parsed.capture,
      ),
    ).toBe(true);
  });

  it('rejects invalid page / region', () => {
    expect(parsePdfCaptureResult(validVisualRaw({ pageNumber: 0 }), 'sec-1').ok).toBe(false);
    expect(
      parsePdfCaptureResult(validVisualRaw({ regionNorm: { x: 0, y: 0, w: 0, h: 0.2 } }), 'sec-1')
        .ok,
    ).toBe(false);
  });
  it('rejects forged JPEG magic and truncated images before provider calls', () => {
    const forged = btoa(String.fromCharCode(255, 216, 255) + 'x'.repeat(64));
    expect(parsePdfCaptureResult(validVisualRaw({ imageBase64: forged }), 'sec-1').ok).toBe(false);
    const truncated = btoa(atob(SYNTHETIC_JPEG_BASE64).slice(0, -2));
    expect(parsePdfCaptureResult(validVisualRaw({ imageBase64: truncated }), 'sec-1').ok).toBe(false);
  });

});
