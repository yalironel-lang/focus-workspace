/**
 * Client invoke for ai-knowledge-notebook-process (M0.8E).
 * Body: { version, sectionId, notebookObjectId, pageId } only.
 */

import { isSupabaseConfigured, supabase } from '../../supabase';

export const AI_KNOWLEDGE_NOTEBOOK_PROCESS_FUNCTION_NAME =
  'ai-knowledge-notebook-process' as const;

export type NotebookKnowledgeProcessClientRequest = {
  version: 1;
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
};

export type NotebookKnowledgeProcessClientErrorCode =
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
  | 'not_ready'
  | 'stale_job'
  | 'incomplete_embeddings'
  | 'embedding_rate_limited'
  | 'embedding_timeout'
  | 'embedding_provider_unavailable'
  | 'embedding_invalid_response'
  | 'embedding_quota_exceeded'
  | 'embedding_internal_error'
  | 'internal_error'
  | 'aborted'
  | 'network_error';

export type NotebookKnowledgeProcessClientResponse =
  | {
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
        };
      };
    }
  | {
      version: 1;
      ok: false;
      error: {
        code: NotebookKnowledgeProcessClientErrorCode;
        message: string;
        class?: 'permanent' | 'retryable' | 'stale';
      };
    };

function asError(
  code: NotebookKnowledgeProcessClientErrorCode,
  message: string,
): NotebookKnowledgeProcessClientResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function parseBody(data: unknown): NotebookKnowledgeProcessClientResponse | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.version !== 1 || typeof o.ok !== 'boolean') return null;
  if (o.ok === true) {
    const result = o.result as Record<string, unknown> | undefined;
    if (!result || result.type !== 'notebook_knowledge_process') return null;
    const ingest = result.ingest as Record<string, unknown> | undefined;
    const index = result.index as Record<string, unknown> | undefined;
    if (!ingest || !index) return null;
    return {
      version: 1,
      ok: true,
      result: {
        type: 'notebook_knowledge_process',
        ingest: {
          outcome: ingest.outcome as 'ready' | 'reused' | 'cleared',
          sourceVersion:
            typeof ingest.sourceVersion === 'number' ? ingest.sourceVersion : null,
          chunkCount: typeof ingest.chunkCount === 'number' ? ingest.chunkCount : 0,
          ...(typeof ingest.retrievalCleared === 'boolean'
            ? { retrievalCleared: ingest.retrievalCleared }
            : {}),
        },
        index: {
          outcome: index.outcome as 'indexed' | 'reused' | 'skipped',
          retrievalSourceVersion:
            typeof index.retrievalSourceVersion === 'number'
              ? index.retrievalSourceVersion
              : null,
        },
      },
    };
  }
  const err = o.error as { code?: string; message?: string; class?: string } | undefined;
  if (err && typeof err.code === 'string' && typeof err.message === 'string') {
    return {
      version: 1,
      ok: false,
      error: {
        code: err.code as NotebookKnowledgeProcessClientErrorCode,
        message: err.message,
        ...(err.class === 'permanent' || err.class === 'retryable' || err.class === 'stale'
          ? { class: err.class }
          : {}),
      },
    };
  }
  return null;
}

async function parseStructuredErrorFromInvoke(
  error: unknown,
): Promise<NotebookKnowledgeProcessClientResponse | null> {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: unknown }).context;
  if (!ctx || typeof ctx !== 'object') return null;
  const json = (ctx as { json?: unknown }).json;
  if (typeof json !== 'function') return null;
  try {
    const body = await (json as () => Promise<unknown>).call(ctx);
    return parseBody(body);
  } catch {
    return null;
  }
}

export async function requestNotebookKnowledgeProcess(
  request: NotebookKnowledgeProcessClientRequest,
  opts?: { signal?: AbortSignal },
): Promise<NotebookKnowledgeProcessClientResponse> {
  if (!isSupabaseConfigured) {
    return asError('internal_error', 'ZIKUK is not connected to the cloud.');
  }

  const body: NotebookKnowledgeProcessClientRequest = {
    version: 1,
    sectionId: request.sectionId,
    notebookObjectId: request.notebookObjectId,
    pageId: request.pageId,
  };

  try {
    const { data, error } = await supabase.functions.invoke(
      AI_KNOWLEDGE_NOTEBOOK_PROCESS_FUNCTION_NAME,
      {
        body,
        signal: opts?.signal,
      },
    );

    if (error) {
      const fromContext = await parseStructuredErrorFromInvoke(error);
      if (fromContext) return fromContext;
      const msg = error instanceof Error ? error.message : String(error);
      if (/abort/i.test(msg)) return asError('aborted', 'Request aborted.');
      return asError('network_error', 'Could not reach Notebook knowledge process.');
    }

    const parsed = parseBody(data);
    if (parsed) return parsed;
    return asError('internal_error', 'Unexpected Notebook knowledge process response.');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) return asError('aborted', 'Request aborted.');
    return asError('network_error', 'Could not reach Notebook knowledge process.');
  }
}

/** Server-side remove of notebook_page knowledge (page soft-delete). */
export async function requestNotebookKnowledgePageRemove(input: {
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
  signal?: AbortSignal;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!isSupabaseConfigured) return { ok: false, code: 'internal_error' };
  try {
    const { data, error } = await supabase.functions.invoke(
      AI_KNOWLEDGE_NOTEBOOK_PROCESS_FUNCTION_NAME,
      {
        body: {
          version: 1,
          action: 'remove_page_source',
          sectionId: input.sectionId,
          notebookObjectId: input.notebookObjectId,
          pageId: input.pageId,
        },
        signal: input.signal,
      },
    );
    if (error) {
      const fromContext = await parseStructuredErrorFromInvoke(error);
      if (fromContext && !fromContext.ok) return { ok: false, code: fromContext.error.code };
      return { ok: false, code: 'network_error' };
    }
    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === true) {
      return { ok: true };
    }
    return { ok: false, code: 'internal_error' };
  } catch {
    return { ok: false, code: 'network_error' };
  }
}
