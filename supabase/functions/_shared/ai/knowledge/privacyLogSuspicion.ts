/**
 * Privacy-safe observational logging for M1.0B B1 page suspicion detection.
 * NEVER logs extracted text, PDF bytes, page images, filenames, or academic content.
 */

import type { PageSuspicionReasonCode } from './detectPageExtractionSuspicion.ts';

export type KnowledgeSuspicionPageDiag = {
  pageNumber: number;
  suspicious: true;
  reasons: PageSuspicionReasonCode[];
  itemCount: number;
  meaningfulChars: number;
  suspiciousUnicodeCount: number;
};

export type KnowledgeSuspicionLogLine = {
  event: 'knowledge_page_suspicion';
  requestId?: string;
  detectorVersion: string;
  extractionVersion: string;
  pageCount: number;
  suspiciousPageCount: number;
  reasonCounts: Partial<Record<PageSuspicionReasonCode, number>>;
  /** Suspicious pages only — compact, metadata-safe. */
  suspiciousPages: KnowledgeSuspicionPageDiag[];
};

export function formatKnowledgeSuspicionLogLine(line: KnowledgeSuspicionLogLine): string {
  return JSON.stringify({
    event: line.event,
    ...(line.requestId ? { requestId: line.requestId } : {}),
    detectorVersion: line.detectorVersion,
    extractionVersion: line.extractionVersion,
    pageCount: line.pageCount,
    suspiciousPageCount: line.suspiciousPageCount,
    reasonCounts: line.reasonCounts,
    suspiciousPages: line.suspiciousPages,
  });
}
