/**
 * Single-page PDF render via pdf.js + @napi-rs/canvas (Node).
 * Renders ONLY the requested page. No OCR here.
 */

import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type RenderPageSuccess = {
  ok: true;
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
  renderMs: number;
  pageCount: number;
};

export type RenderPageFailure = {
  ok: false;
  code: 'invalid_page' | 'render_failed' | 'source_unavailable';
  detail?: string;
};

export type RenderPageResult = RenderPageSuccess | RenderPageFailure;

export async function renderPdfPageToPng(input: {
  bytes: Uint8Array;
  pageNumber: number;
  dpi: number;
}): Promise<RenderPageResult> {
  const started = Date.now();
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    return { ok: false, code: 'source_unavailable', detail: 'empty_bytes' };
  }

  let doc: {
    numPages: number;
    getPage(n: number): Promise<{
      getViewport(opts: { scale: number }): { width: number; height: number };
      render(opts: {
        canvasContext: unknown;
        viewport: { width: number; height: number };
        canvas?: unknown;
      }): { promise: Promise<void> };
    }>;
    destroy?: () => Promise<void> | void;
  };

  // pdf.js rejects Node Buffer even though Buffer extends Uint8Array.
  // Always pass a plain Uint8Array copy so Storage downloads / Buffer uploads work.
  const data = new Uint8Array(input.bytes);

  try {
    doc = await getDocument({
      data,
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
      code: 'render_failed',
      detail: msg.replace(/\s+/g, ' ').slice(0, 200),
    };
  }

  try {
    const pageCount = doc.numPages;
    if (!Number.isFinite(pageCount) || pageCount < 1) {
      return { ok: false, code: 'render_failed', detail: 'bad_page_count' };
    }
    if (input.pageNumber < 1 || input.pageNumber > pageCount) {
      return { ok: false, code: 'invalid_page', detail: 'page_out_of_range' };
    }

    const page = await doc.getPage(input.pageNumber);
    const scale = input.dpi / 72;
    const viewport = page.getViewport({ scale });
    const widthPx = Math.max(1, Math.ceil(viewport.width));
    const heightPx = Math.max(1, Math.ceil(viewport.height));
    const canvas = createCanvas(widthPx, heightPx);
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas,
    }).promise;

    const png = canvas.toBuffer('image/png');
    return {
      ok: true,
      png: new Uint8Array(png),
      widthPx,
      heightPx,
      renderMs: Date.now() - started,
      pageCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'render_failed',
      detail: msg.replace(/\s+/g, ' ').slice(0, 200),
    };
  } finally {
    try {
      await doc.destroy?.();
    } catch {
      // ignore
    }
  }
}
