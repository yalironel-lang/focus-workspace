/**
 * M1.0B B3.1 — canonical page text selection (pure).
 * Downstream chunking consumes canonical_text only.
 */

export type CanonicalExtractionMethod = 'native' | 'ocr_tesseract';

export type PageFallbackResult =
  | 'none'
  | 'native_after_ocr_failed'
  | 'native_after_ocr_unusable';

export type RecoveryCommitStatus = 'recovered' | 'failed' | 'unusable';

export type CanonicalPageDecision = {
  canonicalText: string;
  extractionMethod: CanonicalExtractionMethod;
  fallbackResult: PageFallbackResult;
  /** True when recovered_text is stored as the canonical representation. */
  usedRecovered: boolean;
};

/**
 * Bounded recovery-validity gate for accepting OCR as canonical.
 * B3.1: meaningful length floor only (no academic NLP). B3.2 may tighten.
 */
export function isRecoveredTextValidForCanonical(recoveredText: string): boolean {
  const meaningful = recoveredText.replace(/\s+/g, '').length;
  return meaningful >= 8;
}

/**
 * HEALTHY / no recovery attempt: canonical = native.
 * RECOVERY SUCCESS (valid): canonical = recovered (native preserved separately).
 * RECOVERY FAILED / UNUSABLE: canonical = native + fallback provenance.
 */
export function selectCanonicalPageText(input: {
  nativeText: string;
  recoveredText: string | null | undefined;
  recoveryStatus: RecoveryCommitStatus | null;
}): CanonicalPageDecision {
  const nativeText = input.nativeText ?? '';

  if (input.recoveryStatus == null) {
    return {
      canonicalText: nativeText,
      extractionMethod: 'native',
      fallbackResult: 'none',
      usedRecovered: false,
    };
  }

  if (input.recoveryStatus === 'recovered') {
    const recovered = input.recoveredText ?? '';
    if (isRecoveredTextValidForCanonical(recovered)) {
      return {
        canonicalText: recovered,
        extractionMethod: 'ocr_tesseract',
        fallbackResult: 'none',
        usedRecovered: true,
      };
    }
    return {
      canonicalText: nativeText,
      extractionMethod: 'native',
      fallbackResult: 'native_after_ocr_unusable',
      usedRecovered: false,
    };
  }

  if (input.recoveryStatus === 'unusable') {
    return {
      canonicalText: nativeText,
      extractionMethod: 'native',
      fallbackResult: 'native_after_ocr_unusable',
      usedRecovered: false,
    };
  }

  // failed
  return {
    canonicalText: nativeText,
    extractionMethod: 'native',
    fallbackResult: 'native_after_ocr_failed',
    usedRecovered: false,
  };
}
