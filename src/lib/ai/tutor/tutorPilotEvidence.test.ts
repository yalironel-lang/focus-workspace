// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginTutorPilot, verifyTutorPilot, citationPageForOpenPdf } from './tutorPilotEvidence';
import { makePilotReceipt, parsePilotReceipt, PILOT_FRONTEND, PILOT_SUPABASE } from '../../../../supabase/functions/_shared/ai/tutorPilotEvidence';
import type { ZikukAiResponse, ZikukAiAskCourseRequestV3 } from '../gatewayClient/types';

const KEY = 'ab'.repeat(32);
const request: ZikukAiAskCourseRequestV3 = { version: 3, capability: 'ask_course', sectionId: 'synthetic-course', question: 'Explain the concept.', capture: {
  sourceKind: 'free_space_pdf', sourceObjectId: 'synthetic-pdf', sectionId: 'synthetic-course', pageNumber: 2,
  regionNorm: { x: 0, y: 0, w: 1, h: 1 }, text: 'The cyclical part of real GDP is ...',
} };
const source = { index: 1, sourceKind: 'free_space_pdf' as const, sourceObjectId: 'synthetic-pdf', fileName: 'Synthetic.pdf', pageNumber: 2 };
async function response(): Promise<Extract<ZikukAiResponse, { ok: true }> & { result: { type: 'ask_course' } }> {
  const receipt = await makePilotReceipt({ context: { requestId: crypto.randomUUID(), key: KEY },
    question: request.question, capture: request.capture, chunks: [], modelInput: 'synthetic-input', promptText: '', recentTurns: 0,
    answer: 'A synthetic explanation. [1]', sources: [source], knowledgeTier: 'mixed', providerRequestId: 'req_synthetic',
  });
  return { version: 1, ok: true, result: { type: 'ask_course', text: 'A synthetic explanation. [1]', sources: [source], knowledgeTier: 'mixed' }, meta: { capability: 'ask_course', pilotEvidence: receipt } };
}
afterEach(() => vi.restoreAllMocks());
describe('Phase 7M browser proof privacy and comparison', () => {
  it('requires exact staging and explicit Tutor opt-in; generates a new key per request', () => {
    const input = { supabaseUrl: PILOT_SUPABASE, origin: PILOT_FRONTEND, search: '?tutorEvidence=1', surface: 'tutor' };
    const a = beginTutorPilot(input)!; const b = beginTutorPilot(input)!;
    expect(a.key).toHaveLength(64); expect(a.key).not.toBe(b.key);
    expect(beginTutorPilot({ ...input, search: '' })).toBeUndefined();
    expect(beginTutorPilot({ ...input, origin: 'https://unrelated.invalid' })).toBeUndefined();
    expect(beginTutorPilot({ ...input, supabaseUrl: 'https://unrelated.invalid' })).toBeUndefined();
    expect(beginTutorPilot({ ...input, surface: 'other' })).toBeUndefined();
  });
  it('verifies capture, question, answer, source references and tier together', async () => {
    const reply = await response();
    expect((await verifyTutorPilot(KEY, request, reply))?.verified).toBe(true);
    expect((await verifyTutorPilot('cd'.repeat(32), request, reply))?.verified).toBe(false);
    expect((await verifyTutorPilot(KEY, { ...request, question: 'A different question' }, reply))?.verified).toBe(false);
    expect((await verifyTutorPilot(KEY, { ...request, capture: { ...request.capture, text: 'different selection' } }, reply))?.verified).toBe(false);
    reply.result.text = 'Replaced or restored answer';
    expect((await verifyTutorPilot(KEY, request, reply))?.verified).toBe(false);
  });
  it('rejects receipt expiry, unbounded fields and unsafe extras; never copies unknown content', async () => {
    const reply = await response();
    if (reply.meta?.capability !== 'ask_course') throw new Error('missing meta');
    const receipt = reply.meta.pilotEvidence!;
    expect(parsePilotReceipt({ ...receipt, rawStudentText: 'DO NOT COPY' })).toEqual(receipt);
    expect(parsePilotReceipt({ ...receipt, expiresAt: Date.now() - 1 })).toBeUndefined();
    expect(parsePilotReceipt({ ...receipt, chunks: new Array(33).fill({}) })).toBeUndefined();
    expect(parsePilotReceipt({ ...receipt, providerRequestId: 'unsafe\nvalue' })).toBeUndefined();
  });
  it('detects a changed citation/source response', async () => {
    const reply = await response(); reply.result.sources[0] = { ...source, pageNumber: 8 };
    expect((await verifyTutorPilot(KEY, request, reply))?.verified).toBe(false);
  });
  it('only navigates an authorized citation within the matching open PDF', () => {
    expect(citationPageForOpenPdf(source, 'synthetic-pdf')).toBe(2);
    expect(citationPageForOpenPdf(source, 'another-pdf')).toBeUndefined();
    expect(citationPageForOpenPdf(source, null)).toBeUndefined();
    expect(citationPageForOpenPdf({ ...source, pageNumber: -1 }, 'synthetic-pdf')).toBeUndefined();
  });
});
