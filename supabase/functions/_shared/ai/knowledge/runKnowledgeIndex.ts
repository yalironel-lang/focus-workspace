/**
 * M0.5C Phase 2 — knowledge indexing orchestrator (injectable I/O).
 *
 * Flow:
 *   resolve source → idempotent reused?
 *   → begin_index
 *   → load chunks (exact version)
 *   → batch → embed → upsert (job-scoped)
 *   → finalize_index_success
 * On failure: finalize_index_failure (retrieval unchanged)
 */

import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_MAX_REQUEST_BODY_BYTES,
} from './bounds.ts';
import {
  batchChunksForEmbedding,
  embeddingInputForChunk,
  type IndexableChunk,
} from './batchChunks.ts';
import type { AiEmbeddingProvider } from './embeddingTypes.ts';
import { mapEmbeddingErrorToIndexFailureCode } from './embeddingTypes.ts';
import { routeEmbeddingModel } from './routeEmbedding.ts';

export type KnowledgeIndexRequest = {
  version: 1;
  sectionId: string;
  sourceObjectId: string;
};

export type KnowledgeIndexErrorCode =
  | 'unauthenticated'
  | 'invalid_request'
  | 'not_found'
  | 'auth_mismatch'
  | 'not_ready'
  | 'stale_job'
  | 'incomplete_embeddings'
  | 'embedding_rate_limited'
  | 'embedding_timeout'
  | 'embedding_provider_unavailable'
  | 'embedding_invalid_response'
  | 'embedding_quota_exceeded'
  | 'embedding_internal_error'
  | 'internal_error';

export type KnowledgeIndexResponse =
  | {
      version: 1;
      ok: true;
      result: {
        status: 'indexed' | 'reused';
        reused: boolean;
        sourceId: string;
        sourceVersion: number;
        retrievalSourceVersion: number;
        chunkCount: number;
        batchCount: number;
        embeddingModel: string;
        embeddingDimensions: number;
      };
    }
  | {
      version: 1;
      ok: false;
      error: { code: KnowledgeIndexErrorCode; message: string };
    };

export type BeginIndexResult = {
  ok: boolean;
  code?: string;
  source_id?: string;
  source_version?: number;
  job_id?: string;
  chunk_count?: number;
  embedding_model?: string;
  embedding_dimensions?: number;
  retrieval_source_version?: number | null;
};

export type UpsertEmbeddingsResult = {
  ok: boolean;
  code?: string;
  upserted?: number;
};

export type FinalizeIndexResult = {
  ok: boolean;
  code?: string;
  retrieval_source_version?: number | null;
  ignored?: boolean;
};

export type SourceIndexMeta = {
  sourceId: string;
  userId: string;
  sectionId: string;
  sourceVersion: number;
  status: string;
  retrievalSourceVersion: number | null;
  indexStatus: 'unindexed' | 'indexing' | 'indexed' | 'index_failed' | null;
  indexModel: string | null;
  indexDimensions: number | null;
};

export type KnowledgeIndexDeps = {
  loadSourceForObject: (input: {
    userId: string;
    sectionId: string;
    sourceObjectId: string;
  }) => Promise<
    | { ok: true; source: SourceIndexMeta }
    | { ok: false; code: 'not_found' | 'auth_mismatch' | 'not_ready' }
  >;
  beginIndex: (input: {
    sourceId: string;
    sourceVersion: number;
    embeddingModel: string;
    embeddingDimensions: number;
  }) => Promise<BeginIndexResult>;
  loadChunks: (input: {
    sourceId: string;
    sourceVersion: number;
  }) => Promise<IndexableChunk[]>;
  upsertEmbeddings: (input: {
    sourceId: string;
    sourceVersion: number;
    jobId: string;
    embeddingModel: string;
    embeddingDimensions: number;
    rows: Array<{ chunkId: string; embedding: number[] }>;
  }) => Promise<UpsertEmbeddingsResult>;
  finalizeIndexSuccess: (input: {
    sourceId: string;
    sourceVersion: number;
    jobId: string;
    embeddingModel: string;
    embeddingDimensions: number;
  }) => Promise<FinalizeIndexResult>;
  finalizeIndexFailure: (input: {
    sourceId: string;
    sourceVersion: number;
    jobId: string;
    errorCode: string;
  }) => Promise<FinalizeIndexResult>;
  embeddingProvider: AiEmbeddingProvider;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
  /** Optional metadata-only usage hook (no content). */
  recordUsage?: (input: {
    capability: 'knowledge_index_embed';
    model: string;
    outcome: 'success' | 'provider_error' | 'provider_timeout' | 'rate_limited' | 'bad_response' | 'internal_error';
    errorCode?: string;
    inputTokens?: number | null;
    totalTokens?: number | null;
    latencyMs: number;
    sectionId: string;
    chunkCount: number;
    batchCount: number;
  }) => Promise<void>;
};

function fail(code: KnowledgeIndexErrorCode, message: string): KnowledgeIndexResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseKnowledgeIndexRequest(
  body: unknown,
): { ok: true; request: KnowledgeIndexRequest } | { ok: false; code: 'invalid_request' } {
  if (!body || typeof body !== 'object') return { ok: false, code: 'invalid_request' };
  const o = body as Record<string, unknown>;
  if (o.version !== 1) return { ok: false, code: 'invalid_request' };
  if (typeof o.sectionId !== 'string' || !isUuid(o.sectionId)) {
    return { ok: false, code: 'invalid_request' };
  }
  if (typeof o.sourceObjectId !== 'string' || o.sourceObjectId.trim().length === 0) {
    return { ok: false, code: 'invalid_request' };
  }
  if (o.sourceObjectId !== o.sourceObjectId.trim()) {
    return { ok: false, code: 'invalid_request' };
  }
  if (
    'userId' in o ||
    'user_id' in o ||
    'sourceVersion' in o ||
    'jobId' in o ||
    'model' in o ||
    'dimensions' in o ||
    'embedding' in o ||
    'embeddings' in o
  ) {
    return { ok: false, code: 'invalid_request' };
  }
  return {
    ok: true,
    request: {
      version: 1,
      sectionId: o.sectionId,
      sourceObjectId: o.sourceObjectId.trim(),
    },
  };
}

export function knowledgeIndexRequestBodyTooLarge(byteLength: number): boolean {
  return byteLength > KNOWLEDGE_MAX_REQUEST_BODY_BYTES;
}

/**
 * Shared index lifecycle for an already-resolved knowledge source.
 * Used by PDF (via runKnowledgeIndex) and Notebook (via runNotebookKnowledgeProcess).
 * Does not assume PDF Storage or physical page identity.
 */
export async function runKnowledgeIndexForSource(input: {
  sectionId: string;
  source: SourceIndexMeta;
  deps: KnowledgeIndexDeps;
}): Promise<KnowledgeIndexResponse> {
  const { source, deps, sectionId } = input;

  let route;
  try {
    route = routeEmbeddingModel({
      model: deps.embeddingModel,
      dimensions: deps.embeddingDimensions,
    });
  } catch {
    return fail('internal_error', 'Embedding model is not configured.');
  }

  // Idempotent: already indexed current version with matching model/dims.
  if (
    source.indexStatus === 'indexed' &&
    source.retrievalSourceVersion === source.sourceVersion &&
    source.indexModel === route.model &&
    source.indexDimensions === route.dimensions
  ) {
    return {
      version: 1,
      ok: true,
      result: {
        status: 'reused',
        reused: true,
        sourceId: source.sourceId,
        sourceVersion: source.sourceVersion,
        retrievalSourceVersion: source.retrievalSourceVersion!,
        chunkCount: 0,
        batchCount: 0,
        embeddingModel: route.model,
        embeddingDimensions: route.dimensions,
      },
    };
  }

  const begin = await deps.beginIndex({
    sourceId: source.sourceId,
    sourceVersion: source.sourceVersion,
    embeddingModel: route.model,
    embeddingDimensions: route.dimensions,
  });
  if (!begin.ok || !begin.job_id) {
    if (begin.code === 'stale_job') {
      return fail('stale_job', 'Index job is stale; retry.');
    }
    return fail('internal_error', 'Could not begin knowledge index.');
  }

  const jobId = begin.job_id;
  const sourceVersion = begin.source_version ?? source.sourceVersion;
  const started = Date.now();
  let batchCount = 0;
  let inputTokensAcc = 0;
  let hadTokenUsage = false;

  const failJob = async (
    code: KnowledgeIndexErrorCode,
    message: string,
    sqlCode: string,
  ): Promise<KnowledgeIndexResponse> => {
    try {
      await deps.finalizeIndexFailure({
        sourceId: source.sourceId,
        sourceVersion,
        jobId,
        errorCode: sqlCode,
      });
    } catch {
      /* best-effort */
    }
    if (deps.recordUsage) {
      try {
        await deps.recordUsage({
          capability: 'knowledge_index_embed',
          model: route.model,
          outcome:
            code === 'embedding_timeout'
              ? 'provider_timeout'
              : code === 'embedding_rate_limited' || code === 'embedding_quota_exceeded'
                ? 'rate_limited'
                : code === 'embedding_invalid_response'
                  ? 'bad_response'
                  : code.startsWith('embedding_')
                    ? 'provider_error'
                    : 'internal_error',
          errorCode: code,
          inputTokens: hadTokenUsage ? inputTokensAcc : null,
          totalTokens: hadTokenUsage ? inputTokensAcc : null,
          latencyMs: Date.now() - started,
          sectionId,
          chunkCount: 0,
          batchCount,
        });
      } catch {
        /* ignore */
      }
    }
    return fail(code, message);
  };

  const chunks = await deps.loadChunks({
    sourceId: source.sourceId,
    sourceVersion,
  });
  if (chunks.length === 0) {
    return failJob('incomplete_embeddings', 'No chunks to index.', 'incomplete_embeddings');
  }

  const batches = batchChunksForEmbedding(chunks);

  for (const batch of batches) {
    batchCount += 1;
    const texts = batch.chunks.map(embeddingInputForChunk);
    const embedded = await deps.embeddingProvider.embed({
      model: route.model,
      dimensions: route.dimensions,
      inputs: texts,
    });

    if (!embedded.ok) {
      return failJob(
        embedded.code,
        'Embedding provider failed.',
        mapEmbeddingErrorToIndexFailureCode(embedded.code),
      );
    }

    if (embedded.embeddings.length !== batch.chunks.length) {
      return failJob(
        'embedding_invalid_response',
        'Embedding count mismatch.',
        'incomplete_embeddings',
      );
    }
    if (embedded.dimensions !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
      return failJob(
        'embedding_invalid_response',
        'Unexpected embedding dimensions.',
        'incomplete_embeddings',
      );
    }

    if (typeof embedded.usage?.inputTokens === 'number') {
      inputTokensAcc += embedded.usage.inputTokens;
      hadTokenUsage = true;
    }

    const rows = batch.chunks.map((c, i) => ({
      chunkId: c.id,
      embedding: embedded.embeddings[i]!,
    }));

    const upserted = await deps.upsertEmbeddings({
      sourceId: source.sourceId,
      sourceVersion,
      jobId,
      embeddingModel: route.model,
      embeddingDimensions: route.dimensions,
      rows,
    });
    if (!upserted.ok) {
      if (upserted.code === 'stale_job') {
        return failJob('stale_job', 'Index job became stale.', 'stale_job');
      }
      return failJob('internal_error', 'Could not store embeddings.', 'internal_error');
    }
  }

  const finalized = await deps.finalizeIndexSuccess({
    sourceId: source.sourceId,
    sourceVersion,
    jobId,
    embeddingModel: route.model,
    embeddingDimensions: route.dimensions,
  });

  if (!finalized.ok) {
    if (finalized.code === 'stale_job') {
      return failJob('stale_job', 'Index job became stale.', 'stale_job');
    }
    if (finalized.code === 'incomplete_embeddings') {
      return failJob(
        'incomplete_embeddings',
        'Embeddings incomplete for this version.',
        'incomplete_embeddings',
      );
    }
    return failJob('internal_error', 'Could not finalize knowledge index.', 'internal_error');
  }

  if (deps.recordUsage) {
    try {
      await deps.recordUsage({
        capability: 'knowledge_index_embed',
        model: route.model,
        outcome: 'success',
        inputTokens: hadTokenUsage ? inputTokensAcc : null,
        totalTokens: hadTokenUsage ? inputTokensAcc : null,
        latencyMs: Date.now() - started,
        sectionId,
        chunkCount: chunks.length,
        batchCount,
      });
    } catch {
      /* fail-open */
    }
  }

  return {
    version: 1,
    ok: true,
    result: {
      status: 'indexed',
      reused: false,
      sourceId: source.sourceId,
      sourceVersion,
      retrievalSourceVersion: finalized.retrieval_source_version ?? sourceVersion,
      chunkCount: chunks.length,
      batchCount,
      embeddingModel: route.model,
      embeddingDimensions: route.dimensions,
    },
  };
}

export async function runKnowledgeIndex(input: {
  authUserId: string | null;
  body: unknown;
  deps: KnowledgeIndexDeps;
}): Promise<KnowledgeIndexResponse> {
  if (!input.authUserId) {
    return fail('unauthenticated', 'Sign in to index course knowledge.');
  }

  const parsed = parseKnowledgeIndexRequest(input.body);
  if (!parsed.ok) {
    return fail('invalid_request', 'Invalid index request.');
  }
  const { request } = parsed;

  const loaded = await input.deps.loadSourceForObject({
    userId: input.authUserId,
    sectionId: request.sectionId,
    sourceObjectId: request.sourceObjectId,
  });
  if (!loaded.ok) {
    if (loaded.code === 'auth_mismatch') {
      return fail('auth_mismatch', 'You do not have access to this section.');
    }
    if (loaded.code === 'not_ready') {
      return fail('not_ready', 'Knowledge text is not ready to index yet.');
    }
    return fail('not_found', 'Knowledge source not found.');
  }

  return runKnowledgeIndexForSource({
    sectionId: request.sectionId,
    source: loaded.source,
    deps: input.deps,
  });
}
