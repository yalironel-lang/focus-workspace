/**
 * Client invoke wrapper for the ZIKUK AI Gateway.
 * Sends a provider-independent request; never talks to OpenAI/Gemini/etc. directly.
 */

import { isSupabaseConfigured, supabase } from '../../supabase';
import {
  AI_GATEWAY_FUNCTION_NAME,
  type ZikukAiErrorCode,
  type ZikukAiRequest,
  type ZikukAiResponse,
} from './types';

function asError(code: ZikukAiErrorCode, message: string): ZikukAiResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function parseResponseBody(data: unknown): ZikukAiResponse | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.version !== 1 || typeof o.ok !== 'boolean') return null;
  if (o.ok === true) {
    const result = o.result as { type?: string; text?: string } | undefined;
    if (result?.type === 'text' && typeof result.text === 'string') {
      const meta = o.meta as { capability?: string; latencyMs?: number } | undefined;
      return {
        version: 1,
        ok: true,
        result: { type: 'text', text: result.text },
        ...(meta && typeof meta.capability === 'string'
          ? {
              meta: {
                capability: meta.capability as import('./types').ZikukAiCapability,
                ...(typeof meta.latencyMs === 'number' ? { latencyMs: meta.latencyMs } : {}),
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

  // Strip any accidental provider-control fields if a caller spreads extras.
  const body: ZikukAiRequest = {
    version: 1,
    capability: request.capability,
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
      // Function may still return a JSON error body in `data`
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
