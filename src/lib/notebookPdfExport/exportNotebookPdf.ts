/**
 * M7.6 — Notebook PDF export entrypoint.
 *
 * Architecture: canonical pages[] → semantic HTML → browser print / Save as PDF.
 * Read-only: never mutates documentBody, activePageId, codecs, assets, or tombstones.
 */

import type { NotebookContentWithPages } from '../notebookPages/types';
import { buildExportHtmlDocument, planExportDocument } from './buildExportHtml';
import { notebookPdfFilename } from './filename';
import { openNotebookPdfPrintDialog } from './printPdf';
import type { PdfAssetResolver } from './renderBlocksHtml';
import { resolvePdfAssets } from './resolveAssets';

export type ExportNotebookPdfInput = {
  /** Snapshot of notebook content — must include pages[] when present. */
  content: NotebookContentWithPages;
  /** Free Space / object title used for filename + first-page heading. */
  notebookTitle?: string | null;
  /** Notebook object id for handwriting/image local asset reads. */
  objectId?: string;
  /**
   * When true (default), open the browser print dialog (Save as PDF).
   * Tests may set false to only build HTML.
   */
  openPrintDialog?: boolean;
  /** Optional pre-resolved assets (tests / callers that already hydrated). */
  assets?: PdfAssetResolver;
};

export type ExportNotebookPdfResult =
  | {
      ok: true;
      filename: string;
      pageCount: number;
      html: string;
      pagesExported: Array<{ id: string; kind: string; title: string }>;
    }
  | {
      ok: false;
      error: string;
      pageId?: string;
      pageTitle?: string;
    };

/**
 * Export the entire Notebook to PDF via a dedicated print document.
 * Uses pages[] order (sections.pageIds). Ignores which page is active.
 */
export async function exportNotebookPdf(
  input: ExportNotebookPdfInput,
): Promise<ExportNotebookPdfResult> {
  const plan = planExportDocument(input.content);
  if (!plan.ok) {
    return {
      ok: false,
      error: formatExportError(plan.error, plan.pageTitle),
      pageId: plan.pageId,
      pageTitle: plan.pageTitle,
    };
  }

  const assets =
    input.assets ??
    (await resolvePdfAssets({
      objectId: input.objectId,
      imageKeys: plan.imageKeys,
      handwritingKeys: plan.handwritingKeys,
    }));

  const built = buildExportHtmlDocument({
    content: input.content,
    notebookTitle: input.notebookTitle,
    assets,
  });

  if (!built.ok) {
    return {
      ok: false,
      error: formatExportError(built.error, built.pageTitle),
      pageId: built.pageId,
      pageTitle: built.pageTitle,
    };
  }

  if (input.openPrintDialog !== false) {
    await openNotebookPdfPrintDialog({
      html: built.html,
      filename: built.filename,
    });
  }

  return {
    ok: true,
    filename: built.filename,
    pageCount: built.pageCount,
    html: built.html,
    pagesExported: built.pagesExported,
  };
}

function formatExportError(message: string, pageTitle?: string): string {
  const where = pageTitle ? ` (page “${pageTitle}”)` : '';
  if (/Corrupt state|Invalid versioned|Unsupported Notebook text codec/i.test(message)) {
    return `Export stopped${where}: this page has content that cannot be read safely. Fix or restore the page, then try again.`;
  }
  return `Export failed${where}: ${message}`;
}

export { notebookPdfFilename, planExportDocument, buildExportHtmlDocument };
