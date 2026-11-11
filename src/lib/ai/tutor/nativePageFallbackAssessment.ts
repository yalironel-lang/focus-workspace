/**
 * Native full-page Capture fallback — eligible when region extract fails
 * but `assessPdfPageTextLayer` / probe returns `useful` page text.
 *
 * Provenance (must stay distinct from OCR recovery):
 *   - textKind: 'native_page'
 *   - Tutor attachmentType: 'native_page'
 *   - Prompt envelope: userProvidedNativePdfPage
 *   - Citation marker: [PDF page text]
 *   - Grounding tier: pdf_page_native
 */

import type { PdfPageTextAssessmentKind } from './assessPdfPageTextLayer';
import { isUsefulTutorExtractedText } from './tutorCaptureClassifier';

export const NATIVE_PAGE_FALLBACK_STATUS = 'available' as const;

export type NativePageFallbackStatus = typeof NATIVE_PAGE_FALLBACK_STATUS;

export type NativePageFallbackEligibility = {
  eligible: boolean;
  /** Full-page native text when eligible (caller must confirm before attach). */
  pageText?: string;
};

/**
 * True when region Capture missed but the page has Tutor-usable native text.
 * Does not treat OCR recovery as native-page eligibility.
 */
export function assessNativePageFallbackEligibility(input: {
  regionTextUseful: boolean;
  pageKind: PdfPageTextAssessmentKind | 'unknown';
  pageText?: string | null;
}): NativePageFallbackEligibility {
  if (input.regionTextUseful) {
    return { eligible: false };
  }
  if (input.pageKind !== 'useful') {
    return { eligible: false };
  }
  const pageText = input.pageText?.trim() ?? '';
  if (!isUsefulTutorExtractedText(pageText)) {
    return { eligible: false };
  }
  return { eligible: true, pageText };
}
