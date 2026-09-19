/**
 * Client invoke seam for M0.5B knowledge ingest.
 * NOT wired to PDF upload automatically — call explicitly when ready.
 */

export const AI_KNOWLEDGE_INGEST_FUNCTION_NAME = 'ai-knowledge-ingest' as const;

export type KnowledgeIngestClientRequest = {
  version: 1;
  sectionId: string;
  sourceObjectId: string;
};

export type KnowledgeIngestClientErrorCode =
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

export type KnowledgeIngestClientResponse =
  | {
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
    }
  | {
      version: 1;
      ok: false;
      error: { code: KnowledgeIngestClientErrorCode; message: string };
    };
