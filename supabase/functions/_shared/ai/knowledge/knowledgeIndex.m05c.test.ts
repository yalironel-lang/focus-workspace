/**
 * M0.5C Phase 2 — embedding adapter, batching, indexing orchestrator (unit tests).
 * Uses fake provider only. No network. No remote Postgres. No real OpenAI.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
  KNOWLEDGE_EMBED_MAX_CHARS_PER_BATCH,
  KNOWLEDGE_EMBED_MAX_CHUNKS_PER_BATCH,
} from './bounds.ts';
import {
  batchChunksForEmbedding,
  embeddingInputForChunk,
  sortChunksForEmbedding,
  type IndexableChunk,
} from './batchChunks.ts';
import {
  createFakeEmbeddingProvider,
  fakeEmbeddingForText,
} from './fakeEmbeddingProvider.ts';
import {
  embeddingsUrl,
  validateEmbeddingsResponse,
} from './providerEmbeddings.ts';
import { routeEmbeddingModel } from './routeEmbedding.ts';
import {
  parseKnowledgeIndexRequest,
  runKnowledgeIndex,
  type KnowledgeIndexDeps,
  type SourceIndexMeta,
} from './runKnowledgeIndex.ts';
import { mapEmbeddingErrorToIndexFailureCode } from './embeddingTypes.ts';
import { formatKnowledgeIndexLogLine } from './privacyLogIndex.ts';

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
    sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: '11111111-1111-4111-8111-111111111111',
    sectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    sourceVersion: 1,
    status: 'ready',
    retrievalSourceVersion: null,
    indexStatus: 'unindexed',
    indexModel: null,
    indexDimensions: null,
    ...over,
  };
}

async function baseDeps(
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
      chunk('c3', 2, 0, 'Gamma chunk about mitochondria energy transfer.'),
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
      if (stored.size < chunks.filter((c) => c.source_version === sourceVersion).length) {
        return { ok: false, code: 'incomplete_embeddings' };
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

describe('M0.5C Phase 2 route + URL + validation', () => {
  it('routes default model/dimensions; rejects non-1536', () => {
    expect(routeEmbeddingModel()).toEqual({
      providerId: 'openai_compatible',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    });
    expect(() => routeEmbeddingModel({ dimensions: 768 })).toThrow(/1536/);
  });

  it('builds /v1/embeddings from OpenAI-style base', () => {
    expect(embeddingsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/embeddings',
    );
    expect(embeddingsUrl('https://api.openai.com')).toBe(
      'https://api.openai.com/v1/embeddings',
    );
  });

  it('validateEmbeddingsResponse accepts ordered finite vectors', () => {
    const v0 = fakeEmbeddingForText('a');
    const v1 = fakeEmbeddingForText('b');
    const ok = validateEmbeddingsResponse({
      body: {
        model: 'text-embedding-3-small',
        data: [
          { index: 1, embedding: v1 },
          { index: 0, embedding: v0 },
        ],
        usage: { prompt_tokens: 12, total_tokens: 12 },
      },
      expectedCount: 2,
      expectedDimensions: 1536,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.embeddings[0]).toEqual(v0);
    expect(ok.embeddings[1]).toEqual(v1);
    expect(ok.usage?.inputTokens).toBe(12);
  });

  it('rejects wrong dims / NaN / duplicate / missing index / count mismatch', () => {
    const good = fakeEmbeddingForText('x');
    expect(
      validateEmbeddingsResponse({
        body: { data: [{ index: 0, embedding: good.slice(0, 10) }] },
        expectedCount: 1,
        expectedDimensions: 1536,
      }).ok,
    ).toBe(false);
    const nan = [...good];
    nan[0] = Number.NaN;
    expect(
      validateEmbeddingsResponse({
        body: { data: [{ index: 0, embedding: nan }] },
        expectedCount: 1,
        expectedDimensions: 1536,
      }).ok,
    ).toBe(false);
    expect(
      validateEmbeddingsResponse({
        body: {
          data: [
            { index: 0, embedding: good },
            { index: 0, embedding: good },
          ],
        },
        expectedCount: 2,
        expectedDimensions: 1536,
      }).ok,
    ).toBe(false);
    expect(
      validateEmbeddingsResponse({
        body: { data: [{ index: 0, embedding: good }] },
        expectedCount: 2,
        expectedDimensions: 1536,
      }).ok,
    ).toBe(false);
  });

  it('maps adapter errors to SQL finalize codes', () => {
    expect(mapEmbeddingErrorToIndexFailureCode('embedding_rate_limited')).toBe('rate_limited');
    expect(mapEmbeddingErrorToIndexFailureCode('embedding_timeout')).toBe('provider_timeout');
    expect(mapEmbeddingErrorToIndexFailureCode('embedding_invalid_response')).toBe(
      'internal_error',
    );
  });
});

describe('M0.5C Phase 2 batching + embed input', () => {
  it('sorts by page then chunk_index', () => {
    const sorted = sortChunksForEmbedding([
      chunk('c', 2, 0, 'c'),
      chunk('a', 1, 1, 'a'),
      chunk('b', 1, 0, 'b'),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('batches by max chunks and max chars', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      chunk(`id-${i}`, 1, i, 'x'.repeat(100)),
    );
    const batches = batchChunksForEmbedding(many);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) {
      expect(b.chunks.length).toBeLessThanOrEqual(KNOWLEDGE_EMBED_MAX_CHUNKS_PER_BATCH);
      expect(b.charCount).toBeLessThanOrEqual(KNOWLEDGE_EMBED_MAX_CHARS_PER_BATCH);
    }
  });

  it('embedding input is chunk text only', () => {
    const c = chunk('id', 4, 2, 'Pure lecture text.');
    expect(embeddingInputForChunk(c)).toBe('Pure lecture text.');
    expect(embeddingInputForChunk(c)).not.toContain('Page');
    expect(embeddingInputForChunk(c)).not.toContain('id');
  });
});

describe('M0.5C Phase 2 request parsing + privacy log', () => {
  it('rejects client authority fields', () => {
    expect(
      parseKnowledgeIndexRequest({
        version: 1,
        sectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sourceObjectId: 'obj',
        model: 'evil',
      }).ok,
    ).toBe(false);
    expect(
      parseKnowledgeIndexRequest({
        version: 1,
        sectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sourceObjectId: 'obj',
      }).ok,
    ).toBe(true);
  });

  it('privacy log has no text/vector keys', () => {
    const line = formatKnowledgeIndexLogLine({
      event: 'ai_knowledge_index',
      requestId: 'r1',
      outcome: 'ok',
      code: 'ok',
      hasUser: true,
      hasSection: true,
      hasObject: true,
      chunkCount: 3,
      batchCount: 1,
      latencyMs: 10,
    });
    expect(line).not.toMatch(/text|embedding|vector|Authorization|Bearer/i);
  });
});

describe('M0.5C Phase 2 indexing orchestrator', () => {
  const sectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const objectId = 'ps-pdf-test';
  const userId = '11111111-1111-4111-8111-111111111111';
  const body = { version: 1 as const, sectionId, sourceObjectId: objectId };

  it('indexes all chunks via fake provider and activates retrieval', async () => {
    const deps = await baseDeps();
    const res = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.reused).toBe(false);
    expect(res.result.status).toBe('indexed');
    expect(res.result.chunkCount).toBe(3);
    expect(res.result.embeddingModel).toBe('text-embedding-3-small');
    expect(res.result.embeddingDimensions).toBe(1536);
    expect(deps.provider.calls.length).toBeGreaterThanOrEqual(1);
    expect(deps.provider.calls[0]!.model).toBe('text-embedding-3-small');
    expect(deps.provider.calls[0]!.dimensions).toBe(1536);
    expect(deps.finalizeIndexSuccess).toHaveBeenCalled();
    expect(deps.finalizeIndexFailure).not.toHaveBeenCalled();
  });

  it('idempotent already-indexed path skips provider', async () => {
    const source = baseSource({
      indexStatus: 'indexed',
      retrievalSourceVersion: 1,
      indexModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      indexDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    });
    const deps = await baseDeps({ source });
    const res = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.reused).toBe(true);
    expect(deps.provider.calls.length).toBe(0);
    expect(deps.beginIndex).not.toHaveBeenCalled();
  });

  it('rate limit → finalize failure; retrieval unchanged', async () => {
    const source = baseSource({ retrievalSourceVersion: 1 });
    const provider = createFakeEmbeddingProvider({ kind: 'http', status: 429 });
    const deps = await baseDeps({ source, embeddingProvider: provider });
    const res = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('embedding_rate_limited');
    expect(deps.finalizeIndexFailure).toHaveBeenCalled();
    expect(source.retrievalSourceVersion).toBe(1);
  });

  it('timeout → finalize failure', async () => {
    const deps = await baseDeps({
      embeddingProvider: createFakeEmbeddingProvider({ kind: 'timeout' }),
    });
    const res = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('embedding_timeout');
  });

  it('malformed / wrong dims / nan / index errors fail closed', async () => {
    for (const kind of [
      'malformed',
      'wrong_dimensions',
      'nan',
      'duplicate_index',
      'missing_index',
    ] as const) {
      const deps = await baseDeps({
        embeddingProvider: createFakeEmbeddingProvider(
          kind === 'wrong_dimensions'
            ? { kind: 'wrong_dimensions', dimensions: 8 }
            : { kind },
        ),
      });
      const res = await runKnowledgeIndex({ authUserId: userId, body, deps });
      expect(res.ok).toBe(false);
    }
  });

  it('stale upsert prevents activation', async () => {
    const deps = await baseDeps({
      upsertEmbeddings: vi.fn(async () => ({ ok: false, code: 'stale_job' })),
    });
    const res = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('stale_job');
    expect(deps.finalizeIndexSuccess).not.toHaveBeenCalled();
  });

  it('stale finalize_success after version race', async () => {
    const deps = await baseDeps({
      finalizeIndexSuccess: vi.fn(async () => ({ ok: false, code: 'stale_job' })),
    });
    const res = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('stale_job');
  });

  it('multi-batch maps embeddings to chunk ids deterministically', async () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      chunk(`c-${i}`, Math.floor(i / 5) + 1, i % 5, `Chunk text number ${i} with padding.`),
    );
    const seen: string[] = [];
    const provider = createFakeEmbeddingProvider({
      kind: 'custom',
      handler: async (input) => {
        seen.push(...input.inputs);
        return {
          ok: true,
          embeddings: input.inputs.map((t) => fakeEmbeddingForText(t)),
          model: input.model,
          dimensions: 1536,
          latencyMs: 1,
          retryable: false,
        };
      },
    });
    const upsertedIds: string[] = [];
    const deps = await baseDeps({
      chunks,
      embeddingProvider: provider,
      upsertEmbeddings: vi.fn(async ({ rows }) => {
        for (const r of rows) upsertedIds.push(r.chunkId);
        return { ok: true, upserted: rows.length };
      }),
      finalizeIndexSuccess: vi.fn(async () => ({
        ok: true,
        retrieval_source_version: 1,
      })),
    });
    const res = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.batchCount).toBeGreaterThan(1);
    expect(upsertedIds).toEqual(chunks.map((c) => c.id));
    expect(seen).toEqual(chunks.map((c) => c.text));
  });

  it('retry after failure can succeed (upsert replace semantics)', async () => {
    let failOnce = true;
    const provider = createFakeEmbeddingProvider({
      kind: 'custom',
      handler: async (input) => {
        if (failOnce) {
          failOnce = false;
          return {
            ok: false,
            code: 'embedding_provider_unavailable',
            message: 'temp',
            latencyMs: 1,
            retryable: true,
          };
        }
        return {
          ok: true,
          embeddings: input.inputs.map((t) => fakeEmbeddingForText(t)),
          model: input.model,
          dimensions: 1536,
          latencyMs: 1,
          retryable: false,
        };
      },
    });
    const deps = await baseDeps({ embeddingProvider: provider });
    const first = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(first.ok).toBe(false);
    const second = await runKnowledgeIndex({ authUserId: userId, body, deps });
    expect(second.ok).toBe(true);
  });

  it('unauthenticated denied', async () => {
    const deps = await baseDeps();
    const res = await runKnowledgeIndex({ authUserId: null, body, deps });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('unauthenticated');
  });
});

describe('M0.5C Phase 2 retrieval SQL contract (static)', () => {
  it('search RPC still requires user/section/retrieval/model filters', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/012_ai_knowledge_semantic_index.sql'),
      'utf8',
    );
    expect(sql).toContain('create or replace function public.ai_knowledge_search');
    expect(sql).toContain('s.retrieval_source_version is not null');
    expect(sql).toContain('order by e.embedding <=> p_query_embedding asc');
    expect(sql).toContain('create or replace function public.ai_knowledge_upsert_embeddings');
    expect(sql).toContain("'stale_job'");
    expect(sql).toMatch(/on conflict \(chunk_id, embedding_model, embedding_dimensions\) do update/i);
  });
});
