import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const fromMock = vi.fn();

vi.mock('../../supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { fetchRecoveredPdfPageText } from './fetchRecoveredPdfPageText';

function chainResult(data: unknown, error: unknown = null) {
  const api: Record<string, unknown> = {};
  api.select = () => api;
  api.eq = () => api;
  api.maybeSingle = async () => ({ data, error });
  return api;
}

describe('fetchRecoveredPdfPageText', () => {
  beforeEach(() => {
    getSession.mockReset();
    fromMock.mockReset();
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  });

  it('rejects unauthenticated callers', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const res = await fetchRecoveredPdfPageText({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 2,
    });
    expect(res).toEqual({ ok: false, code: 'unauthenticated' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects invalid page mapping', async () => {
    const res = await fetchRecoveredPdfPageText({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 0,
    });
    expect(res).toEqual({ ok: false, code: 'invalid_request' });
  });

  it('returns source_not_found when knowledge source is missing', async () => {
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe('ai_knowledge_sources');
      return chainResult(null);
    });
    const res = await fetchRecoveredPdfPageText({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 3,
    });
    expect(res).toEqual({ ok: false, code: 'source_not_found' });
  });

  it('returns authorized recovered page text for exact PDF/page', async () => {
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
        page_number: 3,
        recovered_text: 'Mean Value Theorem recovered page text with f(c).',
        canonical_text: 'Mean Value Theorem recovered page text with f(c).',
        extraction_method: 'ocr_tesseract',
        source_version: 2,
        source_id: 'src-1',
        section_id: 'sec-1',
      });
    });

    const res = await fetchRecoveredPdfPageText({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 3,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pageNumber).toBe(3);
    expect(res.sourceObjectId).toBe('pdf-1');
    expect(res.sectionId).toBe('sec-1');
    expect(res.extractionMethod).toBe('ocr_tesseract');
    expect(res.text).toContain('Mean Value Theorem');
  });

  it('returns no_recovered_text when ledger exists without OCR', async () => {
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
        canonical_text: 'thin native',
        extraction_method: 'native',
        source_version: 1,
        source_id: 'src-1',
        section_id: 'sec-1',
      });
    });

    const res = await fetchRecoveredPdfPageText({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
    });
    expect(res).toEqual({ ok: false, code: 'no_recovered_text' });
  });

  it('rejects mismatched source_object_id on source row', async () => {
    fromMock.mockImplementation(() =>
      chainResult({
        id: 'src-1',
        source_version: 1,
        retrieval_source_version: 1,
        source_kind: 'free_space_pdf',
        source_object_id: 'other-pdf',
        section_id: 'sec-1',
      }),
    );
    const res = await fetchRecoveredPdfPageText({
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-1',
      pageNumber: 1,
    });
    expect(res).toEqual({ ok: false, code: 'source_not_found' });
  });
});
