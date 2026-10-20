import type { ActivePdfDocument, DocumentWindowCursor } from '../requestTypes.ts';

const ACTIVE_DOCUMENT_KEYS = ['sourceKind', 'sourceObjectId', 'pageNumber'] as const;

/**
 * Active document is identity only: kind, object id, and visible page.
 * A title, extracted text, or any other field is rejected.
 */
export function parseActivePdfDocument(raw: unknown): ActivePdfDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !(ACTIVE_DOCUMENT_KEYS as readonly string[]).includes(key))) {
    return null;
  }
  if (value.sourceKind !== 'free_space_pdf') return null;
  if (typeof value.sourceObjectId !== 'string') return null;
  const sourceObjectId = value.sourceObjectId.trim();
  if (!sourceObjectId || sourceObjectId.length > 200) return null;
  if (
    typeof value.pageNumber !== 'number' ||
    !Number.isInteger(value.pageNumber) ||
    value.pageNumber < 1 ||
    value.pageNumber > 10000
  ) {
    return null;
  }
  return {
    sourceKind: 'free_space_pdf',
    sourceObjectId,
    pageNumber: value.pageNumber,
  };
}

const CURSOR_KEYS = ['sourceObjectId', 'resumeFromPage'] as const;

export function parseDocumentCursor(raw: unknown): DocumentWindowCursor | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !(CURSOR_KEYS as readonly string[]).includes(key))) return null;
  if (typeof value.sourceObjectId !== 'string') return null;
  const sourceObjectId = value.sourceObjectId.trim();
  if (!sourceObjectId || sourceObjectId.length > 200) return null;
  if (
    typeof value.resumeFromPage !== 'number' ||
    !Number.isInteger(value.resumeFromPage) ||
    value.resumeFromPage < 1 ||
    value.resumeFromPage > 10000
  ) {
    return null;
  }
  return { sourceObjectId, resumeFromPage: value.resumeFromPage };
}
