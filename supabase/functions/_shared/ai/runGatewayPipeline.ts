/**
 * Core Gateway pipeline (server-only). Injectable provider + enforcement for tests.
 *
 * Flow:
 *   preflight (authz + validate)
 *   → entitlement / safety / quota (fail-closed)
 *   → [retrieval seam: ask_course only]
 *   → sanitize → prompt → route → provider  (explain_selection)
 *   → usage accounting (fail-open after provider success)
 *
 * Edge entry runs preflight BEFORE the AI config gate so auth_mismatch /
 * validation errors are observable without provider secrets.
 */

import { estimateCostUsdMicros } from './aiPricing.ts';
import { SERVER_MAX_OUTPUT_TOKENS } from './bounds.ts';
import type { AiEnforcementStore, UsageOutcome } from './enforcement.ts';
import { buildExplainSelectionMessages } from './promptExplainSelection.ts';
import {
  preflightGatewayRequest,
} from './preflightGatewayRequest.ts';
import { formatProviderDiagnosticLog } from './providerOpenAICompatible.ts';
import type { AiProvider } from './providerTypes.ts';
import { routeModel, type RouterConfig } from './routeModel.ts';
import { sanitizeForProvider } from './sanitizeForProvider.ts';
import type { ZikukAiRequest, ZikukAiResponse } from './requestTypes.ts';
import {
  runAskCoursePipeline,
  type AskCourseDeps,
} from './askCourse/runAskCourse.ts';

export type GatewayPipelineInput = {
  /** Raw JSON body from the client. */
  body: unknown;
  /** Verified auth uid from JWT; null if missing/invalid. */
  authUserId: string | null;
  provider: AiProvider;
  routerConfig: RouterConfig;
  signal?: AbortSignal;
  /** Required for provider stage in production; tests may inject memory store. */
  enforcement?: AiEnforcementStore;
  /** Required for ask_course (section auth + embed + search). */
  askCourseDeps?: Omit<AskCourseDeps, 'generationProvider' | 'routerConfig' | 'enforcement' | 'signal'>;
};

export type GatewayPipelineAfterPreflightInput = {
  authUserId: string;
  request: ZikukAiRequest;
  provider: AiProvider;
  routerConfig: RouterConfig;
  signal?: AbortSignal;
  /** Fail-closed before provider when absent in production Edge. */
  enforcement: AiEnforcementStore;
  askCourseDeps?: Omit<AskCourseDeps, 'generationProvider' | 'routerConfig' | 'enforcement' | 'signal'>;
};

export type GatewayUsageLog = {
  authUserId: string;
  sectionId: string;
  capability: string;
  providerId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCostUsdMicros?: number | null;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
  selectionChars: number;
  surroundingsBlocks: number;
  plan?: string;
  usageEventPersisted?: boolean;
  retrievalHitCount?: number;
  embeddingInputTokens?: number;
};

function selectionCharCount(req: Extract<ZikukAiRequest, { capability: 'explain_selection' }>): number {
  const f = req.context.focus;
  if (f.kind === 'text') return f.text.length;
  if (f.kind === 'math_block' || f.kind === 'math_inline') return f.latex.length;
  if (f.kind === 'table') return (f.text ?? '').length;
  return 0;
}

function deniedResponse(
  code: 'ai_disabled' | 'rate_limited' | 'quota_exceeded' | 'internal_error',
  message: string,
): ZikukAiResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function mapProviderOutcome(code: string): UsageOutcome {
  if (code === 'provider_timeout') return 'provider_timeout';
  if (code === 'rate_limited') return 'rate_limited';
  if (code === 'bad_response') return 'bad_response';
  return 'provider_error';
}

export type GatewayPipelineResult = {
  response: ZikukAiResponse;
  usageLog: GatewayUsageLog | null;
};

/**
 * Provider stage only — call after successful preflight (+ optional AI config gate).
 * Enforcement is mandatory and fail-closed.
 */
export async function runGatewayPipelineAfterPreflight(
  input: GatewayPipelineAfterPreflightInput,
): Promise<GatewayPipelineResult> {
  const { request, authUserId, enforcement } = input;

  // --- M0.5D retrieval seam: ask_course (does its own beginRequest after section auth) ---
  if (request.capability === 'ask_course') {
    if (!input.askCourseDeps) {
      return {
        response: deniedResponse(
          'internal_error',
          'Course-aware AI is temporarily unavailable. Try again shortly.',
        ),
        usageLog: null,
      };
    }
    const ask = await runAskCoursePipeline({
      authUserId,
      request,
      deps: {
        ...input.askCourseDeps,
        generationProvider: input.provider,
        routerConfig: input.routerConfig,
        enforcement,
        signal: input.signal,
      },
    });
    const usageLog: GatewayUsageLog = {
      authUserId,
      sectionId: ask.meta.sectionId,
      capability: 'ask_course',
      providerId: ask.meta.providerId ?? 'openai_compatible',
      model: ask.meta.model ?? '',
      inputTokens: ask.meta.inputTokens,
      outputTokens: ask.meta.outputTokens,
      reasoningTokens: ask.meta.reasoningTokens,
      totalTokens: ask.meta.totalTokens,
      estimatedCostUsdMicros: ask.meta.estimatedCostUsdMicros,
      latencyMs: ask.meta.latencyMs,
      ok: ask.meta.ok,
      errorCode: ask.meta.errorCode,
      selectionChars: ask.meta.selectionChars,
      surroundingsBlocks: 0,
      plan: ask.meta.plan,
      usageEventPersisted: ask.meta.usageEventPersisted,
      retrievalHitCount: ask.meta.retrievalHitCount,
      embeddingInputTokens: ask.meta.embeddingInputTokens,
    };
    return { response: ask.response, usageLog };
  }

  // --- M0.4: entitlement + safety + product quota (BEFORE provider) ---
  let begin;
  try {
    begin = await enforcement.beginRequest(authUserId, request.capability);
  } catch {
    console.error(
      JSON.stringify({
        event: 'zikuk_ai_gateway',
        ok: false,
        errorCode: 'internal_error',
        reason: 'enforcement_unavailable',
      }),
    );
    return {
      response: deniedResponse(
        'internal_error',
        'AI usage controls are temporarily unavailable. Try again shortly.',
      ),
      usageLog: null,
    };
  }

  if (!begin.ok) {
    const message =
      begin.code === 'ai_disabled'
        ? 'AI is disabled for this account.'
        : begin.code === 'quota_exceeded'
          ? 'Daily AI limit reached. Try again tomorrow.'
          : begin.code === 'rate_limited'
            ? 'Too many requests. Try again shortly.'
            : 'Unable to start AI request.';
    return {
      response: deniedResponse(
        begin.code === 'invalid_request' ? 'internal_error' : begin.code,
        begin.code === 'invalid_request' ? 'Unable to start AI request.' : message,
      ),
      usageLog: null,
    };
  }

  // --- retrieval seam: explain_selection does NOT retrieve course PDFs ---

  let providerPayload;
  try {
    providerPayload = sanitizeForProvider(request.context);
  } catch {
    return {
      response: {
        version: 1,
        ok: false,
        error: {
          code: 'unsupported_content',
          message: 'This selection cannot be explained yet.',
        },
      },
      usageLog: null,
    };
  }

  const messages = buildExplainSelectionMessages(providerPayload);
  const route = routeModel({ capability: request.capability, modality: 'text' }, input.routerConfig);

  const providerResult = await input.provider.complete({
    model: route.model,
    messages,
    maxTokens: SERVER_MAX_OUTPUT_TOKENS,
    signal: input.signal,
  });

  const usageLog: GatewayUsageLog = {
    authUserId,
    sectionId: request.context.academic.sectionId,
    capability: request.capability,
    providerId: route.providerId,
    model: route.model,
    latencyMs: providerResult.latencyMs,
    ok: providerResult.ok,
    selectionChars: selectionCharCount(request),
    surroundingsBlocks: request.context.surroundings.blocks.length,
    plan: begin.plan,
  };

  const sectionId = request.context.academic.sectionId;

  if (!providerResult.ok) {
    usageLog.errorCode = providerResult.code;
    if (providerResult.diagnostics) {
      console.error(formatProviderDiagnosticLog(providerResult.diagnostics));
    }

    const record = await enforcement.recordUsage({
      userId: authUserId,
      capability: request.capability,
      providerId: route.providerId,
      model: route.model,
      outcome: mapProviderOutcome(providerResult.code),
      errorCode: providerResult.code,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      estimatedCostUsdMicros: null,
      latencyMs: providerResult.latencyMs,
      sectionId,
      providerRequestId: providerResult.providerRequestId ?? null,
    });
    usageLog.usageEventPersisted = record.ok;
    if (!record.ok) {
      console.error(
        JSON.stringify({
          event: 'zikuk_ai_gateway',
          ok: false,
          errorCode: 'internal_error',
          reason: 'usage_event_persist_failed',
          providerOk: false,
        }),
      );
    }

    const code =
      providerResult.code === 'rate_limited'
        ? 'rate_limited'
        : providerResult.code === 'provider_timeout'
          ? 'provider_timeout'
          : 'provider_unavailable';
    return {
      response: {
        version: 1,
        ok: false,
        error: {
          code,
          message:
            code === 'rate_limited'
              ? 'Too many requests. Try again shortly.'
              : code === 'provider_timeout'
                ? 'The AI service timed out. Try again.'
                : 'The AI service is temporarily unavailable.',
        },
      },
      usageLog,
    };
  }

  usageLog.inputTokens = providerResult.usage?.inputTokens;
  usageLog.outputTokens = providerResult.usage?.outputTokens;
  usageLog.reasoningTokens = providerResult.usage?.reasoningTokens;
  usageLog.totalTokens = providerResult.usage?.totalTokens;

  const estimatedCost = estimateCostUsdMicros(route.model, {
    inputTokens: providerResult.usage?.inputTokens,
    outputTokens: providerResult.usage?.outputTokens,
    reasoningTokens: providerResult.usage?.reasoningTokens,
    totalTokens: providerResult.usage?.totalTokens,
  });
  usageLog.estimatedCostUsdMicros = estimatedCost;

  const record = await enforcement.recordUsage({
    userId: authUserId,
    capability: request.capability,
    providerId: route.providerId,
    model: route.model,
    outcome: 'success',
    errorCode: null,
    inputTokens: providerResult.usage?.inputTokens ?? null,
    outputTokens: providerResult.usage?.outputTokens ?? null,
    reasoningTokens: providerResult.usage?.reasoningTokens ?? null,
    totalTokens: providerResult.usage?.totalTokens ?? null,
    estimatedCostUsdMicros: estimatedCost,
    latencyMs: providerResult.latencyMs,
    sectionId,
    providerRequestId: providerResult.providerRequestId ?? null,
  });
  usageLog.usageEventPersisted = record.ok;
  if (!record.ok) {
    console.error(
      JSON.stringify({
        event: 'zikuk_ai_gateway',
        ok: false,
        errorCode: 'internal_error',
        reason: 'usage_event_persist_failed',
        providerOk: true,
      }),
    );
  }

  return {
    response: {
      version: 1,
      ok: true,
      result: { type: 'text', text: providerResult.text },
      meta: { capability: 'explain_selection', latencyMs: providerResult.latencyMs },
    },
    usageLog,
  };
}

/**
 * Full pipeline: preflight then provider stage.
 * Does not mutate Notebook / Free Space / DB content.
 */
export async function runGatewayPipeline(
  input: GatewayPipelineInput,
): Promise<GatewayPipelineResult> {
  const preflight = preflightGatewayRequest({
    body: input.body,
    authUserId: input.authUserId,
  });
  if (!preflight.ok) {
    return { response: preflight.response, usageLog: null };
  }

  if (!input.enforcement) {
    return {
      response: deniedResponse(
        'internal_error',
        'AI usage controls are temporarily unavailable. Try again shortly.',
      ),
      usageLog: null,
    };
  }

  return runGatewayPipelineAfterPreflight({
    authUserId: preflight.authUserId,
    request: preflight.request,
    provider: input.provider,
    routerConfig: input.routerConfig,
    signal: input.signal,
    enforcement: input.enforcement,
    askCourseDeps: input.askCourseDeps,
  });
}

/** Privacy-safe structured log (lengths/metadata only — never selection/question/chunk text). */
export function formatUsageLogLine(log: GatewayUsageLog): string {
  return JSON.stringify({
    event: 'zikuk_ai_gateway',
    authUserId: log.authUserId,
    sectionId: log.sectionId,
    capability: log.capability,
    providerId: log.providerId,
    model: log.model,
    inputTokens: log.inputTokens ?? null,
    outputTokens: log.outputTokens ?? null,
    reasoningTokens: log.reasoningTokens ?? null,
    totalTokens: log.totalTokens ?? null,
    estimatedCostUsdMicros: log.estimatedCostUsdMicros ?? null,
    latencyMs: log.latencyMs,
    ok: log.ok,
    errorCode: log.errorCode ?? null,
    selectionChars: log.selectionChars,
    surroundingsBlocks: log.surroundingsBlocks,
    plan: log.plan ?? null,
    usageEventPersisted: log.usageEventPersisted ?? null,
    retrievalHitCount: log.retrievalHitCount ?? null,
    embeddingInputTokens: log.embeddingInputTokens ?? null,
  });
}
