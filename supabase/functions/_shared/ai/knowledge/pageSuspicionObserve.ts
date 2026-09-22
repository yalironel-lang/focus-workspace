/**
 * M1.0B B1 — observational gate + summary helpers for page suspicion detection.
 */

import {
  KNOWLEDGE_PAGE_SUSPICION_DETECT_ENABLED,
  KNOWLEDGE_PAGE_SUSPICION_DETECTOR_VERSION,
  KNOWLEDGE_PDF_EXTRACTION_VERSION,
} from './bounds.ts';
import {
  detectPageExtractionSuspicion,
  type PageSuspicionInput,
  type PageSuspicionReasonCode,
  type PageSuspicionResult,
} from './detectPageExtractionSuspicion.ts';
import type {
  KnowledgeSuspicionLogLine,
  KnowledgeSuspicionPageDiag,
} from './privacyLogSuspicion.ts';

declare const Deno: { env?: { get(key: string): string | undefined } } | undefined;

/** Trivial rollback: false restores prior runtime (no detect / no suspicion log). */
export function isPageSuspicionDetectEnabled(): boolean {
  if (typeof Deno !== 'undefined') {
    const v = Deno.env?.get?.('KNOWLEDGE_PAGE_SUSPICION_DETECT');
    if (v === '0' || v === 'false' || v === 'off') return false;
  }
  return KNOWLEDGE_PAGE_SUSPICION_DETECT_ENABLED;
}

export function buildSuspicionObservationSummary(
  pages: PageSuspicionInput[],
  opts?: { requestId?: string },
): {
  results: PageSuspicionResult[];
  logLine: KnowledgeSuspicionLogLine;
} {
  const results = pages.map((p) => detectPageExtractionSuspicion(p));
  const reasonCounts: Partial<Record<PageSuspicionReasonCode, number>> = {};
  const suspiciousPages: KnowledgeSuspicionPageDiag[] = [];

  for (const r of results) {
    if (!r.suspicious) continue;
    for (const code of r.reasons) {
      reasonCounts[code] = (reasonCounts[code] ?? 0) + 1;
    }
    suspiciousPages.push({
      pageNumber: r.metrics.pageNumber,
      suspicious: true,
      reasons: r.reasons,
      itemCount: r.metrics.itemCount,
      meaningfulChars: r.metrics.meaningfulChars,
      suspiciousUnicodeCount: r.metrics.suspiciousUnicodeCount,
    });
  }

  return {
    results,
    logLine: {
      event: 'knowledge_page_suspicion',
      ...(opts?.requestId ? { requestId: opts.requestId } : {}),
      detectorVersion: KNOWLEDGE_PAGE_SUSPICION_DETECTOR_VERSION,
      extractionVersion: KNOWLEDGE_PDF_EXTRACTION_VERSION,
      pageCount: pages.length,
      suspiciousPageCount: suspiciousPages.length,
      reasonCounts,
      suspiciousPages,
    },
  };
}
