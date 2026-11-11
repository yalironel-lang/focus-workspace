import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const fromMock = vi.fn();

vi.mock('../../supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('../../auth/stagingEmailAuthFlag', () => ({
  isStagingEmailAuthEnabled: () => true,
}));

import {
  diagnoseOwnerPdfRecovery,
  isOwnerPdfRecoveryDiagEnabled,
  isOwnerPdfRecoveryDiagOptIn,
  PDF_RECOVERY_DIAG_STORAGE_KEY,
  resolveOwnerPdfRecoveryDiagBuildEnabled,
  sanitizeOwnerPdfRecoveryDetectorReasons,
  sanitizeOwnerPdfRecoveryFallbackResult,
} from './diagnoseOwnerPdfRecovery';

function chainResult(data: unknown, error: unknown = null) {
  const api: Record<string, unknown> = {};
  api.select = () => api;
  api.eq = () => api;
  api.maybeSingle = async () => ({ data, error });
  return api;
}

/** Assert result never carries document text / UUIDs / paths. */
function assertSafePayload(value: unknown): void {
  const json = JSON.stringify(value);
  expect(json).not.toMatch(/Mean Value|exam content|storage\/|eyJ|Bearer /i);
  expect(json).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
}

describe('owner PDF recovery diagnostic gates', () => {
  it('excludes Production builds (no staging email auth, not Vite DEV)', () => {
    expect(
      resolveOwnerPdfRecoveryDiagBuildEnabled({
        stagingEmailAuth: false,
        viteDev: false,
      }),
    ).toBe(false);
    expect(
      resolveOwnerPdfRecoveryDiagBuildEnabled({
        stagingEmailAuth: true,
        viteDev: false,
      }),
    ).toBe(true);
  });

  it('requires explicit opt-in even on staging builds', () => {
    expect(
      isOwnerPdfRecoveryDiagOptIn({
        search: '',
        storage: { getItem: () => null },
      }),
    ).toBe(false);
    expect(
      isOwnerPdfRecoveryDiagOptIn({
        search: '?pdfRecoveryDiag=1',
        storage: { getItem: () => null },
      }),
    ).toBe(true);
    expect(
      isOwnerPdfRecoveryDiagEnabled({
        search: '',
        storage: { getItem: (k) => (k === PDF_RECOVERY_DIAG_STORAGE_KEY ? '1' : null) },
      }),
    ).toBe(true);
  });

  it('allowlists detector reasons and drops unexpected values', () => {
    expect(
      sanitizeOwnerPdfRecoveryDetectorReasons([
        'SPARSE_TEXT',
        'Mean Value Theorem secret',
        'LOW_TEXT_ITEM_COUNT',
        'SPARSE_TEXT',
        42,
        null,
      ]),
    ).toEqual(['LOW_TEXT_ITEM_COUNT', 'SPARSE_TEXT']);
    expect(sanitizeOwnerPdfRecoveryDetectorReasons('not-an-array')).toEqual([]);
  });

  it('maps missing/unexpected fallback_result to unknown', () => {
    expect(sanitizeOwnerPdfRecoveryFallbackResult(null)).toBe('unknown');
    expect(sanitizeOwnerPdfRecoveryFallbackResult(undefined)).toBe('unknown');
    expect(sanitizeOwnerPdfRecoveryFallbackResult('none')).toBe('none');
    expect(sanitizeOwnerPdfRecoveryFallbackResult('native_after_ocr_failed')).toBe(
      'native_after_ocr_failed',
    );
    expect(sanitizeOwnerPdfRecoveryFallbackResult('weird')).toBe('unknown');
  });
});

describe('diagnoseOwnerPdfRecovery', () => {
  beforeEach(() => {
    getSession.mockReset();
    fromMock.mockReset();
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  });

  it('rejects unauthenticated callers without querying tables', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const res = await diagnoseOwnerPdfRecovery({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
    });
    expect(res).toEqual({ ok: false, code: 'unauthenticated' });
    expect(fromMock).not.toHaveBeenCalled();
    assertSafePayload(res);
  });

  it('reports missing source without leaking foreign-row details', async () => {
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe('ai_knowledge_sources');
      return chainResult(null);
    });
    const res = await diagnoseOwnerPdfRecovery({
      sectionId: 'other-user-section',
      sourceObjectId: 'other-user-pdf',
      pageNumber: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sourceFound).toBe(false);
    expect(res.pageRowFound).toBe(false);
    expect(res.mappingValid).toBe(false);
    expect(res.recoveredTextAvailable).toBe(false);
    expect(res.causeHint).toBe('missing_knowledge_source');
    expect(res.detectorReasons).toEqual([]);
    expect(res.fallbackResult).toBe('unknown');
    expect(fromMock).not.toHaveBeenCalledWith('ai_knowledge_page_recovery_jobs');
    assertSafePayload(res);
  });

  it('treats RLS/query errors as opaque lookup_error', async () => {
    fromMock.mockImplementation(() =>
      chainResult(null, { message: 'permission denied for table ai_knowledge_sources', code: '42501' }),
    );
    const res = await diagnoseOwnerPdfRecovery({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
    });
    expect(res).toEqual({ ok: false, code: 'lookup_error' });
    assertSafePayload(res);
  });

  it('classifies native-only page ledger without exposing text', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'ai_knowledge_sources') {
        return chainResult({
          id: 'src-1',
          source_version: 1,
          retrieval_source_version: 1,
          source_kind: 'free_space_pdf',
          source_object_id: 'pdf-1',
          section_id: 'sec-1',
        });
      }
      return chainResult({
        page_number: 1,
        recovered_text: null,
        canonical_text: 'Native exam glyphs only — Mean Value Theorem secret.',
        extraction_method: 'native',
        detector_reasons: ['SPARSE_TEXT', 'INJECTED_SECRET_REASON', 'SHELL_WITH_MISSING_CONTENT'],
        fallback_result: 'none',
        source_version: 1,
        source_id: 'src-1',
        section_id: 'sec-1',
      });
    });

    const res = await diagnoseOwnerPdfRecovery({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res).toMatchObject({
      sourceFound: true,
      pageRowFound: true,
      extractionMethod: 'native',
      recoveredTextAvailable: false,
      captureRecoveryUsable: false,
      recoveryJobStatus: 'unavailable_to_client',
      mappingValid: true,
      causeHint: 'native_only_no_ocr_text',
      detectorReasons: ['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT'],
      fallbackResult: 'none',
    });
    assertSafePayload(res);
    expect(JSON.stringify(res)).not.toContain('Mean Value');
    expect(JSON.stringify(res)).not.toContain('INJECTED_SECRET_REASON');
    expect(fromMock.mock.calls.map((c) => c[0])).not.toContain(
      'ai_knowledge_page_recovery_jobs',
    );
  });

  it('maps null fallback_result to unknown and never queries jobs', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'ai_knowledge_sources') {
        return chainResult({
          id: 'src-1',
          source_version: 1,
          retrieval_source_version: 1,
          source_kind: 'free_space_pdf',
          source_object_id: 'pdf-1',
          section_id: 'sec-1',
        });
      }
      return chainResult({
        page_number: 1,
        recovered_text: null,
        canonical_text: '',
        extraction_method: 'native',
        detector_reasons: [],
        fallback_result: null,
        source_version: 1,
        source_id: 'src-1',
        section_id: 'sec-1',
      });
    });
    const res = await diagnoseOwnerPdfRecovery({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fallbackResult).toBe('unknown');
    expect(res.detectorReasons).toEqual([]);
    assertSafePayload(res);
  });

  it('reports usable OCR recovery statuses only', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'ai_knowledge_sources') {
        return chainResult({
          id: 'src-1',
          source_version: 2,
          retrieval_source_version: 2,
          source_kind: 'free_space_pdf',
          source_object_id: 'pdf-1',
          section_id: 'sec-1',
        });
      }
      return chainResult({
        page_number: 1,
        recovered_text: 'Recovered OCR page body with enough letters 123.',
        canonical_text: 'Recovered OCR page body with enough letters 123.',
        extraction_method: 'ocr_tesseract',
        detector_reasons: ['LOW_TEXT_ITEM_COUNT'],
        fallback_result: 'none',
        source_version: 2,
        source_id: 'src-1',
        section_id: 'sec-1',
      });
    });

    const res = await diagnoseOwnerPdfRecovery({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.recoveredTextAvailable).toBe(true);
    expect(res.captureRecoveryUsable).toBe(true);
    expect(res.causeHint).toBe('ready_for_capture_recovery');
    expect(res.detectorReasons).toEqual(['LOW_TEXT_ITEM_COUNT']);
    expect(res.fallbackResult).toBe('none');
    assertSafePayload(res);
    expect(JSON.stringify(res)).not.toContain('Recovered OCR');
  });

  it('reports missing page ledger when source exists without page row', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'ai_knowledge_sources') {
        return chainResult({
          id: 'src-1',
          source_version: 1,
          retrieval_source_version: 1,
          source_kind: 'free_space_pdf',
          source_object_id: 'pdf-1',
          section_id: 'sec-1',
        });
      }
      return chainResult(null);
    });
    const res = await diagnoseOwnerPdfRecovery({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.causeHint).toBe('missing_page_ledger');
    expect(res.pageRowFound).toBe(false);
    expect(res.detectorReasons).toEqual([]);
    expect(res.fallbackResult).toBe('unknown');
    assertSafePayload(res);
  });
});
