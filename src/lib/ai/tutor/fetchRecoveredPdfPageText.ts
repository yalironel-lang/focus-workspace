/**
 * Capture Recovery Bridge V1 — RLS-bound lookup of recovered page text.
 *
 * Uses authenticated anon client only (never service role).
 * Mapping: free_space PDF object id → ai_knowledge_sources.source_object_id
 *          → ai_knowledge_page_texts (exact page_number).
 */

import { supabase } from '../../supabase';
import { isUsefulTutorExtractedText } from './tutorCaptureClassifier';

export const RECOVERED_PAGE_TEXT_MAX_CHARS = 4000;

export type RecoveredPdfPageTextResult =
  | {
      ok: true;
      text: string;
      pageNumber: number;
      sourceObjectId: string;
      sectionId: string;
      extractionMethod: 'ocr_tesseract' | 'native';
      truncated: boolean;
    }
  | {
      ok: false;
      code:
        | 'unauthenticated'
        | 'invalid_request'
        | 'source_not_found'
        | 'page_not_found'
        | 'no_recovered_text'
        | 'query_failed';
    };

type QueryResult = { data: unknown; error: { message?: string } | null };

/** Minimal untyped PostgREST seam (tables not always in generated Database types). */
type UntypedTable = {
  select: (cols: string) => UntypedFilter;
};

type UntypedFilter = {
  eq: (col: string, val: string | number) => UntypedFilter;
  maybeSingle: () => PromiseLike<QueryResult>;
};

function table(name: string): UntypedTable {
  return (supabase as unknown as { from: (relation: string) => UntypedTable }).from(name);
}

function clampPageText(raw: string): { text: string; truncated: boolean } {
  const trimmed = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (trimmed.length <= RECOVERED_PAGE_TEXT_MAX_CHARS) {
    return { text: trimmed, truncated: false };
  }
  return {
    text: trimmed.slice(0, RECOVERED_PAGE_TEXT_MAX_CHARS).trimEnd(),
    truncated: true,
  };
}

function pickRecoveredText(row: {
  recovered_text: string | null;
  canonical_text: string;
  extraction_method: string;
}): { text: string; extractionMethod: 'ocr_tesseract' | 'native' } | null {
  const recovered =
    typeof row.recovered_text === 'string' && row.recovered_text.trim()
      ? row.recovered_text
      : null;
  if (recovered) {
    return { text: recovered, extractionMethod: 'ocr_tesseract' };
  }
  if (
    row.extraction_method === 'ocr_tesseract' &&
    typeof row.canonical_text === 'string' &&
    row.canonical_text.trim()
  ) {
    return { text: row.canonical_text, extractionMethod: 'ocr_tesseract' };
  }
  return null;
}

/**
 * Load recovered/OCR page text for an owned Free Space PDF page.
 * Never returns another user's content (RLS + explicit section/object filters).
 */
export async function fetchRecoveredPdfPageText(input: {
  sectionId: string;
  sourceObjectId: string;
  pageNumber: number;
}): Promise<RecoveredPdfPageTextResult> {
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
    return { ok: false, code: 'query_failed' };
  }
  const source = sourceRes.data as {
    id?: unknown;
    source_version?: unknown;
    retrieval_source_version?: unknown;
    source_kind?: unknown;
    source_object_id?: unknown;
    section_id?: unknown;
  } | null;

  if (
    !source ||
    typeof source.id !== 'string' ||
    source.source_kind !== 'free_space_pdf' ||
    source.source_object_id !== sourceObjectId ||
    source.section_id !== sectionId ||
    typeof source.source_version !== 'number'
  ) {
    return { ok: false, code: 'source_not_found' };
  }

  const versionCandidates: number[] = [source.source_version];
  if (
    typeof source.retrieval_source_version === 'number' &&
    source.retrieval_source_version !== source.source_version
  ) {
    versionCandidates.push(source.retrieval_source_version);
  }

  let tipRowSeen = false;

  for (const version of versionCandidates) {
    const pageRes = await table('ai_knowledge_page_texts')
      .select(
        'page_number,recovered_text,canonical_text,extraction_method,source_version,source_id,section_id',
      )
      .eq('source_id', source.id)
      .eq('source_version', version)
      .eq('page_number', pageNumber)
      .maybeSingle();

    if (pageRes.error) {
      return { ok: false, code: 'query_failed' };
    }
    const row = pageRes.data as {
      page_number?: unknown;
      recovered_text?: unknown;
      canonical_text?: unknown;
      extraction_method?: unknown;
      section_id?: unknown;
      source_id?: unknown;
    } | null;

    if (!row) continue;
    if (version === source.source_version) tipRowSeen = true;
    if (row.page_number !== pageNumber) continue;
    if (row.section_id !== sectionId) continue;
    if (row.source_id !== source.id) continue;

    const recovered = pickRecoveredText({
      recovered_text: typeof row.recovered_text === 'string' ? row.recovered_text : null,
      canonical_text: typeof row.canonical_text === 'string' ? row.canonical_text : '',
      extraction_method:
        typeof row.extraction_method === 'string' ? row.extraction_method : 'native',
    });
    if (!recovered) continue;

    const { text, truncated } = clampPageText(recovered.text);
    if (!isUsefulTutorExtractedText(text)) {
      continue;
    }

    return {
      ok: true,
      text,
      pageNumber,
      sourceObjectId,
      sectionId,
      extractionMethod: recovered.extractionMethod,
      truncated,
    };
  }

  return { ok: false, code: tipRowSeen ? 'no_recovered_text' : 'page_not_found' };
}
