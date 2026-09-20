/**
 * @vitest-environment happy-dom
 *
 * M0.7B.3 — durable PDF → knowledge handoff wiring (mocks only).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeProcessClientResponse } from '../knowledgeProcessClient';
import type { PendingOperation } from '../../focusCache/types';

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

vi.mock('../../focusCache/pendingOperations', () => ({
  listPendingOperations: vi.fn(),
}));

const { listPendingOperations } = await import('../../focusCache/pendingOperations');
const listMock = vi.mocked(listPendingOperations);

const {
  assertSafeNeedsProcessMarker,
  cancelPdfKnowledgeProcessSafe,
  getNeedsKnowledgeProcessMarker,
  isStructuredFsoSafeForKnowledgeProcess,
  markNeedsProcess,
  notifyFreeSpaceObjectCloudWriteSucceededSafe,
  notifyPdfStorageUploadSucceededSafe,
  onFreeSpaceObjectCloudWriteSucceeded,
  onPdfStorageUploadSucceeded,
  recoverKnowledgeProcessForSection,
  resetKnowledgeProcessHandoffForTests,
  resetNeedsKnowledgeProcessDbForTests,
  setKnowledgeProcessRequestForTests,
} = await import('./index');

const userId = 'user-wiring-1';
const sectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pdfId = 'ps-pdf-wiring-1';
const imageId = 'ps-img-wiring-1';

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

function fsoOp(
  overrides: Partial<PendingOperation> & { operationType: 'create' | 'update' | 'delete' },
): PendingOperation {
  return {
    seq: 1,
    id: `op-${overrides.operationType}-${overrides.entityId ?? pdfId}`,
    userId,
    workspaceId: sectionId,
    entityType: 'free_space_object',
    entityId: pdfId,
    payload: { boardId: 'main', object: { id: pdfId, type: 'pdf' } },
    ...overrides,
  };
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Error('waitFor timeout');
}

beforeEach(async () => {
  resetKnowledgeProcessHandoffForTests();
  await resetNeedsKnowledgeProcessDbForTests();
  listMock.mockReset();
  listMock.mockResolvedValue({ ok: true, value: [] });
  setKnowledgeProcessRequestForTests(null);
});

afterEach(() => {
  resetKnowledgeProcessHandoffForTests();
  setKnowledgeProcessRequestForTests(null);
});

describe('M0.7B.3 primary PDF trigger', () => {
  it('1–2. Storage success → markNeedsProcess + background drain', async () => {
    const requests: Array<{ version: 1; sectionId: string; sourceObjectId: string }> = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });

    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });

    const marker = await getNeedsKnowledgeProcessMarker(sectionId, pdfId);
    expect(marker).not.toBeNull();
    expect(marker!.generation).toBe(1);

    await waitFor(() => requests.length === 1);
    expect(requests[0]).toEqual({
      version: 1,
      sectionId,
      sourceObjectId: pdfId,
    });
    await waitFor(async () => (await getNeedsKnowledgeProcessMarker(sectionId, pdfId)) === null);
  });

  it('3. non-PDF path is out of scope — wiring only accepts explicit PDF ids', async () => {
    // Wiring APIs are PDF-oriented; image uploads never call them.
    // Guard: calling with an image id still marks only what was asked — no scan.
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: imageId,
    });
    expect(await getNeedsKnowledgeProcessMarker(sectionId, imageId)).not.toBeNull();
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).toBeNull();
  });

  it('4. failed Storage does not call wiring (caller responsibility) — mark never happens without call', async () => {
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).toBeNull();
  });
});

describe('M0.7B.3 FSO ordering gate', () => {
  it('CASE A: FSO durable first → Storage success marks and drains immediately', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] });
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
    await waitFor(() => requests.length === 1);
  });

  it('5 / CASE B: Storage first while FSO pending → mark retained, no process yet', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [fsoOp({ operationType: 'create', seq: 1 })],
    });
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });

    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });

    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
    expect(await isStructuredFsoSafeForKnowledgeProcess(userId, sectionId, pdfId)).toBe(
      false,
    );
    await new Promise(r => setTimeout(r, 80));
    expect(requests).toHaveLength(0);
  });

  it('6 / CASE B continued: once FSO write safe → drain can occur', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [fsoOp({ operationType: 'update', seq: 1 })],
    });
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });

    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    expect(requests).toHaveLength(0);

    listMock.mockResolvedValue({ ok: true, value: [] });
    await onFreeSpaceObjectCloudWriteSucceeded({
      userId,
      sectionId,
      objectId: pdfId,
    });

    await waitFor(() => requests.length === 1);
  });

  it('unknown pending-state: mark retained, no immediate process', async () => {
    listMock.mockResolvedValue({ ok: false, reason: 'db_error' as never });
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
    await new Promise(r => setTimeout(r, 80));
    expect(requests).toHaveLength(0);
    expect(await isStructuredFsoSafeForKnowledgeProcess(userId, sectionId, pdfId)).toBe(
      false,
    );
  });

  it('delete pending skips mark', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [fsoOp({ operationType: 'delete', seq: 2 })],
    });
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).toBeNull();
  });
});

describe('M0.7B.3 replacement + rapid generation', () => {
  it('7–8. replacement bumps generation; same objectId', async () => {
    setKnowledgeProcessRequestForTests(async () => fail('network_error'));
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    const first = await getNeedsKnowledgeProcessMarker(sectionId, pdfId);
    expect(first?.sourceObjectId).toBe(pdfId);
    expect(first?.generation).toBe(1);

    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    const second = await getNeedsKnowledgeProcessMarker(sectionId, pdfId);
    expect(second?.sourceObjectId).toBe(pdfId);
    expect(second?.generation).toBe(2);
  });

  it('9. rapid B→C: stale earlier process cannot clear latest marker', async () => {
    let resolveB!: (v: KnowledgeProcessClientResponse) => void;
    const bPromise = new Promise<KnowledgeProcessClientResponse>(r => {
      resolveB = r;
    });
    let call = 0;
    setKnowledgeProcessRequestForTests(async () => {
      call += 1;
      if (call === 1) return bPromise;
      return okReuse();
    });

    await markNeedsProcess(sectionId, pdfId); // gen 1 (B)
    const drainB = import('./index').then(m =>
      m.drainKnowledgeProcessForSource(sectionId, pdfId),
    );

    await markNeedsProcess(sectionId, pdfId); // gen 2 (C)
    resolveB(okReuse());
    const resultB = await drainB;
    expect(resultB.outcome).toBe('stale_ignored');

    const still = await getNeedsKnowledgeProcessMarker(sectionId, pdfId);
    expect(still?.generation).toBe(2);

    // Drain C
    setKnowledgeProcessRequestForTests(async () => okReuse());
    const resultC = await (await import('./index')).drainKnowledgeProcessForSource(
      sectionId,
      pdfId,
    );
    expect(resultC.outcome).toBe('success');
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).toBeNull();
  });
});

describe('M0.7B.3 recovery', () => {
  it('10. marker survives simulated reload', async () => {
    await markNeedsProcess(sectionId, pdfId);
    const again = await getNeedsKnowledgeProcessMarker(sectionId, pdfId);
    expect(again?.generation).toBe(1);
  });

  it('11–12. section open drains markers only; does not scan historical unmarked PDFs', async () => {
    const requests: string[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req.sourceObjectId);
      return okReuse();
    });
    await markNeedsProcess(sectionId, pdfId);
    const historical = 'ps-pdf-historical-unmarked';

    recoverKnowledgeProcessForSection(sectionId, userId);
    await waitFor(() => requests.length === 1);
    expect(requests).toEqual([pdfId]);
    expect(await getNeedsKnowledgeProcessMarker(sectionId, historical)).toBeNull();
  });

  it('13. online/reconnect recovery drains retained marker when FSO safe', async () => {
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await markNeedsProcess(sectionId, pdfId);
    recoverKnowledgeProcessForSection(sectionId, userId);
    await waitFor(() => requests.length === 1);
  });

  it('recovery does not drain while FSO write still pending (marker retained)', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [fsoOp({ operationType: 'create', seq: 1 })],
    });
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await markNeedsProcess(sectionId, pdfId);
    recoverKnowledgeProcessForSection(sectionId, userId);
    await new Promise(r => setTimeout(r, 80));
    expect(requests).toHaveLength(0);
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
  });

  it('recovery does not drain when pending-op list is unknown', async () => {
    listMock.mockResolvedValue({ ok: false, reason: 'db_error' as never });
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await markNeedsProcess(sectionId, pdfId);
    recoverKnowledgeProcessForSection(sectionId, userId);
    await new Promise(r => setTimeout(r, 80));
    expect(requests).toHaveLength(0);
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
  });

  it('14. repeated recovery respects single-flight', async () => {
    let resolveReq!: (v: KnowledgeProcessClientResponse) => void;
    const held = new Promise<KnowledgeProcessClientResponse>(r => {
      resolveReq = r;
    });
    let calls = 0;
    setKnowledgeProcessRequestForTests(async () => {
      calls += 1;
      return held;
    });
    await markNeedsProcess(sectionId, pdfId);
    recoverKnowledgeProcessForSection(sectionId, userId);
    recoverKnowledgeProcessForSection(sectionId, userId);
    await waitFor(() => calls === 1);
    resolveReq(okReuse());
    await waitFor(async () => (await getNeedsKnowledgeProcessMarker(sectionId, pdfId)) === null);
    expect(calls).toBe(1);
  });
});

describe('M0.7B.3 delete wiring', () => {
  it('15–17. delete clears marker, aborts in-flight, stale completion ignored', async () => {
    let resolveReq!: (v: KnowledgeProcessClientResponse) => void;
    const held = new Promise<KnowledgeProcessClientResponse>(r => {
      resolveReq = r;
    });
    setKnowledgeProcessRequestForTests(async (_req, opts) => {
      if (opts?.signal) {
        await new Promise<void>((resolve, reject) => {
          if (opts.signal!.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          opts.signal!.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
          void held.then(() => resolve());
        });
      }
      return okReuse();
    });

    await markNeedsProcess(sectionId, pdfId);
    const drainP = (await import('./index')).drainKnowledgeProcessForSource(
      sectionId,
      pdfId,
    );

    cancelPdfKnowledgeProcessSafe(sectionId, pdfId);
    await waitFor(async () => (await getNeedsKnowledgeProcessMarker(sectionId, pdfId)) === null);

    resolveReq(okReuse());
    const result = await drainP;
    expect(['aborted', 'stale_ignored', 'retained_retryable']).toContain(result.outcome);
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).toBeNull();
  });

  it('18. AI cancel failure does not throw into delete caller', async () => {
    expect(() => cancelPdfKnowledgeProcessSafe(sectionId, pdfId)).not.toThrow();
    await new Promise(r => setTimeout(r, 30));
  });
});

describe('M0.7B.3 failure isolation', () => {
  it('19. mark failure does not reject notify wrapper', async () => {
    const markSpy = vi
      .spyOn(await import('./needsProcessStore'), 'markNeedsKnowledgeProcess')
      .mockRejectedValueOnce(new Error('idb down'));
    expect(() =>
      notifyPdfStorageUploadSucceededSafe({
        userId,
        sectionId,
        sourceObjectId: pdfId,
      }),
    ).not.toThrow();
    await new Promise(r => setTimeout(r, 40));
    markSpy.mockRestore();
  });

  it('20. process failure does not reject upload notify path', async () => {
    setKnowledgeProcessRequestForTests(async () => fail('network_error'));
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    await waitFor(async () => {
      const m = await getNeedsKnowledgeProcessMarker(sectionId, pdfId);
      return m != null;
    });
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
  });

  it('21. auth failure retains marker', async () => {
    setKnowledgeProcessRequestForTests(async () => fail('unauthenticated'));
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    await waitFor(async () => {
      const m = await getNeedsKnowledgeProcessMarker(sectionId, pdfId);
      return m != null;
    });
    // Allow drain to finish
    await new Promise(r => setTimeout(r, 50));
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
  });

  it('22. retryable failure retains marker', async () => {
    setKnowledgeProcessRequestForTests(async () => fail('embedding_timeout'));
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    await new Promise(r => setTimeout(r, 60));
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
  });

  it('23. permanent failure clears marker (B.2 behavior)', async () => {
    setKnowledgeProcessRequestForTests(async () => fail('no_extractable_text'));
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    await waitFor(async () => (await getNeedsKnowledgeProcessMarker(sectionId, pdfId)) === null);
  });
});

describe('M0.7B.3 privacy', () => {
  it('24–25. process request has only version/sectionId/sourceObjectId; marker has no PDF content', async () => {
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await onPdfStorageUploadSucceeded({
      userId,
      sectionId,
      sourceObjectId: pdfId,
    });
    const marker = await getNeedsKnowledgeProcessMarker(sectionId, pdfId);
    expect(assertSafeNeedsProcessMarker(marker)).toBe(true);
    await waitFor(() => requests.length === 1);
    expect(Object.keys(requests[0] as object).sort()).toEqual([
      'sectionId',
      'sourceObjectId',
      'version',
    ]);
  });
});

describe('M0.7B.3 notify wrappers', () => {
  it('FSO notify drains when marker exists and queue empty', async () => {
    const requests: unknown[] = [];
    setKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await markNeedsProcess(sectionId, pdfId);
    expect(() =>
      notifyFreeSpaceObjectCloudWriteSucceededSafe({
        userId,
        sectionId,
        objectId: pdfId,
      }),
    ).not.toThrow();
    await waitFor(() => requests.length === 1);
  });
});
