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
  type ContextAvailable,
  type DocumentWindowCoverage,
  type KnowledgeTier,
  type ZikukAiAskCourseRequest,
  type ZikukAiErrorCode,
  type ZikukAiRequest,
  type ZikukAiResponse,
} from './types';
import { MAX_ASK_COURSE_VISUAL_BODY_BYTES } from '../visualCapture/visualSelectionContract';
import { parsePilotReceipt } from '../../../../supabase/functions/_shared/ai/tutorPilotEvidence';
import { beginTutorPilot, verifyTutorPilot } from '../tutor/tutorPilotEvidence';

function asError(code: ZikukAiErrorCode, message: string): ZikukAiResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function parseDocumentWindow(raw: unknown): DocumentWindowCoverage | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.sourceObjectId !== 'string' || !value.sourceObjectId.trim()) return undefined;
  const pages = [value.fromPage, value.toPage, value.resumeFromPage];
  if (pages.some((page) => typeof page !== 'number' || !Number.isInteger(page) || page < 1)) return undefined;
  return {
    sourceObjectId: value.sourceObjectId,
    fileName: typeof value.fileName === 'string' ? value.fileName : null,
    pageCount: typeof value.pageCount === 'number' ? value.pageCount : null,
    fromPage: value.fromPage as number,
    toPage: value.toPage as number,
    resumeFromPage: value.resumeFromPage as number,
    partial: value.partial === true,
  };
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

function parseKnowledgeTier(value: unknown): KnowledgeTier | undefined {
  return value === 'course_material' ||
    value === 'pdf_selection' ||
    value === 'pdf_page_native' ||
    value === 'pdf_page_recovered' ||
    value === 'pdf_selection_visual' ||
    value === 'general_academic' ||
    value === 'mixed'
    ? value
    : undefined;
}

function generationIncomplete(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

function parseContextAvailable(value: unknown): ContextAvailable | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.hasIndexedChunks !== 'boolean' || typeof o.hasPdfCapture !== 'boolean') return undefined;
  return { hasIndexedChunks: o.hasIndexedChunks, hasPdfCapture: o.hasPdfCapture };
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
        result: {
          type: 'text',
          text: result.text,
          ...(generationIncomplete(result.generationIncomplete) ? { generationIncomplete: true } : {}),
        },
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
      const knowledgeTier = parseKnowledgeTier(result.knowledgeTier);
      const contextAvailable = parseContextAvailable(result.contextAvailable);
      const incomplete = generationIncomplete(result.generationIncomplete);
      const documentWindow = parseDocumentWindow(result.documentWindow);
      const meta = o.meta as {
        capability?: string;
        latencyMs?: number;
        retrievalHitCount?: number;
        knowledgeTier?: unknown;
        contextAvailable?: unknown;
        pilotEvidence?: unknown;
      } | undefined;
      const metaTier = parseKnowledgeTier(meta?.knowledgeTier);
      const metaContext = parseContextAvailable(meta?.contextAvailable);
      const pilotReceipt = parsePilotReceipt(meta?.pilotEvidence);
      return {
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text: result.text,
          sources,
          ...(knowledgeTier ? { knowledgeTier } : {}),
          ...(contextAvailable ? { contextAvailable } : {}),
          ...(incomplete ? { generationIncomplete: true } : {}),
          ...(documentWindow ? { documentWindow } : {}),
        },
        ...(meta && meta.capability === 'ask_course'
          ? {
              meta: {
                capability: 'ask_course' as const,
                ...(typeof meta.latencyMs === 'number' ? { latencyMs: meta.latencyMs } : {}),
                ...(typeof meta.retrievalHitCount === 'number'
                  ? { retrievalHitCount: meta.retrievalHitCount }
                  : {}),
                ...(metaTier ? { knowledgeTier: metaTier } : {}),
                ...(metaContext ? { contextAvailable: metaContext } : {}),
                ...(pilotReceipt ? { pilotEvidence: pilotReceipt } : {}),
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

/** Serialize ask_course without downgrading v3/v2 or stripping recentTurns/capture. */
export function serializeAskCourseGatewayBody(
  request: ZikukAiAskCourseRequest,
): ZikukAiAskCourseRequest {
  if (request.version === 3) {
    const recentTurns = request.recentTurns;
    const hasTurns = Array.isArray(recentTurns) && recentTurns.length > 0;
    return {
      version: 3,
      capability: 'ask_course',
      sectionId: request.sectionId,
      question: request.question,
      capture: request.capture,
      ...(request.teachingMode ? { teachingMode: request.teachingMode } : {}),
      ...(hasTurns ? { recentTurns: recentTurns as AskCourseRecentTurn[] } : {}),
      ...(request.activeDocument ? { activeDocument: request.activeDocument } : {}),
      ...(request.documentCursor ? { documentCursor: request.documentCursor } : {}),
    };
  }
  if (request.version === 2) {
    const recentTurns = request.recentTurns;
    const hasTurns = Array.isArray(recentTurns) && recentTurns.length > 0;
    return {
      version: 2,
      capability: 'ask_course',
      sectionId: request.sectionId,
      question: request.question,
      ...(request.teachingMode ? { teachingMode: request.teachingMode } : {}),
      ...(hasTurns ? { recentTurns: recentTurns as AskCourseRecentTurn[] } : {}),
      ...(request.activeDocument ? { activeDocument: request.activeDocument } : {}),
      ...(request.documentCursor ? { documentCursor: request.documentCursor } : {}),
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
  const turns = body.version !== 1 ? body.recentTurns ?? [] : [];
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
    hasCapture: body.version === 3 ? Boolean(body.capture) : false,
    hasActiveDocument: body.version !== 1 && Boolean(body.activeDocument),
    hasRecentTurns: turns.length > 0,
    recentTurnsCount: turns.length,
    recentUserTurnCount,
    recentAssistantTurnCount,
    questionLength: body.question.length,
  });
}

export type GatewayCallSurface = 'tutor' | 'ask' | 'explain';

type ContentTypeClass = 'json' | 'html' | 'empty' | 'other';

function contentTypeClass(header: string | null | undefined): ContentTypeClass {
  if (!header || !header.trim()) return 'empty';
  const value = header.toLowerCase();
  if (value.includes('json')) return 'json';
  if (value.includes('text/html')) return 'html';
  return 'other';
}

/** Provider or platform correlation id only. Rejects tokens and free text. */
function safeCorrelationId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(trimmed)) return undefined;
  if (trimmed.startsWith('eyJ')) return undefined;
  return trimmed;
}

function logTransportFailure(input: {
  surface?: GatewayCallSurface;
  errorName: string;
  httpStatus: number | null;
  contentTypeClass: ContentTypeClass;
  requestId?: string;
}): void {
  const line: Record<string, unknown> = {
    event: 'zikuk_ai_gateway_transport',
    surface: input.surface ?? 'unknown',
    errorName: input.errorName.slice(0, 80),
    httpStatus: input.httpStatus,
    contentTypeClass: input.contentTypeClass,
    parseFailed: true,
  };
  if (input.requestId) line.requestId = input.requestId;
  console.error(JSON.stringify(line));
}

function transportFacts(error: unknown): {
  errorName: string;
  httpStatus: number | null;
  contentTypeClass: ContentTypeClass;
  requestId?: string;
} {
  const errorName =
    error && typeof error === 'object' && typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : 'unknown';
  const ctx =
    error && typeof error === 'object'
      ? (error as { context?: unknown }).context
      : undefined;
  let httpStatus: number | null = null;
  let header: string | null = null;
  let requestId: string | undefined;
  if (ctx && typeof ctx === 'object') {
    const status = (ctx as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) httpStatus = status;
    const headers = (ctx as { headers?: { get?: (name: string) => string | null } }).headers;
    if (headers && typeof headers.get === 'function') {
      header = headers.get('content-type');
      requestId = safeCorrelationId(headers.get('x-request-id'));
    }
  }
  return { errorName, httpStatus, contentTypeClass: contentTypeClass(header), requestId };
}

/**
 * Invoke the secure ZIKUK AI Gateway with the current Supabase session JWT.
 * Does not accept provider/model/apiKey — those are server-only.
 */
export async function zikukAiRequest(
  request: ZikukAiRequest,
  opts?: { signal?: AbortSignal; surface?: GatewayCallSurface },
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
    if (body.version === 3 && body.capture && 'attachmentType' in body.capture && body.capture.attachmentType === 'visual_selection') {
      const rawText = JSON.stringify(body);
      const wireBytes = new TextEncoder().encode(rawText).byteLength;
      if (wireBytes > MAX_ASK_COURSE_VISUAL_BODY_BYTES) {
        logTransportFailure({
          surface: opts?.surface,
          errorName: 'visual_request_body_too_large',
          httpStatus: 413,
          contentTypeClass: 'empty',
        });
        return asError('invalid_request', 'The visual request exceeds the 512 KiB request limit.');
      }
    }
  }

  try {
    const pilot = body.capability === 'ask_course' && typeof window !== 'undefined' ? beginTutorPilot({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '', origin: window.location.origin,
      search: window.location.search, surface: opts?.surface,
    }) : undefined;
    const { data, error } = await supabase.functions.invoke(AI_GATEWAY_FUNCTION_NAME, {
      body,
      signal: opts?.signal,
      ...(pilot ? { headers: pilot.headers } : {}),
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
      logTransportFailure({ ...transportFacts(error), surface: opts?.surface });
      return asError('provider_unavailable', 'AI Gateway is temporarily unavailable.');
    }

    const parsed = parseResponseBody(data);
    if (pilot && body.capability === 'ask_course' && parsed?.ok && parsed.result.type === 'ask_course' && parsed.meta?.capability === 'ask_course') {
      try { parsed.meta.pilotRenderEvidence = await verifyTutorPilot(pilot.key, body, parsed); } catch { /* Evidence failure must not retry inference. */ }
    }
    if (parsed) return parsed;
    logTransportFailure({
      surface: opts?.surface,
      errorName: 'unexpected_response',
      httpStatus: null,
      contentTypeClass: 'empty',
    });
    return asError('internal_error', 'Unexpected response from AI Gateway.');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return asError('provider_timeout', 'Request cancelled.');
    }
    logTransportFailure({
      surface: opts?.surface,
      errorName: e instanceof Error ? e.name : 'unknown',
      httpStatus: null,
      contentTypeClass: 'empty',
    });
    return asError('provider_unavailable', 'Could not reach AI Gateway.');
  }
}
