/**
 * M0.5B knowledge ingest request/response contracts (metadata only).
 */

export type KnowledgeIngestRequest = {
  version: 1;
  sectionId: string;
  sourceObjectId: string;
};

export type KnowledgeIngestErrorCode =
  | 'unauthenticated'
  | 'auth_mismatch'
  | 'not_found'
  | 'not_pdf'
  | 'invalid_request'
  | 'too_large'
  | 'too_many_pages'
  | 'no_extractable_text'
  | 'extract_failed'
  | 'internal_error';

export type KnowledgeIngestSuccess = {
  version: 1;
  ok: true;
  result: {
    /**
     * ready — classic finalize completed (recovery feature off).
     * reused — same-hash READY short-circuit.
     * awaiting_finalize — native ledger (+ optional recovery enqueue) done;
     *   READY chunks deferred to assemble/publish (B3.3C).
     */
    status: 'ready' | 'reused' | 'awaiting_finalize';
    sourceId: string;
    sourceVersion: number;
    pageCount: number;
    chunkCount: number;
    contentChanged: boolean;
    reused: boolean;
    /** True when selective recovery jobs were enqueued this attempt. */
    recoveryEnqueued?: boolean;
  };
};

export type KnowledgeIngestFailure = {
  version: 1;
  ok: false;
  error: {
    code: KnowledgeIngestErrorCode;
    message: string;
  };
};

export type KnowledgeIngestResponse = KnowledgeIngestSuccess | KnowledgeIngestFailure;

/** Safe operational log line — never includes course text / bytes / JWT. */
export type KnowledgeIngestLogLine = {
  event: 'ai_knowledge_ingest';
  requestId: string;
  outcome: 'ok' | 'error';
  code?: KnowledgeIngestErrorCode | 'ok';
  hasUser: boolean;
  hasSection: boolean;
  hasObject: boolean;
  byteLength?: number;
  pageCount?: number;
  chunkCount?: number;
  latencyMs: number;
};
