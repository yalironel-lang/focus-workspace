/**
 * Meaningful PDF.js page-text assessment for Capture diagnostics.
 * Reuses region extraction + usefulness classifier (no arbitrary one-glyph probe).
 */

import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import { extractPdfTextFromRegion, type PdfTextContent } from './pdfTutorTextExtraction';
import { isUsefulTutorExtractedText } from './tutorCaptureClassifier';

export const FULL_PAGE_REGION_NORM: NormalizedPageRegion = { x: 0, y: 0, w: 1, h: 1 };

export type PdfPageTextAssessmentKind = 'useful' | 'sparse' | 'empty';

export type PdfPageTextAssessment = {
  kind: PdfPageTextAssessmentKind;
  itemCount: number;
  meaningfulCharCount: number;
  /** Full-page joined native text when kind === 'useful'. */
  pageText?: string;
};

function countNonEmptyItems(content: PdfTextContent): number {
  let n = 0;
  for (const item of content.items ?? []) {
    if (typeof item?.str === 'string' && item.str.trim()) n += 1;
  }
  return n;
}

function countMeaningfulChars(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]/gu);
  return matches?.length ?? 0;
}

/**
 * Assess whether the page has tutor-usable native text (full page),
 * sparse/unusable residual glyphs, or an empty layer.
 */
export function assessPdfPageTextLayer(
  content: PdfTextContent,
  pageWidth: number,
  pageHeight: number,
): PdfPageTextAssessment {
  const itemCount = countNonEmptyItems(content);
  const pageText = extractPdfTextFromRegion(content, pageWidth, pageHeight, FULL_PAGE_REGION_NORM);
  const joined = pageText?.trim() ?? '';
  const meaningfulCharCount = countMeaningfulChars(joined);

  if (isUsefulTutorExtractedText(joined)) {
    return {
      kind: 'useful',
      itemCount,
      meaningfulCharCount,
      pageText: joined,
    };
  }

  if (itemCount === 0 && meaningfulCharCount === 0) {
    return { kind: 'empty', itemCount: 0, meaningfulCharCount: 0 };
  }

  return { kind: 'sparse', itemCount, meaningfulCharCount };
}

/** True when full-page native text is useful for Tutor (not a single leftover glyph). */
export function pageHasUsefulNativeText(assessment: PdfPageTextAssessment): boolean {
  return assessment.kind === 'useful';
}
