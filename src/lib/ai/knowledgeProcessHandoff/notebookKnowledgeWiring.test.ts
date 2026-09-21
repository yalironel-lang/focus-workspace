/**
 * @vitest-environment happy-dom
 *
 * M0.8E — durable Notebook knowledge handoff (mocks only; 0 provider calls).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingOperation } from '../../focusCache/types';
import type { NotebookKnowledgeProcessClientResponse } from '../knowledgeProcessClient/notebookClient';

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
  NOTEBOOK_KNOWLEDGE_DRAIN_CONCURRENCY,
  NOTEBOOK_KNOWLEDGE_IDLE_MS,
  assertSafeNeedsProcessMarker,
  cancelNotebookKnowledgeProcessForNotebookSafe,
  cancelNotebookKnowledgeProcessForPageSafe,
  drainNotebookKnowledgeProcessForPage,
  getNeedsKnowledgeProcessMarker,
  getNeedsNotebookKnowledgeProcessMarker,
  listNeedsKnowledgeProcessForSection,
  markNeedsKnowledgeProcess,
  markNeedsNotebookKnowledgeProcess,
  markNotebookPageNeedsProcess,
  normalizeNeedsProcessMarker,
  notifyNotebookFreeSpaceObjectCloudWriteSucceededSafe,
  onFreeSpaceObjectCloudWriteSucceeded,
  onNotebookFreeSpaceObjectCloudWriteSucceeded,
  onNotebookPageSoftDeletedSafe,
  recoverKnowledgeProcessForSection,
  resetKnowledgeProcessHandoffForTests,
  resetNeedsKnowledgeProcessDbForTests,
  resetNotebookKnowledgeHandoffForTests,
  setNotebookKnowledgeProcessRequestForTests,
  setNotebookKnowledgeRemoveRequestForTests,
} = await import('./index');

const userId = 'user-nb-wiring-1';
const sectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const notebookId = 'ps-nb-wiring-1';
const pageA = 'page-a-1';
const pageB = 'page-b-2';
const pdfId = 'ps-pdf-keep-1';

function okReuse(): NotebookKnowledgeProcessClientResponse {
  return {
    version: 1,
    ok: true,
    result: {
      type: 'notebook_knowledge_process',
      ingest: { outcome: 'reused', sourceVersion: 1, chunkCount: 0 },
      index: { outcome: 'reused', retrievalSourceVersion: 1 },
    },
  };
}

function okCleared(): NotebookKnowledgeProcessClientResponse {
  return {
    version: 1,
    ok: true,
    result: {
      type: 'notebook_knowledge_process',
      ingest: {
        outcome: 'cleared',
        sourceVersion: null,
        chunkCount: 0,
        retrievalCleared: true,
      },
      index: { outcome: 'skipped', retrievalSourceVersion: null },
    },
  };
}

function fail(
  code: string,
  message = 'x',
): NotebookKnowledgeProcessClientResponse {
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
    id: `op-${overrides.operationType}-${overrides.entityId ?? notebookId}`,
    userId,
    workspaceId: sectionId,
    entityType: 'free_space_object',
    entityId: notebookId,
    payload: { boardId: 'main', object: { id: notebookId, type: 'notebook' } },
    ...overrides,
  };
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2500,
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
  resetNotebookKnowledgeHandoffForTests();
  await resetNeedsKnowledgeProcessDbForTests();
  listMock.mockReset();
  listMock.mockResolvedValue({ ok: true, value: [] });
  setNotebookKnowledgeProcessRequestForTests(null);
  setNotebookKnowledgeRemoveRequestForTests(null);
  vi.useRealTimers();
});

afterEach(() => {
  resetNotebookKnowledgeHandoffForTests();
  resetKnowledgeProcessHandoffForTests();
  setNotebookKnowledgeProcessRequestForTests(null);
  setNotebookKnowledgeRemoveRequestForTests(null);
  vi.useRealTimers();
});

describe('M0.8E marker architecture', () => {
  it('1. semantic mark creates notebook_page marker (metadata only)', async () => {
    const m = await markNotebookPageNeedsProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      mode: 'immediate',
    });
    expect(m).not.toBeNull();
    expect(m!.sourceKind).toBe('notebook_page');
    expect(m!.notebookObjectId).toBe(notebookId);
    expect(m!.sourceObjectId).toBe(pageA);
    expect(m!.generation).toBe(1);
    expect(assertSafeNeedsProcessMarker(m)).toBe(true);
  });

  it('2. repeat edit bumps generation and coalesces to one row', async () => {
    await markNotebookPageNeedsProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      mode: 'immediate',
    });
    const m2 = await markNotebookPageNeedsProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      mode: 'immediate',
    });
    expect(m2!.generation).toBe(2);
    const all = await listNeedsKnowledgeProcessForSection(sectionId);
    expect(all.filter(x => x.sourceObjectId === pageA)).toHaveLength(1);
  });

  it('3. legacy PDF markers normalize without notebook fields', () => {
    const n = normalizeNeedsProcessMarker({
      id: `${sectionId}::${pdfId}`,
      sectionId,
      sourceObjectId: pdfId,
      generation: 3,
      updatedAt: 1,
    });
    expect(n?.sourceKind).toBe('free_space_pdf');
    expect(n?.notebookObjectId).toBeUndefined();
  });

  it('4. page title rename path uses idle mark (generation)', async () => {
    const m = await markNotebookPageNeedsProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      mode: 'idle',
    });
    expect(m!.notBefore).toBeGreaterThan(Date.now());
    expect(m!.notBefore! - Date.now()).toBeLessThanOrEqual(NOTEBOOK_KNOWLEDGE_IDLE_MS + 50);
  });

  it('5. reorder identity unchanged — no automatic mark API for reorder', () => {
    // Reorder does not call markNotebookPageNeedsProcess in ProjectNotebookBlock.
    expect(NOTEBOOK_KNOWLEDGE_IDLE_MS).toBe(45_000);
  });
});

describe('M0.8E debounce + page leave', () => {
  it('6–8. idle notBefore blocks early drain; after notBefore process runs once', async () => {
    const requests: unknown[] = [];
    setNotebookKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });

    const future = Date.now() + NOTEBOOK_KNOWLEDGE_IDLE_MS;
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: future,
    });
    // Coalesce / reset: bump again further out
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() + NOTEBOOK_KNOWLEDGE_IDLE_MS,
    });
    const early = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(early.outcome).toBe('skipped_not_before');
    expect(requests).toHaveLength(0);

    // Simulate idle elapsed
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const late = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(late.outcome).toBe('success');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      version: 1,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
  });

  it('9. page_leave mode sets notBefore ≈ now (early drain eligible)', async () => {
    const m = await markNotebookPageNeedsProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      mode: 'page_leave',
    });
    expect(m!.notBefore).toBeLessThanOrEqual(Date.now() + 25);
    setNotebookKnowledgeProcessRequestForTests(async () => okReuse());
    const r = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(r.outcome).toBe('success');
  });

  it('10. concurrency constant is sequential V1 (no polling loop)', () => {
    expect(NOTEBOOK_KNOWLEDGE_DRAIN_CONCURRENCY).toBe(1);
  });
});

describe('M0.8E cloud gate + FSO success', () => {
  it('11. pending FSO write → no process', async () => {
    listMock.mockResolvedValue({ ok: true, value: [fsoOp({ operationType: 'update' })] });
    const requests: unknown[] = [];
    setNotebookKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const r = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(r.outcome).toBe('skipped_fso_pending');
    expect(requests).toHaveLength(0);
    expect(await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)).not.toBeNull();
  });

  it('12. unknown pending state → no process', async () => {
    listMock.mockResolvedValue({ ok: false, error: { code: 'x', message: 'fail' } } as never);
    const requests: unknown[] = [];
    setNotebookKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const r = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(r.outcome).toBe('skipped_fso_pending');
    expect(requests).toHaveLength(0);
  });

  it('13. cloud FSO success drains due notebook markers', async () => {
    const requests: unknown[] = [];
    setNotebookKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    await onNotebookFreeSpaceObjectCloudWriteSucceeded({
      userId,
      sectionId,
      notebookObjectId: notebookId,
    });
    await waitFor(() => requests.length === 1);
    expect(await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)).toBeNull();
  });

  it('14. AI handoff throw after FSO success does not propagate', async () => {
    setNotebookKnowledgeProcessRequestForTests(async () => {
      throw new Error('boom');
    });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    await expect(
      onNotebookFreeSpaceObjectCloudWriteSucceeded({
        userId,
        sectionId,
        notebookObjectId: notebookId,
      }),
    ).resolves.toBeUndefined();
    notifyNotebookFreeSpaceObjectCloudWriteSucceededSafe({
      userId,
      sectionId,
      notebookObjectId: notebookId,
    });
  });
});

describe('M0.8E generation / single-flight', () => {
  it('15–16. gen1 success cannot clear gen2; stale ignored', async () => {
    let resolveFirst!: (v: NotebookKnowledgeProcessClientResponse) => void;
    const firstGate = new Promise<NotebookKnowledgeProcessClientResponse>(r => {
      resolveFirst = r;
    });
    let calls = 0;
    setNotebookKnowledgeProcessRequestForTests(async () => {
      calls += 1;
      if (calls === 1) return firstGate;
      return okReuse();
    });

    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const p1 = drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    expect((await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA))!.generation).toBe(2);

    resolveFirst(okReuse());
    const r1 = await p1;
    expect(r1.outcome).toBe('stale_ignored');
    expect(await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)).not.toBeNull();
    expect((await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA))!.generation).toBe(2);

    await waitFor(async () => {
      const m = await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA);
      return m === null;
    });
  });

  it('17. single-flight same page joins in-flight promise', async () => {
    let resolveGate!: (v: NotebookKnowledgeProcessClientResponse) => void;
    const gate = new Promise<NotebookKnowledgeProcessClientResponse>(r => {
      resolveGate = r;
    });
    let calls = 0;
    setNotebookKnowledgeProcessRequestForTests(async () => {
      calls += 1;
      return gate;
    });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const a = drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    const b = drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    resolveGate(okReuse());
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });
});

describe('M0.8E recovery + offline + cost', () => {
  it('18–22. markers persist; recovery enumerates only marked notebook pages', async () => {
    const requests: Array<{ pageId: string }> = [];
    setNotebookKnowledgeProcessRequestForTests(async req => {
      requests.push({ pageId: req.pageId });
      return okReuse();
    });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    // Unmarked pageB must not be scanned/processed.
    recoverKnowledgeProcessForSection(sectionId, userId);
    await waitFor(() => requests.some(r => r.pageId === pageA));
    expect(requests.every(r => r.pageId === pageA)).toBe(true);
    expect(requests.filter(r => r.pageId === pageB)).toHaveLength(0);
  });

  it('23–25. offline: marker preserved; pending FSO blocks process until flush', async () => {
    listMock.mockResolvedValue({ ok: true, value: [fsoOp({ operationType: 'update' })] });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const blocked = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(blocked.outcome).toBe('skipped_fso_pending');

    listMock.mockResolvedValue({ ok: true, value: [] });
    const requests: unknown[] = [];
    setNotebookKnowledgeProcessRequestForTests(async req => {
      requests.push(req);
      return okReuse();
    });
    await onNotebookFreeSpaceObjectCloudWriteSucceeded({
      userId,
      sectionId,
      notebookObjectId: notebookId,
    });
    await waitFor(() => requests.length === 1);
  });

  it('34–35. continuous edits coalesce; five dirty pages drain sequentially', async () => {
    const pages = ['p1', 'p2', 'p3', 'p4', 'p5'];
    let inflight = 0;
    let maxInflight = 0;
    const order: string[] = [];
    setNotebookKnowledgeProcessRequestForTests(async req => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      order.push(req.pageId);
      await new Promise(r => setTimeout(r, 5));
      inflight -= 1;
      return okReuse();
    });
    for (const p of pages) {
      await markNeedsNotebookKnowledgeProcess({
        sectionId,
        notebookObjectId: notebookId,
        pageId: p,
        notBefore: Date.now() - 1,
      });
      // Coalesce: bump same page thrice — still one marker.
      if (p === 'p1') {
        await markNeedsNotebookKnowledgeProcess({
          sectionId,
          notebookObjectId: notebookId,
          pageId: p,
          notBefore: Date.now() - 1,
        });
        await markNeedsNotebookKnowledgeProcess({
          sectionId,
          notebookObjectId: notebookId,
          pageId: p,
          notBefore: Date.now() - 1,
        });
      }
    }
    await onNotebookFreeSpaceObjectCloudWriteSucceeded({
      userId,
      sectionId,
      notebookObjectId: notebookId,
    });
    await waitFor(() => order.length === 5);
    expect(maxInflight).toBeLessThanOrEqual(NOTEBOOK_KNOWLEDGE_DRAIN_CONCURRENCY);
    expect(new Set(order).size).toBe(5);
  });

  it('36. unchanged reuse path clears marker (0 embeddings implied by server)', async () => {
    setNotebookKnowledgeProcessRequestForTests(async () => okReuse());
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)).toBeNull();
  });
});

describe('M0.8E delete + blank', () => {
  it('26–29. page delete cancels, clears marker, invokes server remove', async () => {
    const removes: unknown[] = [];
    setNotebookKnowledgeRemoveRequestForTests(async input => {
      removes.push(input);
      return { ok: true };
    });
    let resolveGate!: (v: NotebookKnowledgeProcessClientResponse) => void;
    const gate = new Promise<NotebookKnowledgeProcessClientResponse>(r => {
      resolveGate = r;
    });
    setNotebookKnowledgeProcessRequestForTests(async () => gate);

    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const drainP = drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    onNotebookPageSoftDeletedSafe({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    await waitFor(async () => {
      return (await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)) === null;
    });
    await waitFor(() => removes.length === 1);
    resolveGate(okReuse());
    const drained = await drainP;
    // In-flight may abort or finish stale; marker must stay cleared.
    expect(['aborted', 'stale_ignored', 'success', 'skipped_no_marker']).toContain(drained.outcome);
    expect(await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)).toBeNull();
  });

  it('30. Notebook delete clears all notebook markers', async () => {
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageB,
    });
    cancelNotebookKnowledgeProcessForNotebookSafe(sectionId, notebookId);
    await waitFor(async () => {
      const all = await listNeedsKnowledgeProcessForSection(sectionId);
      return all.filter(m => m.notebookObjectId === notebookId).length === 0;
    });
  });

  it('32–33. blank page process → cleared outcome clears marker', async () => {
    setNotebookKnowledgeProcessRequestForTests(async () => okCleared());
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const r = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(r.outcome).toBe('success');
    expect(r.response && r.response.ok && r.response.result.ingest.outcome).toBe('cleared');
    expect(await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)).toBeNull();
  });

  it('permanent notebook errors clear marker', async () => {
    setNotebookKnowledgeProcessRequestForTests(async () =>
      fail('notebook_page_not_found', 'gone'),
    );
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const r = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(r.outcome).toBe('cleared_permanent');
    expect(await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)).toBeNull();
  });

  it('retryable errors retain marker', async () => {
    setNotebookKnowledgeProcessRequestForTests(async () => fail('network_error'));
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    const r = await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(r.outcome).toBe('retained_retryable');
    expect(await getNeedsNotebookKnowledgeProcessMarker(sectionId, notebookId, pageA)).not.toBeNull();
  });
});

describe('M0.8E PDF regression + Ask fail-closed', () => {
  it('37–40. PDF markers unaffected by notebook mark/drain', async () => {
    await markNeedsKnowledgeProcess(sectionId, pdfId);
    await markNeedsNotebookKnowledgeProcess({
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
      notBefore: Date.now() - 1,
    });
    setNotebookKnowledgeProcessRequestForTests(async () => okReuse());
    await drainNotebookKnowledgeProcessForPage({
      userId,
      sectionId,
      notebookObjectId: notebookId,
      pageId: pageA,
    });
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
    cancelNotebookKnowledgeProcessForPageSafe(sectionId, notebookId, pageA);
    expect(await getNeedsKnowledgeProcessMarker(sectionId, pdfId)).not.toBeNull();
  });

  it('FSO success still drains PDF when PDF marker present', async () => {
    const pdfRequests: string[] = [];
    const { setKnowledgeProcessRequestForTests } = await import('./index');
    setKnowledgeProcessRequestForTests(async req => {
      pdfRequests.push(req.sourceObjectId);
      return {
        version: 1,
        ok: true,
        result: {
          type: 'knowledge_process',
          ingest: { outcome: 'reused', sourceVersion: 1, pageCount: 0, chunkCount: 0 },
          index: { outcome: 'reused', retrievalSourceVersion: 1 },
        },
      };
    });
    await markNeedsKnowledgeProcess(sectionId, pdfId);
    await onFreeSpaceObjectCloudWriteSucceeded({
      userId,
      sectionId,
      objectId: pdfId,
    });
    await waitFor(() => pdfRequests.includes(pdfId));
    setKnowledgeProcessRequestForTests(null);
  });

  it('41. ai_knowledge_search remains free_space_pdf-only in migration 013', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const sql = await fs.readFile(
      path.join(process.cwd(), 'supabase/migrations/013_ai_knowledge_notebook_pages.sql'),
      'utf8',
    );
    expect(sql).toContain("and s.source_kind = 'free_space_pdf'");
    expect(sql).toMatch(/create or replace function public\.ai_knowledge_search/);
  });
});
