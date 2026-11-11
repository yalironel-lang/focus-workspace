/**
 * Visual Capture V1 — Gateway attachment contract (Edge).
 * Dedicated size budgets; does not raise global MAX_REQUEST_BODY_BYTES for text.
 */

export type NormalizedPageRegion = { x: number; y: number; w: number; h: number };

export const VISUAL_SELECTION_MIME_ALLOWLIST = ['image/jpeg', 'image/png'] as const;
export type VisualSelectionMime = (typeof VISUAL_SELECTION_MIME_ALLOWLIST)[number];

export const MAX_ASK_COURSE_VISUAL_BODY_BYTES = 512 * 1024;
export const MAX_VISUAL_SELECTION_IMAGE_BYTES = 400 * 1024;
export const MAX_VISUAL_SELECTION_LONG_EDGE_PX = 1600;
export const MAX_VISUAL_SELECTION_IMAGES = 1;

export const KNOWLEDGE_TIER_PDF_SELECTION_VISUAL = 'pdf_selection_visual' as const;
export const PDF_VISUAL_SELECTION_MARKER = '[PDF visual selection]';

export type PdfCaptureVisualKind = 'visual_selection';

export type PdfVisualSelectionAttachment = {
  sourceKind: 'free_space_pdf';
  sourceObjectId: string;
  sectionId: string;
  pageNumber: number;
  regionNorm: NormalizedPageRegion;
  attachmentType: 'visual_selection';
  textKind: PdfCaptureVisualKind;
  mime: VisualSelectionMime;
  /** Decoded JPEG bytes — never logged. */
  imageBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  userConfirmedVisual: true;
};

export type VisualContractRejectCode =
  | 'invalid_shape'
  | 'invalid_mime'
  | 'invalid_dimensions'
  | 'image_too_large'
  | 'too_many_images'
  | 'invalid_region'
  | 'invalid_page'
  | 'missing_confirmation'
  | 'section_mismatch'
  | 'visual_body_too_large';

export type VisualContractResult =
  | { ok: true; attachment: PdfVisualSelectionAttachment; estimatedBodyBytes: number }
  | { ok: false; code: VisualContractRejectCode };

function isInvalidRegionGeometry(region: NormalizedPageRegion): boolean {
  const { x, y, w, h } = region;
  if (![x, y, w, h].every(Number.isFinite)) return true;
  if (w <= 0 || h <= 0) return true;
  if (w > 2 || h > 2) return true;
  return false;
}

/** Validate bounded JPEG marker structure before forwarding untrusted bytes. */
function isJpegMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
  let offset = 2;
  let frame = false;
  let scan = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) return frame && scan && offset === bytes.length;
    if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) return false;
    if (offset + 2 > bytes.length) return false;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 11 || bytes[offset + 2] !== 8) return false;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (!width || !height || Math.max(width, height) > MAX_VISUAL_SELECTION_LONG_EDGE_PX) return false;
      if (length !== 8 + 3 * bytes[offset + 7]) return false;
      frame = true;
    }
    if (marker === 0xda) {
      if (!frame || length < 6 || length !== 6 + 2 * bytes[offset + 2]) return false;
      scan = true;
      offset += length;
      const start = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        break;
      }
      if (offset === start) return false;
    } else {
      offset += length;
    }
  }
  return false;
}

function decodeBase64Jpeg(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function isPngMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 24) return false;
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return false;
  }
  if (
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return false;
  }
  const width =
    ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const height =
    ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  if (!width || !height || Math.max(width, height) > MAX_VISUAL_SELECTION_LONG_EDGE_PX * 2) {
    return false;
  }
  return true;
}

/** True when raw capture object claims visual_selection (before full validation). */
export function rawLooksLikeVisualSelection(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const a = raw as Record<string, unknown>;
  return a.attachmentType === 'visual_selection' || a.textKind === 'visual_selection';
}

export function parseVisualSelectionAttachment(
  raw: unknown,
  expectedSectionId: string,
): VisualContractResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'invalid_shape' };
  }
  const a = raw as Record<string, unknown>;

  if (a.attachmentType !== 'visual_selection' || a.textKind !== 'visual_selection') {
    return { ok: false, code: 'invalid_shape' };
  }
  if (a.sourceKind !== 'free_space_pdf') return { ok: false, code: 'invalid_shape' };
  if (a.userConfirmedVisual !== true) return { ok: false, code: 'missing_confirmation' };

  if (typeof a.sectionId !== 'string' || a.sectionId !== expectedSectionId) {
    return { ok: false, code: 'section_mismatch' };
  }
  if (typeof a.sourceObjectId !== 'string' || !a.sourceObjectId.trim() || a.sourceObjectId.length > 200) {
    return { ok: false, code: 'invalid_shape' };
  }
  if (
    typeof a.pageNumber !== 'number' ||
    !Number.isInteger(a.pageNumber) ||
    a.pageNumber < 1 ||
    a.pageNumber > 10000
  ) {
    return { ok: false, code: 'invalid_page' };
  }

  const region = a.regionNorm as Record<string, unknown> | undefined;
  if (
    !region ||
    typeof region.x !== 'number' ||
    typeof region.y !== 'number' ||
    typeof region.w !== 'number' ||
    typeof region.h !== 'number'
  ) {
    return { ok: false, code: 'invalid_region' };
  }
  const regionNorm: NormalizedPageRegion = {
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
  };
  if (isInvalidRegionGeometry(regionNorm)) {
    return { ok: false, code: 'invalid_region' };
  }

  if (!VISUAL_SELECTION_MIME_ALLOWLIST.includes(a.mime as VisualSelectionMime)) {
    return { ok: false, code: 'invalid_mime' };
  }

  const widthPx = a.widthPx;
  const heightPx = a.heightPx;
  if (
    typeof widthPx !== 'number' ||
    typeof heightPx !== 'number' ||
    !Number.isInteger(widthPx) ||
    !Number.isInteger(heightPx) ||
    widthPx < 8 ||
    heightPx < 8 ||
    widthPx > MAX_VISUAL_SELECTION_LONG_EDGE_PX * 2 ||
    heightPx > MAX_VISUAL_SELECTION_LONG_EDGE_PX * 2
  ) {
    return { ok: false, code: 'invalid_dimensions' };
  }
  if (Math.max(widthPx, heightPx) > MAX_VISUAL_SELECTION_LONG_EDGE_PX) {
    return { ok: false, code: 'invalid_dimensions' };
  }

  let imageBytes: Uint8Array | null = null;
  if (typeof a.imageBase64 === 'string') {
    imageBytes = decodeBase64Jpeg(a.imageBase64);
    if (!imageBytes) return { ok: false, code: 'invalid_mime' };
  }
  if (!imageBytes) return { ok: false, code: 'invalid_shape' };
  if (imageBytes.byteLength < 32 || imageBytes.byteLength > MAX_VISUAL_SELECTION_IMAGE_BYTES) {
    return { ok: false, code: 'image_too_large' };
  }
  if (a.mime === 'image/jpeg') {
    if (!isJpegMagic(imageBytes)) return { ok: false, code: 'invalid_mime' };
  } else if (a.mime === 'image/png') {
    if (!isPngMagic(imageBytes)) return { ok: false, code: 'invalid_mime' };
  } else {
    return { ok: false, code: 'invalid_mime' };
  }

  if (Array.isArray(a.images) && a.images.length > MAX_VISUAL_SELECTION_IMAGES) {
    return { ok: false, code: 'too_many_images' };
  }

  const attachment: PdfVisualSelectionAttachment = {
    sourceKind: 'free_space_pdf',
    sourceObjectId: a.sourceObjectId.trim(),
    sectionId: expectedSectionId,
    pageNumber: a.pageNumber,
    regionNorm,
    attachmentType: 'visual_selection',
    textKind: 'visual_selection',
    mime: a.mime as VisualSelectionMime,
    imageBytes,
    widthPx,
    heightPx,
    userConfirmedVisual: true,
  };

  // Wire Base64 expansion is ceil(imageBytes * 4 / 3), plus minimal JSON envelope overhead (512 bytes).
  const base64Len = typeof (a as { imageBase64?: unknown }).imageBase64 === 'string'
    ? (a as { imageBase64: string }).imageBase64.length
    : Math.ceil((imageBytes.byteLength * 4) / 3);
  const estimatedBodyBytes = base64Len + 512;
  if (estimatedBodyBytes > MAX_ASK_COURSE_VISUAL_BODY_BYTES) {
    return { ok: false, code: 'visual_body_too_large' };
  }

  return { ok: true, attachment, estimatedBodyBytes };
}

export function messageForVisualReject(code: VisualContractRejectCode): string {
  switch (code) {
    case 'missing_confirmation':
      return 'Visual understanding requires explicit confirmation.';
    case 'invalid_mime':
    case 'invalid_dimensions':
    case 'image_too_large':
    case 'visual_body_too_large':
    case 'too_many_images':
      return 'The visual selection image is invalid or too large.';
    case 'invalid_region':
    case 'invalid_page':
      return 'The visual selection region is invalid.';
    case 'section_mismatch':
      return 'PDF selection is invalid for this course.';
    default:
      return 'Visual selection is invalid.';
  }
}

/** Body may exceed text limit only when it appears to be a visual ask. */
export function allowVisualSizedGatewayBody(rawText: string): boolean {
  try {
    const body = JSON.parse(rawText);
    if (!body || body.capability !== 'ask_course' || body.version !== 3 ||
        typeof body.sectionId !== 'string') return false;
    return parseVisualSelectionAttachment(body.capture, body.sectionId.trim()).ok;
  } catch {
    return false;
  }
}
