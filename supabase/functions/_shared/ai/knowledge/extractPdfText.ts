/**
 * Digital/text-layer PDF page extraction via pdf.js getDocument API.
 * OCR is out of scope. Rendering/canvas not required.
 *
 * M1.0B B1: pages include observational metrics (itemCount, meaningfulChars,
 * suspiciousUnicodeCount). Canonical `text` normalization is unchanged.
 */

import {
  KNOWLEDGE_MAX_EXTRACTED_CHARS,
  KNOWLEDGE_MAX_PAGES,
  KNOWLEDGE_PDF_EXTRACTION_VERSION,
} from './bounds.ts';
import type { ExtractedPdfPage } from './chunkPages.ts';
import { countSuspiciousUnicodeChars } from './extractionMetrics.ts';
import { meaningfulCharCount, normalizeExtractedPageText } from './normalizeText.ts';

/** Minimal pdf.js surface used by extraction (injectable for tests). */
export type PdfJsDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{
      items: Array<{ str?: string } | unknown>;
    }>;
  }>;
  destroy?: () => Promise<void> | void;
};

export type PdfJsModule = {
  getDocument(src: {
    data: Uint8Array;
    disableWorker?: boolean;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    verbosity?: number;
    useWorkerFetch?: boolean;
  }): { promise: Promise<PdfJsDocument> };
  GlobalWorkerOptions?: { workerSrc?: string };
};

export type ExtractPdfTextSuccess = {
  ok: true;
  pageCount: number;
  pages: ExtractedPdfPage[];
  extractedChars: number;
  pagesWithText: number;
  extractionVersion: typeof KNOWLEDGE_PDF_EXTRACTION_VERSION;
};

export type ExtractPdfTextFailure = {
  ok: false;
  code:
    | 'extract_failed'
    | 'too_many_pages'
    | 'too_large'
    | 'no_extractable_text'
    | 'invalid_request';
  /** Optional safe diagnostic (never course content). */
  detail?: string;
};

export type ExtractPdfTextResult = ExtractPdfTextSuccess | ExtractPdfTextFailure;

function itemsToRawText(items: Array<{ str?: string } | unknown>): string {
  const parts: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const str = (item as { str?: unknown }).str;
    if (typeof str === 'string' && str.length > 0) {
      parts.push(str);
    }
  }
  // Join with space; normalize will collapse runs.
  return parts.join(' ');
}

export async function extractPdfTextFromBytes(
  bytes: Uint8Array,
  pdfjs: PdfJsModule,
  opts?: { maxPages?: number; maxExtractedChars?: number },
): Promise<ExtractPdfTextResult> {
  const maxPages = opts?.maxPages ?? KNOWLEDGE_MAX_PAGES;
  const maxChars = opts?.maxExtractedChars ?? KNOWLEDGE_MAX_EXTRACTED_CHARS;

  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return { ok: false, code: 'invalid_request' };
  }

  // Quick magic check — not authoritative, but fails closed early.
  const head = String.fromCharCode(
    bytes[0] ?? 0,
    bytes[1] ?? 0,
    bytes[2] ?? 0,
    bytes[3] ?? 0,
  );
  if (head !== '%PDF') {
    return { ok: false, code: 'extract_failed' };
  }

  let doc: PdfJsDocument;
  try {
    doc = await pdfjs.getDocument({
      data: bytes.slice(),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
      useWorkerFetch: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'extract_failed',
      detail: msg.replace(/\s+/g, ' ').slice(0, 240),
    };
  }

  try {
    const pageCount = doc.numPages;
    if (!Number.isFinite(pageCount) || pageCount < 1) {
      return { ok: false, code: 'extract_failed' };
    }
    if (pageCount > maxPages) {
      return { ok: false, code: 'too_many_pages' };
    }

    const pages: ExtractedPdfPage[] = [];
    let extractedChars = 0;
    let pagesWithText = 0;

    for (let n = 1; n <= pageCount; n++) {
      let pageText = '';
      let itemCount = 0;
      try {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        const items = content.items ?? [];
        itemCount = items.length;
        const raw = itemsToRawText(items);
        pageText = normalizeExtractedPageText(raw);
      } catch {
        // Treat page extraction failure as empty page; continue.
        pageText = '';
        itemCount = 0;
      }

      const meaningfulChars = meaningfulCharCount(pageText);
      if (meaningfulChars > 0) {
        pagesWithText += 1;
      }
      extractedChars += pageText.length;
      if (extractedChars > maxChars) {
        return { ok: false, code: 'too_large' };
      }
      pages.push({
        pageNumber: n,
        text: pageText,
        itemCount,
        meaningfulChars,
        suspiciousUnicodeCount: countSuspiciousUnicodeChars(pageText),
      });
    }

    return {
      ok: true,
      pageCount,
      pages,
      extractedChars,
      pagesWithText,
      extractionVersion: KNOWLEDGE_PDF_EXTRACTION_VERSION,
    };
  } finally {
    try {
      await doc.destroy?.();
    } catch {
      // ignore
    }
  }
}
