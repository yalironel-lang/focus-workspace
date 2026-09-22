/**
 * M1.0B B2 — read-only MVT evidence runner (local Tesseract + local PDF).
 *
 * Usage:
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runMvtEvidence.ts
 *
 * Does NOT mutate Production DB / Storage. Writes sanitized JSON under tmp/m10b2_validate/.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_OCR_RECOVERY_VERSION } from './src/bounds.ts';
import { formatPageOcrRecoveryLogLine } from './src/privacyLog.ts';
import { recoverPdfPage } from './src/recoverPage.ts';
import { createLocalFixtureResolver } from './src/resolveLocalFixtureSource.ts';
import { scoreMvtTheoremEvidence } from './src/scoreMvtSemantic.ts';
import { detectPageExtractionSuspicion } from '../../supabase/functions/_shared/ai/knowledge/detectPageExtractionSuspicion.ts';
import { countSuspiciousUnicodeChars } from '../../supabase/functions/_shared/ai/knowledge/extractionMetrics.ts';
import { meaningfulCharCount, normalizeExtractedPageText } from '../../supabase/functions/_shared/ai/knowledge/normalizeText.ts';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const OUT_DIR = join(ROOT, 'tmp/m10b2_validate');

const MVT_CANDIDATES = [
  '/Users/ylyrwnl/Desktop/Calculus 2/1.C. Mean Value Theorem.pdf',
  '/Users/ylyrwnl/Downloads/1.C. Mean Value Theorem.pdf',
];

const SOURCE_ID = 'mvt-local-fixture';
const SOURCE_VERSION = 1;
const EXTRACTION_VERSION = 'pdf-extract-v2-metrics';

type NativePage = {
  pageNumber: number;
  text: string;
  itemCount: number;
  meaningfulChars: number;
  suspiciousUnicodeCount: number;
};

type YieldLabel = 'HIGH_VALUE' | 'SOME_VALUE' | 'LOW_NO_VALUE' | 'UNUSABLE';

function findMvtPdf(): string {
  for (const p of MVT_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error('MVT PDF not found in known local locations');
}

async function extractNativePages(bytes: Uint8Array): Promise<NativePage[]> {
  const doc = await getDocument({
    data: bytes.slice(),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    useWorkerFetch: false,
    verbosity: 0,
  }).promise;
  const pages: NativePage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items ?? [];
      const parts: string[] = [];
      for (const item of items) {
        if (item && typeof item === 'object' && typeof (item as { str?: unknown }).str === 'string') {
          const s = (item as { str: string }).str;
          if (s.length > 0) parts.push(s);
        }
      }
      const text = normalizeExtractedPageText(parts.join(' '));
      pages.push({
        pageNumber: n,
        text,
        itemCount: items.length,
        meaningfulChars: meaningfulCharCount(text),
        suspiciousUnicodeCount: countSuspiciousUnicodeChars(text),
      });
    }
  } finally {
    await doc.destroy?.();
  }
  return pages;
}

function classifyYield(input: {
  nativeMeaningful: number;
  ocrMeaningful: number;
  status: string;
  pageNumber: number;
  semantic?: ReturnType<typeof scoreMvtTheoremEvidence>;
  reasons: string[];
}): YieldLabel {
  if (input.status === 'unusable' || input.status === 'failed') return 'UNUSABLE';
  if (input.pageNumber === 3 && input.semantic) {
    if (input.semantic.overall === 'PASS') return 'HIGH_VALUE';
    if (input.semantic.overall === 'PARTIAL') return 'SOME_VALUE';
    return 'LOW_NO_VALUE';
  }
  const delta = input.ocrMeaningful - input.nativeMeaningful;
  const reasons = new Set(input.reasons);
  if (reasons.has('LOW_TEXT_ITEM_COUNT') && input.ocrMeaningful < 20) return 'LOW_NO_VALUE';
  if (reasons.has('SHELL_WITH_MISSING_CONTENT') && delta > 40) return 'HIGH_VALUE';
  if (delta >= 80 && input.ocrMeaningful >= 100) return 'HIGH_VALUE';
  if (delta >= 25) return 'SOME_VALUE';
  if (delta <= 5) return 'LOW_NO_VALUE';
  return 'SOME_VALUE';
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const pdfPath = findMvtPdf();
  const bytes = new Uint8Array(readFileSync(pdfPath));
  const nativePages = await extractNativePages(bytes);

  const suspicion = nativePages.map((p) => ({
    ...detectPageExtractionSuspicion(p),
    native: {
      pageNumber: p.pageNumber,
      itemCount: p.itemCount,
      meaningfulChars: p.meaningfulChars,
      suspiciousUnicodeCount: p.suspiciousUnicodeCount,
    },
  }));

  const suspicious = suspicion.filter((s) => s.suspicious);
  const emptyMeaningful = nativePages.filter((p) => p.meaningfulChars === 0);

  // Healthy controls: title-like p2, dense p5, math-unicode-ish dense p6 if healthy
  const healthyControls = [2, 5, 6].filter((n) => {
    const s = suspicion.find((x) => x.metrics.pageNumber === n);
    return s && !s.suspicious;
  });

  const resolveSource = createLocalFixtureResolver({
    [SOURCE_ID]: { sourceVersion: SOURCE_VERSION, absolutePath: pdfPath },
  });

  const pagesToOcr = [
    ...suspicious.map((s) => s.metrics.pageNumber),
    ...healthyControls,
    ...emptyMeaningful.map((p) => p.pageNumber).slice(0, 3),
  ];
  const uniquePages = [...new Set(pagesToOcr)].sort((a, b) => a - b);

  const pageRows: Array<Record<string, unknown>> = [];
  const timing: number[] = [];

  for (const pageNumber of uniquePages) {
    const native = nativePages.find((p) => p.pageNumber === pageNumber)!;
    const det = suspicion.find((s) => s.metrics.pageNumber === pageNumber)!;
    const result = await recoverPdfPage(
      {
        sourceId: SOURCE_ID,
        sourceVersion: SOURCE_VERSION,
        pageNumber,
        extractionVersion: EXTRACTION_VERSION,
        recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
      },
      { resolveSource },
    );

    // Safe operational log (no academic text)
    console.log(formatPageOcrRecoveryLogLine(result));

    const ocrText = result.recoveredText ?? '';
    const ocrMeaningful = meaningfulCharCount(ocrText);
    const semantic =
      pageNumber === 3 && result.status === 'recovered'
        ? scoreMvtTheoremEvidence(ocrText)
        : pageNumber === 3
          ? scoreMvtTheoremEvidence(ocrText || native.text)
          : undefined;

    const yieldLabel = classifyYield({
      nativeMeaningful: native.meaningfulChars,
      ocrMeaningful,
      status: result.status,
      pageNumber,
      semantic,
      reasons: det.reasons,
    });

    if (typeof result.metadata.durationMs === 'number') timing.push(result.metadata.durationMs);

    pageRows.push({
      pageNumber,
      b1Suspicious: det.suspicious,
      b1Reasons: det.reasons,
      role: det.suspicious
        ? 'suspicious'
        : emptyMeaningful.some((p) => p.pageNumber === pageNumber)
          ? 'empty_probe'
          : 'healthy_control',
      nativeItemCount: native.itemCount,
      nativeMeaningfulChars: native.meaningfulChars,
      ocrStatus: result.status,
      ocrErrorCode: result.errorCode ?? null,
      ocrCharCount: result.metadata.recoveredCharCount ?? 0,
      ocrMeaningfulChars: ocrMeaningful,
      renderMs: result.metadata.renderMs ?? null,
      ocrMs: result.metadata.ocrMs ?? null,
      durationMs: result.metadata.durationMs,
      pageWidthPx: result.metadata.pageWidthPx ?? null,
      pageHeightPx: result.metadata.pageHeightPx ?? null,
      recoveryValue: yieldLabel,
      semantic: semantic
        ? { overall: semantic.overall, score: semantic.score, checks: semantic.checks }
        : null,
      // Evidence notes without dumping full page text
      evidenceNote:
        pageNumber === 3 && semantic
          ? `p3 semantic ${semantic.overall} score=${semantic.score}`
          : yieldLabel === 'HIGH_VALUE'
            ? 'OCR added substantial extract vs native'
            : yieldLabel === 'LOW_NO_VALUE'
              ? 'Little/no academic gain vs native'
              : yieldLabel === 'UNUSABLE'
                ? 'OCR failed or near-empty'
                : 'Modest OCR gain',
    });
  }

  // Failure probes
  const failInvalidPage = await recoverPdfPage(
    {
      sourceId: SOURCE_ID,
      sourceVersion: SOURCE_VERSION,
      pageNumber: 9999,
      extractionVersion: EXTRACTION_VERSION,
      recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
    },
    { resolveSource },
  );
  const failMissing = await recoverPdfPage(
    {
      sourceId: 'does-not-exist',
      sourceVersion: 1,
      pageNumber: 1,
      extractionVersion: EXTRACTION_VERSION,
      recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
    },
    { resolveSource },
  );

  timing.sort((a, b) => a - b);
  const median = timing.length
    ? timing[Math.floor(timing.length / 2)]
    : null;

  const report = {
    milestone: 'M1.0B B2',
    sourceId: SOURCE_ID,
    pageCount: nativePages.length,
    b1SuspiciousCount: suspicious.length,
    b1SuspiciousPages: suspicious.map((s) => ({
      pageNumber: s.metrics.pageNumber,
      reasons: s.reasons,
      itemCount: s.metrics.itemCount,
      meaningfulChars: s.metrics.meaningfulChars,
    })),
    emptyMeaningfulPageCount: emptyMeaningful.length,
    emptyMeaningfulPages: emptyMeaningful.map((p) => ({
      pageNumber: p.pageNumber,
      itemCount: p.itemCount,
    })),
    pageResults: pageRows,
    failureProbes: {
      invalidPage: {
        status: failInvalidPage.status,
        errorCode: failInvalidPage.errorCode,
      },
      missingSource: {
        status: failMissing.status,
        errorCode: failMissing.errorCode,
      },
    },
    performance: {
      sampleCount: timing.length,
      medianDurationMs: median,
      minDurationMs: timing[0] ?? null,
      maxDurationMs: timing[timing.length - 1] ?? null,
    },
    page3: pageRows.find((r) => r.pageNumber === 3) ?? null,
    render: {
      method: 'pdfjs-dist + @napi-rs/canvas',
      defaultDpi: 220,
    },
  };

  const outPath = join(OUT_DIR, 'SANITIZED_B2_SUMMARY.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ wrote: outPath, suspicious: suspicious.length, pagesOcrd: uniquePages.length }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'm10b2_validate_failed', message: String(err).slice(0, 200) }));
  process.exit(1);
});
