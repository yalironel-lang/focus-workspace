/**
 * Visual Capture spike — multimodal ask_course attachment contract (local prototype).
 *
 * Text-only capture remains unchanged. Visual attachments are a separate
 * discriminated path with dedicated size budgets (not a global 64 KiB raise).
 */

import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import { isInvalidCaptureRegionGeometry } from '../tutor/captureRegionDiagnostics';
import {
  isKnownVisionCapableChatModel,
  routeVisionModel,
} from './visionModelCompatibility';

/** Existing text capture kinds (unchanged). */
export type PdfCaptureTextKindV1 = 'native_selection' | 'native_page' | 'recovered_page';

/** New visual kind — never relabeled as native or OCR. */
export type PdfCaptureVisualKind = 'visual_selection';

export const VISUAL_SELECTION_MIME_ALLOWLIST = ['image/jpeg', 'image/png'] as const;
export type VisualSelectionMime = (typeof VISUAL_SELECTION_MIME_ALLOWLIST)[number];

/** Dedicated visual ask body budget — does not replace MAX_REQUEST_BODY_BYTES for text. */
export const MAX_ASK_COURSE_VISUAL_BODY_BYTES = 512 * 1024;

/** Max JPEG payload for one visual_selection image. */
export const MAX_VISUAL_SELECTION_IMAGE_BYTES = 400 * 1024;

/** Max long edge in pixels after encode. */
export const MAX_VISUAL_SELECTION_LONG_EDGE_PX = 1600;

/** Exactly one image per visual ask in V1. */
export const MAX_VISUAL_SELECTION_IMAGES = 1;

/** Provenance tier for visual PDF selection. */
export const KNOWLEDGE_TIER_PDF_SELECTION_VISUAL = 'pdf_selection_visual' as const;

/** Citation marker for visual grounding. */
export const PDF_VISUAL_SELECTION_MARKER = '[PDF visual selection]';

export type VisualSelectionAttachment = {
  sourceKind: 'free_space_pdf';
  sourceObjectId: string;
  sectionId: string;
  pageNumber: number;
  regionNorm: NormalizedPageRegion;
  attachmentType: 'visual_selection';
  textKind: PdfCaptureVisualKind;
  /** image/jpeg only in V1 */
  mime: VisualSelectionMime;
  /** Raw JPEG bytes (not base64) for size accounting */
  imageBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  /**
   * Explicit confirmation flag — Gateway rejects if false/omitted.
   * Client must set true only after user confirms visual processing.
   */
  userConfirmedVisual: true;
};

export type TextCaptureAttachment = {
  sourceKind: 'free_space_pdf';
  sourceObjectId: string;
  sectionId: string;
  pageNumber: number;
  text: string;
  textKind?: PdfCaptureTextKindV1;
};

export type AskCourseCaptureAttachment = TextCaptureAttachment | VisualSelectionAttachment;

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
  | 'model_not_vision_capable'
  | 'model_vision_unconfirmed'
  | 'model_not_configured'
  | 'visual_body_too_large'
  | 'unauthorized_identity';

export type VisualContractResult =
  | { ok: true; attachment: VisualSelectionAttachment; estimatedBodyBytes: number }
  | { ok: false; code: VisualContractRejectCode };

function isJpegMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Validate a visual_selection attachment for Gateway intake (prototype).
 * Does not prove the pixels came from the PDF — see security review.
 */
export function parseVisualSelectionAttachment(
  raw: unknown,
  expectedSectionId: string,
  opts?: { configuredModel?: string; visionModelOverride?: string | null },
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
  if (isInvalidCaptureRegionGeometry(regionNorm)) {
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
  if (a.imageBytes instanceof Uint8Array) {
    imageBytes = a.imageBytes;
  } else if (typeof a.imageBase64 === 'string') {
    try {
      const bin = atob(a.imageBase64);
      imageBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch {
      return { ok: false, code: 'invalid_mime' };
    }
  }
  if (!imageBytes) return { ok: false, code: 'invalid_shape' };
  if (imageBytes.byteLength < 32 || imageBytes.byteLength > MAX_VISUAL_SELECTION_IMAGE_BYTES) {
    return { ok: false, code: 'image_too_large' };
  }
  if (!isJpegMagic(imageBytes)) return { ok: false, code: 'invalid_mime' };

  // V1: single image implied by one attachment; reject if client sends arrays.
  if (Array.isArray(a.images) && a.images.length > MAX_VISUAL_SELECTION_IMAGES) {
    return { ok: false, code: 'too_many_images' };
  }

  if (opts?.configuredModel !== undefined) {
    const route = routeVisionModel({
      configuredModel: opts.configuredModel,
      visionModelOverride: opts.visionModelOverride,
    });
    if (!route.ok) return { ok: false, code: route.code };
  }

  const attachment: VisualSelectionAttachment = {
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

/** Ownership identity — same shape as text capture; does not prove pixel origin. */
export type VisualCaptureIdentity = {
  userId: string;
  sectionId: string;
  sourceObjectId: string;
  pageNumber: number;
};

export function assertVisualOwnershipIdentity(input: {
  authUserId: string;
  row: { id: string; user_id: string; section_id: string } | null;
  capture: VisualCaptureIdentity;
}): { ok: true } | { ok: false; code: 'unauthorized_identity' } {
  const row = input.row;
  if (
    !row ||
    row.id !== input.capture.sourceObjectId ||
    row.user_id !== input.authUserId ||
    row.section_id !== input.capture.sectionId ||
    row.user_id !== input.capture.userId
  ) {
    return { ok: false, code: 'unauthorized_identity' };
  }
  return { ok: true };
}

export function isTextOnlyCapture(att: AskCourseCaptureAttachment): att is TextCaptureAttachment {
  return !('attachmentType' in att && att.attachmentType === 'visual_selection');
}

export function requireVisionModelOrReject(model: string): VisualContractResult | { ok: true } {
  if (isKnownVisionCapableChatModel(model)) return { ok: true };
  const route = routeVisionModel({ configuredModel: model });
  if (route.ok) return { ok: true };
  return { ok: false, code: route.code };
}
