/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ASK_COURSE_VISUAL_BODY_BYTES,
  MAX_VISUAL_SELECTION_IMAGE_BYTES,
  MAX_VISUAL_SELECTION_LONG_EDGE_PX,
  parseVisualSelectionAttachment as parseFrontendVisual,
} from './visualSelectionContract';
import {
  MAX_ASK_COURSE_VISUAL_BODY_BYTES as GATEWAY_MAX_WIRE_BYTES,
  MAX_VISUAL_SELECTION_IMAGE_BYTES as GATEWAY_MAX_IMAGE_BYTES,
  MAX_VISUAL_SELECTION_LONG_EDGE_PX as GATEWAY_MAX_LONG_EDGE,
  parseVisualSelectionAttachment as parseGatewayVisual,
  allowVisualSizedGatewayBody,
} from '../../../../supabase/functions/_shared/ai/visualCapture/visualSelectionContract';
import {
  calculateVisualRequestWireBudget,
  fitVisualRequestToWireBudget,
  WIRE_BUDGET_SAFETY_MARGIN_BYTES,
} from './visualPayloadWireBudget';
import type { ZikukAiAskCourseRequestV3 } from '../gatewayClient/types';
import { syntheticJpegBytes } from './syntheticJpeg';

// Minimal valid PNG header and chunk (1x1 transparent PNG)
const SYNTHETIC_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Minimal valid JPEG header (1x1)
const SYNTHETIC_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

function makeVisualRequest(overrides: {
  question?: string;
  recentTurns?: Array<{ role: 'user' | 'assistant'; content: string }>;
  widthPx?: number;
  heightPx?: number;
  imageBase64?: string;
  mime?: 'image/png' | 'image/jpeg';
} = {}): ZikukAiAskCourseRequestV3 {
  return {
    version: 3,
    capability: 'ask_course',
    sectionId: 'sec-calc2-exam2',
    question:
      overrides.question ??
      'Solve this question step by step. Evaluate all four options exactly as printed and identify the correct answer.',
    capture: {
      sourceKind: 'free_space_pdf',
      sourceObjectId: 'pdf-obj-1234',
      sectionId: 'sec-calc2-exam2',
      pageNumber: 2,
      regionNorm: { x: 0.07, y: 0.38, w: 0.86, h: 0.19 },
      attachmentType: 'visual_selection',
      textKind: 'visual_selection',
      mime: overrides.mime ?? 'image/png',
      imageBase64: overrides.imageBase64 ?? SYNTHETIC_PNG_BASE64,
      widthPx: overrides.widthPx ?? 1600,
      heightPx: overrides.heightPx ?? 499,
      userConfirmedVisual: true,
    },
    teachingMode: 'socratic',
    activeDocument: {
      sourceObjectId: 'pdf-obj-1234',
      visiblePageNumber: 2,
    },
    ...(overrides.recentTurns ? { recentTurns: overrides.recentTurns } : {}),
  };
}

describe('visualPayloadWireBudget & contract parity', () => {
  describe('Frontend and Gateway Contract Parity', () => {
    it('agrees on 1600px maximum long edge between frontend and gateway', () => {
      expect(MAX_VISUAL_SELECTION_LONG_EDGE_PX).toBe(1600);
      expect(GATEWAY_MAX_LONG_EDGE).toBe(1600);
      expect(MAX_VISUAL_SELECTION_LONG_EDGE_PX).toBe(GATEWAY_MAX_LONG_EDGE);
    });

    it('agrees on 512 KiB visual wire request ceiling', () => {
      expect(MAX_ASK_COURSE_VISUAL_BODY_BYTES).toBe(512 * 1024);
      expect(GATEWAY_MAX_WIRE_BYTES).toBe(512 * 1024);
      expect(MAX_ASK_COURSE_VISUAL_BODY_BYTES).toBe(GATEWAY_MAX_WIRE_BYTES);
    });

    it('both contracts accept 1280px and 1600px valid captures', () => {
      for (const edge of [1280, 1600]) {
        const req = makeVisualRequest({ widthPx: edge, heightPx: 480, mime: 'image/jpeg', imageBase64: SYNTHETIC_JPEG_BASE64 });
        const fe = parseFrontendVisual(req.capture, 'sec-calc2-exam2');
        const gw = parseGatewayVisual(req.capture, 'sec-calc2-exam2');
        expect(fe.ok).toBe(true);
        expect(gw.ok).toBe(true);
      }
    });

    it('both contracts reject long edges exceeding 1600px (e.g. 1601px, 2000px)', () => {
      for (const edge of [1601, 2000, 3200]) {
        const req = makeVisualRequest({ widthPx: edge, heightPx: 480, mime: 'image/jpeg', imageBase64: SYNTHETIC_JPEG_BASE64 });
        const fe = parseFrontendVisual(req.capture, 'sec-calc2-exam2');
        const gw = parseGatewayVisual(req.capture, 'sec-calc2-exam2');
        expect(fe).toMatchObject({ ok: false, code: 'invalid_dimensions' });
        expect(gw).toMatchObject({ ok: false, code: 'invalid_dimensions' });
      }
    });
  });

  describe('Mathematical Base64 and Envelope Accounting', () => {
    it('accurately calculates envelope overhead without image', () => {
      const req = makeVisualRequest();
      const budget = calculateVisualRequestWireBudget(req);
      expect(budget.envelopeBytes).toBeGreaterThan(400);
      expect(budget.envelopeBytes).toBeLessThan(2000);
      expect(budget.fits).toBe(true);
      expect(budget.maxAllowedBase64Chars).toBe(
        512 * 1024 - budget.envelopeBytes - WIRE_BUDGET_SAFETY_MARGIN_BYTES,
      );
    });

    it('dynamically shrinks raw image budget when large conversation context is present', () => {
      const shortReq = makeVisualRequest();
      const shortBudget = calculateVisualRequestWireBudget(shortReq);

      const longHistory = [
        { role: 'user' as const, content: 'A'.repeat(800) },
        { role: 'assistant' as const, content: 'B'.repeat(1200) },
        { role: 'user' as const, content: 'C'.repeat(500) },
      ];
      const longReq = makeVisualRequest({ recentTurns: longHistory });
      const longBudget = calculateVisualRequestWireBudget(longReq);

      expect(longBudget.envelopeBytes).toBeGreaterThan(shortBudget.envelopeBytes + 2500);
      expect(longBudget.maxRawImageBytes).toBeLessThan(shortBudget.maxRawImageBytes);
      // Both still leave plenty of headroom for normal 1600px math images (~232 KiB)
      expect(longBudget.maxRawImageBytes).toBeGreaterThan(350 * 1024);
    });

    it('confirms Base64 mathematical boundary: 384 KiB raw binary = exactly 512 KiB Base64', () => {
      const rawBytes = 384 * 1024; // 393,216 bytes
      const base64Chars = Math.ceil((rawBytes * 4) / 3);
      expect(base64Chars).toBe(512 * 1024); // Exactly 524,288 chars
    });
  });

  describe('Realistic STG-REL-1 Question 3 Payload Simulation', () => {
    it('accepts authentic Question 3 1600px PNG payload without recompression', async () => {
      // Simulate authentic Question 3 rendered at 1600x499 with 232 KiB PNG (308.8 KiB Base64)
      const fakeQ3PngB64 = 'iVBORw0KGgoAAAANSUhEUgAABkAAAAH3' + 'A'.repeat(316200);
      const req = makeVisualRequest({
        widthPx: 1600,
        heightPx: 499,
        imageBase64: fakeQ3PngB64,
        mime: 'image/png',
      });

      const budget = calculateVisualRequestWireBudget(req);
      expect(budget.fits).toBe(true);
      expect(budget.currentTotalBodyBytes).toBeLessThan(320 * 1024); // ~317 KiB
      expect(budget.deficitBytes).toBe(0);

      const fitRes = await fitVisualRequestToWireBudget(req);
      expect(fitRes.ok).toBe(true);
      if (fitRes.ok) {
        expect(fitRes.recompressed).toBe(false);
        expect(fitRes.bodyBytes).toBeLessThan(MAX_ASK_COURSE_VISUAL_BODY_BYTES);
      }
    });

    it('allowVisualSizedGatewayBody allows Question 3 1600px capture under 512 KiB', () => {
      // Create a valid gateway capture with synthetic JPEG scaled to 1600x500
      const req = makeVisualRequest({
        widthPx: 1600,
        heightPx: 500,
        mime: 'image/jpeg',
        imageBase64: SYNTHETIC_JPEG_BASE64,
      });
      const rawText = JSON.stringify(req);
      expect(allowVisualSizedGatewayBody(rawText)).toBe(true);
    });

    it('allowVisualSizedGatewayBody rejects text requests disguised as visual', () => {
      const fakeReq = {
        version: 3,
        capability: 'ask_course',
        sectionId: 'sec-1',
        capture: { attachmentType: 'text_selection', text: 'plain text' },
      };
      expect(allowVisualSizedGatewayBody(JSON.stringify(fakeReq))).toBe(false);
    });

    it('allowVisualSizedGatewayBody rejects requests exceeding 1600px long edge', () => {
      const oversizedReq = makeVisualRequest({
        widthPx: 1601,
        heightPx: 500,
        mime: 'image/jpeg',
        imageBase64: SYNTHETIC_JPEG_BASE64,
      });
      expect(allowVisualSizedGatewayBody(JSON.stringify(oversizedReq))).toBe(false);
    });
  });

  describe('Bounded Payload Safety & Fail-Closed Guardrails', () => {
    it('detects requests exceeding 512 KiB before network dispatch', () => {
      // 550 KiB base64 image
      const hugeB64 = 'A'.repeat(550 * 1024);
      const req = makeVisualRequest({ imageBase64: hugeB64 });
      const budget = calculateVisualRequestWireBudget(req);
      expect(budget.fits).toBe(false);
      expect(budget.deficitBytes).toBeGreaterThan(30 * 1024);
    });

    it('fails safely without dropping conversation context when context alone exhausts budget', async () => {
      // If conversation history is somehow huge (> 511 KiB)
      const massiveTurns = [
        { role: 'user' as const, content: 'X'.repeat(260 * 1024) },
        { role: 'assistant' as const, content: 'Y'.repeat(260 * 1024) },
      ];
      const req = makeVisualRequest({ recentTurns: massiveTurns });
      const fitRes = await fitVisualRequestToWireBudget(req);
      expect(fitRes.ok).toBe(false);
      if (!fitRes.ok) {
        expect(fitRes.code).toBe('context_too_large');
        expect(fitRes.message).toContain('exceed');
      }
    });

    it('gateway rejects requests with base64 payloads exceeding 512 KiB', () => {
      // 393,200 bytes <= 400 KiB raw limit, but base64 (524,268) + 512 = 524,780 > 512 KiB wire limit
      const rawBytes = new Uint8Array(393200);
      rawBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // PNG magic
      rawBytes.set([0, 0, 0, 13], 8); // IHDR length
      rawBytes.set([0x49, 0x48, 0x44, 0x52], 12); // 'IHDR'
      rawBytes.set([0, 0, 1, 0], 16); // width = 256
      rawBytes.set([0, 0, 1, 0], 20); // height = 256

      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < rawBytes.length; i += chunk) {
        binary += String.fromCharCode(...rawBytes.subarray(i, Math.min(i + chunk, rawBytes.length)));
      }
      const b64 = btoa(binary);

      const hugeReq = makeVisualRequest({
        imageBase64: b64,
        mime: 'image/png',
      });
      const gw = parseGatewayVisual(hugeReq.capture, 'sec-calc2-exam2');
      expect(gw).toMatchObject({ ok: false, code: 'visual_body_too_large' });
    });
  });
});
