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
});
