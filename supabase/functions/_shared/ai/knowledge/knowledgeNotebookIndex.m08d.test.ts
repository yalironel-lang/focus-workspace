/**
 * M0.8D — Notebook index / embedding pipeline (fake provider only).
 * No remote Supabase. No real embeddings. Search remains PDF-only.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_CHUNK_MAX_CHARS,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
  KNOWLEDGE_MAX_CHUNKS,
} from './bounds.ts';
import type { IndexableChunk } from './batchChunks.ts';
import { createFakeEmbeddingProvider } from './fakeEmbeddingProvider.ts';
import { chunkNotebookSegments } from './chunkNotebookSegments.ts';
import { extractNotebookPageSemantics } from './extractNotebookPage.ts';
import {
  classifyNotebookProcessError,
  parseNotebookKnowledgeProcessRequest,
  runNotebookKnowledgeProcess,
  type NotebookKnowledgeProcessDeps,
} from './runNotebookKnowledgeProcess.ts';
import type { SourceIndexMeta } from './runKnowledgeIndex.ts';
import type { NotebookKnowledgeIngestDeps } from './runNotebookKnowledgeIngest.ts';

const SQL_013 = resolve(
  process.cwd(),
  'supabase/migrations/013_ai_knowledge_notebook_pages.sql',
);
const SQL_016 = resolve(
  process.cwd(),
  'supabase/migrations/016_ai_knowledge_mixed_course_search.sql',
);

function nb1(kind: string, text: string, detail: unknown = null): string {
  return `~nb1:${JSON.stringify([kind, text, [], detail])}`;
}

const userId = '11111111-1111-4111-8111-111111111111';
const sectionId = '22222222-2222-4222-8222-222222222222';
const notebookObjectId = 'ps-notebook-1';
const pageId = 'page-abc';

function makeFso(body: string, title = 'Strict Liability') {
  return {
    id: notebookObjectId,
    user_id: userId,
    section_id: sectionId,
    object: {
      id: notebookObjectId,
      type: 'notebook',
      title: 'Law Notes',
      content: {
        type: 'notebook',
        body: '',
        pages: [
          {
            id: pageId,
            kind: 'document',
            title,
            documentBody: body,
            documentBodyCodecVersion: 1,
          },
        ],
      },
    },
  };
}

function buildChunksFromBody(body: string, title: string, sourceVersion: number): IndexableChunk[] {
  const extracted = extractNotebookPageSemantics({
    documentBody: body,
    codecVersion: 1,
    pageTitle: title,
  });
  if (!extracted.ok) return [];
  return chunkNotebookSegments(extracted.segments).map((c, i) => ({
    id: `chunk-${sourceVersion}-${i}`,
    page_number: c.page_number,
    chunk_index: c.chunk_index,
    text: c.text,
    source_version: sourceVersion,
  }));
}

async function makeProcessDeps(opts?: {
  body?: string;
  title?: string;
  providerBehavior?: Parameters<typeof createFakeEmbeddingProvider>[0];
  ingestOverrides?: Partial<NotebookKnowledgeIngestDeps>;
  sourceOverrides?: Partial<SourceIndexMeta>;
}): Promise<{
  deps: NotebookKnowledgeProcessDeps;
  provider: ReturnType<typeof createFakeEmbeddingProvider>;
  source: SourceIndexMeta;
  stored: Map<string, number[]>;
  chunksByVersion: Map<number, IndexableChunk[]>;
}> {
  const body = opts?.body ?? nb1('paragraph', 'Strict liability does not require proof of fault.');
  const title = opts?.title ?? 'Strict Liability';
  const provider = createFakeEmbeddingProvider(opts?.providerBehavior ?? { kind: 'ok' });
  const fso = makeFso(body, title);

  const source: SourceIndexMeta = {
    sourceId: 'src-nb-1',
    userId,
    sectionId,
    sourceVersion: 1,
    status: 'ready',
    retrievalSourceVersion: null,
    indexStatus: null,
    indexModel: null,
    indexDimensions: null,
    ...opts?.sourceOverrides,
  };

  const chunksByVersion = new Map<number, IndexableChunk[]>();
  chunksByVersion.set(1, buildChunksFromBody(body, title, 1));

  let jobId = 'job-1';
  let indexingVersion = source.sourceVersion;
  const stored = new Map<string, number[]>();

  let contentHash = 'hash-v1';
  let pendingHash: string | null = null;

  const ingest: NotebookKnowledgeIngestDeps = {
    loadOwnedNotebookFso: vi.fn(async () => ({ ok: true as const, fso })),
    beginNotebookPageIngest: vi.fn(async ({ contentHash: h }) => {
      if (h === contentHash && source.status === 'ready' && source.retrievalSourceVersion != null) {
        return {
          ok: true,
          source_id: source.sourceId,
          source_version: source.sourceVersion,
          status: 'ready',
          retrieval_source_version: source.retrievalSourceVersion,
          idempotent: true,
        };
      }
      if (contentHash && h !== contentHash && source.retrievalSourceVersion != null) {
        pendingHash = h;
        source.status = 'stale';
        return {
          ok: true,
          source_id: source.sourceId,
          source_version: source.sourceVersion,
          status: 'stale',
          retrieval_source_version: source.retrievalSourceVersion,
          idempotent: false,
        };
      }
      pendingHash = h;
      contentHash = h;
      return {
        ok: true,
        source_id: source.sourceId,
        source_version: source.sourceVersion,
        status: 'pending',
        retrieval_source_version: source.retrievalSourceVersion,
        idempotent: false,
      };
    }),
    finalizeIngest: vi.fn(async ({ status, chunks, sourceVersion }) => {
      if (status === 'failed') {
        if (source.retrievalSourceVersion != null) {
          source.status = 'ready';
        } else {
          source.status = 'failed';
        }
        return {
          ok: true,
          source_id: source.sourceId,
          source_version: sourceVersion,
          status: source.status,
          preserved_corpus: source.retrievalSourceVersion != null,
        };
      }
      const nextVersion =
        chunksByVersion.has(sourceVersion) && source.retrievalSourceVersion != null
          ? sourceVersion + 1
          : sourceVersion;
      if (chunks) {
        chunksByVersion.set(
          nextVersion,
          chunks.map((c, i) => ({
            id: `chunk-${nextVersion}-${i}`,
            page_number: c.page_number,
            chunk_index: c.chunk_index,
            text: c.text,
            source_version: nextVersion,
          })),
        );
      }
      source.sourceVersion = nextVersion;
      source.status = 'ready';
      contentHash = pendingHash ?? contentHash;
      pendingHash = null;
      return {
        ok: true,
        source_id: source.sourceId,
        source_version: nextVersion,
        status: 'ready',
        chunk_count: chunks?.length ?? 0,
      };
    }),
    invalidateNotebookPageCorpus: vi.fn(async () => {
      const had = source.retrievalSourceVersion != null;
      source.retrievalSourceVersion = null;
      source.status = 'failed';
      source.indexStatus = null;
      return { ok: true, cleared: had, source_id: source.sourceId };
    }),
    ...opts?.ingestOverrides,
  };

  const deps: NotebookKnowledgeProcessDeps = {
    ingest,
    loadNotebookSource: vi.fn(async () => {
      if (source.status !== 'ready' && source.status !== 'stale') {
        return { ok: false as const, code: 'not_ready' };
      }
      return { ok: true as const, source: { ...source } };
    }),
    index: {
      embeddingModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      embeddingDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      embeddingProvider: provider,
      beginIndex: vi.fn(async ({ sourceVersion }) => {
        jobId = `job-${Math.random().toString(16).slice(2, 8)}`;
        indexingVersion = sourceVersion;
        source.indexStatus = 'indexing';
        return {
          ok: true,
          job_id: jobId,
          source_version: sourceVersion,
          chunk_count: chunksByVersion.get(sourceVersion)?.length ?? 0,
        };
      }),
      loadChunks: vi.fn(async ({ sourceVersion }) => {
        return chunksByVersion.get(sourceVersion) ?? [];
      }),
      upsertEmbeddings: vi.fn(async ({ jobId: j, sourceVersion, rows }) => {
        if (j !== jobId || sourceVersion !== indexingVersion) {
          return { ok: false, code: 'stale_job' };
        }
        for (const r of rows) stored.set(`${sourceVersion}:${r.chunkId}`, r.embedding);
        return { ok: true, upserted: rows.length };
      }),
      finalizeIndexSuccess: vi.fn(async ({ jobId: j, sourceVersion }) => {
        if (j !== jobId || sourceVersion !== indexingVersion) {
          return { ok: false, code: 'stale_job' };
        }
        const needed = chunksByVersion.get(sourceVersion) ?? [];
        const have = needed.filter((c) => stored.has(`${sourceVersion}:${c.id}`)).length;
        if (have < needed.length) return { ok: false, code: 'incomplete_embeddings' };
        source.retrievalSourceVersion = sourceVersion;
        source.indexStatus = 'indexed';
        source.indexModel = KNOWLEDGE_EMBEDDING_MODEL_DEFAULT;
        source.indexDimensions = KNOWLEDGE_EMBEDDING_DIMENSIONS;
        source.sourceVersion = sourceVersion;
        source.status = 'ready';
        return { ok: true, retrieval_source_version: sourceVersion };
      }),
      finalizeIndexFailure: vi.fn(async () => {
        source.indexStatus = 'index_failed';
        return { ok: true, retrieval_source_version: source.retrievalSourceVersion };
      }),
    },
  };

  return { deps, provider, source, stored, chunksByVersion };
}

describe('M0.8D notebook process request authority', () => {
  it('25–26. rejects client authoritative fields', () => {
    expect(
      parseNotebookKnowledgeProcessRequest({
        version: 1,
        sectionId,
        notebookObjectId,
        pageId,
        contentHash: 'x',
      }).ok,
    ).toBe(false);
    expect(
      parseNotebookKnowledgeProcessRequest({
        version: 1,
        sectionId,
        notebookObjectId,
        pageId,
        embeddings: [],
      }).ok,
    ).toBe(false);
    expect(
      parseNotebookKnowledgeProcessRequest({
        version: 1,
        sectionId,
        notebookObjectId,
        pageId,
        model: 'text-embedding-3-small',
      }).ok,
    ).toBe(false);
  });

  it('error classification for handoff', () => {
    expect(classifyNotebookProcessError('stale_job')).toBe('stale');
    expect(classifyNotebookProcessError('embedding_timeout')).toBe('retryable');
    expect(classifyNotebookProcessError('notebook_page_not_found')).toBe('permanent');
    expect(classifyNotebookProcessError('notebook_codec_unsupported')).toBe('permanent');
  });
});

describe('M0.8D first index + reuse + change', () => {
  it('1–7. first process indexes and flips retrieval to v1', async () => {
    const { deps, provider, source, stored } = await makeProcessDeps();
    const res = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.ingest.outcome).toBe('ready');
    expect(res.result.index.outcome).toBe('indexed');
    expect(res.result.index.retrievalSourceVersion).toBe(1);
    expect(source.retrievalSourceVersion).toBe(1);
    expect(provider.calls.length).toBeGreaterThan(0);
    expect(stored.size).toBeGreaterThan(0);
    expect(
      [...stored.keys()].every((k) => k.startsWith('1:')),
    ).toBe(true);
    // Notebook page_number convention = 1 (not PDF physical identity).
    const chunks = await deps.index.loadChunks!({
      sourceId: source.sourceId,
      sourceVersion: 1,
    });
    expect(chunks.every((c) => c.page_number === 1)).toBe(true);
    expect(chunks.every((c) => c.text.length <= KNOWLEDGE_CHUNK_MAX_CHARS)).toBe(true);
  });

  it('8–10. identical reprocess → reused, zero embedding calls', async () => {
    const { deps, provider, source } = await makeProcessDeps();
    const first = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(first.ok).toBe(true);
    const callsAfterFirst = provider.calls.length;
    source.indexStatus = 'indexed';
    source.retrievalSourceVersion = source.sourceVersion;
    source.indexModel = KNOWLEDGE_EMBEDDING_MODEL_DEFAULT;
    source.indexDimensions = KNOWLEDGE_EMBEDDING_DIMENSIONS;

    const second = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.ingest.outcome).toBe('reused');
    expect(second.result.index.outcome).toBe('reused');
    expect(provider.calls.length).toBe(callsAfterFirst);
    expect(second.result.index.embeddingCalls).toBe(0);
  });

  it('11–15. semantic edit → v2 index; old retrieval preserved until flip', async () => {
    const bodyV1 = nb1('paragraph', 'Version one content about liability.');
    const { deps, provider, source, chunksByVersion } = await makeProcessDeps({
      body: bodyV1,
    });
    const first = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(first.ok).toBe(true);
    expect(source.retrievalSourceVersion).toBe(1);
    const callsV1 = provider.calls.length;

    // Mutate FSO to v2 content and reset begin idempotency hash tracking via new deps body path.
    const bodyV2 = nb1('paragraph', 'Version two content about negligence.');
    const fsoV2 = makeFso(bodyV2);
    deps.ingest.loadOwnedNotebookFso = vi.fn(async () => ({
      ok: true as const,
      fso: fsoV2,
    }));
    // Force begin to treat as changed: clear content hash match by simulating stale path.
    // After v1, contentHash in mock equals v1 hash; v2 extract produces different hash.
    const mid = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(mid.ok).toBe(true);
    if (!mid.ok) return;
    expect(mid.result.ingest.outcome).toBe('ready');
    expect(mid.result.index.retrievalSourceVersion).toBe(2);
    expect(source.retrievalSourceVersion).toBe(2);
    expect(provider.calls.length).toBeGreaterThan(callsV1);
    expect(chunksByVersion.has(2)).toBe(true);
  });
});

describe('M0.8D failure / empty / security', () => {
  it('16. embedding failure leaves old retrieval intact', async () => {
    const { deps, source } = await makeProcessDeps();
    const ok = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(ok.ok).toBe(true);
    expect(source.retrievalSourceVersion).toBe(1);

    // Force re-index path with failing provider.
    source.indexStatus = null;
    source.retrievalSourceVersion = 1;
    deps.index.embeddingProvider = createFakeEmbeddingProvider({
      kind: 'http',
      status: 500,
    });
    // Make begin think content changed so index runs.
    deps.ingest.beginNotebookPageIngest = vi.fn(async () => ({
      ok: true,
      source_id: source.sourceId,
      source_version: 1,
      status: 'ready',
      retrieval_source_version: 1,
      idempotent: true,
    }));
    // But index not reused — clear index status already done.
    const failRes = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    // Ingest reused; index attempted and failed.
    expect(failRes.ok).toBe(false);
    if (failRes.ok) return;
    expect(failRes.error.code).toMatch(/embedding_/);
    expect(source.retrievalSourceVersion).toBe(1);
  });

  it('17. stale completion cannot overwrite newer version', async () => {
    const { deps, source, chunksByVersion } = await makeProcessDeps();
    await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });

    // Newer version already authoritative; late job finalize is rejected.
    source.indexStatus = null;
    source.retrievalSourceVersion = 2;
    source.sourceVersion = 2;
    chunksByVersion.set(2, buildChunksFromBody(
      nb1('paragraph', 'Version two content about negligence.'),
      'Strict Liability',
      2,
    ));
    deps.ingest.beginNotebookPageIngest = vi.fn(async () => ({
      ok: true,
      source_id: source.sourceId,
      source_version: 2,
      status: 'ready',
      retrieval_source_version: 2,
      idempotent: true,
    }));
    deps.index.upsertEmbeddings = vi.fn(async () => ({ ok: false, code: 'stale_job' }));
    const res = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('stale_job');
    expect(res.error.class).toBe('stale');
    expect(source.retrievalSourceVersion).toBe(2);
  });

  it('18–20. malformed / deleted / wrong ownership never embed', async () => {
    const { deps, provider } = await makeProcessDeps({
      body: '~nb1:["paragraph","broken"',
    });
    const bad = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(bad.ok).toBe(false);
    expect(provider.calls.length).toBe(0);

    const deleted = await makeProcessDeps({
      ingestOverrides: {
        loadOwnedNotebookFso: vi.fn(async () => ({
          ok: true as const,
          fso: makeFso(nb1('paragraph', 'x')),
        })),
      },
    });
    // Empty pages array
    deleted.deps.ingest.loadOwnedNotebookFso = vi.fn(async () => ({
      ok: true as const,
      fso: {
        ...makeFso(nb1('paragraph', 'x')),
        object: {
          id: notebookObjectId,
          type: 'notebook',
          title: 'Law Notes',
          content: { type: 'notebook', body: '', pages: [] },
        },
      },
    }));
    const del = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps: deleted.deps,
    });
    expect(del.ok).toBe(false);
    expect(deleted.provider.calls.length).toBe(0);

    const auth = await makeProcessDeps({
      ingestOverrides: {
        loadOwnedNotebookFso: vi.fn(async () => ({
          ok: false as const,
          code: 'auth_mismatch',
        })),
      },
    });
    const denied = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps: auth.deps,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error.code).toBe('auth_mismatch');
    expect(auth.provider.calls.length).toBe(0);
  });

  it('21–24. blank / image-only / handwriting-only → cleared, zero embeddings', async () => {
    for (const body of ['', '::img::img-1::""::', '::hw::hw-1::']) {
      const { deps, provider } = await makeProcessDeps({ body });
      const res = await runNotebookKnowledgeProcess({
        authUserId: userId,
        body: { version: 1, sectionId, notebookObjectId, pageId },
        deps,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.result.ingest.outcome).toBe('cleared');
      expect(res.result.index.outcome).toBe('skipped');
      expect(res.result.index.embeddingCalls).toBe(0);
      expect(provider.calls.length).toBe(0);
      expect(deps.ingest.invalidateNotebookPageCorpus).toHaveBeenCalled();
    }
  });
});

describe('M0.8D search fail-closed + limits', () => {
  it('28–29. search remains PDF-only in migration 013; 016 widens', () => {
    const sql013 = readFileSync(SQL_013, 'utf8');
    const search013 = sql013.slice(sql013.indexOf('create or replace function public.ai_knowledge_search'));
    expect(search013).toContain("s.source_kind = 'free_space_pdf'");

    const sql016 = readFileSync(SQL_016, 'utf8');
    expect(sql016).toContain("s.source_kind in ('free_space_pdf', 'notebook_page')");
  });

  it('36–37. oversized chunk count fails safely (no silent truncation)', async () => {
    const huge = Array.from({ length: KNOWLEDGE_MAX_CHUNKS + 5 }, (_, i) =>
      nb1('paragraph', `Block-${i}-` + 'x'.repeat(900)),
    ).join('\n');
    const { deps, provider } = await makeProcessDeps({ body: huge });
    const res = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('too_large');
    expect(provider.calls.length).toBe(0);
  });
});

describe('M0.8D privacy', () => {
  it('27. process result / logs expose no Notebook text or vectors', async () => {
    const { deps } = await makeProcessDeps();
    const events: unknown[] = [];
    deps.onEvent = (e) => events.push(e);
    const res = await runNotebookKnowledgeProcess({
      authUserId: userId,
      body: { version: 1, sectionId, notebookObjectId, pageId },
      deps,
    });
    const json = JSON.stringify({ res, events });
    expect(json).not.toMatch(/Strict liability does not require/);
    expect(json).not.toMatch(/embedding":\s*\[/);
    expect(json).not.toContain('documentBody');
  });
});
