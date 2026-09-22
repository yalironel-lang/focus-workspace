/**
 * M1.0B B1 — pure page extraction suspicion detector (observational).
 * Does not alter text, chunks, embeddings, or source status.
 */

import {
  KNOWLEDGE_PAGE_SUSPICION_DETECTOR_VERSION,
  KNOWLEDGE_PDF_EXTRACTION_VERSION,
  KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_ITEMS,
  KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_MEANINGFUL_CHARS,
  KNOWLEDGE_SUSPICION_MIN_PUA_CHARS,
  KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS,
  KNOWLEDGE_SUSPICION_THIN_MIN_ITEMS,
} from './bounds.ts';

export type PageSuspicionReasonCode =
  | 'SPARSE_TEXT'
  | 'LOW_TEXT_ITEM_COUNT'
  | 'SHELL_WITH_MISSING_CONTENT'
  | 'SUSPICIOUS_UNICODE';

export type PageSuspicionInput = {
  pageNumber: number;
  text: string;
  itemCount: number;
  meaningfulChars: number;
  suspiciousUnicodeCount: number;
};

export type PageSuspicionMetrics = {
  pageNumber: number;
  itemCount: number;
  meaningfulChars: number;
  suspiciousUnicodeCount: number;
};

export type PageSuspicionResult = {
  suspicious: boolean;
  reasons: PageSuspicionReasonCode[];
  metrics: PageSuspicionMetrics;
  detectorVersion: typeof KNOWLEDGE_PAGE_SUSPICION_DETECTOR_VERSION;
  extractionVersion: typeof KNOWLEDGE_PDF_EXTRACTION_VERSION;
};

/**
 * Conservative theorem/definition shell with missing mathematical operands.
 * Justified by M1.0A/M1.0B0 MVT page-3 failure pattern — not a general NLP engine.
 */
export function hasShellWithMissingContent(text: string): boolean {
  if (!text) return false;
  const t = text.replace(/\s+/g, ' ').trim();
  // Classic broken shell: subject/operand missing after "If"
  if (/\bIf\s+is\s+a\s+continuous\b/i.test(t)) return true;
  // Same slide family: continuous + differentiable + gap "on and" + Then + Theorem
  if (
    /\bcontinuous\b/i.test(t) &&
    /\bdifferentiable\b/i.test(t) &&
    /\bon\s+and\b/i.test(t) &&
    /\bThen\b/.test(t) &&
    /\bTheorem\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

export function detectPageExtractionSuspicion(
  page: PageSuspicionInput,
): PageSuspicionResult {
  const reasons: PageSuspicionReasonCode[] = [];

  if (hasShellWithMissingContent(page.text)) {
    reasons.push('SHELL_WITH_MISSING_CONTENT');
  }

  if (
    page.itemCount >= KNOWLEDGE_SUSPICION_THIN_MIN_ITEMS &&
    page.meaningfulChars <= KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS
  ) {
    reasons.push('SPARSE_TEXT');
  }

  if (
    page.itemCount > 0 &&
    page.itemCount <= KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_ITEMS &&
    page.meaningfulChars > 0 &&
    page.meaningfulChars <= KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_MEANINGFUL_CHARS
  ) {
    reasons.push('LOW_TEXT_ITEM_COUNT');
  }

  if (page.suspiciousUnicodeCount >= KNOWLEDGE_SUSPICION_MIN_PUA_CHARS) {
    reasons.push('SUSPICIOUS_UNICODE');
  }

  reasons.sort();

  return {
    suspicious: reasons.length > 0,
    reasons,
    metrics: {
      pageNumber: page.pageNumber,
      itemCount: page.itemCount,
      meaningfulChars: page.meaningfulChars,
      suspiciousUnicodeCount: page.suspiciousUnicodeCount,
    },
    detectorVersion: KNOWLEDGE_PAGE_SUSPICION_DETECTOR_VERSION,
    extractionVersion: KNOWLEDGE_PDF_EXTRACTION_VERSION,
  };
}

export function detectPagesExtractionSuspicion(
  pages: PageSuspicionInput[],
): PageSuspicionResult[] {
  return pages.map((p) => detectPageExtractionSuspicion(p));
}
