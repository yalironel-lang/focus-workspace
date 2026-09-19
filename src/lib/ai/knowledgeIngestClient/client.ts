/**
 * Thin client wrapper for ai-knowledge-ingest.
 * Fire-and-forget safe: callers must not block PDF upload on failure.
 */

import { isSupabaseConfigured, supabase } from '../../supabase';
import {
  AI_KNOWLEDGE_INGEST_FUNCTION_NAME,
  type KnowledgeIngestClientErrorCode,
  type KnowledgeIngestClientRequest,
  type KnowledgeIngestClientResponse,
} from './types';

function asError(
  code: KnowledgeIngestClientErrorCode,
  message: string,
): KnowledgeIngestClientResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function parseBody(data: unknown): KnowledgeIngestClientResponse | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.version !== 1 || typeof o.ok !== 'boolean') return null;
  if (o.ok === true) {
    const result = o.result as Record<string, unknown> | undefined;
    if (!result) return null;
    if (result.status !== 'ready' && result.status !== 'reused') return null;
    if (typeof result.sourceId !== 'string') return null;
    if (typeof result.sourceVersion !== 'number') return null;
    return {
      version: 1,
      ok: true,
      result: {
        status: result.status,
        sourceId: result.sourceId,
        sourceVersion: result.sourceVersion,
        pageCount: typeof result.pageCount === 'number' ? result.pageCount : 0,
        chunkCount: typeof result.chunkCount === 'number' ? result.chunkCount : 0,
        contentChanged: Boolean(result.contentChanged),
        reused: Boolean(result.reused),
      },
    };
  }
  const err = o.error as { code?: string; message?: string } | undefined;
  if (err && typeof err.code === 'string' && typeof err.message === 'string') {
    return {
      version: 1,
      ok: false,
      error: { code: err.code as KnowledgeIngestClientErrorCode, message: err.message },
    };
  }
  return null;
}

/**
 * Request server-side knowledge ingest for a Free Space PDF.
 * Does not upload bytes. Does not mutate local Free Space state.
 */
export async function requestKnowledgeIngest(
  request: KnowledgeIngestClientRequest,
  opts?: { signal?: AbortSignal },
): Promise<KnowledgeIngestClientResponse> {
  if (!isSupabaseConfigured) {
    return asError('internal_error', 'ZIKUK is not connected to the cloud.');
  }

  const body: KnowledgeIngestClientRequest = {
    version: 1,
    sectionId: request.sectionId,
    sourceObjectId: request.sourceObjectId,
  };

  try {
    const { data, error } = await supabase.functions.invoke(AI_KNOWLEDGE_INGEST_FUNCTION_NAME, {
      body,
      signal: opts?.signal,
    });

    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 401) return asError('unauthenticated', 'Sign in required.');
      if (status === 403) return asError('auth_mismatch', 'Not allowed.');
      return asError('internal_error', 'Knowledge ingest request failed.');
    }

    const parsed = parseBody(data);
    if (!parsed) return asError('internal_error', 'Unexpected ingest response.');
    return parsed;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return asError('internal_error', 'Request aborted.');
    }
    return asError('internal_error', 'Knowledge ingest request failed.');
  }
}
