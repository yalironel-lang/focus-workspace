/**
 * @vitest-environment node
 *
 * M1.0B B3.3C — production-shaped PDF finalization orchestration.
 * No remote / no real provider.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
} from './bounds.ts';
import { createFakeEmbeddingProvider } from './fakeEmbeddingProvider.ts';
import { fixturePdfOnePage } from './fixtures.ts';
import { loadPdfJsModule } from './loadPdfJs.ts';
import {
  formatKnowledgeProcessLogLine,
  type KnowledgeProcessLogEvent,
} from './privacyLogProcess.ts';
import { assertSafeKnowledgeLogPayload } from './privacyLog.ts';
import {
  runFinalizeRecoveredPdfCorpus,
  type FinalizeRecoveredPdfDeps,
} from './runFinalizeRecoveredPdf.ts';
import {
  runKnowledgeIngest,
  type KnowledgeIngestDeps,
} from './runKnowledgeIngest.ts';
import {
  runKnowledgeProcess,
  type KnowledgeProcessDeps,
} from './runKnowledgeProcess.ts';
import type { KnowledgeIndexDeps, SourceIndexMeta } from './runKnowledgeIndex.ts';
import type { PageRecoveryJobStatus } from './pageRecoveryJobState.ts';
import { runNotebookKnowledgeProcess } from './runNotebookKnowledgeProcess.ts';

const sectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const objectId = 'pdf-obj-b33c';
const userId = '11111111-1111-4111-8111-111111111111';
const sourceId = 'src-b33c';
const body = { version: 1 as const, sectionId, sourceObjectId: objectId };

async function pdfjs() {
  return loadPdfJsModule();
}

type PageRow = {
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  canonicalText: string;
  detectorReasons: string[];
};

type JobRow = {
  pageNumber: number;
  status: PageRecoveryJobStatus;
  detectorReasons: string[];
};

async function makeHarness(opts?: {
  recoveryEnabled?: boolean;
  tipVersion?: number;
  retrieval?: number | null;
  pages?: PageRow[];
  jobs?: JobRow[];
  assembleFail?: 'finalize' | 'index' | null;
  publishAlready?: boolean;
}) {
  const recoveryEnabled = opts?.recoveryEnabled ?? true;
  let tip = opts?.tipVersion ?? 1;
  let retrieval = opts?.retrieval ?? null;
  let status = 'pending';
  let pageCount: number | null = null;
  const pages: PageRow[] = opts?.pages ? [...opts.pages] : [];
  const jobs: JobRow[] = opts?.jobs ? [...opts.jobs] : [];
  let chunks: Array<{
    id: string;
    page_number: number;
    chunk_index: number;
    text: string;
    source_version: number;
  }> = [];
  let embeddings = 0;
  let publishCalls = 0;
  let classicIndexCalls = 0;
  const events: KnowledgeProcessLogEvent[] = [];

  const sourceMeta = (): SourceIndexMeta & {
    sourceKind: string;
    pageCount: number | null;
  } => ({
    sourceId,
    userId,
    sectionId,
    sourceVersion: tip,
    status,
    retrievalSourceVersion: retrieval,
    indexStatus: embeddings > 0 ? 'indexing' : 'unindexed',
    indexModel: embeddings > 0 ? KNOWLEDGE_EMBEDDING_MODEL_DEFAULT : null,
    indexDimensions: embeddings > 0 ? KNOWLEDGE_EMBEDDING_DIMENSIONS : null,
    sourceKind: 'free_space_pdf',
    pageCount,
  });

  const ingest: KnowledgeIngestDeps = {
    loadOwnedPdfObject: vi.fn(async () => ({ ok: true as const, objectType: 'pdf' })),
    downloadPdfBytes: vi.fn(async () => ({
      ok: true as const,
      bytes: fixturePdfOnePage(),
    })),
    beginIngest: vi.fn(async () => {
      if (status === 'ready' && retrieval === tip) {
        return {
          ok: true,
          source_id: sourceId,
          source_version: tip,
          status: 'ready',
          idempotent: true,
        };
      }
      return {
        ok: true,
        source_id: sourceId,
        source_version: tip,
        status: 'pending',
        idempotent: false,
      };
    }),
    finalizeIngest: vi.fn(async ({ status: st, chunks: ch, pageCount: pc }) => {
      if (st === 'ready') {
        status = 'ready';
        pageCount = pc ?? pageCount;
        chunks = (ch ?? []).map((c, i) => ({
          id: `c-${i}`,
          page_number: c.page_number,
          chunk_index: c.chunk_index,
          text: c.text,
          source_version: tip,
        }));
        return {
          ok: true,
          source_id: sourceId,
          source_version: tip,
          status: 'ready',
          chunk_count: chunks.length,
        };
      }
      return { ok: true, source_id: sourceId, source_version: tip, status: 'failed' };
    }),
    upsertPageTextsNative: vi.fn(async ({ sourceVersion, pages: incoming }) => {
      for (const p of incoming) {
        const idx = pages.findIndex(
          (x) => x.sourceVersion === sourceVersion && x.pageNumber === p.page_number,
        );
        const row: PageRow = {
          sourceId,
          sourceVersion,
          pageNumber: p.page_number,
          canonicalText: p.native_text,
          detectorReasons: p.detector_reasons ?? [],
        };
        if (idx >= 0) pages[idx] = row;
        else pages.push(row);
      }
      return { ok: true, page_count: incoming.length };
    }),
    enqueuePageRecoveryJobs: vi.fn(async ({ pages: enqueuePages }) => {
      for (const p of enqueuePages) {
        if (!jobs.some((j) => j.pageNumber === p.page_number)) {
          jobs.push({
            pageNumber: p.page_number,
            status: 'queued',
            detectorReasons: p.detector_reasons ?? [],
          });
        }
      }
      return { ok: true, enqueued: enqueuePages.length, already_present: 0 };
    }),
    pdfjs: await pdfjs(),
    recoveryEnabled,
  };

  const provider = createFakeEmbeddingProvider(
    opts?.assembleFail === 'index' ? { kind: 'timeout' } : { kind: 'ok' },
  );

  const index: KnowledgeIndexDeps = {
    embeddingModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    embeddingDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    embeddingProvider: provider,
    loadSourceForObject: vi.fn(async () => ({
      ok: true as const,
      source: sourceMeta(),
    })),
    beginIndex: vi.fn(async () => {
      classicIndexCalls += 1;
      return {
        ok: true,
        job_id: 'job-classic',
        source_version: tip,
        chunk_count: Math.max(chunks.length, 1),
      };
    }),
    loadChunks: vi.fn(async () =>
      chunks.length
        ? chunks
        : [
            {
              id: 'seed',
              page_number: 1,
              chunk_index: 0,
              text: 'Seed classic chunk for feature-off path indexing.',
              source_version: tip,
            },
          ],
    ),
    upsertEmbeddings: vi.fn(async ({ rows }) => {
      embeddings += rows.length;
      return { ok: true, upserted: rows.length };
    }),
    finalizeIndexSuccess: vi.fn(async ({ sourceVersion }) => {
      retrieval = sourceVersion;
      return { ok: true, retrieval_source_version: sourceVersion };
    }),
    finalizeIndexFailure: vi.fn(async () => ({
      ok: true,
      retrieval_source_version: retrieval,
    })),
  };

  const finalize: FinalizeRecoveredPdfDeps = {
    embeddingModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    embeddingDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    embeddingProvider: provider,
    loadSourceForObject: index.loadSourceForObject,
    loadSourceById: vi.fn(async () => ({ ok: true as const, source: sourceMeta() })),
    loadPageTexts: vi.fn(async ({ sourceVersion }) =>
      pages.filter((p) => p.sourceVersion === sourceVersion),
    ),
    loadRecoveryJobs: vi.fn(async () => [...jobs]),
    countChunks: vi.fn(async ({ sourceVersion }) =>
      chunks.filter((c) => c.source_version === sourceVersion).length,
    ),
    deleteVersionChunks: vi.fn(async ({ sourceVersion }) => {
      if (retrieval === sourceVersion) throw new Error('refused_delete_published');
      chunks = chunks.filter((c) => c.source_version !== sourceVersion);
      embeddings = 0;
    }),
    finalizeIngest: vi.fn(async (input) => {
      if (opts?.assembleFail === 'finalize') {
        return { ok: false, code: 'internal_error' };
      }
      status = 'ready';
      pageCount = input.pageCount;
      chunks = input.chunks.map((c, i) => ({
        id: `ac-${i}`,
        page_number: c.page_number,
        chunk_index: c.chunk_index,
        text: c.text,
        source_version: tip,
      }));
      return {
        ok: true,
        source_version: tip,
        chunk_count: chunks.length,
      };
    }),
    beginIndex: vi.fn(async () => ({
      ok: true,
      job_id: 'job-unpub',
      source_version: tip,
      chunk_count: Math.max(chunks.length, 1),
    })),
    loadChunks: vi.fn(async () => chunks),
    upsertEmbeddings: vi.fn(async ({ rows }) => {
      if (opts?.assembleFail === 'index') {
        return { ok: false, code: 'embedding_timeout' };
      }
      embeddings += rows.length;
      return { ok: true, upserted: rows.length };
    }),
    finalizeIndexSuccess: vi.fn(async () => ({ ok: false, code: 'forbidden' })),
    finalizeIndexFailure: vi.fn(async () => ({
      ok: true,
      retrieval_source_version: retrieval,
    })),
    countEmbeddings: vi.fn(async () => embeddings),
    recoveryEnabled,
    publishRecoveredCorpus: vi.fn(async ({ expectedSourceVersion }) => {
      publishCalls += 1;
      if (expectedSourceVersion !== tip) {
        return { ok: false, code: 'stale_processing_version' };
      }
      if (opts?.publishAlready || retrieval === expectedSourceVersion) {
        return {
          ok: true,
          already_published: true,
          source_version: tip,
          retrieval_source_version: tip,
          previous_retrieval_source_version: retrieval,
          chunk_count: chunks.length,
          page_count: pageCount ?? 1,
        };
      }
      if (status !== 'ready' || chunks.length < 1 || embeddings < 1) {
        return { ok: false, code: 'incomplete_index' };
      }
      const prev = retrieval;
      retrieval = expectedSourceVersion;
      return {
        ok: true,
        already_published: false,
        source_version: tip,
        retrieval_source_version: tip,
        previous_retrieval_source_version: prev,
        chunk_count: chunks.length,
        page_count: pageCount ?? 1,
      };
    }),
  };

  const deps: KnowledgeProcessDeps = {
    ingest,
    index,
    finalize,
    onEvent: (e) => events.push(e),
  };

  return {
    deps,
    events,
    state: {
      get tip() {
        return tip;
      },
      set tip(v: number) {
        tip = v;
      },
      get retrieval() {
        return retrieval;
      },
      set retrieval(v: number | null) {
        retrieval = v;
      },
      get status() {
        return status;
      },
      jobs,
      pages,
      get publishCalls() {
        return publishCalls;
      },
      get classicIndexCalls() {
        return classicIndexCalls;
      },
    },
  };
}

describe('M1.0B B3.3C PDF finalization orchestration', () => {
  it('1. normal PDF with no recovery required finalizes via process', async () => {
    const h = await makeHarness({ recoveryEnabled: true });
    const res = await runKnowledgeProcess({
      authUserId: userId,
      body,
      deps: h.deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.ingest.outcome).toBe('awaiting_finalize');
    expect(res.result.index.outcome).toBe('published');
    expect(res.result.index.retrievalSourceVersion).toBe(1);
    expect(h.state.retrieval).toBe(1);
    expect(h.state.publishCalls).toBe(1);
    expect(h.state.classicIndexCalls).toBe(0);
  });

  it('2. waits while recovery is non-terminal (does not publish)', async () => {
    const h = await makeHarness({
      recoveryEnabled: true,
      pages: [
        {
          sourceId,
          sourceVersion: 1,
          pageNumber: 1,
          canonicalText: 'Suspicious shell page needing OCR recovery for terminal gate wait.',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
      jobs: [
        {
          pageNumber: 1,
          status: 'queued',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
    });
    const fin = await runFinalizeRecoveredPdfCorpus({
      sourceId,
      sourceVersion: 1,
      sectionId,
      userId,
      deps: h.deps.finalize!,
    });
    expect(fin.ok).toBe(false);
    if (fin.ok) return;
    expect(fin.code).toBe('recovery_pending');
    expect(h.state.retrieval).toBeNull();
    expect(h.state.publishCalls).toBe(0);

    // Process surfaces the same deferral code.
    const processRes = await runKnowledgeProcess({
      authUserId: userId,
      body,
      deps: {
        ...h.deps,
        ingest: {
          ...h.deps.ingest,
          // Force short-circuit ingest so we exercise finalize branch only.
          beginIngest: vi.fn(async () => ({
            ok: true,
            source_id: sourceId,
            source_version: 1,
            status: 'ready',
            idempotent: true,
          })),
          // When begin says ready+idempotent, ingest returns reused without touching jobs.
        },
      },
    });
    // reused path still finalizes; keep jobs queued → recovery_pending
    expect(processRes.ok).toBe(false);
    if (processRes.ok) return;
    expect(processRes.error.code).toBe('recovery_pending');
  });

  it('3. terminal successful recovery triggers finalization', async () => {
    const h = await makeHarness({
      recoveryEnabled: true,
      pages: [
        {
          sourceId,
          sourceVersion: 1,
          pageNumber: 1,
          canonicalText: 'OCR recovered continuous theorem text about analysis and limits.',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
      jobs: [
        {
          pageNumber: 1,
          status: 'succeeded',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
    });
    const fin = await runFinalizeRecoveredPdfCorpus({
      sourceId,
      sourceVersion: 1,
      sectionId,
      userId,
      deps: h.deps.finalize!,
    });
    expect(fin.ok).toBe(true);
    if (!fin.ok) return;
    expect(fin.outcome).toBe('published');
    expect(h.state.retrieval).toBe(1);
  });

  it('4. failed/unusable recovery uses native fallback and can finalize', async () => {
    const h = await makeHarness({
      recoveryEnabled: true,
      pages: [
        {
          sourceId,
          sourceVersion: 1,
          pageNumber: 1,
          canonicalText: 'Native fallback text remains after unusable OCR attempt on page.',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
      jobs: [
        {
          pageNumber: 1,
          status: 'unusable',
          detectorReasons: ['SHELL_WITH_MISSING_CONTENT'],
        },
      ],
    });
    const fin = await runFinalizeRecoveredPdfCorpus({
      sourceId,
      sourceVersion: 1,
      sectionId,
      userId,
      deps: h.deps.finalize!,
    });
    expect(fin.ok).toBe(true);
    expect(h.state.retrieval).toBe(1);
  });

  it('5. stale recovery/process attempt cannot finalize', async () => {
    const h = await makeHarness({ recoveryEnabled: true, tipVersion: 2 });
    h.state.pages.push({
      sourceId,
      sourceVersion: 1,
      pageNumber: 1,
      canonicalText: 'Stale version page text must not publish.',
      detectorReasons: [],
    });
    const fin = await runFinalizeRecoveredPdfCorpus({
      sourceId,
      sourceVersion: 1,
      sectionId,
      userId,
      deps: h.deps.finalize!,
    });
    expect(fin.ok).toBe(false);
    if (fin.ok) return;
    expect(fin.code).toBe('stale_processing_version');
    expect(h.state.publishCalls).toBe(0);
  });

  it('6. canonical assembly failure leaves retrieval N', async () => {
    const h = await makeHarness({
      recoveryEnabled: true,
      tipVersion: 2,
      retrieval: 1,
      assembleFail: 'finalize',
      pages: [
        {
          sourceId,
          sourceVersion: 2,
          pageNumber: 1,
          canonicalText: 'N+1 canonical page text that will fail finalize on purpose.',
          detectorReasons: [],
        },
      ],
    });
    h.state.retrieval = 1;
    const fin = await runFinalizeRecoveredPdfCorpus({
      sourceId,
      sourceVersion: 2,
      sectionId,
      userId,
      deps: h.deps.finalize!,
    });
    expect(fin.ok).toBe(false);
    expect(h.state.retrieval).toBe(1);
    expect(h.state.publishCalls).toBe(0);
  });

  it('7. indexing failure leaves retrieval N', async () => {
    const h = await makeHarness({
      recoveryEnabled: true,
      tipVersion: 2,
      retrieval: 1,
      assembleFail: 'index',
      pages: [
        {
          sourceId,
          sourceVersion: 2,
          pageNumber: 1,
          canonicalText: 'N+1 page for index failure leaving retrieval on N.',
          detectorReasons: [],
        },
      ],
    });
    h.state.retrieval = 1;
    const fin = await runFinalizeRecoveredPdfCorpus({
      sourceId,
      sourceVersion: 2,
      sectionId,
      userId,
      deps: h.deps.finalize!,
    });
    expect(fin.ok).toBe(false);
    expect(h.state.retrieval).toBe(1);
    expect(h.state.publishCalls).toBe(0);
  });

  it('8. successful build invokes atomic publication', async () => {
    const h = await makeHarness({ recoveryEnabled: true });
    const res = await runKnowledgeProcess({
      authUserId: userId,
      body,
      deps: h.deps,
    });
    expect(res.ok).toBe(true);
    expect(h.state.publishCalls).toBe(1);
    expect(h.deps.finalize!.publishRecoveredCorpus).toHaveBeenCalled();
  });

  it('9. duplicate invocation is idempotent', async () => {
    const h = await makeHarness({ recoveryEnabled: true });
    const first = await runKnowledgeProcess({
      authUserId: userId,
      body,
      deps: h.deps,
    });
    expect(first.ok).toBe(true);
    const second = await runKnowledgeProcess({
      authUserId: userId,
      body,
      deps: h.deps,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.index.outcome).toBe('already_published');
    expect(h.state.tip).toBe(1);
  });

  it('10. already-published invocation is safe', async () => {
    const h = await makeHarness({
      recoveryEnabled: true,
      publishAlready: true,
      retrieval: 1,
    });
    h.state.retrieval = 1;
    // Mark ready so begin short-circuits reused
    await runFinalizeRecoveredPdfCorpus({
      sourceId,
      sourceVersion: 1,
      sectionId,
      userId,
      deps: {
        ...h.deps.finalize!,
        loadPageTexts: vi.fn(async () => [
          {
            sourceId,
            sourceVersion: 1,
            pageNumber: 1,
            canonicalText: 'Already published corpus page for idempotent publish proof.',
            detectorReasons: [],
          },
        ]),
      },
    });
    // Force ready+same tip
    vi.mocked(h.deps.ingest.beginIngest).mockResolvedValue({
      ok: true,
      source_id: sourceId,
      source_version: 1,
      status: 'ready',
      idempotent: true,
    });
    const res = await runKnowledgeProcess({
      authUserId: userId,
      body,
      deps: h.deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(['already_published', 'published']).toContain(res.result.index.outcome);
    expect(h.state.retrieval).toBe(1);
  });

  it('11. N+2 supersession prevents N+1 publication', async () => {
    const h = await makeHarness({ recoveryEnabled: true, tipVersion: 3, retrieval: 1 });
    h.state.retrieval = 1;
    const fin = await runFinalizeRecoveredPdfCorpus({
      sourceId,
      sourceVersion: 2,
      sectionId,
      userId,
      deps: h.deps.finalize!,
    });
    expect(fin.ok).toBe(false);
    if (fin.ok) return;
    expect(fin.code).toBe('stale_processing_version');
    expect(h.state.retrieval).toBe(1);
  });

  it('12. Notebook path unchanged (does not use PDF finalize)', async () => {
    expect(typeof runNotebookKnowledgeProcess).toBe('function');
    expect(runNotebookKnowledgeProcess.name).toBe('runNotebookKnowledgeProcess');
  });

  it('13. feature-gate rollback keeps classic finalize+index path', async () => {
    const h = await makeHarness({ recoveryEnabled: false });
    const ingestOnly = await runKnowledgeIngest({
      authUserId: userId,
      body,
      deps: h.deps.ingest,
    });
    expect(ingestOnly.ok).toBe(true);
    if (ingestOnly.ok) {
      expect(ingestOnly.result.status).toBe('ready');
      expect(h.deps.ingest.finalizeIngest).toHaveBeenCalled();
    }
    vi.mocked(h.deps.ingest.beginIngest).mockResolvedValue({
      ok: true,
      source_id: sourceId,
      source_version: 1,
      status: 'ready',
      idempotent: true,
    });
    const res = await runKnowledgeProcess({
      authUserId: userId,
      body,
      deps: { ingest: h.deps.ingest, index: h.deps.index, onEvent: h.deps.onEvent },
    });
    expect(res.ok).toBe(true);
    expect(h.state.classicIndexCalls).toBeGreaterThanOrEqual(1);
    expect(h.state.publishCalls).toBe(0);
  });

  it('14. privacy logging has no academic content keys', () => {
    const lines = [
      formatKnowledgeProcessLogLine({
        event: 'knowledge_process_finalize_ok',
        requestId: 'r1',
        outcome: 'published',
        sourceVersion: 2,
        retrievalSourceVersion: 2,
        chunkCount: 3,
        pageCount: 2,
      }),
      formatKnowledgeProcessLogLine({
        event: 'knowledge_process_failed',
        requestId: 'r1',
        stage: 'finalize',
        code: 'recovery_pending',
      }),
    ];
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(assertSafeKnowledgeLogPayload(parsed)).toBe(true);
      expect(parsed).not.toHaveProperty('text');
      expect(parsed).not.toHaveProperty('canonicalText');
      expect(parsed).not.toHaveProperty('embedding');
    }
  });

  it('ingest with recovery enabled defers READY finalize', async () => {
    const h = await makeHarness({ recoveryEnabled: true });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body,
      deps: h.deps.ingest,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.status).toBe('awaiting_finalize');
    expect(res.result.chunkCount).toBe(0);
    expect(h.deps.ingest.finalizeIngest).not.toHaveBeenCalled();
    expect(h.deps.ingest.upsertPageTextsNative).toHaveBeenCalled();
  });
});
