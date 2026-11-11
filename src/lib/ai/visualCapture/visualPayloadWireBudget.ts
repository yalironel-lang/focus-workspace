/**
 * Dynamic wire-budget calculator and bounded payload safety adapter for Visual Capture.
 *
 * Guarantees that multimodal ask_course requests strictly fit within the
 * MAX_ASK_COURSE_VISUAL_BODY_BYTES (512 KiB) wire limit across all variable
 * payload components: prompt text, multi-turn conversation history (recentTurns),
 * document cursor/metadata, and base64-expanded visual selections.
 */

import {
  MAX_ASK_COURSE_VISUAL_BODY_BYTES,
  MAX_VISUAL_SELECTION_IMAGE_BYTES,
} from './visualSelectionContract';
import {
  isVisualSelectionCapture,
  type ZikukAiAskCourseRequest,
  type ZikukAiAskCourseRequestV3,
} from '../gatewayClient/types';

export type WireBudgetCalculation = {
  fits: boolean;
  currentTotalBodyBytes: number;
  envelopeBytes: number;
  maxAllowedBase64Chars: number;
  maxRawImageBytes: number;
  deficitBytes: number;
};

/** Safety headroom in bytes for JSON formatting and transport overhead. */
export const WIRE_BUDGET_SAFETY_MARGIN_BYTES = 64;

/**
 * Accurately calculate the exact wire byte budget available for the base64 image
 * in a given ask_course request, accounting for all non-image components.
 */
export function calculateVisualRequestWireBudget(
  request: ZikukAiAskCourseRequest,
  maxWireBytes: number = MAX_ASK_COURSE_VISUAL_BODY_BYTES,
): WireBudgetCalculation {
  if (request.version !== 3 || !request.capture || !isVisualSelectionCapture(request.capture)) {
    const json = JSON.stringify(request);
    const bytes = new TextEncoder().encode(json).byteLength;
    return {
      fits: bytes <= maxWireBytes,
      currentTotalBodyBytes: bytes,
      envelopeBytes: bytes,
      maxAllowedBase64Chars: 0,
      maxRawImageBytes: 0,
      deficitBytes: Math.max(0, bytes - maxWireBytes),
    };
  }

  const capture = request.capture;

  // Clone request with empty imageBase64 to measure exact JSON envelope size
  const envelopeReq = {
    ...request,
    capture: {
      ...capture,
      imageBase64: '',
    },
  };
  const envelopeJson = JSON.stringify(envelopeReq);
  const envelopeBytes = new TextEncoder().encode(envelopeJson).byteLength;

  // In JSON, `"imageBase64":""` is replaced by `"imageBase64":"<ascii-chars>"`.
  // Because base64 chars are 1-byte ASCII in UTF-8, each char adds exactly 1 byte.
  const currentBase64Chars = typeof capture.imageBase64 === 'string'
    ? capture.imageBase64.length
    : 0;

  const currentTotalBodyBytes = envelopeBytes + currentBase64Chars;
  const maxAllowedBase64Chars = Math.max(
    0,
    maxWireBytes - envelopeBytes - WIRE_BUDGET_SAFETY_MARGIN_BYTES,
  );
  // Base64 expands binary bytes by 4/3: ceil(B / 3) * 4. Inverting gives floor(Chars * 3 / 4).
  const maxRawImageBytes = Math.min(
    MAX_VISUAL_SELECTION_IMAGE_BYTES,
    Math.floor((maxAllowedBase64Chars * 3) / 4),
  );

  const fits = currentTotalBodyBytes <= maxWireBytes;
  const deficitBytes = fits ? 0 : currentTotalBodyBytes - maxWireBytes;

  return {
    fits,
    currentTotalBodyBytes,
    envelopeBytes,
    maxAllowedBase64Chars,
    maxRawImageBytes,
    deficitBytes,
  };
}

export type FitVisualRequestResult =
  | {
      ok: true;
      request: ZikukAiAskCourseRequest;
      bodyBytes: number;
      recompressed: boolean;
    }
  | {
      ok: false;
      code: 'context_too_large' | 'recompress_failed';
      message: string;
      bodyBytes?: number;
    };

function dataUrlToBase64(dataUrl: string): { mime: 'image/png' | 'image/jpeg'; base64: string } | null {
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/i.exec(dataUrl);
  if (!m?.[1] || !m?.[2]) return null;
  return { mime: m[1].toLowerCase() as 'image/png' | 'image/jpeg', base64: m[2] };
}

/**
 * In-browser bounded image recompression helper.
 * Takes an existing base64 image and recompresses it to fit targetRawBytes.
 * Tries JPEG quality steps and bounded downscale.
 */
async function recompressBase64Image(input: {
  imageBase64: string;
  mime: 'image/jpeg' | 'image/png';
  widthPx: number;
  heightPx: number;
  targetRawBytes: number;
  targetMaxBase64Chars: number;
}): Promise<{
  ok: true;
  mime: 'image/jpeg' | 'image/png';
  imageBase64: string;
  widthPx: number;
  heightPx: number;
} | { ok: false }> {
  if (typeof document === 'undefined') {
    return { ok: false };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let curW = img.naturalWidth || input.widthPx;
      let curH = img.naturalHeight || input.heightPx;

      const canvas = document.createElement('canvas');
      canvas.width = curW;
      canvas.height = curH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ ok: false });
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, curW, curH);
      ctx.drawImage(img, 0, 0, curW, curH);

      const cleanup = () => {
        canvas.width = 0;
        canvas.height = 0;
      };

      // Quality stepping attempts (bounded to 6 steps)
      const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.40];
      for (const q of qualities) {
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', q);
          const parsed = dataUrlToBase64(dataUrl);
          if (parsed && parsed.base64.length <= input.targetMaxBase64Chars) {
            cleanup();
            resolve({
              ok: true,
              mime: 'image/jpeg',
              imageBase64: parsed.base64,
              widthPx: curW,
              heightPx: curH,
            });
            return;
          }
        } catch {
          break;
        }
      }

      // If quality reduction alone does not fit, perform a bounded single downscale (0.75x)
      if (curW > 480 && curH > 480) {
        const nextW = Math.max(1, Math.floor(curW * 0.75));
        const nextH = Math.max(1, Math.floor(curH * 0.75));
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = nextW;
        scaledCanvas.height = nextH;
        const sCtx = scaledCanvas.getContext('2d');
        if (sCtx) {
          sCtx.fillStyle = '#ffffff';
          sCtx.fillRect(0, 0, nextW, nextH);
          sCtx.drawImage(canvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
          for (const q of [0.80, 0.65, 0.50, 0.40]) {
            try {
              const dataUrl = scaledCanvas.toDataURL('image/jpeg', q);
              const parsed = dataUrlToBase64(dataUrl);
              if (parsed && parsed.base64.length <= input.targetMaxBase64Chars) {
                cleanup();
                scaledCanvas.width = 0;
                scaledCanvas.height = 0;
                resolve({
                  ok: true,
                  mime: 'image/jpeg',
                  imageBase64: parsed.base64,
                  widthPx: nextW,
                  heightPx: nextH,
                });
                return;
              }
            } catch {
              break;
            }
          }
          scaledCanvas.width = 0;
          scaledCanvas.height = 0;
        }
      }

      cleanup();
      resolve({ ok: false });
    };

    img.onerror = () => {
      resolve({ ok: false });
    };

    img.src = `data:${input.mime};base64,${input.imageBase64}`;
  });
}

/**
 * Ensures an ask_course request strictly fits within the wire budget before network dispatch.
 * If the request fits as-is (e.g. lossless PNG fits), it is returned untouched.
 * If the request exceeds the budget due to multi-turn conversation context or dense image size,
 * it performs bounded recompression of the visual attachment without dropping conversation context.
 */
export async function fitVisualRequestToWireBudget(
  request: ZikukAiAskCourseRequest,
  maxWireBytes: number = MAX_ASK_COURSE_VISUAL_BODY_BYTES,
): Promise<FitVisualRequestResult> {
  const budget = calculateVisualRequestWireBudget(request, maxWireBytes);
  if (budget.fits) {
    return {
      ok: true,
      request,
      bodyBytes: budget.currentTotalBodyBytes,
      recompressed: false,
    };
  }

  // If request has no visual capture or is text-only, fail directly
  if (request.version !== 3 || !request.capture || !isVisualSelectionCapture(request.capture)) {
    return {
      ok: false,
      code: 'context_too_large',
      message: 'The request size exceeds the gateway limit.',
      bodyBytes: budget.currentTotalBodyBytes,
    };
  }

  // If conversation context alone leaves insufficient room for any usable image (> 508 KiB context)
  if (budget.maxRawImageBytes < 1024) {
    return {
      ok: false,
      code: 'context_too_large',
      message: 'The conversation context and visual selection exceed the 512 KiB request limit. Try asking in a fresh chat turn.',
      bodyBytes: budget.currentTotalBodyBytes,
    };
  }

  const capture = request.capture;
  const recompressed = await recompressBase64Image({
    imageBase64: capture.imageBase64,
    mime: capture.mime,
    widthPx: capture.widthPx,
    heightPx: capture.heightPx,
    targetRawBytes: budget.maxRawImageBytes,
    targetMaxBase64Chars: budget.maxAllowedBase64Chars,
  });

  if (!recompressed.ok) {
    return {
      ok: false,
      code: 'recompress_failed',
      message: 'The visual capture could not be compressed to fit within the 512 KiB request limit.',
      bodyBytes: budget.currentTotalBodyBytes,
    };
  }

  const updatedRequest: ZikukAiAskCourseRequestV3 = {
    ...request,
    version: 3,
    capture: {
      ...capture,
      mime: recompressed.mime,
      imageBase64: recompressed.imageBase64,
      widthPx: recompressed.widthPx,
      heightPx: recompressed.heightPx,
    },
  };

  const rechecked = calculateVisualRequestWireBudget(updatedRequest, maxWireBytes);
  if (!rechecked.fits) {
    return {
      ok: false,
      code: 'recompress_failed',
      message: 'The visual capture could not be compressed to fit within the 512 KiB request limit.',
      bodyBytes: rechecked.currentTotalBodyBytes,
    };
  }

  return {
    ok: true,
    request: updatedRequest,
    bodyBytes: rechecked.currentTotalBodyBytes,
    recompressed: true,
  };
}
