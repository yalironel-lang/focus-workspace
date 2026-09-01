/**
 * pdfIngestion — client-side PDF spatial data extraction.
 *
 * Stage 1 of the cognitive ingestion system.
 * Extracts what can be known immediately, before any upload:
 *   - page count
 *   - document title (from PDF metadata, not filename)
 *   - first-page thumbnail (canvas render at ~140px wide)
 *
 * Philosophy: attentive, not active.
 * This runs silently in the background. Every field is optional.
 * Failure at any step produces partial data — never an error surface.
 * The workspace noticed what was dropped. Nothing announces that it did.
 */

import { loadPdfDocument } from './pdfjsBootstrap';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfSpatialData {
  /** Total number of pages. */
  pageCount: number;
  /**
   * Title from PDF document metadata — populated in academic papers,
   * textbooks, and most generated PDFs. Absent in scans.
   * null when not found or meaningfully different from the filename.
   */
  documentTitle: string | null;
  /**
   * First-page thumbnail as a JPEG data URL (~10–20KB at 140px wide).
   * null when rendering failed (malformed PDF, memory constraint, timeout).
   */
  thumbnailDataUrl: string | null;
}

const EXTRACTION_TIMEOUT_MS = 5000;
const THUMBNAIL_WIDTH_PX    = 140;
const THUMBNAIL_QUALITY     = 0.75;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout.
 * Returns the fallback value if the promise doesn't resolve in time.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timer]);
}

/**
 * Render the first page of an open PDF document to a canvas
 * and return the result as a JPEG data URL.
 * Returns null on any failure.
 */
async function renderThumbnail(
  pdf: Awaited<ReturnType<typeof loadPdfDocument>>,
): Promise<string | null> {
  try {
    const page     = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale    = THUMBNAIL_WIDTH_PX / viewport.width;
    const scaled   = page.getViewport({ scale });

    const canvas  = document.createElement('canvas');
    canvas.width  = Math.round(scaled.width);
    canvas.height = Math.round(scaled.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // pdfjs-dist v5 requires `canvas` in RenderParameters alongside `canvasContext`
    await page.render({ canvas, canvasContext: ctx, viewport: scaled }).promise;
    return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
  } catch {
    return null;
  }
}

/**
 * Extract a clean document title from PDF metadata.
 * Returns null if:
 *   - metadata has no title
 *   - title is empty or whitespace-only
 *   - title appears to be a raw filename (has file extension)
 */
function extractDocumentTitle(
  info: Record<string, unknown>,
): string | null {
  const raw = info['Title'];
  if (typeof raw !== 'string') return null;
  const title = raw.trim();
  if (!title) return null;
  // Reject if it looks like a filename — e.g. "chapter3.pdf", "lecture_notes.PDF"
  if (/\.\w{2,5}$/.test(title)) return null;
  return title;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract spatial data from a PDF File object.
 *
 * Runs entirely client-side with no network calls.
 * Capped at EXTRACTION_TIMEOUT_MS total — always resolves.
 * On partial failure, returns whatever was successfully extracted.
 */
export async function extractPdfSpatialData(file: File): Promise<PdfSpatialData> {
  const fallback: PdfSpatialData = {
    pageCount:       0,
    documentTitle:   null,
    thumbnailDataUrl: null,
  };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await withTimeout(
      loadPdfDocument(arrayBuffer),
      EXTRACTION_TIMEOUT_MS,
      null,
    );

    if (!pdf) return fallback;

    const pageCount = pdf.numPages;

    // Metadata — best-effort, never throws
    let documentTitle: string | null = null;
    try {
      const meta = await pdf.getMetadata();
      documentTitle = extractDocumentTitle(
        (meta.info ?? {}) as Record<string, unknown>,
      );
    } catch {
      // metadata extraction failed — not critical
    }

    // Thumbnail — best-effort, capped at a short window
    const thumbnailDataUrl = await withTimeout(
      renderThumbnail(pdf),
      3000,
      null,
    );

    return { pageCount, documentTitle, thumbnailDataUrl };
  } catch {
    return fallback;
  }
}
