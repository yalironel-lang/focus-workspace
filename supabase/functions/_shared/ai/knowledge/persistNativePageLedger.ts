/**
 * M1.0B B3.3A.1 — build complete native page ledger payloads (pure).
 *
 * Persists ALL extracted pages 1..P via ai_knowledge_upsert_page_texts_native.
 * Enqueues recovery ONLY for policy auto_recover candidates.
 */

import {
  KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
  KNOWLEDGE_PDF_EXTRACTION_VERSION,
} from './bounds.ts';
import type { PageSuspicionResult } from './detectPageExtractionSuspicion.ts';
import { decidePageRecoveryTrigger } from './pageRecoveryPolicy.ts';
import type { ExtractedPdfPage } from './chunkPages.ts';

export type NativePageLedgerRow = {
  page_number: number;
  native_text: string;
  detector_reasons: string[];
};

export type RecoveryEnqueuePage = {
  page_number: number;
  detector_reasons: string[];
};

export type NativePageLedgerPlan = {
  extractionVersion: typeof KNOWLEDGE_PDF_EXTRACTION_VERSION;
  recoveryVersion: typeof KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION;
  /** Complete set sorted by page_number ASC — one entry per extracted page. */
  nativePages: NativePageLedgerRow[];
  /** Subset that must auto-recover under current policy. */
  recoveryPages: RecoveryEnqueuePage[];
  expectedPageCount: number;
};

/**
 * Map extracted pages + suspicion results → full native ledger + selective enqueue.
 * Empty pages are included (explicit blank rows). Ordering is page_number ASC.
 */
export function buildNativePageLedgerPlan(input: {
  pages: readonly ExtractedPdfPage[];
  suspicionResults: readonly PageSuspicionResult[];
  recoveryEnabled?: boolean;
}): NativePageLedgerPlan {
  const byPage = new Map<number, PageSuspicionResult>();
  for (const r of input.suspicionResults) {
    byPage.set(r.metrics.pageNumber, r);
  }

  const sorted = [...input.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const nativePages: NativePageLedgerRow[] = [];
  const recoveryPages: RecoveryEnqueuePage[] = [];

  for (const page of sorted) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
      continue;
    }
    const suspicion = byPage.get(page.pageNumber);
    const reasons = suspicion?.reasons ?? [];
    nativePages.push({
      page_number: page.pageNumber,
      native_text: page.text ?? '',
      detector_reasons: [...reasons],
    });

    const trigger = decidePageRecoveryTrigger(reasons, {
      enabled: input.recoveryEnabled,
    });
    if (trigger.autoRecover) {
      recoveryPages.push({
        page_number: page.pageNumber,
        detector_reasons: [...reasons],
      });
    }
  }

  return {
    extractionVersion: KNOWLEDGE_PDF_EXTRACTION_VERSION,
    recoveryVersion: KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
    nativePages,
    recoveryPages,
    expectedPageCount: nativePages.length,
  };
}

/**
 * Soft model of upsert ON CONFLICT behavior (017): preserve OCR canonical.
 * Used by unit tests; SQL RPC is authoritative at runtime.
 */
export function applyNativeUpsertConflict(input: {
  existing: {
    native_text: string;
    recovered_text: string | null;
    canonical_text: string;
    extraction_method: 'native' | 'ocr_tesseract';
    detector_reasons: string[];
  } | null;
  incoming: NativePageLedgerRow;
}): {
  native_text: string;
  recovered_text: string | null;
  canonical_text: string;
  extraction_method: 'native' | 'ocr_tesseract';
  detector_reasons: string[];
} {
  if (!input.existing) {
    return {
      native_text: input.incoming.native_text,
      recovered_text: null,
      canonical_text: input.incoming.native_text,
      extraction_method: 'native',
      detector_reasons: [...input.incoming.detector_reasons],
    };
  }
  const keepOcr = input.existing.extraction_method === 'ocr_tesseract';
  return {
    native_text: input.incoming.native_text,
    recovered_text: input.existing.recovered_text,
    canonical_text: keepOcr
      ? input.existing.canonical_text
      : input.incoming.native_text,
    extraction_method: input.existing.extraction_method,
    detector_reasons: [...input.incoming.detector_reasons],
  };
}
