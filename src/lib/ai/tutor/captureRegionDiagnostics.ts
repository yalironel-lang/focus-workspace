/**
 * Privacy-safe Capture region diagnostics (staging/dev, opt-in).
 * Status codes + numeric counters only — never text, coords, IDs, or user data.
 */

import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import type { PdfPageTextAssessmentKind } from './assessPdfPageTextLayer';
import {
  extractPdfTextFromRegion,
  type PdfTextContent,
  type PdfTextItem,
} from './pdfTutorTextExtraction';
import { isUsefulTutorExtractedText } from './tutorCaptureClassifier';

/** Region-level outcome codes. */
export type CaptureRegionDiagCode =
  | 'region_usable'
  | 'no_intersecting_items'
  | 'intersecting_unusable'
  | 'invalid_geometry';

/** Page-layer outcome as a stable numeric code (no strings in optional sinks). */
export const CAPTURE_PAGE_KIND_CODE = {
  empty: 0,
  sparse: 1,
  useful: 2,
  unknown: 3,
} as const;

export type CapturePageKindCode =
  (typeof CAPTURE_PAGE_KIND_CODE)[keyof typeof CAPTURE_PAGE_KIND_CODE];

export type CaptureRegionDiagnostics = {
  code: CaptureRegionDiagCode;
  /** Non-empty text items whose boxes overlap the region. */
  intersectingItemCount: number;
  /** Meaningful letter/digit count in the joined region extract (0 when empty). */
  extractedCharCount: number;
  /** 1 when extracted region text passes the usefulness classifier. */
  regionUseful: 0 | 1;
  /** Page assessment code from probe (or unknown). */
  pageKindCode: CapturePageKindCode;
  /** 1 when full-page native text is Tutor-useful. */
  pageUseful: 0 | 1;
  /** 1 when region failed but pageUseful — native-page fallback is eligible. */
  nativePageEligible: 0 | 1;
};

export type CaptureRegionDiagSnapshot = CaptureRegionDiagnostics & {
  /** Wall-clock ms of last record (no document correlation). */
  recordedAtMs: number;
};

let lastSnapshot: CaptureRegionDiagSnapshot | null = null;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function overlapArea(
  box: { left: number; top: number; right: number; bottom: number },
  region: NormalizedPageRegion,
): number {
  const left = Math.max(box.left, region.x);
  const top = Math.max(box.top, region.y);
  const right = Math.min(box.right, region.x + region.w);
  const bottom = Math.min(box.bottom, region.y + region.h);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function itemNormBox(
  item: PdfTextItem,
  pageWidth: number,
  pageHeight: number,
): { left: number; top: number; right: number; bottom: number } | null {
  const transform = item.transform;
  const text = item.str?.trim();
  if (!transform || transform.length < 6 || !text) return null;
  const x = Number(transform[4]);
  const baseline = Number(transform[5]);
  const width = Math.abs(
    Number(item.width) || Math.hypot(Number(transform[0]), Number(transform[1])) * text.length,
  );
  const height = Math.abs(
    Number(item.height) || Math.hypot(Number(transform[2]), Number(transform[3])) || 1,
  );
  if (![x, baseline, width, height].every(Number.isFinite) || pageWidth <= 0 || pageHeight <= 0) {
    return null;
  }
  const left = clamp01(x / pageWidth);
  const right = clamp01((x + width) / pageWidth);
  const top = clamp01((pageHeight - baseline - height) / pageHeight);
  const bottom = clamp01((pageHeight - baseline) / pageHeight);
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

function countMeaningfulChars(text: string): number {
  return text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

export function pageKindToCode(kind: PdfPageTextAssessmentKind | 'unknown'): CapturePageKindCode {
  if (kind === 'empty') return CAPTURE_PAGE_KIND_CODE.empty;
  if (kind === 'sparse') return CAPTURE_PAGE_KIND_CODE.sparse;
  if (kind === 'useful') return CAPTURE_PAGE_KIND_CODE.useful;
  return CAPTURE_PAGE_KIND_CODE.unknown;
}

export function isInvalidCaptureRegionGeometry(region: NormalizedPageRegion): boolean {
  const { x, y, w, h } = region;
  if (![x, y, w, h].every(Number.isFinite)) return true;
  if (w <= 0 || h <= 0) return true;
  // Normalized page region must have positive area inside [0,1] extent (allow slight overshoot).
  if (w > 2 || h > 2) return true;
  return false;
}

/**
 * Assess region extract without returning any text.
 * Uses the same overlap rules as `extractPdfTextFromRegion` (viewport scale-1 units).
 */
export function assessCaptureRegionExtraction(
  content: PdfTextContent,
  pageWidth: number,
  pageHeight: number,
  region: NormalizedPageRegion,
  pageKind: PdfPageTextAssessmentKind | 'unknown' = 'unknown',
): CaptureRegionDiagnostics {
  const pageKindCode = pageKindToCode(pageKind);
  const pageUseful: 0 | 1 = pageKind === 'useful' ? 1 : 0;

  if (isInvalidCaptureRegionGeometry(region) || pageWidth <= 0 || pageHeight <= 0) {
    return {
      code: 'invalid_geometry',
      intersectingItemCount: 0,
      extractedCharCount: 0,
      regionUseful: 0,
      pageKindCode,
      pageUseful,
      nativePageEligible: pageUseful,
    };
  }

  let intersectingItemCount = 0;
  for (const item of content.items ?? []) {
    const box = itemNormBox(item, pageWidth, pageHeight);
    if (box && overlapArea(box, region) > 0) intersectingItemCount += 1;
  }

  const extracted = extractPdfTextFromRegion(content, pageWidth, pageHeight, region);
  const joined = extracted?.trim() ?? '';
  const extractedCharCount = countMeaningfulChars(joined);
  const regionUseful: 0 | 1 = isUsefulTutorExtractedText(joined, region) ? 1 : 0;

  let code: CaptureRegionDiagCode;
  if (regionUseful === 1) {
    code = 'region_usable';
  } else if (intersectingItemCount === 0) {
    code = 'no_intersecting_items';
  } else {
    code = 'intersecting_unusable';
  }

  return {
    code,
    intersectingItemCount,
    extractedCharCount,
    regionUseful,
    pageKindCode,
    pageUseful,
    nativePageEligible: regionUseful === 0 && pageUseful === 1 ? 1 : 0,
  };
}

/** Merge a page probe into an existing region-only assessment. */
export function withPageProbe(
  regionDiag: CaptureRegionDiagnostics,
  pageKind: PdfPageTextAssessmentKind | 'unknown',
): CaptureRegionDiagnostics {
  const pageKindCode = pageKindToCode(pageKind);
  const pageUseful: 0 | 1 = pageKind === 'useful' ? 1 : 0;
  return {
    ...regionDiag,
    pageKindCode,
    pageUseful,
    nativePageEligible: regionDiag.regionUseful === 0 && pageUseful === 1 ? 1 : 0,
  };
}

export function recordCaptureRegionDiagnostics(diag: CaptureRegionDiagnostics): void {
  lastSnapshot = { ...diag, recordedAtMs: Date.now() };
}

export function getLastCaptureRegionDiagnostics(): CaptureRegionDiagSnapshot | null {
  return lastSnapshot;
}

export function clearCaptureRegionDiagnostics(): void {
  lastSnapshot = null;
}

/** Dev/staging console sink — codes and counters only. */
export function logCaptureRegionDiagnosticsIfEnabled(
  enabled: boolean,
  diag: CaptureRegionDiagnostics,
): void {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.debug('[capture-region-diag]', {
    code: diag.code,
    intersectingItemCount: diag.intersectingItemCount,
    extractedCharCount: diag.extractedCharCount,
    regionUseful: diag.regionUseful,
    pageKindCode: diag.pageKindCode,
    pageUseful: diag.pageUseful,
    nativePageEligible: diag.nativePageEligible,
  });
}
