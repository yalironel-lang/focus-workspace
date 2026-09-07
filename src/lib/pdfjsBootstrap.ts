/**
 * Shared pdfjs-dist bootstrap — worker config + document loading.
 * Used by ingestion and the Free Space PDF.js viewer.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { isTauriDesktop } from './desktopPlatform';
import { installMapGetOrInsertComputedPolyfill } from './mapGetOrInsertComputedPolyfill';

let pdfjsConfigured = false;

export async function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  // Modern pdfjs-dist calls Map.prototype.getOrInsertComputed; Tauri WKWebView lacks it.
  if (isTauriDesktop()) {
    installMapGetOrInsertComputedPolyfill();
  }
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
