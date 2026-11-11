import { describe, expect, it } from 'vitest';
import { buildAskCourseMessages } from './promptAskCourse.ts';
import type { PdfVisualSelectionAttachment } from '../requestTypes.ts';

const SYNTHETIC_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

function jpegBytes(): Uint8Array {
  const bin = atob(SYNTHETIC_JPEG_BASE64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

describe('promptAskCourse visual_selection', () => {
  it('builds multimodal user content for visual capture and keeps text-only string content', () => {
    const visual: PdfVisualSelectionAttachment = {
      sourceKind: 'free_space_pdf',
      sourceObjectId: 'pdf-1',
      sectionId: 'sec-1',
      pageNumber: 1,
      regionNorm: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      attachmentType: 'visual_selection',
      textKind: 'visual_selection',
      mime: 'image/jpeg',
      imageBytes: jpegBytes(),
      widthPx: 32,
      heightPx: 32,
      userConfirmedVisual: true,
    };
    const visualMsgs = buildAskCourseMessages({
      question: 'Explain this integral',
      chunks: [],
      capture: visual,
      teachingMode: 'explain',
    });
    expect(visualMsgs[0]?.role).toBe('system');
    expect(typeof visualMsgs[0]?.content).toBe('string');
    expect(Array.isArray(visualMsgs[1]?.content)).toBe(true);
    const parts = visualMsgs[1]!.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.some((p) => p.type === 'image_url')).toBe(true);
    expect(parts.some((p) => p.type === 'text')).toBe(true);
    const img = parts.find((p) => p.type === 'image_url');
    expect(img?.image_url?.url.startsWith('data:image/jpeg;base64,')).toBe(true);

    const textMsgs = buildAskCourseMessages({
      question: 'Explain this integral',
      chunks: [],
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: 'pdf-1',
        sectionId: 'sec-1',
        pageNumber: 1,
        text: '∫ f(x) dx',
      },
      teachingMode: 'explain',
    });
    expect(typeof textMsgs[1]?.content).toBe('string');
  });
});
