/**
 * M1.0B B3.3B — atomic publish of a complete unpublished PDF corpus.
 *
 * Calls ai_knowledge_publish_recovered_corpus (single DB transaction).
 * Does not assemble, embed, or mutate Notebook paths.
 */

import {
  assertPublishLogIsPrivacySafe,
  formatPublishRecoveredCorpusLogLine,
} from './privacyLogPublish.ts';

export type PublishRecoveredCorpusErrorCode =
  | 'invalid_request'
  | 'not_found'
  | 'not_pdf'
  | 'not_ready'
  | 'missing_page_count'
  | 'missing_page'
  | 'duplicate_page'
  | 'recovery_not_terminal'
  | 'missing_required_job'
  | 'discarded_stale_authority'
  | 'stale_processing_version'
  | 'incomplete_index'
  | 'incomplete_embeddings'
  | 'auth_mismatch'
  | 'internal_error';

export type PublishRecoveredCorpusRequest = {
  sourceId: string;
  /** Exact processing version expected to become retrieval-active. */
  expectedSourceVersion: number;
  sectionId: string;
  userId: string;
};

export type PublishRecoveredCorpusResult =
  | {
      ok: true;
      sourceId: string;
      sourceVersion: number;
      retrievalSourceVersion: number;
      previousRetrievalSourceVersion: number | null;
      alreadyPublished: boolean;
      chunkCount: number;
      pageCount?: number;
    }
  | {
      ok: false;
      code: PublishRecoveredCorpusErrorCode;
      message: string;
    };

export type PublishRecoveredCorpusDeps = {
  loadSourceById: (sourceId: string) => Promise<
    | {
        ok: true;
        source: {
          sourceId: string;
          userId: string;
          sectionId: string;
          sourceKind: string;
          sourceVersion: number;
          retrievalSourceVersion: number | null;
        };
      }
    | { ok: false; code: 'not_found' | 'auth_mismatch' }
  >;
  publishRecoveredCorpus: (input: {
    sourceId: string;
    expectedSourceVersion: number;
  }) => Promise<{
    ok: boolean;
    code?: string;
    already_published?: boolean;
    source_id?: string;
    source_version?: number;
    retrieval_source_version?: number | null;
    previous_retrieval_source_version?: number | null;
    chunk_count?: number;
    page_count?: number;
  }>;
  requestId?: string;
  onLog?: (line: string) => void;
};

function fail(
  code: PublishRecoveredCorpusErrorCode,
  message: string,
): PublishRecoveredCorpusResult {
  return { ok: false, code, message };
}

function mapRpcCode(code: string | undefined): PublishRecoveredCorpusErrorCode {
  switch (code) {
    case 'invalid_request':
    case 'not_found':
    case 'not_pdf':
    case 'not_ready':
    case 'missing_page_count':
    case 'missing_page':
    case 'duplicate_page':
    case 'recovery_not_terminal':
    case 'missing_required_job':
    case 'discarded_stale_authority':
    case 'stale_processing_version':
    case 'incomplete_index':
    case 'incomplete_embeddings':
      return code;
    default:
      return 'internal_error';
  }
}

export async function runPublishRecoveredCorpus(input: {
  request: PublishRecoveredCorpusRequest;
  deps: PublishRecoveredCorpusDeps;
}): Promise<PublishRecoveredCorpusResult> {
  const { request, deps } = input;
  const requestId = deps.requestId ?? 'publish';
  const started = Date.now();

  const beginLine = formatPublishRecoveredCorpusLogLine({
    event: 'publish_recovered_corpus_begin',
    requestId,
    expectedSourceVersion: request.expectedSourceVersion,
    hasSourceId: Boolean(request.sourceId),
  });
  if (!assertPublishLogIsPrivacySafe(beginLine)) {
    return fail('internal_error', 'Publish log privacy check failed.');
  }
  deps.onLog?.(beginLine);

  if (
    !request.sourceId ||
    !Number.isInteger(request.expectedSourceVersion) ||
    request.expectedSourceVersion < 1
  ) {
    return fail('invalid_request', 'Invalid publish request.');
  }

  const loaded = await deps.loadSourceById(request.sourceId);
  if (!loaded.ok) {
    return fail(
      loaded.code === 'auth_mismatch' ? 'auth_mismatch' : 'not_found',
      'Knowledge source not found.',
    );
  }
  if (
    loaded.source.userId !== request.userId ||
    loaded.source.sectionId !== request.sectionId
  ) {
    return fail('auth_mismatch', 'Source ownership mismatch.');
  }
  if (loaded.source.sourceKind !== 'free_space_pdf') {
    return fail('not_pdf', 'Publication applies only to free_space_pdf sources.');
  }

  const published = await deps.publishRecoveredCorpus({
    sourceId: request.sourceId,
    expectedSourceVersion: request.expectedSourceVersion,
  });

  if (!published.ok) {
    const code = mapRpcCode(published.code);
    const failLine = formatPublishRecoveredCorpusLogLine({
      event: 'publish_recovered_corpus_failed',
      requestId,
      code,
      latencyMs: Date.now() - started,
    });
    deps.onLog?.(failLine);
    return fail(code, 'Publication rejected.');
  }

  if (
    published.retrieval_source_version == null ||
    published.source_version == null
  ) {
    return fail('internal_error', 'Publication returned incomplete result.');
  }

  const okLine = formatPublishRecoveredCorpusLogLine({
    event: 'publish_recovered_corpus_ok',
    requestId,
    sourceVersion: published.source_version,
    retrievalSourceVersion: published.retrieval_source_version,
    previousRetrievalSourceVersion:
      published.previous_retrieval_source_version ?? null,
    alreadyPublished: published.already_published === true,
    chunkCount: published.chunk_count,
    pageCount: published.page_count,
    latencyMs: Date.now() - started,
  });
  if (!assertPublishLogIsPrivacySafe(okLine)) {
    return fail('internal_error', 'Publish log privacy check failed.');
  }
  deps.onLog?.(okLine);

  return {
    ok: true,
    sourceId: request.sourceId,
    sourceVersion: published.source_version,
    retrievalSourceVersion: published.retrieval_source_version,
    previousRetrievalSourceVersion:
      published.previous_retrieval_source_version ?? null,
    alreadyPublished: published.already_published === true,
    chunkCount: published.chunk_count ?? 0,
    pageCount: published.page_count,
  };
}
