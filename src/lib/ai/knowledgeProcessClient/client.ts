/**
 * Thin client wrapper for ai-knowledge-process (M0.7B.2).
 * Preserves structured non-2xx errors via FunctionsHttpError.context.json().
 * Does not upload bytes. Does not mutate Free Space / knowledge markers.
 */

import { isSupabaseConfigured, supabase } from '../../supabase';
import {
  AI_KNOWLEDGE_PROCESS_FUNCTION_NAME,
  type KnowledgeProcessClientErrorCode,
  type KnowledgeProcessClientRequest,
  type KnowledgeProcessClientResponse,
} from './types';

function asError(
  code: KnowledgeProcessClientErrorCode,
  message: string,
): KnowledgeProcessClientResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function parseBody(data: unknown): KnowledgeProcessClientResponse | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.version !== 1 || typeof o.ok !== 'boolean') return null;

  if (o.ok === true) {
    const result = o.result as Record<string, unknown> | undefined;
    if (!result || result.type !== 'knowledge_process') return null;
    const ingest = result.ingest as Record<string, unknown> | undefined;
    const index = result.index as Record<string, unknown> | undefined;
    if (!ingest || !index) return null;
    if (ingest.outcome !== 'ready' && ingest.outcome !== 'reused') return null;
    if (index.outcome !== 'indexed' && index.outcome !== 'reused') return null;
    if (typeof ingest.sourceVersion !== 'number') return null;
    if (typeof ingest.pageCount !== 'number') return null;
    if (typeof ingest.chunkCount !== 'number') return null;
    if (typeof index.retrievalSourceVersion !== 'number') return null;
    return {
      version: 1,
      ok: true,
      result: {
        type: 'knowledge_process',
        ingest: {
          outcome: ingest.outcome,
          sourceVersion: ingest.sourceVersion,
          pageCount: ingest.pageCount,
          chunkCount: ingest.chunkCount,
        },
        index: {
          outcome: index.outcome,
          retrievalSourceVersion: index.retrievalSourceVersion,
        },
      },
    };
  }

  const err = o.error as { code?: string; message?: string } | undefined;
  if (err && typeof err.code === 'string' && typeof err.message === 'string') {
    return {
      version: 1,
      ok: false,
      error: {
        code: err.code as KnowledgeProcessClientErrorCode,
        message: err.message,
      },
    };
  }
  return null;
}

/**
 * Supabase functions-js sets `data: null` on non-2xx and places the Response
 * on `error.context`. Parse that body once through the shared contract.
 */
async function parseStructuredErrorFromInvoke(
  error: unknown,
): Promise<KnowledgeProcessClientResponse | null> {
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

/**
 * Request server-side knowledge process (ingest → index) for a Free Space PDF.
 * Client body is only { version, sectionId, sourceObjectId }.
 */
export async function requestKnowledgeProcess(
  request: KnowledgeProcessClientRequest,
  opts?: { signal?: AbortSignal },
): Promise<KnowledgeProcessClientResponse> {
  if (!isSupabaseConfigured) {
    return asError('internal_error', 'ZIKUK is not connected to the cloud.');
  }

  const body: KnowledgeProcessClientRequest = {
    version: 1,
    sectionId: request.sectionId,
    sourceObjectId: request.sourceObjectId,
  };

  try {
    const { data, error } = await supabase.functions.invoke(
      AI_KNOWLEDGE_PROCESS_FUNCTION_NAME,
      {
        body,
        signal: opts?.signal,
      },
    );

    if (error) {
      const fromContext = await parseStructuredErrorFromInvoke(error);
      if (fromContext) return fromContext;

      const fromData = parseBody(data);
      if (fromData) return fromData;

      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 401) {
        return asError('unauthenticated', 'Sign in required.');
      }
      if (status === 403) {
        return asError('auth_mismatch', 'Not allowed.');
      }
      return asError('network_error', 'Knowledge process request failed.');
    }

    const parsed = parseBody(data);
    if (!parsed) return asError('internal_error', 'Unexpected knowledge process response.');
    return parsed;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return asError('aborted', 'Request aborted.');
    }
    return asError('network_error', 'Knowledge process request failed.');
  }
}
