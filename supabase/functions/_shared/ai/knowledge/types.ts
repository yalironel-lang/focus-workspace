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
    status: 'ready' | 'reused';
    sourceId: string;
    sourceVersion: number;
    pageCount: number;
    chunkCount: number;
    contentChanged: boolean;
    reused: boolean;
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
