/**
 * M1.0B B2 — isolated page OCR recovery worker (prototype orchestrator).
 *
 * Flow: validate → resolve trusted source → render ONE page → OCR → cleanup.
 * Not wired to Edge, Storage, or Course Knowledge ingest.
 */

import {
  PAGE_OCR_MAX_OUTPUT_CHARS,
  PAGE_OCR_RECOVERY_VERSION,
  PAGE_OCR_TIMEOUT_MS,
} from './bounds.ts';
import { buildRecoveryIdentity } from './recoveryIdentity.ts';
import { renderPdfPageToPng } from './renderPdfPage.ts';
import { runLocalTesseract } from './runLocalTesseract.ts';
import { createTempRenderSession, writeTempPng } from './tempArtifacts.ts';
import type {
  PageOcrRecoveryRequest,
  PageOcrRecoveryResult,
  TrustedSourceResolver,
} from './types.ts';
import { validatePageOcrRecoveryRequest } from './validateRequest.ts';

export type RecoverPageOptions = {
  resolveSource: TrustedSourceResolver;
  timeoutMs?: number;
  tesseractBin?: string;
  now?: () => number;
};

function failResult(
  base: {
    sourceId: string;
    sourceVersion: number;
    pageNumber: number;
    recoveryVersion: string;
    recoveryIdentity: string;
    renderDpi: number;
    durationMs: number;
    engineVersion: string;
  },
  errorCode: PageOcrRecoveryResult['errorCode'],
  status: PageOcrRecoveryResult['status'] = 'failed',
): PageOcrRecoveryResult {
  return {
    sourceId: base.sourceId,
    sourceVersion: base.sourceVersion,
    pageNumber: base.pageNumber,
    recoveryVersion: base.recoveryVersion,
    status,
    metadata: {
      durationMs: base.durationMs,
      renderDpi: base.renderDpi,
      engine: 'tesseract',
      engineVersion: base.engineVersion,
      renderer: 'pdfjs+napi-canvas',
      recoveryIdentity: base.recoveryIdentity,
    },
    errorCode,
  };
}

export async function recoverPdfPage(
  rawRequest: unknown,
  opts: RecoverPageOptions,
): Promise<PageOcrRecoveryResult> {
  const t0 = (opts.now ?? Date.now)();
  const timeoutMs = opts.timeoutMs ?? PAGE_OCR_TIMEOUT_MS;
  const engineVersionStub = 'tesseract';

  const validated = validatePageOcrRecoveryRequest(rawRequest);
  if (!validated.ok) {
    return failResult(
      {
        sourceId: typeof (rawRequest as { sourceId?: unknown })?.sourceId === 'string'
          ? (rawRequest as { sourceId: string }).sourceId.slice(0, 64)
          : 'unknown',
        sourceVersion:
          typeof (rawRequest as { sourceVersion?: unknown })?.sourceVersion === 'number'
            ? (rawRequest as { sourceVersion: number }).sourceVersion
            : 0,
        pageNumber:
          typeof (rawRequest as { pageNumber?: unknown })?.pageNumber === 'number'
            ? (rawRequest as { pageNumber: number }).pageNumber
            : 0,
        recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
        recoveryIdentity: 'invalid',
        renderDpi: 0,
        durationMs: (opts.now ?? Date.now)() - t0,
        engineVersion: engineVersionStub,
      },
      validated.errorCode,
    );
  }

  const req = validated.request;
  const recoveryIdentity = buildRecoveryIdentity(req);
  const baseMeta = {
    sourceId: req.sourceId,
    sourceVersion: req.sourceVersion,
    pageNumber: req.pageNumber,
    recoveryVersion: req.recoveryVersion,
    recoveryIdentity,
    renderDpi: req.renderDpi,
    engineVersion: engineVersionStub,
  };

  const deadline = t0 + timeoutMs;
  const remaining = () => Math.max(1, deadline - (opts.now ?? Date.now)());

  const source = await opts.resolveSource(req);
  if (!source) {
    return failResult(
      { ...baseMeta, durationMs: (opts.now ?? Date.now)() - t0 },
      'source_unavailable',
    );
  }

  const session = await createTempRenderSession();
  try {
    if (remaining() < 50) {
      return failResult(
        { ...baseMeta, durationMs: (opts.now ?? Date.now)() - t0 },
        'timeout',
      );
    }

    const rendered = await renderPdfPageToPng({
      bytes: source.bytes,
      pageNumber: req.pageNumber,
      dpi: req.renderDpi,
    });

    if (!rendered.ok) {
      return failResult(
        { ...baseMeta, durationMs: (opts.now ?? Date.now)() - t0 },
        rendered.code === 'invalid_page' ? 'invalid_page' : rendered.code === 'source_unavailable' ? 'source_unavailable' : 'render_failed',
      );
    }

    await writeTempPng(session, rendered.png);

    if (remaining() < 50) {
      return failResult(
        { ...baseMeta, durationMs: (opts.now ?? Date.now)() - t0 },
        'timeout',
      );
    }

    const ocr = await runLocalTesseract({
      imagePath: session.imagePath,
      timeoutMs: remaining(),
      tesseractBin: opts.tesseractBin,
    });

    const durationMs = (opts.now ?? Date.now)() - t0;

    if (!ocr.ok) {
      return {
        ...failResult(
          { ...baseMeta, durationMs, engineVersion: ocr.engineVersion },
          ocr.code,
        ),
        metadata: {
          durationMs,
          renderMs: rendered.renderMs,
          ocrMs: ocr.ocrMs,
          renderDpi: req.renderDpi,
          engine: 'tesseract',
          engineVersion: ocr.engineVersion,
          renderer: 'pdfjs+napi-canvas',
          pageWidthPx: rendered.widthPx,
          pageHeightPx: rendered.heightPx,
          recoveryIdentity,
        },
      };
    }

    let text = ocr.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (text.length > PAGE_OCR_MAX_OUTPUT_CHARS) {
      return {
        sourceId: req.sourceId,
        sourceVersion: req.sourceVersion,
        pageNumber: req.pageNumber,
        recoveryVersion: req.recoveryVersion,
        status: 'failed',
        errorCode: 'output_too_large',
        metadata: {
          durationMs,
          renderMs: rendered.renderMs,
          ocrMs: ocr.ocrMs,
          renderDpi: req.renderDpi,
          engine: 'tesseract',
          engineVersion: ocr.engineVersion,
          renderer: 'pdfjs+napi-canvas',
          pageWidthPx: rendered.widthPx,
          pageHeightPx: rendered.heightPx,
          recoveredCharCount: text.length,
          recoveryIdentity,
        },
      };
    }

    // Near-empty OCR → unusable (not "recovered")
    const meaningful = text.replace(/\s+/g, '').length;
    if (meaningful < 8) {
      return {
        sourceId: req.sourceId,
        sourceVersion: req.sourceVersion,
        pageNumber: req.pageNumber,
        recoveryVersion: req.recoveryVersion,
        status: 'unusable',
        recoveredText: text,
        errorCode: undefined,
        metadata: {
          durationMs,
          renderMs: rendered.renderMs,
          ocrMs: ocr.ocrMs,
          renderDpi: req.renderDpi,
          engine: 'tesseract',
          engineVersion: ocr.engineVersion,
          renderer: 'pdfjs+napi-canvas',
          pageWidthPx: rendered.widthPx,
          pageHeightPx: rendered.heightPx,
          recoveredCharCount: text.length,
          recoveryIdentity,
        },
      };
    }

    return {
      sourceId: req.sourceId,
      sourceVersion: req.sourceVersion,
      pageNumber: req.pageNumber,
      recoveryVersion: req.recoveryVersion,
      status: 'recovered',
      recoveredText: text,
      metadata: {
        durationMs,
        renderMs: rendered.renderMs,
        ocrMs: ocr.ocrMs,
        renderDpi: req.renderDpi,
        engine: 'tesseract',
        engineVersion: ocr.engineVersion,
        renderer: 'pdfjs+napi-canvas',
        pageWidthPx: rendered.widthPx,
        pageHeightPx: rendered.heightPx,
        recoveredCharCount: text.length,
        recoveryIdentity,
      },
    };
  } catch {
    return failResult(
      { ...baseMeta, durationMs: (opts.now ?? Date.now)() - t0 },
      'internal_error',
    );
  } finally {
    await session.dispose();
  }
}

/** Type-only helper for callers that already validated. */
export type ValidatedPageOcrRequest = NonNullable<
  ReturnType<typeof validatePageOcrRecoveryRequest> extends { ok: true; request: infer R }
    ? R
    : never
>;

export type { PageOcrRecoveryRequest };
