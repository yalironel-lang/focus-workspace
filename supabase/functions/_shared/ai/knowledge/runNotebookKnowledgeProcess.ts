/**
 * M0.8D — Notebook page knowledge process (ingest → shared index lifecycle).
 *
 * Reuses runKnowledgeIndexForSource (same embedding/version/finalize path as PDF).
 * Does NOT widen Ask search (still PDF-only until M0.8F).
 * Does NOT call providers in unit tests (inject fake embedding adapter).
 */

import { KNOWLEDGE_MAX_REQUEST_BODY_BYTES } from './bounds.ts';
import type { NotebookKnowledgeErrorCode } from './notebookTypes.ts';
import {
  parseNotebookKnowledgeIngestRequest,
  runNotebookKnowledgeIngest,
  type NotebookKnowledgeIngestDeps,
} from './runNotebookKnowledgeIngest.ts';
import {
  runKnowledgeIndexForSource,
  type KnowledgeIndexDeps,
  type KnowledgeIndexErrorCode,
  type SourceIndexMeta,
} from './runKnowledgeIndex.ts';

export type NotebookKnowledgeProcessRequest = {
  version: 1;
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
};

export type NotebookKnowledgeProcessErrorCode =
  | NotebookKnowledgeErrorCode
  | KnowledgeIndexErrorCode;

export type NotebookKnowledgeProcessSuccess = {
  version: 1;
  ok: true;
  result: {
    type: 'notebook_knowledge_process';
    ingest: {
      outcome: 'ready' | 'reused' | 'cleared';
      sourceVersion: number | null;
      chunkCount: number;
      retrievalCleared?: boolean;
    };
    index: {
      outcome: 'indexed' | 'reused' | 'skipped';
      retrievalSourceVersion: number | null;
      chunkCount?: number;
      batchCount?: number;
      embeddingCalls?: number;
    };
  };
};

export type NotebookKnowledgeProcessFailure = {
  version: 1;
  ok: false;
  error: {
    code: NotebookKnowledgeProcessErrorCode;
    message: string;
    /** permanent | retryable | stale — for later M0.8E handoff. */
    class: 'permanent' | 'retryable' | 'stale';
  };
};

export type NotebookKnowledgeProcessResponse =
  | NotebookKnowledgeProcessSuccess
  | NotebookKnowledgeProcessFailure;

export type NotebookKnowledgeProcessLogEvent =
  | {
      event: 'notebook_knowledge_process_begin';
      hasUser: boolean;
      hasSection: boolean;
      hasNotebook: boolean;
      hasPage: boolean;
    }
  | {
      event: 'notebook_knowledge_process_ingest_ok';
      outcome: 'ready' | 'reused' | 'cleared';
      sourceVersion: number | null;
      chunkCount: number;
    }
  | {
      event: 'notebook_knowledge_process_index_ok';
      outcome: 'indexed' | 'reused' | 'skipped';
      retrievalSourceVersion: number | null;
    }
  | {
      event: 'notebook_knowledge_process_failed';
      stage: 'request' | 'ingest' | 'index';
      code: string;
    };

export type NotebookKnowledgeProcessDeps = {
  ingest: NotebookKnowledgeIngestDeps;
  /**
   * Index deps minus PDF-oriented loadSourceForObject (Notebook resolves source
   * via loadNotebookSource after ingest).
   */
  index: Omit<KnowledgeIndexDeps, 'loadSourceForObject'> & {
    loadSourceForObject?: KnowledgeIndexDeps['loadSourceForObject'];
  };
  /** Load notebook_page source meta after successful ingest (by parent+page). */
  loadNotebookSource: (input: {
    userId: string;
    sectionId: string;
    notebookObjectId: string;
    pageId: string;
  }) => Promise<
    | { ok: true; source: SourceIndexMeta }
    | { ok: false; code: 'not_found' | 'auth_mismatch' | 'not_ready' }
  >;
  onEvent?: (event: NotebookKnowledgeProcessLogEvent) => void;
};

function fail(
  code: NotebookKnowledgeProcessErrorCode,
  message: string,
): NotebookKnowledgeProcessFailure {
  return {
    version: 1,
    ok: false,
    error: { code, message, class: classifyNotebookProcessError(code) },
  };
}

export function classifyNotebookProcessError(
  code: NotebookKnowledgeProcessErrorCode,
): 'permanent' | 'retryable' | 'stale' {
  switch (code) {
    case 'stale_job':
      return 'stale';
    case 'embedding_rate_limited':
    case 'embedding_timeout':
    case 'embedding_provider_unavailable':
    case 'embedding_quota_exceeded':
    case 'internal_error':
    case 'not_ready':
      return 'retryable';
    default:
      return 'permanent';
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseNotebookKnowledgeProcessRequest(
  body: unknown,
):
  | { ok: true; request: NotebookKnowledgeProcessRequest }
  | { ok: false; code: 'invalid_request' } {
  const parsed = parseNotebookKnowledgeIngestRequest(body);
  if (!parsed.ok) return parsed;
  if (!body || typeof body !== 'object') return { ok: false, code: 'invalid_request' };
  const o = body as Record<string, unknown>;
  // Extra index-authority fields rejected beyond ingest contract.
  if (
    'jobId' in o ||
    'job_id' in o ||
    'model' in o ||
    'dimensions' in o ||
    'embedding' in o ||
    'embeddings' in o ||
    'vectors' in o ||
    'provider' in o ||
    'retrievalSourceVersion' in o ||
    'retrieval_source_version' in o
  ) {
    return { ok: false, code: 'invalid_request' };
  }
  if (!isUuid(parsed.request.sectionId)) return { ok: false, code: 'invalid_request' };
  return { ok: true, request: parsed.request };
}

export function notebookKnowledgeProcessRequestBodyTooLarge(byteLength: number): boolean {
  return byteLength > KNOWLEDGE_MAX_REQUEST_BODY_BYTES;
}

export async function runNotebookKnowledgeProcess(input: {
  authUserId: string | null;
  body: unknown;
  deps: NotebookKnowledgeProcessDeps;
}): Promise<NotebookKnowledgeProcessResponse> {
  const emit = (event: NotebookKnowledgeProcessLogEvent) => {
    try {
      input.deps.onEvent?.(event);
    } catch {
      /* diagnostics must never break orchestration */
    }
  };

  const hasSection =
    Boolean(input.body) &&
    typeof input.body === 'object' &&
    typeof (input.body as Record<string, unknown>).sectionId === 'string';
  const hasNotebook =
    Boolean(input.body) &&
    typeof input.body === 'object' &&
    typeof (input.body as Record<string, unknown>).notebookObjectId === 'string';
  const hasPage =
    Boolean(input.body) &&
    typeof input.body === 'object' &&
    typeof (input.body as Record<string, unknown>).pageId === 'string';

  emit({
    event: 'notebook_knowledge_process_begin',
    hasUser: Boolean(input.authUserId),
    hasSection,
    hasNotebook,
    hasPage,
  });

  if (!input.authUserId) {
    emit({
      event: 'notebook_knowledge_process_failed',
      stage: 'request',
      code: 'unauthenticated',
    });
    return fail('unauthenticated', 'Sign in to process Notebook knowledge.');
  }

  const parsed = parseNotebookKnowledgeProcessRequest(input.body);
  if (!parsed.ok) {
    emit({
      event: 'notebook_knowledge_process_failed',
      stage: 'request',
      code: 'invalid_request',
    });
    return fail('invalid_request', 'Invalid Notebook knowledge process request.');
  }

  const { sectionId, notebookObjectId, pageId } = parsed.request;
  const stageBody = {
    version: 1 as const,
    sectionId,
    notebookObjectId,
    pageId,
  };

  const ingest = await runNotebookKnowledgeIngest({
    authUserId: input.authUserId,
    body: stageBody,
    deps: input.deps.ingest,
  });

  if (!ingest.ok) {
    emit({
      event: 'notebook_knowledge_process_failed',
      stage: 'ingest',
      code: ingest.error.code,
    });
    return fail(ingest.error.code, ingest.error.message);
  }

  const ingestOutcome = ingest.result.status;
  emit({
    event: 'notebook_knowledge_process_ingest_ok',
    outcome: ingestOutcome,
    sourceVersion: ingest.result.sourceVersion,
    chunkCount: ingest.result.chunkCount,
  });

  // Blank / no-text: invalidation already applied — skip embedding entirely.
  if (ingestOutcome === 'cleared') {
    emit({
      event: 'notebook_knowledge_process_index_ok',
      outcome: 'skipped',
      retrievalSourceVersion: null,
    });
    return {
      version: 1,
      ok: true,
      result: {
        type: 'notebook_knowledge_process',
        ingest: {
          outcome: 'cleared',
          sourceVersion: null,
          chunkCount: 0,
          retrievalCleared: ingest.result.retrievalCleared === true,
        },
        index: {
          outcome: 'skipped',
          retrievalSourceVersion: null,
          embeddingCalls: 0,
        },
      },
    };
  }

  const loaded = await input.deps.loadNotebookSource({
    userId: input.authUserId,
    sectionId,
    notebookObjectId,
    pageId,
  });
  if (!loaded.ok) {
    emit({
      event: 'notebook_knowledge_process_failed',
      stage: 'index',
      code: loaded.code,
    });
    if (loaded.code === 'auth_mismatch') {
      return fail('auth_mismatch', 'You do not have access to this section.');
    }
    if (loaded.code === 'not_ready') {
      return fail('not_ready', 'Notebook knowledge text is not ready to index yet.');
    }
    return fail('not_found', 'Notebook knowledge source not found.');
  }

  // Count embedding provider calls for cost/idempotency assertions in tests.
  const provider = input.deps.index.embeddingProvider;
  const embedCallsBefore =
    provider && 'calls' in provider && Array.isArray((provider as { calls?: unknown[] }).calls)
      ? (provider as { calls: unknown[] }).calls.length
      : null;

  const index = await runKnowledgeIndexForSource({
    sectionId,
    source: loaded.source,
    deps: input.deps.index as KnowledgeIndexDeps,
  });

  if (!index.ok) {
    emit({
      event: 'notebook_knowledge_process_failed',
      stage: 'index',
      code: index.error.code,
    });
    return fail(index.error.code, index.error.message);
  }

  const embedCallsAfter =
    embedCallsBefore !== null &&
    provider &&
    'calls' in provider &&
    Array.isArray((provider as { calls?: unknown[] }).calls)
      ? (provider as { calls: unknown[] }).calls.length
      : null;
  const embeddingCalls =
    embedCallsBefore !== null && embedCallsAfter !== null
      ? embedCallsAfter - embedCallsBefore
      : index.result.reused
        ? 0
        : index.result.batchCount;

  const indexOutcome = index.result.reused ? 'reused' : 'indexed';
  emit({
    event: 'notebook_knowledge_process_index_ok',
    outcome: indexOutcome,
    retrievalSourceVersion: index.result.retrievalSourceVersion,
  });

  return {
    version: 1,
    ok: true,
    result: {
      type: 'notebook_knowledge_process',
      ingest: {
        outcome: ingestOutcome === 'reused' ? 'reused' : 'ready',
        sourceVersion: ingest.result.sourceVersion,
        chunkCount: ingest.result.chunkCount,
      },
      index: {
        outcome: indexOutcome,
        retrievalSourceVersion: index.result.retrievalSourceVersion,
        chunkCount: index.result.chunkCount,
        batchCount: index.result.batchCount,
        embeddingCalls,
      },
    },
  };
}
