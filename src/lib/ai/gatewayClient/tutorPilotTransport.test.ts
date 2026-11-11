// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PILOT_HEADER, PILOT_FRONTEND, PILOT_SUPABASE, makePilotReceipt } from '../../../../supabase/functions/_shared/ai/tutorPilotEvidence';
import type { ZikukAiAskCourseRequestV3 } from './types';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../../supabase', () => ({ isSupabaseConfigured: true, supabase: { functions: { invoke } } }));
const { zikukAiRequest } = await import('./client');
const req: ZikukAiAskCourseRequestV3 = { version: 3, capability: 'ask_course', sectionId: 'synthetic-course', question: 'Explain this sentence.', capture: {
  sourceKind: 'free_space_pdf', sourceObjectId: 'synthetic-pdf', sectionId: 'synthetic-course', pageNumber: 2, regionNorm: { x: 0, y: 0, w: 1, h: 1 }, text: 'A synthetic selection.',
} };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); invoke.mockReset(); });
describe('7M real client invoke/parse proof seam', () => {
  it('uses exactly one invocation and verifies the returned receipt against the serialized capture', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', PILOT_SUPABASE);
    vi.stubGlobal('window', { location: { origin: PILOT_FRONTEND, search: '?tutorEvidence=1' } });
    invoke.mockImplementation(async (_name, opts) => {
      const receipt = await makePilotReceipt({ context: { requestId: crypto.randomUUID(), key: opts.headers[PILOT_HEADER] },
        question: opts.body.question, capture: opts.body.capture, chunks: [], modelInput: 'synthetic', promptText: '', recentTurns: 0,
        answer: 'A synthetic answer.', sources: [], knowledgeTier: 'general_academic', providerRequestId: 'req_transport_synthetic',
      });
      return { data: { version: 1, ok: true, result: { type: 'ask_course', text: 'A synthetic answer.', sources: [], knowledgeTier: 'general_academic' }, meta: { capability: 'ask_course', pilotEvidence: receipt } }, error: null };
    });
    const result = await zikukAiRequest(req, { surface: 'tutor' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body.capture.text).toBe(req.capture.text);
    expect(invoke.mock.calls[0][1].body.capture.pageNumber).toBe(2);
    expect(result.ok && result.meta?.capability === 'ask_course' && result.meta.pilotRenderEvidence?.verified).toBe(true);
  });
  it('never enables diagnostics outside staging and never retries a transport failure', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://unrelated.invalid');
    vi.stubGlobal('window', { location: { origin: PILOT_FRONTEND, search: '?tutorEvidence=1' } });
    invoke.mockResolvedValue({ data: null, error: { context: { status: 502 } } });
    const result = await zikukAiRequest(req, { surface: 'tutor' });
    expect(result.ok).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1]).not.toHaveProperty('headers');
  });
});
