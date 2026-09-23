/**
 * M1.0B B3.3A — index a ready text version WITHOUT flipping retrieval.
 *
 * Reuses begin_index → embed → upsert from the standard index path.
 * Does NOT call finalize_index_success (that RPC publishes retrieval).
 * Completeness is validated in process; version_index may remain `indexing`
 * until B3.3B publication. N stays searchable via retrieval_source_version.
 */

import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from './bounds.ts';
import {
  batchChunksForEmbedding,
  embeddingInputForChunk,
} from './batchChunks.ts';
import { mapEmbeddingErrorToIndexFailureCode } from './embeddingTypes.ts';
import { routeEmbeddingModel } from './routeEmbedding.ts';
import type {
  KnowledgeIndexDeps,
  KnowledgeIndexResponse,
  SourceIndexMeta,
} from './runKnowledgeIndex.ts';

/** Optional dep for completeness checks without loading vectors. */
export type UnpublishedIndexDeps = KnowledgeIndexDeps & {
  countEmbeddings?: (input: {
    sourceId: string;
    sourceVersion: number;
    embeddingModel: string;
    embeddingDimensions: number;
  }) => Promise<number>;
};

function fail(
  code: Extract<KnowledgeIndexResponse, { ok: false }>['error']['code'],
  message: string,
): KnowledgeIndexResponse {
  return { version: 1, ok: false, error: { code, message } };
}

export type UnpublishedIndexResult = {
  ok: true;
  sourceId: string;
  sourceVersion: number;
  retrievalSourceVersion: number | null;
  chunkCount: number;
  embeddingCount: number;
  batchCount: number;
  jobId: string;
  embeddingModel: string;
  embeddingDimensions: number;
  published: false;
};

/**
 * Build embeddings for source.sourceVersion without changing retrieval_source_version.
 */
export async function runKnowledgeIndexUnpublishedForSource(input: {
  sectionId: string;
  source: SourceIndexMeta;
  deps: UnpublishedIndexDeps;
  /** When set, must equal source.sourceVersion (processing tip). */
  targetSourceVersion: number;
}): Promise<
  | { ok: true; result: UnpublishedIndexResult }
  | { ok: false; response: KnowledgeIndexResponse }
> {
  const { source, deps, sectionId, targetSourceVersion } = input;

  if (source.sourceVersion !== targetSourceVersion) {
    return {
      ok: false,
      response: fail('stale_job', 'Processing version is no longer authoritative.'),
    };
  }

  let route;
  try {
    route = routeEmbeddingModel({
      model: deps.embeddingModel,
      dimensions: deps.embeddingDimensions,
    });
  } catch {
    return {
      ok: false,
      response: fail('internal_error', 'Embedding model is not configured.'),
    };
  }

  const begin = await deps.beginIndex({
    sourceId: source.sourceId,
    sourceVersion: targetSourceVersion,
    embeddingModel: route.model,
    embeddingDimensions: route.dimensions,
  });
  if (!begin.ok || !begin.job_id) {
    if (begin.code === 'stale_job') {
      return {
        ok: false,
        response: fail('stale_job', 'Index job is stale; retry.'),
      };
    }
    return {
      ok: false,
      response: fail('internal_error', 'Could not begin knowledge index.'),
    };
  }

  const jobId = begin.job_id;
  const sourceVersion = begin.source_version ?? targetSourceVersion;
  let batchCount = 0;

  const failJob = async (
    code: Extract<KnowledgeIndexResponse, { ok: false }>['error']['code'],
    message: string,
    sqlCode: string,
  ) => {
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
    return { ok: false as const, response: fail(code, message) };
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
    if (
      embedded.embeddings.length !== batch.chunks.length ||
      embedded.dimensions !== KNOWLEDGE_EMBEDDING_DIMENSIONS
    ) {
      return failJob(
        'embedding_invalid_response',
        'Unexpected embedding response.',
        'incomplete_embeddings',
      );
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

  // Completeness without publication: every chunk must have an embedding row.
  const verifyChunks = await deps.loadChunks({
    sourceId: source.sourceId,
    sourceVersion,
  });
  const embeddingCount = await deps.countEmbeddings?.({
    sourceId: source.sourceId,
    sourceVersion,
    embeddingModel: route.model,
    embeddingDimensions: route.dimensions,
  });

  if (
    typeof embeddingCount === 'number' &&
    embeddingCount !== verifyChunks.length
  ) {
    return failJob(
      'incomplete_embeddings',
      'Embeddings incomplete for unpublished version.',
      'incomplete_embeddings',
    );
  }

  // Explicitly do NOT call finalizeIndexSuccess (would flip retrieval).
  return {
    ok: true,
    result: {
      ok: true,
      sourceId: source.sourceId,
      sourceVersion,
      retrievalSourceVersion: source.retrievalSourceVersion,
      chunkCount: verifyChunks.length,
      embeddingCount: embeddingCount ?? verifyChunks.length,
      batchCount,
      jobId,
      embeddingModel: route.model,
      embeddingDimensions: route.dimensions,
      published: false,
    },
  };
}
