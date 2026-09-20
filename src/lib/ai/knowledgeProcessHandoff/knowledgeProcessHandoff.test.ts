/**
 * @vitest-environment happy-dom
 *
 * M0.7B.2 — needsProcess markers + handoff controller (mocked process client).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeProcessClientResponse } from '../knowledgeProcessClient';

// Safety net: never hit real Edge even if inject is missed.
vi.mock('../../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: vi.fn(async () => ({
        data: null,
        error: { message: 'mock-not-injected', context: { status: 500 } },
      })),
    },
  },
}));

const {
  assertSafeNeedsProcessMarker,
  cancelKnowledgeProcessForSource,
  classifyKnowledgeProcessFailure,
  clearNeedsKnowledgeProcessMarker,
  drainKnowledgeProcessForSection,
  drainKnowledgeProcessForSource,
  getNeedsKnowledgeProcessMarker,
  listNeedsKnowledgeProcessForSection,
  markNeedsProcess,
  resetKnowledgeProcessHandoffForTests,
  resetNeedsKnowledgeProcessDbForTests,
  setKnowledgeProcessRequestForTests,
} = await import('./index');

const sectionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sectionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pdf1 = 'ps-pdf-1';
const pdf2 = 'ps-pdf-2';

function okReuse(): KnowledgeProcessClientResponse {
  return {
    version: 1,
    ok: true,
    result: {
      type: 'knowledge_process',
      ingest: { outcome: 'reused', sourceVersion: 1, pageCount: 0, chunkCount: 0 },
      index: { outcome: 'reused', retrievalSourceVersion: 1 },
    },
  };
}

function fail(
  code: string,
  message = 'x',
): KnowledgeProcessClientResponse {
  return {
    version: 1,
    ok: false,
    error: { code: code as never, message },
  };
}

beforeEach(async () => {
  resetKnowledgeProcessHandoffForTests();
  await resetNeedsKnowledgeProcessDbForTests();
});

afterEach(() => {
  resetKnowledgeProcessHandoffForTests();
  setKnowledgeProcessRequestForTests(null);
});

describe('M0.7B.2 needsProcess marker', () => {
  it('7–9. mark persists, coalesces, bumps generation', async () => {
    const a = await markNeedsProcess(sectionA, pdf1);
    expect(a.generation).toBe(1);
    const b = await markNeedsProcess(sectionA, pdf1);
    expect(b.generation).toBe(2);
    const listed = await listNeedsKnowledgeProcessForSection(sectionA);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.generation).toBe(2);
  });

  it('8. reload simulation retains marker', async () => {
    await markNeedsProcess(sectionA, pdf1);
    // Simulate new module consumers by re-reading from IDB after "reload"
    // (DB handle stays; data must still be present).
    const again = await getNeedsKnowledgeProcessMarker(sectionA, pdf1);
    expect(again?.sourceObjectId).toBe(pdf1);
    expect(again?.generation).toBe(1);
  });

  it('10. enumerate by section', async () => {
    await markNeedsProcess(sectionA, pdf1);
    await markNeedsProcess(sectionA, pdf2);
    await markNeedsProcess(sectionB, pdf1);
    const a = await listNeedsKnowledgeProcessForSection(sectionA);
    const b = await listNeedsKnowledgeProcessForSection(sectionB);
    expect(a.map(m => m.sourceObjectId).sort()).toEqual([pdf1, pdf2].sort());
    expect(b).toHaveLength(1);
    expect(b[0]!.sectionId).toBe(sectionB);
  });

  it('11. clear removes marker', async () => {
    const m = await markNeedsProcess(sectionA, pdf1);
    expect(await clearNeedsKnowledgeProcessMarker(sectionA, pdf1, m.generation)).toBe(
      true,
    );
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).toBeNull();
  });

  it('12. cancel removes marker', async () => {
    await markNeedsProcess(sectionA, pdf1);
    await cancelKnowledgeProcessForSource(sectionA, pdf1);
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).toBeNull();
  });

  it('25. marker contains no forbidden content', async () => {
    const m = await markNeedsProcess(sectionA, pdf1);
    expect(assertSafeNeedsProcessMarker(m)).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(
      /text|hash|storagePath|embedding|jwt|apiKey|model|userId/i,
    );
  });
});

describe('M0.7B.2 failure classification', () => {
  it('classifies permanent / retryable / auth / stale', () => {
    expect(classifyKnowledgeProcessFailure('no_extractable_text')).toBe('permanent');
    expect(classifyKnowledgeProcessFailure('too_large')).toBe('permanent');
    expect(classifyKnowledgeProcessFailure('auth_mismatch')).toBe('permanent');
    expect(classifyKnowledgeProcessFailure('unauthenticated')).toBe('auth_retain');
    expect(classifyKnowledgeProcessFailure('stale_job')).toBe('stale');
    expect(classifyKnowledgeProcessFailure('network_error')).toBe('retryable');
    expect(classifyKnowledgeProcessFailure('not_found')).toBe('retryable');
    expect(classifyKnowledgeProcessFailure('embedding_provider_unavailable')).toBe(
      'retryable',
    );
  });
});

describe('M0.7B.2 handoff controller', () => {
  it('13. success clears marker', async () => {
    setKnowledgeProcessRequestForTests(async () => okReuse());
    await markNeedsProcess(sectionA, pdf1);
    const r = await drainKnowledgeProcessForSource(sectionA, pdf1);
    expect(r.outcome).toBe('success');
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).toBeNull();
  });

  it('14. retryable failure retains marker', async () => {
    setKnowledgeProcessRequestForTests(async () => fail('network_error'));
    await markNeedsProcess(sectionA, pdf1);
    const r = await drainKnowledgeProcessForSource(sectionA, pdf1);
    expect(r.outcome).toBe('retained_retryable');
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).not.toBeNull();
  });

  it('15. permanent failure clears marker', async () => {
    setKnowledgeProcessRequestForTests(async () => fail('no_extractable_text'));
    await markNeedsProcess(sectionA, pdf1);
    const r = await drainKnowledgeProcessForSource(sectionA, pdf1);
    expect(r.outcome).toBe('cleared_permanent');
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).toBeNull();
  });

  it('16. unauthenticated retains marker', async () => {
    setKnowledgeProcessRequestForTests(async () => fail('unauthenticated'));
    await markNeedsProcess(sectionA, pdf1);
    const r = await drainKnowledgeProcessForSource(sectionA, pdf1);
    expect(r.outcome).toBe('retained_auth');
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).not.toBeNull();
  });

  it('17. duplicate drain while in-flight → one request', async () => {
    let resolveReq!: (v: KnowledgeProcessClientResponse) => void;
    const gate = new Promise<KnowledgeProcessClientResponse>(r => {
      resolveReq = r;
    });
    const invoke = vi.fn(async () => gate);
    setKnowledgeProcessRequestForTests(invoke);
    await markNeedsProcess(sectionA, pdf1);

    const p1 = drainKnowledgeProcessForSource(sectionA, pdf1);
    const p2 = drainKnowledgeProcessForSource(sectionA, pdf1);
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
    });
    resolveReq(okReuse());
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.outcome).toBe('success');
    expect(b.outcome).toBe('success');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('18–19. network fail retains; later retry success clears', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(fail('network_error'))
      .mockResolvedValueOnce(okReuse());
    setKnowledgeProcessRequestForTests(invoke);
    await markNeedsProcess(sectionA, pdf1);
    expect((await drainKnowledgeProcessForSource(sectionA, pdf1)).outcome).toBe(
      'retained_retryable',
    );
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).not.toBeNull();
    expect((await drainKnowledgeProcessForSource(sectionA, pdf1)).outcome).toBe(
      'success',
    );
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).toBeNull();
  });

  it('20. old generation success cannot clear newer generation', async () => {
    let resolveGen1!: (v: KnowledgeProcessClientResponse) => void;
    const gen1Gate = new Promise<KnowledgeProcessClientResponse>(r => {
      resolveGen1 = r;
    });
    let calls = 0;
    setKnowledgeProcessRequestForTests(async () => {
      calls += 1;
      if (calls === 1) return gen1Gate;
      return okReuse();
    });

    await markNeedsProcess(sectionA, pdf1); // gen 1
    const p1 = drainKnowledgeProcessForSource(sectionA, pdf1);
    await markNeedsProcess(sectionA, pdf1); // gen 2 while gen1 in flight
    expect((await getNeedsKnowledgeProcessMarker(sectionA, pdf1))!.generation).toBe(2);

    resolveGen1(okReuse());
    const r1 = await p1;
    expect(r1.outcome).toBe('stale_ignored');
    expect((await getNeedsKnowledgeProcessMarker(sectionA, pdf1))!.generation).toBe(2);

    const r2 = await drainKnowledgeProcessForSource(sectionA, pdf1);
    expect(r2.outcome).toBe('success');
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).toBeNull();
  });

  it('21. old generation failure cannot corrupt newer generation', async () => {
    let resolveGen1!: (v: KnowledgeProcessClientResponse) => void;
    const gen1Gate = new Promise<KnowledgeProcessClientResponse>(r => {
      resolveGen1 = r;
    });
    let calls = 0;
    setKnowledgeProcessRequestForTests(async () => {
      calls += 1;
      if (calls === 1) return gen1Gate;
      return okReuse();
    });

    await markNeedsProcess(sectionA, pdf1);
    const p1 = drainKnowledgeProcessForSource(sectionA, pdf1);
    await markNeedsProcess(sectionA, pdf1); // gen 2

    resolveGen1(fail('no_extractable_text'));
    expect((await p1).outcome).toBe('stale_ignored');
    expect((await getNeedsKnowledgeProcessMarker(sectionA, pdf1))!.generation).toBe(2);

    expect((await drainKnowledgeProcessForSource(sectionA, pdf1)).outcome).toBe(
      'success',
    );
  });

  it('22–23. cancel aborts in-flight and removes marker; stale completion noop', async () => {
    let resolveReq!: (v: KnowledgeProcessClientResponse) => void;
    const gate = new Promise<KnowledgeProcessClientResponse>((resolve, reject) => {
      resolveReq = resolve;
      // Also observe abort via signal in real client; here we just hang until resolve.
      void reject;
    });
    const invoke = vi.fn(async (_req, opts?: { signal?: AbortSignal }) => {
      if (opts?.signal?.aborted) return fail('aborted');
      return new Promise<KnowledgeProcessClientResponse>((resolve, reject) => {
        const onAbort = () => {
          opts?.signal?.removeEventListener('abort', onAbort);
          resolve(fail('aborted'));
        };
        opts?.signal?.addEventListener('abort', onAbort);
        void gate.then(resolve, reject);
      });
    });
    setKnowledgeProcessRequestForTests(invoke);

    await markNeedsProcess(sectionA, pdf1);
    const p = drainKnowledgeProcessForSource(sectionA, pdf1);
    await cancelKnowledgeProcessForSource(sectionA, pdf1);
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).toBeNull();

    // Late success must not recreate marker.
    resolveReq(okReuse());
    const r = await p;
    expect(['aborted', 'stale_ignored']).toContain(r.outcome);
    expect(await getNeedsKnowledgeProcessMarker(sectionA, pdf1)).toBeNull();
  });

  it('24. two different PDFs process independently', async () => {
    const invoke = vi.fn(async (req: { sourceObjectId: string }) => {
      if (req.sourceObjectId === pdf1) return okReuse();
      return okReuse();
    });
    setKnowledgeProcessRequestForTests(invoke);
    await markNeedsProcess(sectionA, pdf1);
    await markNeedsProcess(sectionA, pdf2);
    const results = await drainKnowledgeProcessForSection(sectionA);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.outcome === 'success')).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(await listNeedsKnowledgeProcessForSection(sectionA)).toHaveLength(0);
  });
});
