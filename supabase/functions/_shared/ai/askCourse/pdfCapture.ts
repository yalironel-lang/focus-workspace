import type {
  PdfCaptureAttachment,
  PdfCaptureTextKind,
  PdfTextCaptureAttachment,
  PdfVisualSelectionAttachment,
} from '../requestTypes.ts';
import { isVisualSelectionCapture } from '../requestTypes.ts';
import {
  messageForVisualReject,
  parseVisualSelectionAttachment,
  rawLooksLikeVisualSelection,
  type VisualContractRejectCode,
} from '../visualCapture/visualSelectionContract.ts';

export const MAX_PDF_CAPTURE_CHARS = 4000;

function parseTextKind(raw: unknown): PdfCaptureTextKind | null {
  if (raw === undefined) return 'native_selection';
  if (raw === 'native_selection' || raw === 'native_page' || raw === 'recovered_page') return raw;
  return null;
}

export function parsePdfTextCapture(raw: unknown, sectionId: string): PdfTextCaptureAttachment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  const allowedKeys = ['sourceKind', 'sourceObjectId', 'sectionId', 'pageNumber', 'text', 'textKind'];
  if (Object.keys(a).some((k) => !allowedKeys.includes(k))) return null;

  if (a.sourceKind !== 'free_space_pdf') return null;
  if (typeof a.sectionId !== 'string' || a.sectionId !== sectionId) return null;
  if (typeof a.sourceObjectId !== 'string' || !a.sourceObjectId.trim() || a.sourceObjectId.length > 200) {
    return null;
  }
  if (typeof a.pageNumber !== 'number' || !Number.isInteger(a.pageNumber) || a.pageNumber < 1 || a.pageNumber > 10000) {
    return null;
  }
  if (
    typeof a.text !== 'string' ||
    a.text.length > MAX_PDF_CAPTURE_CHARS ||
    a.text.trim().length < 2 ||
    !/\p{L}|\p{N}/u.test(a.text)
  ) {
    return null;
  }

  const textKind = parseTextKind(a.textKind);
  if (!textKind) return null;

  return {
    sourceKind: 'free_space_pdf',
    sourceObjectId: a.sourceObjectId.trim(),
    sectionId,
    pageNumber: a.pageNumber,
    text: a.text.trim(),
    ...(textKind !== 'native_selection' ? { textKind } : {}),
  };
}

export type ParsePdfCaptureResult =
  | { ok: true; capture: PdfCaptureAttachment }
  | { ok: false; kind: 'text' }
  | { ok: false; kind: 'visual'; code: VisualContractRejectCode };

/**
 * Parse v3 capture: text (legacy keys) or visual_selection (discriminated).
 */
export function parsePdfCaptureResult(raw: unknown, sectionId: string): ParsePdfCaptureResult {
  if (rawLooksLikeVisualSelection(raw)) {
    const visual = parseVisualSelectionAttachment(raw, sectionId);
    if (!visual.ok) return { ok: false, kind: 'visual', code: visual.code };
    return { ok: true, capture: visual.attachment };
  }
  const text = parsePdfTextCapture(raw, sectionId);
  if (!text) return { ok: false, kind: 'text' };
  return { ok: true, capture: text };
}

/** Legacy helper — text-only; returns null for visual (use parsePdfCaptureResult). */
export function parsePdfCapture(raw: unknown, sectionId: string): PdfTextCaptureAttachment | null {
  if (rawLooksLikeVisualSelection(raw)) return null;
  return parsePdfTextCapture(raw, sectionId);
}

export function visualCaptureRejectMessage(code: VisualContractRejectCode): string {
  return messageForVisualReject(code);
}

export type PdfCaptureSource = {
  id: string;
  user_id: string;
  section_id: string;
  object: unknown;
};

export type LoadPdfCaptureSource = (input: {
  userId: string;
  sectionId: string;
  sourceObjectId: string;
}) => Promise<PdfCaptureSource | null>;

export function isOwnedPdfSource(
  row: PdfCaptureSource | null,
  userId: string,
  identity: { sourceObjectId: string; sectionId: string; pageNumber: number },
): boolean {
  if (
    !row ||
    row.id !== identity.sourceObjectId ||
    row.user_id !== userId ||
    row.section_id !== identity.sectionId
  ) {
    return false;
  }
  const obj = row.object as {
    type?: unknown;
    pageCount?: unknown;
    content?: { type?: unknown; pageCount?: unknown };
  } | null;

  if (!obj || typeof obj !== 'object') return false;

  const isPdf =
    obj.type === 'pdf' ||
    (obj.content && typeof obj.content === 'object' && obj.content.type === 'pdf');
  if (!isPdf) return false;

  const pageCount =
    obj.content && typeof obj.content === 'object' && typeof obj.content.pageCount === 'number'
      ? obj.content.pageCount
      : typeof obj.pageCount === 'number'
        ? obj.pageCount
        : null;

  if (typeof pageCount === 'number') {
    return Number.isInteger(pageCount) && identity.pageNumber >= 1 && identity.pageNumber <= pageCount;
  }

  return identity.pageNumber >= 1;
}

export function isOwnedPdfCaptureSource(
  row: PdfCaptureSource | null,
  userId: string,
  capture: PdfCaptureAttachment,
): boolean {
  return isOwnedPdfSource(row, userId, capture);
}

export function captureTextForRetrieval(capture: PdfCaptureAttachment): string | undefined {
  if (isVisualSelectionCapture(capture)) return undefined;
  return capture.text;
}

export type { PdfVisualSelectionAttachment };
