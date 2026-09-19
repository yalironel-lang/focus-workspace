/**
 * Core Gateway pipeline (server-only). Injectable provider for tests.
 *
 * Flow: validate → authz → sanitize → prompt → route → provider
 * Future RAG inserts after authz, before sanitize.
 */

import { authorizeGatewayUser } from './authorize.ts';
import { SERVER_MAX_OUTPUT_TOKENS } from './bounds.ts';
import { buildExplainSelectionMessages } from './promptExplainSelection.ts';
import type { AiProvider } from './providerTypes.ts';
import { routeModel, type RouterConfig } from './routeModel.ts';
import { sanitizeForProvider } from './sanitizeForProvider.ts';
import type { ZikukAiRequest, ZikukAiResponse } from './requestTypes.ts';
import { validateZikukAiRequest } from './validateRequest.ts';

export type GatewayPipelineInput = {
  /** Raw JSON body from the client. */
  body: unknown;
  /** Verified auth uid from JWT; null if missing/invalid. */
  authUserId: string | null;
  provider: AiProvider;
  routerConfig: RouterConfig;
  signal?: AbortSignal;
};

export type GatewayUsageLog = {
  authUserId: string;
  sectionId: string;
  capability: string;
  providerId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
  selectionChars: number;
  surroundingsBlocks: number;
};

function selectionCharCount(req: ZikukAiRequest): number {
  const f = req.context.focus;
  if (f.kind === 'text') return f.text.length;
  if (f.kind === 'math_block' || f.kind === 'math_inline') return f.latex.length;
  if (f.kind === 'table') return (f.text ?? '').length;
  return 0;
}

export type GatewayPipelineResult = {
  response: ZikukAiResponse;
  usageLog: GatewayUsageLog | null;
};

/**
 * Run the full Gateway pipeline. Does not mutate Notebook / Free Space / DB content.
 */
export async function runGatewayPipeline(
  input: GatewayPipelineInput,
): Promise<GatewayPipelineResult> {
  const authz = authorizeGatewayUser(
    input.authUserId,
    // Peek context userId only after light shape check; full validate next.
    typeof (input.body as { context?: { identity?: { userId?: string } } })?.context?.identity
      ?.userId === 'string'
      ? (input.body as { context: { identity: { userId: string } } }).context.identity.userId
      : undefined,
  );

  if (!authz.ok) {
    return {
      response: {
        version: 1,
        ok: false,
        error: { code: authz.code, message: authz.message },
      },
      usageLog: null,
    };
  }

  const validated = validateZikukAiRequest(input.body);
  if (!validated.ok) {
    return {
      response: {
        version: 1,
        ok: false,
        error: { code: validated.code, message: validated.message },
      },
      usageLog: null,
    };
  }

  const { request } = validated;
  // Re-check authz against validated context (authoritative).
  const authz2 = authorizeGatewayUser(authz.authUserId, request.context.identity.userId);
  if (!authz2.ok) {
    return {
      response: {
        version: 1,
        ok: false,
        error: { code: authz2.code, message: authz2.message },
      },
      usageLog: null,
    };
  }

  // --- future retrieval seam (RAG) goes here ---

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
    authUserId: authz2.authUserId,
    sectionId: request.context.academic.sectionId,
    capability: request.capability,
    providerId: route.providerId,
    model: route.model,
    latencyMs: providerResult.latencyMs,
    ok: providerResult.ok,
    selectionChars: selectionCharCount(request),
    surroundingsBlocks: request.context.surroundings.blocks.length,
  };

  if (!providerResult.ok) {
    usageLog.errorCode = providerResult.code;
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

  return {
    response: {
      version: 1,
      ok: true,
      result: { type: 'text', text: providerResult.text },
      meta: { capability: request.capability, latencyMs: providerResult.latencyMs },
    },
    usageLog,
  };
}

/** Privacy-safe structured log (lengths/metadata only — never selection text). */
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
    latencyMs: log.latencyMs,
    ok: log.ok,
    errorCode: log.errorCode ?? null,
    selectionChars: log.selectionChars,
    surroundingsBlocks: log.surroundingsBlocks,
  });
}
