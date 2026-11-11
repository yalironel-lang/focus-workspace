/**
 * Owner-scoped PDF Capture recovery diagnostic (temporary / staging+DEV).
 *
 * Uses the authenticated anon client only (same RLS posture as Capture bridge).
 * Returns status booleans/enums — never PDF text, UUIDs, storage paths, or tokens.
 *
 * Recovery jobs (`ai_knowledge_page_recovery_jobs`) are service_role-only;
 * clients cannot read job rows — reported as `unavailable_to_client`.
 */

import { isStagingEmailAuthEnabled } from '../../auth/stagingEmailAuthFlag';
import { supabase } from '../../supabase';
import {
  PDF_RECOVERY_DIAG_QUERY,
  PDF_RECOVERY_DIAG_STORAGE_KEY,
  persistOwnerPdfRecoveryDiagOptInFromSearch,
  readOwnerPdfRecoveryDiagOptIn,
} from './ownerPdfRecoveryDiagOptIn';

export { PDF_RECOVERY_DIAG_QUERY, PDF_RECOVERY_DIAG_STORAGE_KEY };

export type OwnerPdfRecoveryJobStatus =
  | 'unavailable_to_client'
  | 'not_applicable';

/** Allowlisted detector reason codes from page ledger (never free text). */
export const OWNER_PDF_RECOVERY_DETECTOR_REASONS = [
  'SHELL_WITH_MISSING_CONTENT',
  'LOW_TEXT_ITEM_COUNT',
  'SPARSE_TEXT',
  'SUSPICIOUS_UNICODE',
] as const;

export type OwnerPdfRecoveryDetectorReason =
  (typeof OWNER_PDF_RECOVERY_DETECTOR_REASONS)[number];

const DETECTOR_REASON_SET = new Set<string>(OWNER_PDF_RECOVERY_DETECTOR_REASONS);

/** Allowlisted fallback_result values; missing/null/unexpected → unknown. */
export type OwnerPdfRecoveryFallbackResult =
  | 'none'
  | 'native_after_ocr_failed'
  | 'native_after_ocr_unusable'
  | 'unknown';

export type OwnerPdfRecoveryDiagResult =
  | {
      ok: true;
      sourceFound: boolean;
      pageRowFound: boolean;
      extractionMethod: 'native' | 'ocr_tesseract' | 'unknown' | 'none';
      recoveredTextAvailable: boolean;
      /** True when recovered or OCR-canonical text would satisfy Capture bridge usefulness. */
      captureRecoveryUsable: boolean;
      recoveryJobStatus: OwnerPdfRecoveryJobStatus;
      mappingValid: boolean;
      /** Allowlisted detector codes only (empty when no page row / none recorded). */
      detectorReasons: OwnerPdfRecoveryDetectorReason[];
      /** Ledger fallback_result; unknown when missing or unexpected. */
      fallbackResult: OwnerPdfRecoveryFallbackResult;
      /** High-level cause hint for operators (no identifiers). */
      causeHint:
        | 'ready_for_capture_recovery'
        | 'missing_knowledge_source'
        | 'missing_page_ledger'
        | 'native_only_no_ocr_text'
        | 'ocr_text_present_but_unusable'
        | 'unauthenticated'
        | 'invalid_request'
        | 'lookup_error';
    }
  | {
      ok: false;
      code: 'disabled' | 'unauthenticated' | 'invalid_request' | 'lookup_error';
    };

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };

type UntypedFilter = {
  eq: (col: string, val: string | number) => UntypedFilter;
  maybeSingle: () => PromiseLike<QueryResult>;
};

type UntypedTable = {
  select: (cols: string) => UntypedFilter;
};

function table(name: string): UntypedTable {
  return (supabase as unknown as { from: (relation: string) => UntypedTable }).from(name);
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Meaningful alphanumerics without returning content (length-only). */
function hasUsefulAlphanumericPayload(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

/** Keep only allowlisted detector codes; drop unexpected / content-like values. */
export function sanitizeOwnerPdfRecoveryDetectorReasons(
  raw: unknown,
): OwnerPdfRecoveryDetectorReason[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnerPdfRecoveryDetectorReason[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const code = item.trim();
    if (!DETECTOR_REASON_SET.has(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code as OwnerPdfRecoveryDetectorReason);
  }
  out.sort();
  return out;
}

export function sanitizeOwnerPdfRecoveryFallbackResult(
  raw: unknown,
): OwnerPdfRecoveryFallbackResult {
  if (raw === null || raw === undefined) return 'unknown';
  if (raw === 'none') return 'none';
  if (raw === 'native_after_ocr_failed') return 'native_after_ocr_failed';
  if (raw === 'native_after_ocr_unusable') return 'native_after_ocr_unusable';
  return 'unknown';
}

function emptyForensicFields(): {
  detectorReasons: OwnerPdfRecoveryDetectorReason[];
  fallbackResult: OwnerPdfRecoveryFallbackResult;
} {
  return { detectorReasons: [], fallbackResult: 'unknown' };
}

/** Pure build gate — Production: stagingEmailAuth=false and viteDev=false. */
export function resolveOwnerPdfRecoveryDiagBuildEnabled(opts: {
  stagingEmailAuth: boolean;
  viteDev: boolean;
}): boolean {
  return opts.stagingEmailAuth || opts.viteDev;
}

/**
 * Staging builds (`VITE_STAGING_EMAIL_AUTH=true`) or Vite DEV.
 * Production release builds must remain false (staging email flag unset).
 */
export function isOwnerPdfRecoveryDiagBuildEnabled(): boolean {
  return resolveOwnerPdfRecoveryDiagBuildEnabled({
    stagingEmailAuth: isStagingEmailAuthEnabled(),
    viteDev: import.meta.env.DEV === true,
  });
}

export function isOwnerPdfRecoveryDiagOptIn(opts: {
  search: string;
  storage: Pick<Storage, 'getItem'>;
}): boolean {
  return readOwnerPdfRecoveryDiagOptIn(opts);
}

export function isOwnerPdfRecoveryDiagEnabled(opts: {
  search: string;
  storage: Pick<Storage, 'getItem'>;
}): boolean {
  return isOwnerPdfRecoveryDiagBuildEnabled() && isOwnerPdfRecoveryDiagOptIn(opts);
}

/** Persist opt-in when URL contains `?pdfRecoveryDiag=1`. Call once at app boot. */
export function persistOwnerPdfRecoveryDiagFromUrl(
  storage: Pick<Storage, 'setItem'>,
): boolean {
  if (typeof window === 'undefined') return false;
  if (!isOwnerPdfRecoveryDiagBuildEnabled()) return false;
  return persistOwnerPdfRecoveryDiagOptInFromSearch(window.location.search, storage);
}

/**
 * Diagnose recovery ledger availability for the signed-in owner's PDF page.
 * Never returns document text or internal UUIDs.
 */
export async function diagnoseOwnerPdfRecovery(input: {
  sectionId: string;
  sourceObjectId: string;
  pageNumber: number;
}): Promise<OwnerPdfRecoveryDiagResult> {
  if (!isOwnerPdfRecoveryDiagBuildEnabled()) {
    return { ok: false, code: 'disabled' };
  }

  const sectionId = input.sectionId.trim();
  const sourceObjectId = input.sourceObjectId.trim();
  const pageNumber = input.pageNumber;

  if (!sectionId || !sourceObjectId) {
    return { ok: false, code: 'invalid_request' };
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 10000) {
    return { ok: false, code: 'invalid_request' };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) {
    return { ok: false, code: 'unauthenticated' };
  }

  const sourceRes = await table('ai_knowledge_sources')
    .select('id,source_version,retrieval_source_version,source_kind,source_object_id,section_id')
    .eq('section_id', sectionId)
    .eq('source_object_id', sourceObjectId)
    .eq('source_kind', 'free_space_pdf')
    .maybeSingle();

  if (sourceRes.error) {
    return { ok: false, code: 'lookup_error' };
  }

  const source = sourceRes.data as {
    id?: unknown;
    source_version?: unknown;
    retrieval_source_version?: unknown;
    source_kind?: unknown;
    source_object_id?: unknown;
    section_id?: unknown;
  } | null;

  const mappingValid =
    !!source &&
    typeof source.id === 'string' &&
    source.source_kind === 'free_space_pdf' &&
    source.source_object_id === sourceObjectId &&
    source.section_id === sectionId &&
    typeof source.source_version === 'number';

  if (!mappingValid || !source || typeof source.id !== 'string') {
    return {
      ok: true,
      sourceFound: false,
      pageRowFound: false,
      extractionMethod: 'none',
      recoveredTextAvailable: false,
      captureRecoveryUsable: false,
      recoveryJobStatus: 'not_applicable',
      mappingValid: false,
      ...emptyForensicFields(),
      causeHint: 'missing_knowledge_source',
    };
  }

  const versionCandidates: number[] = [source.source_version as number];
  if (
    typeof source.retrieval_source_version === 'number' &&
    source.retrieval_source_version !== source.source_version
  ) {
    versionCandidates.push(source.retrieval_source_version);
  }

  let pageRowFound = false;
  let extractionMethod: 'native' | 'ocr_tesseract' | 'unknown' | 'none' = 'none';
  let recoveredTextAvailable = false;
  let captureRecoveryUsable = false;
  let detectorReasons: OwnerPdfRecoveryDetectorReason[] = [];
  let fallbackResult: OwnerPdfRecoveryFallbackResult = 'unknown';

  for (const version of versionCandidates) {
    const pageRes = await table('ai_knowledge_page_texts')
      .select(
        'page_number,recovered_text,canonical_text,extraction_method,detector_reasons,fallback_result,source_version,source_id,section_id',
      )
      .eq('source_id', source.id)
      .eq('source_version', version)
      .eq('page_number', pageNumber)
      .maybeSingle();

    if (pageRes.error) {
      return { ok: false, code: 'lookup_error' };
    }

    const row = pageRes.data as {
      page_number?: unknown;
      recovered_text?: unknown;
      canonical_text?: unknown;
      extraction_method?: unknown;
      detector_reasons?: unknown;
      fallback_result?: unknown;
      section_id?: unknown;
      source_id?: unknown;
    } | null;

    if (!row) continue;
    if (row.page_number !== pageNumber) continue;
    if (row.section_id !== sectionId) continue;
    if (row.source_id !== source.id) continue;

    pageRowFound = true;
    const method =
      row.extraction_method === 'ocr_tesseract'
        ? 'ocr_tesseract'
        : row.extraction_method === 'native'
          ? 'native'
          : 'unknown';
    extractionMethod = method;

    const hasRecovered = hasNonEmptyString(row.recovered_text);
    recoveredTextAvailable = hasRecovered;

    const usableRecovered = hasUsefulAlphanumericPayload(row.recovered_text);
    const usableOcrCanonical =
      method === 'ocr_tesseract' && hasUsefulAlphanumericPayload(row.canonical_text);
    captureRecoveryUsable = usableRecovered || usableOcrCanonical;

    detectorReasons = sanitizeOwnerPdfRecoveryDetectorReasons(row.detector_reasons);
    fallbackResult = sanitizeOwnerPdfRecoveryFallbackResult(row.fallback_result);
    break;
  }

  // Jobs table: no authenticated SELECT — never probe it (would only yield RLS noise).
  const recoveryJobStatus: OwnerPdfRecoveryJobStatus = 'unavailable_to_client';

  let causeHint: Extract<OwnerPdfRecoveryDiagResult, { ok: true }>['causeHint'];
  if (captureRecoveryUsable) {
    causeHint = 'ready_for_capture_recovery';
  } else if (!pageRowFound) {
    causeHint = 'missing_page_ledger';
  } else if (extractionMethod === 'native' && !recoveredTextAvailable) {
    causeHint = 'native_only_no_ocr_text';
  } else if (recoveredTextAvailable || extractionMethod === 'ocr_tesseract') {
    causeHint = 'ocr_text_present_but_unusable';
  } else {
    causeHint = 'missing_page_ledger';
  }

  return {
    ok: true,
    sourceFound: true,
    pageRowFound,
    extractionMethod,
    recoveredTextAvailable,
    captureRecoveryUsable,
    recoveryJobStatus,
    mappingValid: true,
    detectorReasons: pageRowFound ? detectorReasons : [],
    fallbackResult: pageRowFound ? fallbackResult : 'unknown',
    causeHint,
  };
}
