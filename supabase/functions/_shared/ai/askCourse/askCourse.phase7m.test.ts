// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAskCoursePipeline, type AskCourseDeps } from './runAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import { PILOT_FRONTEND, PILOT_SUPABASE, pilotContext, pilotFingerprint, parsePilotReceipt } from '../tutorPilotEvidence.ts';
import type { ZikukAiAskCourseRequestV3 } from '../requestTypes.ts';

const USER = 'pilot-synthetic-user';
const SECTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PDF = 'pilot-synthetic-pdf';
const SENTENCE = 'The cyclical part of real GDP is ...';
const OPTIONS = '1. The cyclical part of real GDP is ... (a) trend real GDP less real GDP. (b) real GDP less trend real GDP. (c) real GDP divided by trend real GDP. (d) trend real GDP divided by real GDP.';
const KEY = 'ab'.repeat(32);
const context = () => pilotContext({ supabaseUrl: PILOT_SUPABASE, origin: PILOT_FRONTEND, key: KEY })!;
function request(): ZikukAiAskCourseRequestV3 {
  return { version: 3, capability: 'ask_course', sectionId: SECTION, question: 'Can you explain this concept step by step?', teachingMode: 'explain', capture: {
    sourceKind: 'free_space_pdf', sourceObjectId: PDF, sectionId: SECTION, pageNumber: 2,
    regionNorm: { x: 0.1, y: 0.2, w: 0.5, h: 0.1 }, text: SENTENCE,
  } };
}
function harness(text = OPTIONS) {
  const providerInput: unknown[] = [];
  const recordUsage = vi.fn(async () => ({ ok: true as const }));
  const enforcement = createMemoryEnforcementStore({ plan: 'pro', dailyLimit: 100 });
  const search = vi.fn(async () => ({ ok: true as const, raw: text ? [{ source_kind: 'free_space_pdf', source_object_id: PDF, file_name: 'Synthetic GDP.pdf', page_number: 2, chunk_index: 0, text, similarity: 0.95 }] : [] }));
  const complete = vi.fn(async (input: unknown) => {
    providerInput.push(input);
    return { ok: true as const, rawModel: 'gpt-5.6-luna', text: 'Cyclical GDP is real GDP less trend real GDP, which matches option (b). [1]', latencyMs: 1, providerRequestId: 'req_pilot_synthetic', usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 } };
  });
  const deps: AskCourseDeps = {
    pilotEvidence: context(), loadSectionOwner: async () => ({ userId: USER }),
    loadPdfCaptureSource: async () => ({ id: PDF, user_id: USER, section_id: SECTION, object: { type: 'pdf', content: { type: 'pdf', pageCount: 5 } } }),
    embeddingProvider: createFakeEmbeddingProvider({ fixedEmbedding: new Array(1536).fill(0.01), usage: { inputTokens: 10 } }),
    searchKnowledge: search, loadNotebookFsoForCitation: async () => null,
    generationProvider: { complete }, routerConfig: { model: 'gpt-5.6-luna' }, enforcement: { ...enforcement, recordUsage },
  };
  return { deps, complete, search, providerInput, recordUsage };
}
afterEach(() => vi.restoreAllMocks());

describe('Phase 7M final-input evidence and authorization', () => {
  it('compares the partial capture separately from options actually in final model context and joins the usage event', async () => {
    const h = harness();
    const out = await runAskCoursePipeline({ authUserId: USER, request: request(), deps: h.deps });
    expect(out.response.ok).toBe(true);
    if (!out.response.ok || out.response.meta?.capability !== 'ask_course' || out.response.result.type !== 'ask_course') throw new Error('missing response');
    const receipt = out.response.meta.pilotEvidence!;
    expect(parsePilotReceipt(receipt)).toEqual(receipt);
    expect(receipt.capture.chars).toBe(SENTENCE.length);
    expect(receipt.capture.fingerprint).toBe(await pilotFingerprint(KEY, 'capture', SENTENCE));
    expect(receipt.capture.pageNumber).toBe(2);
    expect(receipt.chunks).toHaveLength(1);
    expect(receipt.chunks[0].included).toBe(true);
    expect(receipt.chunks[0].textFingerprint).toBe(await pilotFingerprint(KEY, 'chunk', OPTIONS));
    expect(receipt.modelInputFingerprint).toBe(await pilotFingerprint(KEY, 'modelInput', JSON.stringify(h.providerInput[0])));
    expect(JSON.stringify(h.providerInput[0])).toContain('(b) real GDP less trend real GDP');
    expect(receipt.providerRequestId).toBe('req_pilot_synthetic');
    expect(h.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ providerRequestId: receipt.providerRequestId }));
    expect(receipt.knowledgeTier).toBe('mixed');
    expect(receipt.answerFingerprint).toBe(await pilotFingerprint(KEY, 'answer', out.response.result.text));
    expect(JSON.stringify(receipt)).not.toContain(SENTENCE);
    expect(JSON.stringify(receipt)).not.toContain('Synthetic GDP.pdf');
    expect(JSON.stringify(receipt)).not.toContain(KEY);
    expect(h.complete).toHaveBeenCalledTimes(1);
  });

  it('does not invent options when only the capture exists; receipt proves zero retrieved chunks', async () => {
    const h = harness('');
    h.complete.mockResolvedValue({ ok: true, rawModel: 'gpt-5.6-luna', text: 'Cyclical GDP equals real GDP minus trend GDP.', latencyMs: 1, providerRequestId: 'req_pilot_synthetic', usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 } });
    const out = await runAskCoursePipeline({ authUserId: USER, request: request(), deps: h.deps });
    if (!out.response.ok || out.response.meta?.capability !== 'ask_course') throw new Error('missing response');
    expect(out.response.meta.pilotEvidence?.chunks).toEqual([]);
    expect(out.response.meta.pilotEvidence?.citationIndices).toEqual([]);
    expect(JSON.stringify(h.complete.mock.calls[0][0])).not.toContain('(b)');
  });

  it('denies another user before retrieval or generation and returns no receipt', async () => {
    const h = harness();
    const out = await runAskCoursePipeline({ authUserId: 'another-user', request: request(), deps: h.deps });
    expect(out.response.ok).toBe(false);
    expect(h.search).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(out.response)).not.toContain('pilotEvidence');
  });

  it('keeps an insufficient-evidence fixture honest and instructs the model not to invent course policies', async () => {
    const h = harness('');
    h.complete.mockResolvedValue({ ok: true, rawModel: 'gpt-5.6-luna', text: 'I cannot establish the professor’s grading weight from the provided material.', latencyMs: 1, providerRequestId: 'req_pilot_synthetic', usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 } });
    const r = request(); r.question = 'What exact grading weight did my professor assign? Use only the uploaded material.';
    const out = await runAskCoursePipeline({ authUserId: USER, request: r, deps: h.deps });
    if (!out.response.ok || out.response.result.type !== 'ask_course') throw new Error('missing response');
    expect(out.response.result.text).toMatch(/cannot (?:be )?establish/);
    expect(out.response.result.knowledgeTier).not.toBe('course_material');
    expect(out.response.result.sources).toEqual([]);
    expect(JSON.stringify(h.complete.mock.calls[0][0])).toContain('without speculating');
  });

  it('denies a capture belonging to a different course before provider dispatch', async () => {
    const h = harness();
    h.deps.loadPdfCaptureSource = async () => ({ id: PDF, user_id: USER, section_id: 'other-course', object: { type: 'pdf', content: { type: 'pdf', pageCount: 5 } } });
    const out = await runAskCoursePipeline({ authUserId: USER, request: request(), deps: h.deps });
    expect(out.response.ok).toBe(false);
    expect(h.search).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });

  it('never adds evidence without the opt-in context', async () => {
    const h = harness(); delete h.deps.pilotEvidence;
    const out = await runAskCoursePipeline({ authUserId: USER, request: request(), deps: h.deps });
    expect(JSON.stringify(out.response)).not.toContain('pilotEvidence');
  });

  it('requires exact staging URLs, explicit origin, and a bounded comparison key', () => {
    expect(pilotContext({ supabaseUrl: PILOT_SUPABASE, origin: PILOT_FRONTEND, key: KEY })).toBeDefined();
    for (const supabaseUrl of ['https://unrelated.invalid', PILOT_SUPABASE + '.invalid', PILOT_SUPABASE + '/']) expect(pilotContext({ supabaseUrl, origin: PILOT_FRONTEND, key: KEY })).toBeUndefined();
    for (const origin of [null, 'https://unrelated.invalid', PILOT_FRONTEND + '.invalid']) expect(pilotContext({ supabaseUrl: PILOT_SUPABASE, origin, key: KEY })).toBeUndefined();
    expect(pilotContext({ supabaseUrl: PILOT_SUPABASE, origin: PILOT_FRONTEND, key: 'unsafe' })).toBeUndefined();
  });

  it('fingerprints cannot be compared across requests or domains', async () => {
    const fp = await pilotFingerprint(KEY, 'capture', SENTENCE);
    expect(fp).not.toBe(await pilotFingerprint('cd'.repeat(32), 'capture', SENTENCE));
    expect(fp).not.toBe(await pilotFingerprint(KEY, 'chunk', SENTENCE));
  });
});
