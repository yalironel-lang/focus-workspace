/**
 * M0.7A / M1.0B B3.3C — knowledge process orchestrator.
 *
 * Flow (PDF / free_space_pdf):
 *   validate request
 *   → runKnowledgeIngest(...)
 *   → on ingest failure: STOP
 *   → when selective recovery ENABLED:
 *        runFinalizeRecoveredPdfCorpus (assemble → 019 publish)
 *        may return recovery_pending (do not publish; resume later)
 *   → when selective recovery DISABLED:
 *        classic runKnowledgeIndex (finalize_index_success)
 *
 * Does NOT call Edge Functions over HTTP.
 * Does NOT debit Ask/Explain quota.
 * Notebook uses a separate orchestrator (unchanged).
 */

import {
  KNOWLEDGE_MAX_REQUEST_BODY_BYTES,
  KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED,
} from './bounds.ts';
import type { KnowledgeProcessLogEvent } from './privacyLogProcess.ts';
import {
  runFinalizeRecoveredPdfCorpus,
  type FinalizeRecoveredPdfDeps,
  type FinalizeRecoveredPdfErrorCode,
} from './runFinalizeRecoveredPdf.ts';
import {
  runKnowledgeIngest,
  type KnowledgeIngestDeps,
} from './runKnowledgeIngest.ts';
import {
  runKnowledgeIndex,
  type KnowledgeIndexDeps,
  type KnowledgeIndexErrorCode,
} from './runKnowledgeIndex.ts';
import type { KnowledgeIngestErrorCode } from './types.ts';

export type KnowledgeProcessRequest = {
  version: 1;
  sectionId: string;
  sourceObjectId: string;
};

export type KnowledgeProcessErrorCode =
  | KnowledgeIngestErrorCode
  | KnowledgeIndexErrorCode
  | FinalizeRecoveredPdfErrorCode;

export type KnowledgeProcessSuccess = {
  version: 1;
  ok: true;
  result: {
    type: 'knowledge_process';
    ingest: {
      outcome: 'ready' | 'reused' | 'awaiting_finalize';
      sourceVersion: number;
      pageCount: number;
      chunkCount: number;
    };
    index: {
      outcome: 'indexed' | 'reused' | 'published' | 'already_published';
      retrievalSourceVersion: number;
    };
  };
};

export type KnowledgeProcessFailure = {
  version: 1;
  ok: false;
  error: {
    code: KnowledgeProcessErrorCode;
    message: string;
  };
};

export type KnowledgeProcessResponse = KnowledgeProcessSuccess | KnowledgeProcessFailure;

export type KnowledgeProcessDeps = {
  ingest: KnowledgeIngestDeps;
  index: KnowledgeIndexDeps;
  /**
   * Required when selective recovery is enabled (default bounds gate).
   * Owns assemble + atomic publish for the PDF recovered-corpus path.
   */
  finalize?: FinalizeRecoveredPdfDeps;
  /** Optional metadata-only diagnostics (never content). */
  onEvent?: (event: KnowledgeProcessLogEvent) => void;
};

function fail(
  code: KnowledgeProcessErrorCode,
  message: string,
): KnowledgeProcessFailure {
  return { version: 1, ok: false, error: { code, message } };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Strict process request parse.
 * Rejects all client-controlled authority fields from ingest + index contracts.
 */
export function parseKnowledgeProcessRequest(
  body: unknown,
): { ok: true; request: KnowledgeProcessRequest } | { ok: false; code: 'invalid_request' } {
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
  // Reject client attempts to supply authoritative / provider / job fields.
  if (
    'userId' in o ||
    'user_id' in o ||
    'storagePath' in o ||
    'contentHash' in o ||
    'chunks' in o ||
    'sourceVersion' in o ||
    'retrievalSourceVersion' in o ||
    'retrieval_source_version' in o ||
    'jobId' in o ||
    'job_id' in o ||
    'model' in o ||
    'dimensions' in o ||
    'embedding' in o ||
    'embeddings' in o ||
    'vectors' in o ||
    'provider' in o
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

export function knowledgeProcessRequestBodyTooLarge(byteLength: number): boolean {
  return byteLength > KNOWLEDGE_MAX_REQUEST_BODY_BYTES;
}

function recoveryFeatureEnabled(deps: KnowledgeProcessDeps): boolean {
  return deps.ingest.recoveryEnabled ?? KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED;
}

export async function runKnowledgeProcess(input: {
  authUserId: string | null;
  body: unknown;
  deps: KnowledgeProcessDeps;
}): Promise<KnowledgeProcessResponse> {
  const emit = (event: KnowledgeProcessLogEvent) => {
    try {
      input.deps.onEvent?.(event);
    } catch {
      // Diagnostics must never break orchestration.
    }
  };

  const hasSection =
    Boolean(input.body) &&
    typeof input.body === 'object' &&
    typeof (input.body as Record<string, unknown>).sectionId === 'string';
  const hasObject =
    Boolean(input.body) &&
    typeof input.body === 'object' &&
    typeof (input.body as Record<string, unknown>).sourceObjectId === 'string';

  emit({
    event: 'knowledge_process_begin',
    hasUser: Boolean(input.authUserId),
    hasSection,
    hasObject,
  });

  if (!input.authUserId) {
    emit({ event: 'knowledge_process_failed', stage: 'request', code: 'unauthenticated' });
    return fail('unauthenticated', 'Sign in to process course knowledge.');
  }

  const parsed = parseKnowledgeProcessRequest(input.body);
  if (!parsed.ok) {
    emit({ event: 'knowledge_process_failed', stage: 'request', code: 'invalid_request' });
    return fail('invalid_request', 'Invalid knowledge process request.');
  }

  // Same minimal body is authoritative for both stages (server derives everything else).
  const stageBody = {
    version: 1 as const,
    sectionId: parsed.request.sectionId,
    sourceObjectId: parsed.request.sourceObjectId,
  };

  const ingest = await runKnowledgeIngest({
    authUserId: input.authUserId,
    body: stageBody,
    deps: input.deps.ingest,
  });

  if (!ingest.ok) {
    emit({
      event: 'knowledge_process_failed',
      stage: 'ingest',
      code: ingest.error.code,
    });
    return fail(ingest.error.code, ingest.error.message);
  }

  const ingestOutcome =
    ingest.result.status === 'reused'
      ? 'reused'
      : ingest.result.status === 'awaiting_finalize'
        ? 'awaiting_finalize'
        : 'ready';
  emit({
    event: 'knowledge_process_ingest_ok',
    outcome: ingestOutcome,
    sourceVersion: ingest.result.sourceVersion,
    pageCount: ingest.result.pageCount,
    chunkCount: ingest.result.chunkCount,
  });

  // B3.3C recovered-corpus path (feature on): assemble + atomic publish.
  if (recoveryFeatureEnabled(input.deps)) {
    if (!input.deps.finalize) {
      emit({
        event: 'knowledge_process_failed',
        stage: 'finalize',
        code: 'internal_error',
      });
      return fail('internal_error', 'Finalize deps are required when recovery is enabled.');
    }

    const finalized = await runFinalizeRecoveredPdfCorpus({
      sourceId: ingest.result.sourceId,
      sourceVersion: ingest.result.sourceVersion,
      sectionId: parsed.request.sectionId,
      userId: input.authUserId,
      deps: input.deps.finalize,
    });

    if (!finalized.ok) {
      emit({
        event: 'knowledge_process_failed',
        stage: 'finalize',
        code: finalized.code,
      });
      if (finalized.code === 'recovery_pending') {
        return fail(
          'recovery_pending',
          'Page recovery is still in progress; retry after jobs are terminal.',
        );
      }
      return fail(finalized.code, finalized.message);
    }

    emit({
      event: 'knowledge_process_finalize_ok',
      outcome: finalized.outcome,
      sourceVersion: finalized.sourceVersion,
      retrievalSourceVersion: finalized.retrievalSourceVersion,
      chunkCount: finalized.chunkCount,
      pageCount: finalized.pageCount,
    });

    return {
      version: 1,
      ok: true,
      result: {
        type: 'knowledge_process',
        ingest: {
          outcome: ingestOutcome,
          sourceVersion: ingest.result.sourceVersion,
          pageCount: ingest.result.pageCount || finalized.pageCount,
          chunkCount: finalized.chunkCount,
        },
        index: {
          outcome: finalized.outcome,
          retrievalSourceVersion: finalized.retrievalSourceVersion,
        },
      },
    };
  }

  // Classic path (recovery feature off): index publishes via finalize_index_success.
  const index = await runKnowledgeIndex({
    authUserId: input.authUserId,
    body: stageBody,
    deps: input.deps.index,
  });

  if (!index.ok) {
    emit({
      event: 'knowledge_process_failed',
      stage: 'index',
      code: index.error.code,
    });
    return fail(index.error.code, index.error.message);
  }

  const indexOutcome = index.result.reused ? 'reused' : 'indexed';
  emit({
    event: 'knowledge_process_index_ok',
    outcome: indexOutcome,
    retrievalSourceVersion: index.result.retrievalSourceVersion,
    chunkCount: index.result.chunkCount,
    batchCount: index.result.batchCount,
  });

  return {
    version: 1,
    ok: true,
    result: {
      type: 'knowledge_process',
      ingest: {
        outcome: ingestOutcome === 'awaiting_finalize' ? 'ready' : ingestOutcome,
        sourceVersion: ingest.result.sourceVersion,
        pageCount: ingest.result.pageCount,
        chunkCount: ingest.result.chunkCount,
      },
      index: {
        outcome: indexOutcome,
        retrievalSourceVersion: index.result.retrievalSourceVersion,
      },
    },
  };
}
