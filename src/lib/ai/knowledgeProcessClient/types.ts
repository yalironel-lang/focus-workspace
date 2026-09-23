/**
 * Client invoke seam for M0.7A ai-knowledge-process.
 * M0.7B.3 wires Free Space PDF Storage success → handoff controller → this client.
 */

export const AI_KNOWLEDGE_PROCESS_FUNCTION_NAME = 'ai-knowledge-process' as const;

export type KnowledgeProcessClientRequest = {
  version: 1;
  sectionId: string;
  sourceObjectId: string;
};

/** Union of ingest + index error codes returned by ai-knowledge-process. */
export type KnowledgeProcessClientErrorCode =
  | 'unauthenticated'
  | 'auth_mismatch'
  | 'not_found'
  | 'not_pdf'
  | 'invalid_request'
  | 'too_large'
  | 'too_many_pages'
  | 'no_extractable_text'
  | 'extract_failed'
  | 'not_ready'
  | 'stale_job'
  | 'incomplete_embeddings'
  | 'embedding_rate_limited'
  | 'embedding_timeout'
  | 'embedding_provider_unavailable'
  | 'embedding_invalid_response'
  | 'embedding_quota_exceeded'
  | 'embedding_internal_error'
  | 'recovery_pending'
  | 'internal_error'
  | 'aborted'
  | 'network_error';

export type KnowledgeProcessClientSuccess = {
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

export type KnowledgeProcessClientFailure = {
  version: 1;
  ok: false;
  error: {
    code: KnowledgeProcessClientErrorCode;
    message: string;
  };
};

export type KnowledgeProcessClientResponse =
  | KnowledgeProcessClientSuccess
  | KnowledgeProcessClientFailure;
