/**
 * M0.7A — knowledge process orchestrator (direct reuse of ingest → index).
 *
 * Flow:
 *   validate request
 *   → runKnowledgeIngest(...)
 *   → on ingest failure: STOP (do not index)
 *   → runKnowledgeIndex(...) for authoritative current source state
 *   → return normalized process result
 *
 * Does NOT call Edge Functions over HTTP.
 * Does NOT flip retrieval_source_version (index finalize only).
 * Does NOT debit Ask/Explain quota.
 */

import { KNOWLEDGE_MAX_REQUEST_BODY_BYTES } from './bounds.ts';
import type { KnowledgeProcessLogEvent } from './privacyLogProcess.ts';
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
  | KnowledgeIndexErrorCode;

export type KnowledgeProcessSuccess = {
  version: 1;
  ok: true;
  result: {
    type: 'knowledge_process';
    ingest: {
      outcome: 'ready' | 'reused';
      sourceVersion: number;
      pageCount: number;
      chunkCount: number;
    };
    index: {
      outcome: 'indexed' | 'reused';
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

  const ingestOutcome = ingest.result.reused ? 'reused' : 'ready';
  emit({
    event: 'knowledge_process_ingest_ok',
    outcome: ingestOutcome,
    sourceVersion: ingest.result.sourceVersion,
    pageCount: ingest.result.pageCount,
    chunkCount: ingest.result.chunkCount,
  });

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
        outcome: ingestOutcome,
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
