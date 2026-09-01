/**
 * Shared pdfjs-dist bootstrap — worker config + document loading.
 * Used by ingestion and the Free Space PDF.js viewer.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

let pdfjsConfigured = false;

export async function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
    pdfjsConfigured = true;
  }
  const loadTask = pdfjsLib.getDocument({ data });
  return loadTask.promise;
}

/** Test-only reset. */
export function resetPdfjsBootstrapForTests(): void {
  pdfjsConfigured = false;
}
