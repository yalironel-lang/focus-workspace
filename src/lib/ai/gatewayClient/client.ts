/**
 * Client invoke wrapper for the ZIKUK AI Gateway.
 * Sends a provider-independent request; never talks to OpenAI/Gemini/etc. directly.
 */

import { isSupabaseConfigured, supabase } from '../../supabase';
import {
  AI_GATEWAY_FUNCTION_NAME,
  type AskCourseSourceRef,
  type ZikukAiErrorCode,
  type ZikukAiRequest,
  type ZikukAiResponse,
} from './types';

function asError(code: ZikukAiErrorCode, message: string): ZikukAiResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function parseSources(raw: unknown): AskCourseSourceRef[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AskCourseSourceRef[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') return null;
    const o = s as Record<string, unknown>;
    if (typeof o.index !== 'number' || typeof o.sourceObjectId !== 'string') return null;
    if (typeof o.pageNumber !== 'number') return null;
    if (o.fileName !== null && typeof o.fileName !== 'string') return null;
    out.push({
      index: o.index,
      sourceObjectId: o.sourceObjectId,
      fileName: (o.fileName as string | null) ?? null,
      pageNumber: o.pageNumber,
    });
  }
  return out;
}

function parseResponseBody(data: unknown): ZikukAiResponse | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.version !== 1 || typeof o.ok !== 'boolean') return null;
  if (o.ok === true) {
    const result = o.result as Record<string, unknown> | undefined;
    if (result?.type === 'text' && typeof result.text === 'string') {
      const meta = o.meta as { capability?: string; latencyMs?: number } | undefined;
      return {
        version: 1,
        ok: true,
        result: { type: 'text', text: result.text },
        ...(meta && meta.capability === 'explain_selection'
          ? {
              meta: {
                capability: 'explain_selection' as const,
                ...(typeof meta.latencyMs === 'number' ? { latencyMs: meta.latencyMs } : {}),
              },
            }
          : {}),
      };
    }
    if (result?.type === 'ask_course' && typeof result.text === 'string') {
      const sources = parseSources(result.sources);
      if (!sources) return null;
      const meta = o.meta as {
        capability?: string;
        latencyMs?: number;
        retrievalHitCount?: number;
      } | undefined;
      return {
        version: 1,
        ok: true,
        result: { type: 'ask_course', text: result.text, sources },
        ...(meta && meta.capability === 'ask_course'
          ? {
              meta: {
                capability: 'ask_course' as const,
                ...(typeof meta.latencyMs === 'number' ? { latencyMs: meta.latencyMs } : {}),
                ...(typeof meta.retrievalHitCount === 'number'
                  ? { retrievalHitCount: meta.retrievalHitCount }
                  : {}),
              },
            }
          : {}),
      };
    }
    return null;
  }
  const err = o.error as { code?: string; message?: string } | undefined;
  if (err && typeof err.code === 'string' && typeof err.message === 'string') {
    return {
      version: 1,
      ok: false,
      error: { code: err.code as ZikukAiErrorCode, message: err.message },
    };
  }
  return null;
}

/**
 * Invoke the secure ZIKUK AI Gateway with the current Supabase session JWT.
 * Does not accept provider/model/apiKey — those are server-only.
 */
export async function zikukAiRequest(
  request: ZikukAiRequest,
  opts?: { signal?: AbortSignal },
): Promise<ZikukAiResponse> {
  if (!isSupabaseConfigured) {
    return asError('internal_error', 'ZIKUK is not connected to the cloud.');
  }

  const body: ZikukAiRequest =
    request.capability === 'ask_course'
      ? {
          version: 1,
          capability: 'ask_course',
          sectionId: request.sectionId,
          question: request.question,
        }
      : {
          version: 1,
          capability: 'explain_selection',
          context: request.context,
        };

  try {
    const { data, error } = await supabase.functions.invoke(AI_GATEWAY_FUNCTION_NAME, {
      body,
      signal: opts?.signal,
    });

    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 401) {
        return asError('unauthenticated', 'Sign in required to use ZIKUK AI.');
      }
      const parsed = parseResponseBody(data);
      if (parsed) return parsed;
      return asError('provider_unavailable', 'AI Gateway is temporarily unavailable.');
    }

    const parsed = parseResponseBody(data);
    if (parsed) return parsed;
    return asError('internal_error', 'Unexpected response from AI Gateway.');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return asError('provider_timeout', 'Request cancelled.');
    }
    return asError('provider_unavailable', 'Could not reach AI Gateway.');
  }
}
