/**
 * @vitest-environment node
 *
 * M0.7A — knowledge process orchestration (no remote, no real provider).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
} from './bounds.ts';
import type { IndexableChunk } from './batchChunks.ts';
import {
  createFakeEmbeddingProvider,
} from './fakeEmbeddingProvider.ts';
import { fixturePdfBlank, fixturePdfOnePage } from './fixtures.ts';
import { loadPdfJsModule } from './loadPdfJs.ts';
import { assertSafeKnowledgeLogPayload } from './privacyLog.ts';
import {
  formatKnowledgeProcessLogLine,
  type KnowledgeProcessLogEvent,
} from './privacyLogProcess.ts';
import {
  parseKnowledgeIngestRequest,
  runKnowledgeIngest,
  type KnowledgeIngestDeps,
} from './runKnowledgeIngest.ts';
import {
  parseKnowledgeIndexRequest,
  runKnowledgeIndex,
  type KnowledgeIndexDeps,
  type SourceIndexMeta,
} from './runKnowledgeIndex.ts';
import {
  parseKnowledgeProcessRequest,
  runKnowledgeProcess,
  type KnowledgeProcessDeps,
} from './runKnowledgeProcess.ts';

async function pdfjs() {
  return loadPdfJsModule();
}

const sectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const objectId = 'pdf-obj-process-1';
const userId = '11111111-1111-4111-8111-111111111111';
const body = { version: 1 as const, sectionId, sourceObjectId: objectId };

function chunk(
  id: string,
  page: number,
  index: number,
  text: string,
  version = 1,
): IndexableChunk {
  return {
    id,
    page_number: page,
    chunk_index: index,
    text,
    source_version: version,
  };
}

function baseSource(over?: Partial<SourceIndexMeta>): SourceIndexMeta {
  return {
    sourceId: 'src-1',
    userId,
    sectionId,
    sourceVersion: 1,
    status: 'ready',
    retrievalSourceVersion: null,
    indexStatus: 'unindexed',
    indexModel: null,
    indexDimensions: null,
    ...over,
  };
}

async function makeIngestDeps(
  overrides?: Partial<KnowledgeIngestDeps>,
): Promise<KnowledgeIngestDeps> {
  const bytes = fixturePdfOnePage();
  return {
    loadOwnedPdfObject: vi.fn(async () => ({ ok: true as const, objectType: 'pdf' })),
    downloadPdfBytes: vi.fn(async () => ({ ok: true as const, bytes })),
    beginIngest: vi.fn(async () => ({
      ok: true,
      source_id: 'src-1',
      source_version: 1,
      status: 'pending',
      idempotent: false,
    })),
    finalizeIngest: vi.fn(async ({ status, chunks }) => {
      if (status === 'ready') {
        return {
          ok: true,
          source_id: 'src-1',
          source_version: 1,
          status: 'ready',
          chunk_count: chunks?.length ?? 0,
        };
      }
      return {
        ok: true,
        source_id: 'src-1',
        source_version: 1,
        status: 'failed',
        preserved_corpus: false,
      };
    }),
    upsertPageTextsNative: vi.fn(async ({ pages }) => ({
      ok: true,
      page_count: pages.length,
    })),
    enqueuePageRecoveryJobs: vi.fn(async () => ({
      ok: true,
      enqueued: 0,
      already_present: 0,
    })),
    pdfjs: await pdfjs(),
    ...overrides,
  };
}

async function makeIndexDeps(
  overrides?: Partial<KnowledgeIndexDeps> & {
    chunks?: IndexableChunk[];
    source?: SourceIndexMeta;
  },
): Promise<KnowledgeIndexDeps & { provider: ReturnType<typeof createFakeEmbeddingProvider> }> {
  const provider = createFakeEmbeddingProvider({ kind: 'ok' });
  const source = overrides?.source ?? baseSource();
  const chunks =
    overrides?.chunks ??
    [
      chunk('c1', 1, 0, 'Alpha chunk about photosynthesis and chlorophyll.'),
      chunk('c2', 1, 1, 'Beta chunk about cellular respiration pathways.'),
    ];

  let jobId = 'job-1';
  let indexingVersion = source.sourceVersion;
  const stored = new Map<string, number[]>();

  const deps: KnowledgeIndexDeps = {
    embeddingModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    embeddingDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    embeddingProvider: provider,
    loadSourceForObject: vi.fn(async () => ({ ok: true as const, source })),
    beginIndex: vi.fn(async () => {
      jobId = `job-${Math.random().toString(16).slice(2, 10)}`;
      indexingVersion = source.sourceVersion;
      return {
        ok: true,
        job_id: jobId,
        source_version: source.sourceVersion,
        chunk_count: chunks.length,
      };
    }),
    loadChunks: vi.fn(async () => chunks.filter((c) => c.source_version === indexingVersion)),
    upsertEmbeddings: vi.fn(async ({ jobId: j, rows, sourceVersion }) => {
      if (j !== jobId || sourceVersion !== indexingVersion) {
        return { ok: false, code: 'stale_job' };
      }
      for (const r of rows) stored.set(r.chunkId, r.embedding);
      return { ok: true, upserted: rows.length };
    }),
    finalizeIndexSuccess: vi.fn(async ({ jobId: j, sourceVersion }) => {
      if (j !== jobId || sourceVersion !== indexingVersion) {
        return { ok: false, code: 'stale_job' };
      }
      source.retrievalSourceVersion = sourceVersion;
      source.indexStatus = 'indexed';
      source.indexModel = KNOWLEDGE_EMBEDDING_MODEL_DEFAULT;
      source.indexDimensions = KNOWLEDGE_EMBEDDING_DIMENSIONS;
      return { ok: true, retrieval_source_version: sourceVersion };
    }),
    finalizeIndexFailure: vi.fn(async () => {
      source.indexStatus = 'index_failed';
      return {
        ok: true,
        retrieval_source_version: source.retrievalSourceVersion,
      };
    }),
    ...overrides,
  };

  return Object.assign(deps, { provider });
}

async function makeProcessDeps(opts?: {
  ingest?: Partial<KnowledgeIngestDeps>;
  index?: Partial<KnowledgeIndexDeps> & {
    chunks?: IndexableChunk[];
    source?: SourceIndexMeta;
  };
  events?: KnowledgeProcessLogEvent[];
}): Promise<{
  deps: KnowledgeProcessDeps;
  ingest: KnowledgeIngestDeps;
  index: KnowledgeIndexDeps & { provider: ReturnType<typeof createFakeEmbeddingProvider> };
  events: KnowledgeProcessLogEvent[];
}> {
  const events = opts?.events ?? [];
  const ingest = await makeIngestDeps(opts?.ingest);
  const index = await makeIndexDeps(opts?.index);
  const deps: KnowledgeProcessDeps = {
    ingest,
    index,
    onEvent: (e) => events.push(e),
  };
  return { deps, ingest, index, events };
}

describe('M0.7A parseKnowledgeProcessRequest', () => {
  it('accepts minimal client body', () => {
    expect(parseKnowledgeProcessRequest(body).ok).toBe(true);
  });

  it('rejects malformed request', () => {
    expect(parseKnowledgeProcessRequest(null).ok).toBe(false);
    expect(parseKnowledgeProcessRequest({ version: 2, sectionId, sourceObjectId: objectId }).ok).toBe(
      false,
    );
    expect(parseKnowledgeProcessRequest({ version: 1, sectionId: 'not-uuid', sourceObjectId: objectId }).ok).toBe(
      false,
    );
  });

  it('rejects client-controlled authority fields', () => {
    const forbidden = [
      { userId: 'evil' },
      { storagePath: 'evil/path' },
      { contentHash: 'abc' },
      { sourceVersion: 9 },
      { retrievalSourceVersion: 9 },
      { jobId: 'j' },
      { model: 'evil-model' },
      { dimensions: 768 },
      { embeddings: [[0.1]] },
      { vectors: [[0.1]] },
      { chunks: [] },
    ];
    for (const extra of forbidden) {
      expect(
        parseKnowledgeProcessRequest({ ...body, ...extra }).ok,
        `should reject ${Object.keys(extra)[0]}`,
      ).toBe(false);
    }
  });
});

describe('M0.7A privacy log', () => {
  it('process log lines have no text/vector/JWT keys', () => {
    const lines = [
      formatKnowledgeProcessLogLine({
        event: 'knowledge_process_begin',
        requestId: 'r1',
        hasUser: true,
        hasSection: true,
        hasObject: true,
        latencyMs: 1,
      }),
      formatKnowledgeProcessLogLine({
        event: 'knowledge_process_ingest_ok',
        requestId: 'r1',
        outcome: 'ready',
        sourceVersion: 1,
        pageCount: 1,
        chunkCount: 2,
      }),
      formatKnowledgeProcessLogLine({
        event: 'knowledge_process_index_ok',
        requestId: 'r1',
        outcome: 'indexed',
        retrievalSourceVersion: 1,
        batchCount: 1,
      }),
      formatKnowledgeProcessLogLine({
        event: 'knowledge_process_failed',
        requestId: 'r1',
        stage: 'index',
        code: 'stale_job',
      }),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/text|embedding|vector|Authorization|Bearer|chunkText/i);
      expect(assertSafeKnowledgeLogPayload(JSON.parse(line))).toBe(true);
    }
  });
});

describe('M0.7A runKnowledgeProcess orchestration', () => {
  it('1. ingest success → index success', async () => {
    const { deps, ingest, index, events } = await makeProcessDeps();
    const res = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.type).toBe('knowledge_process');
    expect(res.result.ingest.outcome).toBe('ready');
    expect(res.result.ingest.sourceVersion).toBe(1);
    expect(res.result.ingest.chunkCount).toBeGreaterThan(0);
    expect(res.result.index.outcome).toBe('indexed');
    expect(res.result.index.retrievalSourceVersion).toBe(1);
    expect(ingest.finalizeIngest).toHaveBeenCalled();
    expect(index.finalizeIndexSuccess).toHaveBeenCalled();
    expect(index.provider.calls.length).toBeGreaterThanOrEqual(1);
    expect(events.map((e) => e.event)).toEqual([
      'knowledge_process_begin',
      'knowledge_process_ingest_ok',
      'knowledge_process_index_ok',
    ]);
    // Privacy: success result must not expose sourceId / paths / hashes / vectors.
    const json = JSON.stringify(res);
    expect(json).not.toMatch(/src-1|storagePath|contentHash|embedding/i);
  });

  it('2. ingest reused → index reused', async () => {
    const source = baseSource({
      indexStatus: 'indexed',
      retrievalSourceVersion: 1,
      indexModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      indexDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    });
    const { deps, ingest, index } = await makeProcessDeps({
      ingest: {
        beginIngest: vi.fn(async () => ({
          ok: true,
          source_id: 'src-1',
          source_version: 1,
          status: 'ready',
          idempotent: true,
        })),
      },
      index: { source },
    });
    const res = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.ingest.outcome).toBe('reused');
    expect(res.result.index.outcome).toBe('reused');
    expect(ingest.finalizeIngest).not.toHaveBeenCalled();
    expect(index.beginIndex).not.toHaveBeenCalled();
    expect(index.provider.calls.length).toBe(0);
  });

  it('3. ingest failure → index NOT called', async () => {
    const { deps, index, events } = await makeProcessDeps({
      ingest: {
        downloadPdfBytes: vi.fn(async () => ({
          ok: true as const,
          bytes: fixturePdfBlank(),
        })),
      },
    });
    const res = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('no_extractable_text');
    expect(index.loadSourceForObject).not.toHaveBeenCalled();
    expect(index.beginIndex).not.toHaveBeenCalled();
    expect(index.provider.calls.length).toBe(0);
    expect(events.some((e) => e.event === 'knowledge_process_failed' && e.stage === 'ingest')).toBe(
      true,
    );
    expect(events.some((e) => e.event === 'knowledge_process_index_ok')).toBe(false);
  });

  it('4. index failure → process fails safely; no retrieval flip', async () => {
    const source = baseSource({ retrievalSourceVersion: 1 });
    const { deps, index } = await makeProcessDeps({
      index: {
        source,
        embeddingProvider: createFakeEmbeddingProvider({ kind: 'http', status: 429 }),
      },
    });
    const res = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('embedding_rate_limited');
    expect(index.finalizeIndexFailure).toHaveBeenCalled();
    expect(index.finalizeIndexSuccess).not.toHaveBeenCalled();
    expect(source.retrievalSourceVersion).toBe(1);
  });

  it('5. unchanged PDF repeated processing remains idempotent', async () => {
    const source = baseSource();
    const { deps, index } = await makeProcessDeps({ index: { source } });

    const first = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result.ingest.outcome).toBe('ready');
    expect(first.result.index.outcome).toBe('indexed');
    const providerCallsAfterFirst = index.provider.calls.length;

    // Second pass: same bytes → ingest reuse + already-indexed reuse.
    vi.mocked(deps.ingest.beginIngest).mockResolvedValue({
      ok: true,
      source_id: 'src-1',
      source_version: 1,
      status: 'ready',
      idempotent: true,
    });
    // source was mutated to indexed by finalizeIndexSuccess
    const second = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.ingest.outcome).toBe('reused');
    expect(second.result.index.outcome).toBe('reused');
    expect(index.provider.calls.length).toBe(providerCallsAfterFirst);
    expect(deps.ingest.finalizeIngest).toHaveBeenCalledTimes(1);
  });

  it('6. foreign section/source denied', async () => {
    const { deps, index } = await makeProcessDeps({
      ingest: {
        loadOwnedPdfObject: vi.fn(async () => ({
          ok: false as const,
          code: 'auth_mismatch',
        })),
      },
    });
    const res = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('auth_mismatch');
    expect(index.beginIndex).not.toHaveBeenCalled();
  });

  it('7. non-PDF denied', async () => {
    const { deps, index } = await makeProcessDeps({
      ingest: {
        loadOwnedPdfObject: vi.fn(async () => ({ ok: false as const, code: 'not_pdf' })),
      },
    });
    const res = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('not_pdf');
    expect(index.beginIndex).not.toHaveBeenCalled();
  });

  it('8. malformed request denied', async () => {
    const { deps, ingest, index } = await makeProcessDeps();
    const res = await runKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId, model: 'evil' },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('invalid_request');
    expect(ingest.beginIngest).not.toHaveBeenCalled();
    expect(index.beginIndex).not.toHaveBeenCalled();
  });

  it('9. deleted/missing source fails safely', async () => {
    const { deps, index } = await makeProcessDeps({
      ingest: {
        downloadPdfBytes: vi.fn(async () => ({ ok: false as const, code: 'not_found' })),
      },
    });
    const res = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('not_found');
    expect(index.beginIndex).not.toHaveBeenCalled();
  });

  it('10. stale/replacement race does not incorrectly flip retrieval', async () => {
    const source = baseSource({ retrievalSourceVersion: 1 });
    const { deps, index } = await makeProcessDeps({
      index: {
        source,
        upsertEmbeddings: vi.fn(async () => ({ ok: false, code: 'stale_job' })),
      },
    });
    const res = await runKnowledgeProcess({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('stale_job');
    expect(index.finalizeIndexSuccess).not.toHaveBeenCalled();
    expect(source.retrievalSourceVersion).toBe(1);
  });

  it('11. no client-controlled model/path/hash/vector authority in process result', async () => {
    const { deps } = await makeProcessDeps();
    const res = await runKnowledgeProcess({
      authUserId: userId,
      body: {
        version: 1,
        sectionId,
        sourceObjectId: objectId,
        contentHash: 'forged',
        storagePath: 'forged/path',
        model: 'text-embedding-3-large',
        embeddings: [[1, 2, 3]],
      },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('invalid_request');
    expect(JSON.stringify(res.error)).not.toMatch(/forged|text-embedding-3-large|\[1,2,3\]/);
  });

  it('14. privacy-safe errors/results (unauthenticated)', async () => {
    const { deps } = await makeProcessDeps();
    const res = await runKnowledgeProcess({ authUserId: null, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('unauthenticated');
    expect(JSON.stringify(res)).not.toMatch(/Bearer|service_role|apiKey|embedding/i);
  });
});

describe('M0.7A existing endpoint regression', () => {
  it('12. existing ingest endpoint logic still accepts minimal body and rejects authority', async () => {
    expect(parseKnowledgeIngestRequest(body).ok).toBe(true);
    expect(
      parseKnowledgeIngestRequest({ ...body, storagePath: 'evil' }).ok,
    ).toBe(false);

    const ingest = await makeIngestDeps();
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body,
      deps: ingest,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.status).toBe('ready');
  });

  it('13. existing index endpoint logic still indexes via fake provider', async () => {
    expect(parseKnowledgeIndexRequest(body).ok).toBe(true);
    expect(parseKnowledgeIndexRequest({ ...body, model: 'evil' }).ok).toBe(false);

    const index = await makeIndexDeps();
    const res = await runKnowledgeIndex({
      authUserId: userId,
      body,
      deps: index,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.status).toBe('indexed');
    expect(index.provider.calls.length).toBeGreaterThanOrEqual(1);
  });
});
