/**
 * M1.0B B3.3A — canonical page set validation (pure).
 * MISSING PAGE ≠ EMPTY PAGE.
 */

export type CanonicalPageRow = {
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  canonicalText: string;
  /** Detector reasons from page_texts (used by recovery terminal gate). */
  detectorReasons?: string[];
};

export type CanonicalPageValidationOk = {
  ok: true;
  expectedPageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
};

export type CanonicalPageValidationFail = {
  ok: false;
  code:
    | 'invalid_request'
    | 'missing_page_count'
    | 'missing_page'
    | 'duplicate_page'
    | 'cross_source'
    | 'cross_version'
    | 'empty_page_set';
  detail?: string;
};

export type CanonicalPageValidationResult =
  | CanonicalPageValidationOk
  | CanonicalPageValidationFail;

/**
 * Validate page_texts for exact (sourceId, sourceVersion) against authoritative P.
 * Output pages are sorted by page_number ASC (never insertion/created_at order).
 */
export function validateCanonicalPageSet(input: {
  sourceId: string;
  sourceVersion: number;
  expectedPageCount: number | null | undefined;
  rows: readonly CanonicalPageRow[];
}): CanonicalPageValidationResult {
  const P = input.expectedPageCount;
  if (P == null || !Number.isInteger(P) || P < 1) {
    return { ok: false, code: 'missing_page_count' };
  }

  for (const row of input.rows) {
    if (row.sourceId !== input.sourceId) {
      return { ok: false, code: 'cross_source', detail: `page_${row.pageNumber}` };
    }
    if (row.sourceVersion !== input.sourceVersion) {
      return { ok: false, code: 'cross_version', detail: `page_${row.pageNumber}` };
    }
  }

  const byPage = new Map<number, CanonicalPageRow>();
  for (const row of input.rows) {
    if (!Number.isInteger(row.pageNumber) || row.pageNumber < 1) {
      return { ok: false, code: 'invalid_request', detail: 'bad_page_number' };
    }
    if (byPage.has(row.pageNumber)) {
      return { ok: false, code: 'duplicate_page', detail: `page_${row.pageNumber}` };
    }
    byPage.set(row.pageNumber, row);
  }

  for (let p = 1; p <= P; p++) {
    if (!byPage.has(p)) {
      return { ok: false, code: 'missing_page', detail: `page_${p}` };
    }
  }

  // Extra pages beyond P are rejected as invalid set (not authoritative).
  for (const pageNumber of byPage.keys()) {
    if (pageNumber > P) {
      return { ok: false, code: 'invalid_request', detail: `unexpected_page_${pageNumber}` };
    }
  }

  if (byPage.size === 0) {
    return { ok: false, code: 'empty_page_set' };
  }

  const pages: Array<{ pageNumber: number; text: string }> = [];
  for (let p = 1; p <= P; p++) {
    const row = byPage.get(p)!;
    pages.push({ pageNumber: p, text: row.canonicalText ?? '' });
  }

  return { ok: true, expectedPageCount: P, pages };
}
