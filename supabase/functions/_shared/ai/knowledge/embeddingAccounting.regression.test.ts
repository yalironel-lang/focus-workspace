import { describe, it, expect, vi } from 'vitest';
import {
  runKnowledgeIndexForSource,
  type KnowledgeIndexDeps,
  type SourceIndexMeta,
} from './runKnowledgeIndex.ts';
import type { IndexableChunk } from './batchChunks.ts';

describe('Task C: Embedding Ingestion Pre-Dispatch Accounting Regressions', () => {
  const dummySource: SourceIndexMeta = {
    sourceId: 'source-123',
    userId: 'user-ingest-owner',
    sectionId: 'section-abc',
    sourceVersion: 2,
    status: 'ready',
    retrievalSourceVersion: 1, // Prior version already searchable
    indexStatus: 'unindexed',
    indexModel: null,
    indexDimensions: null,
  };

  const dummyChunks: IndexableChunk[] = [
    { id: 'c1', page_number: 1, chunk_index: 0, text: 'Hello knowledge chunk 1', source_version: 2 },
    { id: 'c2', page_number: 1, chunk_index: 1, text: 'Hello knowledge chunk 2', source_version: 2 },
  ];

  it('no reservation means no paid dispatch: provider is never called when spending guard rejects', async () => {
    const embedMock = vi.fn();
    const beginIndexMock = vi.fn(async () => ({ ok: true, job_id: 'job-1' }));
    const finalizeFailureMock = vi.fn(async () => ({ ok: true }));

    const deps: KnowledgeIndexDeps = {
      loadSourceForObject: vi.fn(),
      beginIndex: beginIndexMock,
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: vi.fn(),
      finalizeIndexSuccess: vi.fn(),
      finalizeIndexFailure: finalizeFailureMock,
      embeddingProvider: { embed: embedMock } as any,
      spendingStore: {
        begin: vi.fn(async () => ({
          allowed: false,
          code: 'quota_exceeded',
          reason: 'project_daily_token_limit_exceeded',
          message: 'Project daily token budget exhausted.',
        })),
      },
    };

    const res = await runKnowledgeIndexForSource({
      sectionId: 'section-abc',
      source: dummySource,
      deps,
    });

    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('embedding_quota_exceeded');
    expect(res.error.message).toContain('budget exhausted');

    // CRITICAL: Provider was NEVER dispatched
    expect(embedMock).not.toHaveBeenCalled();

    // CRITICAL: Job failure does NOT destructively overwrite prior searchable state
    expect(finalizeFailureMock).not.toHaveBeenCalled();
    expect(dummySource.retrievalSourceVersion).toBe(1);
  });

  it('fail closed: when requireSpendingReservation is true but store is missing, provider is not called', async () => {
    const embedMock = vi.fn();
    const deps: KnowledgeIndexDeps = {
      loadSourceForObject: vi.fn(),
      beginIndex: vi.fn(async () => ({ ok: true, job_id: 'job-2' })),
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: vi.fn(),
      finalizeIndexSuccess: vi.fn(),
      finalizeIndexFailure: vi.fn(),
      embeddingProvider: { embed: embedMock } as any,
      requireSpendingReservation: true,
      // spendingStore is intentionally undefined
    };

    const res = await runKnowledgeIndexForSource({
      sectionId: 'section-abc',
      source: dummySource,
      deps,
    });

    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('embedding_quota_exceeded');
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('successful batch settles actual provider tokens into admitted reservation', async () => {
    const settleMock = vi.fn(async () => ({ ok: true }));
    const releaseMock = vi.fn(async () => ({ ok: true }));
    const beginMock = vi.fn(async ({ userId, capability, estimatedTokens }) => {
      expect(userId).toBe('user-ingest-owner');
      expect(capability).toBe('knowledge_index_embed');
      expect(estimatedTokens).toBeGreaterThan(0);
      return {
        allowed: true,
        reservationId: 'res-embed-1',
        settleReservation: settleMock,
        releaseReservation: releaseMock,
      };
    });

    const embedMock = vi.fn(async () => ({
      ok: true,
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
      dimensions: 1536,
      usage: { inputTokens: 42 },
    }));

    const upsertMock = vi.fn(async () => ({ ok: true }));
    const finalizeSuccessMock = vi.fn(async () => ({ ok: true, retrieval_source_version: 2 }));

    const deps: KnowledgeIndexDeps = {
      loadSourceForObject: vi.fn(),
      beginIndex: vi.fn(async () => ({ ok: true, job_id: 'job-3' })),
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: upsertMock,
      finalizeIndexSuccess: finalizeSuccessMock,
      finalizeIndexFailure: vi.fn(),
      embeddingProvider: { embed: embedMock } as any,
      spendingStore: { begin: beginMock },
    };

    const res = await runKnowledgeIndexForSource({
      sectionId: 'section-abc',
      source: dummySource,
      deps,
    });

    expect(res.ok).toBe(true);
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(settleMock).toHaveBeenCalledWith(42);
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('missing provider usage conservatively settles full estimated reservation', async () => {
    const settleMock = vi.fn(async () => ({ ok: true }));
    const beginMock = vi.fn(async () => ({
      allowed: true,
      reservationId: 'res-embed-2',
      settleReservation: settleMock,
      releaseReservation: vi.fn(),
    }));

    // Provider returns no usage object
    const embedMock = vi.fn(async () => ({
      ok: true,
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
      dimensions: 1536,
      usage: undefined,
    }));

    const deps: KnowledgeIndexDeps = {
      loadSourceForObject: vi.fn(),
      beginIndex: vi.fn(async () => ({ ok: true, job_id: 'job-4' })),
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: vi.fn(async () => ({ ok: true })),
      finalizeIndexSuccess: vi.fn(async () => ({ ok: true })),
      finalizeIndexFailure: vi.fn(),
      embeddingProvider: { embed: embedMock } as any,
      spendingStore: { begin: beginMock },
    };

    const res = await runKnowledgeIndexForSource({
      sectionId: 'section-abc',
      source: dummySource,
      deps,
    });

    expect(res.ok).toBe(true);
    // Settle was called with conservative estimate (not 0 or null)
    expect(settleMock).toHaveBeenCalled();
    const settledTokens = settleMock.mock.calls[0][0];
    expect(settledTokens).toBeGreaterThanOrEqual(dummyChunks.length * 100);
  });

  it('provider exception during embedding conservatively settles to account for possible spend', async () => {
    const settleMock = vi.fn(async () => ({ ok: true }));
    const beginMock = vi.fn(async () => ({
      allowed: true,
      reservationId: 'res-embed-3',
      settleReservation: settleMock,
      releaseReservation: vi.fn(),
    }));

    const embedMock = vi.fn(async () => {
      throw new Error('PROVIDER_503_NETWORK_ERROR');
    });

    const deps: KnowledgeIndexDeps = {
      loadSourceForObject: vi.fn(),
      beginIndex: vi.fn(async () => ({ ok: true, job_id: 'job-5' })),
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: vi.fn(),
      finalizeIndexSuccess: vi.fn(),
      finalizeIndexFailure: vi.fn(),
      embeddingProvider: { embed: embedMock } as any,
      spendingStore: { begin: beginMock },
    };

    await expect(
      runKnowledgeIndexForSource({
        sectionId: 'section-abc',
        source: dummySource,
        deps,
      })
    ).rejects.toThrow('PROVIDER_503_NETWORK_ERROR');

    // Conservative settlement must be executed to account for possible billing on provider side
    expect(settleMock).toHaveBeenCalled();
  });

  it('dispatchReservation unconfirmed halts index and fails closed before provider dispatch', async () => {
    const embedMock = vi.fn();
    const dispatchMock = vi.fn(async () => ({ ok: false, error: 'DISPATCH_DENIED' }));
    const beginMock = vi.fn(async () => ({
      allowed: true,
      reservationId: 'res-embed-unconfirmed',
      dispatchReservation: dispatchMock,
      settleReservation: vi.fn(),
      releaseReservation: vi.fn(),
    }));

    const deps: KnowledgeIndexDeps = {
      loadSourceForObject: vi.fn(),
      beginIndex: vi.fn(async () => ({ ok: true, job_id: 'job-6' })),
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: vi.fn(),
      finalizeIndexSuccess: vi.fn(),
      finalizeIndexFailure: vi.fn(),
      embeddingProvider: { embed: embedMock } as any,
      spendingStore: { begin: beginMock },
    };

    const res = await runKnowledgeIndexForSource({
      sectionId: 'section-abc',
      source: dummySource,
      deps,
    });

    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('internal_error');
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('createKnowledgeSpendingStore rejects missing or whitespace userId without calling RPC', async () => {
    const { createKnowledgeSpendingStore } = await import('./knowledgeSpendingStore.ts');
    const rpcMock = vi.fn();
    const store = createKnowledgeSpendingStore({ rpc: rpcMock }, { maxDailyTokens: 10_000 });

    const decisionEmpty = await store.begin({
      userId: '',
      capability: 'knowledge_index_embed',
      estimatedTokens: 500,
      chunkCount: 2,
    });
    expect(decisionEmpty.allowed).toBe(false);
    expect(decisionEmpty.code).toBe('quota_exceeded');
    expect(decisionEmpty.reason).toBe('invalid_user_id');

    const decisionWhitespace = await store.begin({
      userId: '   ',
      capability: 'knowledge_index_embed',
      estimatedTokens: 500,
      chunkCount: 2,
    });
    expect(decisionWhitespace.allowed).toBe(false);
    expect(decisionWhitespace.code).toBe('quota_exceeded');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('createKnowledgeSpendingStore attributes reservation to document owner userId, preventing cross-user account bleed', async () => {
    const { createKnowledgeSpendingStore } = await import('./knowledgeSpendingStore.ts');
    const rpcMock = vi.fn(async (fn, args) => {
      if (fn === 'ai_gateway_project_begin') {
        expect(args?.p_user_id).toBe('user-ingest-owner');
        expect(args?.p_capability).toBe('knowledge_index_embed');
        return { data: { ok: true, reservation_id: 'res-owner-verified' }, error: null };
      }
      return { data: { ok: true }, error: null };
    });

    const store = createKnowledgeSpendingStore({ rpc: rpcMock }, { maxDailyTokens: 50_000 });
    const decision = await store.begin({
      userId: dummySource.userId,
      capability: 'knowledge_index_embed',
      estimatedTokens: 1200,
      chunkCount: 4,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reservationId).toBe('res-owner-verified');
    expect(rpcMock).toHaveBeenCalledWith('ai_gateway_project_begin', expect.objectContaining({
      p_user_id: 'user-ingest-owner',
      p_capability: 'knowledge_index_embed',
    }));
  });

  it('runKnowledgeIndexUnpublishedForSource halts without provider dispatch when spending guard rejects', async () => {
    const { runKnowledgeIndexUnpublishedForSource } = await import('./runKnowledgeIndexUnpublished.ts');
    const embedMock = vi.fn();
    const beginIndexMock = vi.fn(async () => ({ ok: true, job_id: 'job-unpub-1' }));
    const finalizeFailureMock = vi.fn(async () => ({ ok: true }));

    const deps = {
      loadSourceForObject: vi.fn(),
      beginIndex: beginIndexMock,
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: vi.fn(),
      finalizeIndexSuccess: vi.fn(),
      finalizeIndexFailure: finalizeFailureMock,
      embeddingProvider: { embed: embedMock } as any,
      spendingStore: {
        begin: vi.fn(async () => ({
          allowed: false,
          code: 'quota_exceeded',
          reason: 'project_daily_request_limit_exceeded',
          message: 'Project daily request limit reached.',
        })),
      },
    };

    const res = await runKnowledgeIndexUnpublishedForSource({
      sectionId: 'section-abc',
      source: dummySource,
      deps: deps as any,
      targetSourceVersion: 2,
    });

    expect(res.ok).toBe(false);
    expect(res.response.ok).toBe(false);
    if (!res.response.ok) {
      expect(res.response.error.code).toBe('embedding_quota_exceeded');
      expect(res.response.error.message).toContain('daily request limit');
    }
    expect(embedMock).not.toHaveBeenCalled();
    expect(finalizeFailureMock).not.toHaveBeenCalled();
  });

  it('runKnowledgeIndexUnpublishedForSource fails closed when requireSpendingReservation is true but store is missing', async () => {
    const { runKnowledgeIndexUnpublishedForSource } = await import('./runKnowledgeIndexUnpublished.ts');
    const embedMock = vi.fn();
    const deps = {
      loadSourceForObject: vi.fn(),
      beginIndex: vi.fn(async () => ({ ok: true, job_id: 'job-unpub-2' })),
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: vi.fn(),
      finalizeIndexSuccess: vi.fn(),
      finalizeIndexFailure: vi.fn(),
      embeddingProvider: { embed: embedMock } as any,
      requireSpendingReservation: true,
    };

    const res = await runKnowledgeIndexUnpublishedForSource({
      sectionId: 'section-abc',
      source: dummySource,
      deps: deps as any,
      targetSourceVersion: 2,
    });

    expect(res.ok).toBe(false);
    if (!res.response.ok) {
      expect(res.response.error.code).toBe('embedding_quota_exceeded');
    }
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('runKnowledgeIndexUnpublishedForSource settles tokens into admitted reservation on success', async () => {
    const { runKnowledgeIndexUnpublishedForSource } = await import('./runKnowledgeIndexUnpublished.ts');
    const settleMock = vi.fn(async () => ({ ok: true }));
    const embedMock = vi.fn(async () => ({
      ok: true,
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
      dimensions: 1536,
      usage: { inputTokens: 55 },
    }));

    const deps = {
      loadSourceForObject: vi.fn(),
      beginIndex: vi.fn(async () => ({ ok: true, job_id: 'job-unpub-3' })),
      loadChunks: vi.fn(async () => dummyChunks),
      upsertEmbeddings: vi.fn(async () => ({ ok: true })),
      finalizeIndexSuccess: vi.fn(),
      finalizeIndexFailure: vi.fn(),
      embeddingProvider: { embed: embedMock } as any,
      spendingStore: {
        begin: vi.fn(async () => ({
          allowed: true,
          reservationId: 'res-unpub-settle',
          settleReservation: settleMock,
        })),
      },
    };

    const res = await runKnowledgeIndexUnpublishedForSource({
      sectionId: 'section-abc',
      source: dummySource,
      deps: deps as any,
      targetSourceVersion: 2,
    });

    expect(res.ok).toBe(true);
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(settleMock).toHaveBeenCalledWith(55);
  });
});
