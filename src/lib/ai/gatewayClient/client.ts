/**
 * Client invoke wrapper for the ZIKUK AI Gateway.
 * Sends a provider-independent request; never talks to OpenAI/Gemini/etc. directly.
 *
 * M0.9C2.2.6: faithfully serialize ask_course v1/v2 (never silently downgrade v2 → v1).
 */

import { isSupabaseConfigured, supabase } from '../../supabase';
import {
  AI_GATEWAY_FUNCTION_NAME,
  type AskCourseRecentTurn,
  type AskCourseSourceRef,
  type ZikukAiAskCourseRequest,
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
    if (typeof o.index !== 'number') return null;

    const kind =
      o.sourceKind === 'notebook_page' || o.sourceKind === 'free_space_pdf'
        ? o.sourceKind
        : // Legacy PDF responses before M0.8F
          o.sourceObjectId !== undefined
          ? 'free_space_pdf'
          : null;
    if (!kind) return null;

    if (kind === 'notebook_page') {
      if (typeof o.notebookObjectId !== 'string' || !o.notebookObjectId.trim()) return null;
      if (typeof o.pageId !== 'string' || !o.pageId.trim()) return null;
      if (o.notebookTitle !== null && typeof o.notebookTitle !== 'string') return null;
      if (o.pageTitle !== null && typeof o.pageTitle !== 'string') return null;
      out.push({
        index: o.index,
        sourceKind: 'notebook_page',
        notebookObjectId: o.notebookObjectId.trim(),
        pageId: o.pageId.trim(),
        notebookTitle: (o.notebookTitle as string | null) ?? null,
        pageTitle: (o.pageTitle as string | null) ?? null,
      });
      continue;
    }

    if (typeof o.sourceObjectId !== 'string') return null;
    if (typeof o.pageNumber !== 'number') return null;
    if (o.fileName !== null && typeof o.fileName !== 'string') return null;
    out.push({
      index: o.index,
      sourceKind: 'free_space_pdf',
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
 * Supabase functions-js sets `data: null` on non-2xx and places the Response
 * on `error.context`. Parse that body once through the shared contract.
 */
async function parseStructuredErrorFromInvoke(error: unknown): Promise<ZikukAiResponse | null> {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: unknown }).context;
  if (!ctx || typeof ctx !== 'object') return null;
  const json = (ctx as { json?: unknown }).json;
  if (typeof json !== 'function') return null;
  try {
    const body = await (json as () => Promise<unknown>).call(ctx);
    return parseResponseBody(body);
  } catch {
    return null;
  }
}

/** Serialize ask_course without downgrading v2 or stripping recentTurns. */
export function serializeAskCourseGatewayBody(
  request: ZikukAiAskCourseRequest,
): ZikukAiAskCourseRequest {
  if (request.version === 2) {
    const recentTurns = request.recentTurns;
    const hasTurns = Array.isArray(recentTurns) && recentTurns.length > 0;
    return {
      version: 2,
      capability: 'ask_course',
      sectionId: request.sectionId,
      question: request.question,
      ...(hasTurns ? { recentTurns: recentTurns as AskCourseRecentTurn[] } : {}),
    };
  }
  return {
    version: 1,
    capability: 'ask_course',
    sectionId: request.sectionId,
    question: request.question,
  };
}

function logAskCourseWireDiag(body: ZikukAiAskCourseRequest): void {
  if (!import.meta.env.DEV) return;
  const turns = body.version === 2 ? body.recentTurns ?? [] : [];
  let recentUserTurnCount = 0;
  let recentAssistantTurnCount = 0;
  for (const t of turns) {
    if (t.role === 'user') recentUserTurnCount += 1;
    else recentAssistantTurnCount += 1;
  }
  // eslint-disable-next-line no-console
  console.info('[ask_course_wire_diag]', {
    version: body.version,
    capability: body.capability,
    hasSectionId: Boolean(body.sectionId),
    hasRecentTurns: turns.length > 0,
    recentTurnsCount: turns.length,
    recentUserTurnCount,
    recentAssistantTurnCount,
    questionLength: body.question.length,
  });
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
      ? serializeAskCourseGatewayBody(request)
      : {
          version: 1,
          capability: 'explain_selection',
          context: request.context,
        };

  if (body.capability === 'ask_course') {
    logAskCourseWireDiag(body);
  }

  try {
    const { data, error } = await supabase.functions.invoke(AI_GATEWAY_FUNCTION_NAME, {
      body,
      signal: opts?.signal,
    });

    if (error) {
      // Prefer authoritative gateway JSON from FunctionsHttpError.context (Response).
      const fromContext = await parseStructuredErrorFromInvoke(error);
      if (fromContext) return fromContext;

      const fromData = parseResponseBody(data);
      if (fromData) return fromData;

      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 401) {
        return asError('unauthenticated', 'Sign in required to use ZIKUK AI.');
      }
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
