import { describe, it, expect } from 'vitest';
import { extractPdfTextFromRegion } from './pdfTutorTextExtraction';
import { isUsefulTutorExtractedText } from './tutorCaptureClassifier';
import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';

describe('pdfTutorTextExtraction', () => {
  it('extracts and sorts text lines within normalized region', () => {
    // PDF coordinate system has y=0 at bottom.
    // In a 500x500 page:
    // Line 1 baseline=450 => top = (500 - 450 - 10)/500 = 0.08
    // Line 2 baseline=400 => top = (500 - 400 - 10)/500 = 0.18
    const content = {
      items: [
        { str: 'Line 2 text', transform: [1, 0, 0, 1, 100, 400], width: 80, height: 10 },
        { str: 'Line 1 text', transform: [1, 0, 0, 1, 100, 450], width: 80, height: 10 },
        { str: 'Out of bounds', transform: [1, 0, 0, 1, 10, 50], width: 80, height: 10 },
      ],
    };

    const region: NormalizedPageRegion = {
      x: 0.1,
      y: 0.05,
      w: 0.8,
      h: 0.3,
    };

    const extracted = extractPdfTextFromRegion(content, 500, 500, region);
    expect(extracted).toBeDefined();
    expect(extracted).toContain('Line 1 text');
    expect(extracted).toContain('Line 2 text');
    expect(extracted).not.toContain('Out of bounds');
    expect(extracted!.indexOf('Line 1 text')).toBeLessThan(extracted!.indexOf('Line 2 text'));
  });

  it('classifies useful tutor extracted text correctly', () => {
    expect(isUsefulTutorExtractedText('')).toBe(false);
    expect(isUsefulTutorExtractedText('   \n  ')).toBe(false);
    expect(isUsefulTutorExtractedText('a')).toBe(false);
    expect(isUsefulTutorExtractedText('Find the derivative of f(x) = x^2')).toBe(true);
  });

  it('returns undefined when the region misses existing glyphs (empty native selection)', () => {
    const content = {
      items: [{ str: 'Visible line', transform: [1, 0, 0, 1, 100, 400], width: 80, height: 10 }],
    };
    const miss: NormalizedPageRegion = { x: 0.8, y: 0.8, w: 0.15, h: 0.15 };
    expect(extractPdfTextFromRegion(content, 500, 500, miss)).toBeUndefined();
  });

  it('returns undefined for an empty text layer', () => {
    const region: NormalizedPageRegion = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    expect(extractPdfTextFromRegion({ items: [] }, 500, 500, region)).toBeUndefined();
  });
});
