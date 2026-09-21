/**
 * M0.8C — Notebook page knowledge ingest contracts (metadata only).
 * Extraction/hash/chunk only — no embeddings.
 */

export type NotebookKnowledgeIngestRequest = {
  version: 1;
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
};

export type NotebookKnowledgeErrorCode =
  | 'unauthenticated'
  | 'auth_mismatch'
  | 'not_found'
  | 'not_notebook'
  | 'notebook_page_not_found'
  | 'notebook_codec_unsupported'
  | 'notebook_extract_failed'
  | 'no_extractable_text'
  | 'invalid_request'
  | 'too_large'
  | 'internal_error';

export type NotebookKnowledgeIngestSuccess = {
  version: 1;
  ok: true;
  result: {
    status: 'ready' | 'reused' | 'cleared';
    sourceId: string | null;
    sourceVersion: number | null;
    chunkCount: number;
    contentChanged: boolean;
    reused: boolean;
    /** True when prior retrieval was invalidated due to blank/no-text. */
    retrievalCleared?: boolean;
  };
};

export type NotebookKnowledgeIngestFailure = {
  version: 1;
  ok: false;
  error: {
    code: NotebookKnowledgeErrorCode;
    message: string;
  };
};

export type NotebookKnowledgeIngestResponse =
  | NotebookKnowledgeIngestSuccess
  | NotebookKnowledgeIngestFailure;

export type NotebookKnowledgeLogLine = {
  event: 'ai_knowledge_notebook_ingest';
  requestId: string;
  outcome: 'ok' | 'error';
  code?: NotebookKnowledgeErrorCode | 'ok';
  hasUser: boolean;
  hasSection: boolean;
  hasNotebook: boolean;
  hasPage: boolean;
  chunkCount?: number;
  segmentCount?: number;
  latencyMs: number;
};
