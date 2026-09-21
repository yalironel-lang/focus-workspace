/**
 * M0.5D ask_course orchestrator (injectable I/O — no network in unit tests).
 *
 * Order:
 *   section ownership → beginRequest once → embed question → search
 *   → filter → knowledge_not_found OR generate → recordUsage
 */

import { SERVER_MAX_OUTPUT_TOKENS } from '../bounds.ts';
import type { AiEnforcementStore, UsageOutcome } from '../enforcement.ts';
import { estimateCostUsdMicros } from '../aiPricing.ts';
import type { AiEmbeddingProvider } from '../knowledge/embeddingTypes.ts';
import { routeEmbeddingModel, type EmbeddingRouterConfig } from '../knowledge/routeEmbedding.ts';
import { KNOWLEDGE_EMBEDDING_DIMENSIONS, KNOWLEDGE_EMBEDDING_MODEL_DEFAULT } from '../knowledge/bounds.ts';
import { formatProviderDiagnosticLog } from '../providerOpenAICompatible.ts';
import type { AiProvider } from '../providerTypes.ts';
import { routeModel, type RouterConfig } from '../routeModel.ts';
import type { ZikukAiAskCourseRequest, ZikukAiResponse } from '../requestTypes.ts';
import { authorizeAskCourseSection, type LoadSectionOwner } from './authorizeSection.ts';
import { ASK_COURSE_RPC_CANDIDATE_LIMIT } from './bounds.ts';
import { buildAskCourseMessages } from './promptAskCourse.ts';
import { parseKnowledgeSearchRows } from './parseSearchHits.ts';
import { filterAskCourseHitsWithDiagnostics, sourcesFromPromptChunks } from './retrievalPolicy.ts';
import {
  formatAskCourseRetrievalLogLine,
} from './retrievalDiagnostics.ts';
import {
  resolveAskCourseHitMetadata,
  type LoadNotebookFsoForCitation,
} from './resolveCitationMetadata.ts';
import type { KnowledgeSearchHit } from './retrievalTypes.ts';

export type AskCourseSearchFn = (input: {
  userId: string;
  sectionId: string;
  queryEmbedding: number[];
  limit: number;
  embeddingModel: string;
  embeddingDimensions: number;
}) => Promise<{ ok: true; raw: unknown } | { ok: false }>;

export type AskCourseDeps = {
  loadSectionOwner: LoadSectionOwner;
  embeddingProvider: AiEmbeddingProvider;
  embeddingRouterConfig?: EmbeddingRouterConfig;
  searchKnowledge: AskCourseSearchFn;
  /** Required for notebook_page citation title resolution (fail-closed). */
  loadNotebookFsoForCitation: LoadNotebookFsoForCitation;
  generationProvider: AiProvider;
  routerConfig: RouterConfig;
  enforcement: AiEnforcementStore;
  signal?: AbortSignal;
};

export type AskCourseUsageExtras = {
  retrievalHitCount?: number;
  embeddingInputTokens?: number;
  embeddingLatencyMs?: number;
};

function mapProviderOutcome(code: string): UsageOutcome {
  if (code === 'provider_timeout') return 'provider_timeout';
  if (code === 'rate_limited') return 'rate_limited';
  if (code === 'bad_response') return 'bad_response';
  return 'provider_error';
}

function mapEmbeddingToGateway(
  code: string,
): Extract<ZikukAiResponse, { ok: false }>['error']['code'] {
  switch (code) {
    case 'embedding_timeout':
      return 'provider_timeout';
    case 'embedding_rate_limited':
      return 'rate_limited';
    case 'embedding_quota_exceeded':
      return 'quota_exceeded';
    case 'embedding_provider_unavailable':
      return 'provider_unavailable';
    default:
      return 'internal_error';
  }
}

export type AskCoursePipelineResult = {
  response: ZikukAiResponse;
  /** Metadata for gateway usage log (no content). */
  meta: {
    sectionId: string;
    plan?: string;
    selectionChars: number;
    retrievalHitCount?: number;
    embeddingInputTokens?: number;
    generationLatencyMs?: number;
    model?: string;
    providerId?: string;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    estimatedCostUsdMicros?: number | null;
    usageEventPersisted?: boolean;
    ok: boolean;
    errorCode?: string;
    latencyMs: number;
  };
};

export async function runAskCoursePipeline(input: {
  authUserId: string;
  request: ZikukAiAskCourseRequest;
  deps: AskCourseDeps;
}): Promise<AskCoursePipelineResult> {
  const started = Date.now();
  const { authUserId, request, deps } = input;
  const sectionId = request.sectionId;
  const question = request.question;

  const baseMeta = {
    sectionId,
    selectionChars: question.length,
    ok: false as boolean,
    latencyMs: 0,
  };

  // 1) Section ownership BEFORE embed/search/generate
  const authz = await authorizeAskCourseSection({
    authUserId,
    sectionId,
    loadSectionOwner: deps.loadSectionOwner,
  });
  if (!authz.ok) {
    return {
      response: {
        version: 1,
        ok: false,
        error: { code: 'not_found', message: 'Course not found.' },
      },
      meta: { ...baseMeta, ok: false, errorCode: 'not_found', latencyMs: Date.now() - started },
    };
  }

  // 2) ONE product quota begin
  let begin;
  try {
    begin = await deps.enforcement.beginRequest(authUserId, 'ask_course');
  } catch {
    return {
      response: {
        version: 1,
        ok: false,
        error: {
          code: 'internal_error',
          message: 'AI usage controls are temporarily unavailable. Try again shortly.',
        },
      },
      meta: { ...baseMeta, ok: false, errorCode: 'internal_error', latencyMs: Date.now() - started },
    };
  }
  if (!begin.ok) {
    const code =
      begin.code === 'invalid_request'
        ? 'internal_error'
        : (begin.code as 'ai_disabled' | 'rate_limited' | 'quota_exceeded' | 'internal_error');
    const message =
      begin.code === 'ai_disabled'
        ? 'AI is disabled for this account.'
        : begin.code === 'quota_exceeded'
          ? 'Daily AI limit reached. Try again tomorrow.'
          : begin.code === 'rate_limited'
            ? 'Too many requests. Try again shortly.'
            : 'Unable to start AI request.';
    return {
      response: { version: 1, ok: false, error: { code, message } },
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: false,
        errorCode: code,
        latencyMs: Date.now() - started,
      },
    };
  }

  // 3) Embed question text only
  const routeEmb = routeEmbeddingModel(deps.embeddingRouterConfig ?? {});
  const embedded = await deps.embeddingProvider.embed({
    model: routeEmb.model,
    dimensions: routeEmb.dimensions,
    inputs: [question],
    signal: deps.signal,
  });
  if (!embedded.ok) {
    const code = mapEmbeddingToGateway(embedded.code);
    return {
      response: {
        version: 1,
        ok: false,
        error: {
          code,
          message:
            code === 'rate_limited'
              ? 'Too many requests. Try again shortly.'
              : code === 'quota_exceeded'
                ? 'Daily AI limit reached. Try again tomorrow.'
                : code === 'provider_timeout'
                  ? 'The AI service timed out. Try again.'
                  : code === 'provider_unavailable'
                    ? 'The AI service is temporarily unavailable.'
                    : 'Something went wrong.',
        },
      },
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: false,
        errorCode: code,
        embeddingInputTokens: undefined,
        latencyMs: Date.now() - started,
      },
    };
  }
  if (embedded.embeddings.length !== 1 || embedded.embeddings[0]!.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    return {
      response: {
        version: 1,
        ok: false,
        error: { code: 'internal_error', message: 'Something went wrong.' },
      },
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: false,
        errorCode: 'internal_error',
        latencyMs: Date.now() - started,
      },
    };
  }

  const embeddingInputTokens = embedded.usage?.inputTokens;

  // 4) Search
  const search = await deps.searchKnowledge({
    userId: authUserId,
    sectionId,
    queryEmbedding: embedded.embeddings[0]!,
    limit: ASK_COURSE_RPC_CANDIDATE_LIMIT,
    embeddingModel: routeEmb.model || KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    embeddingDimensions: routeEmb.dimensions,
  });
  if (!search.ok) {
    return {
      response: {
        version: 1,
        ok: false,
        error: { code: 'internal_error', message: 'Something went wrong.' },
      },
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: false,
        errorCode: 'internal_error',
        embeddingInputTokens,
        latencyMs: Date.now() - started,
      },
    };
  }

  const parsed = parseKnowledgeSearchRows(search.raw);
  if (!parsed.ok) {
    return {
      response: {
        version: 1,
        ok: false,
        error: { code: 'internal_error', message: 'Something went wrong.' },
      },
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: false,
        errorCode: 'internal_error',
        embeddingInputTokens,
        latencyMs: Date.now() - started,
      },
    };
  }

  // Defense: drop any hit that somehow isn't for this section's search contract
  // (RPC already scopes; this is belt-and-suspenders on object shape only.)
  const parsedHits: KnowledgeSearchHit[] = parsed.hits;

  // Resolve live Notebook titles; drop unresolvable notebook evidence.
  const hits = await resolveAskCourseHitMetadata({
    userId: authUserId,
    sectionId,
    hits: parsedHits,
    loadNotebookFso: deps.loadNotebookFsoForCitation,
  });

  const { chunks, diagnostics } = filterAskCourseHitsWithDiagnostics(hits);
  console.log(formatAskCourseRetrievalLogLine(diagnostics));

  if (chunks.length === 0) {
    // Metadata-only: request consumed product begin, terminated before generation.
    console.log(
      JSON.stringify({
        event: 'ask_course_outcome',
        outcome: 'knowledge_not_found',
        reason: diagnostics.reason,
        retrievalCandidateCount: diagnostics.candidateCount,
        finalEvidenceCount: 0,
        // no question / chunks / answer
      }),
    );
    return {
      response: {
        version: 1,
        ok: false,
        error: {
          code: 'knowledge_not_found',
          message: 'No matching course material was found for this question.',
        },
      },
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: false,
        errorCode: 'knowledge_not_found',
        retrievalHitCount: 0,
        embeddingInputTokens,
        latencyMs: Date.now() - started,
      },
    };
  }

  const sources = sourcesFromPromptChunks(chunks);
  const messages = buildAskCourseMessages({ question, chunks });
  const route = routeModel({ capability: 'ask_course', modality: 'text' }, deps.routerConfig);

  const providerResult = await deps.generationProvider.complete({
    model: route.model,
    messages,
    maxTokens: SERVER_MAX_OUTPUT_TOKENS,
    signal: deps.signal,
  });

  const latencyMs = Date.now() - started;

  if (!providerResult.ok) {
    if (providerResult.diagnostics) {
      console.error(formatProviderDiagnosticLog(providerResult.diagnostics));
    }
    const record = await deps.enforcement.recordUsage({
      userId: authUserId,
      capability: 'ask_course',
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
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: false,
        errorCode: code,
        retrievalHitCount: chunks.length,
        embeddingInputTokens,
        generationLatencyMs: providerResult.latencyMs,
        model: route.model,
        providerId: route.providerId,
        usageEventPersisted: record.ok,
        latencyMs,
      },
    };
  }

  const estimatedCost = estimateCostUsdMicros(route.model, {
    inputTokens: providerResult.usage?.inputTokens,
    outputTokens: providerResult.usage?.outputTokens,
    reasoningTokens: providerResult.usage?.reasoningTokens,
    totalTokens: providerResult.usage?.totalTokens,
  });

  const record = await deps.enforcement.recordUsage({
    userId: authUserId,
    capability: 'ask_course',
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

  // Privacy: embedding token count stays in diagnostics only (no second product debit).
  if (typeof embeddingInputTokens === 'number') {
    console.log(
      JSON.stringify({
        event: 'zikuk_ai_ask_course_embed',
        ok: true,
        embeddingInputTokens,
        retrievalHitCount: chunks.length,
        // no question / chunks / answer
      }),
    );
  }

  return {
    response: {
      version: 1,
      ok: true,
      result: {
        type: 'ask_course',
        text: providerResult.text,
        sources,
      },
      meta: {
        capability: 'ask_course',
        latencyMs,
        retrievalHitCount: chunks.length,
      },
    },
    meta: {
      ...baseMeta,
      plan: begin.plan,
      ok: true,
      retrievalHitCount: chunks.length,
      embeddingInputTokens,
      generationLatencyMs: providerResult.latencyMs,
      model: route.model,
      providerId: route.providerId,
      inputTokens: providerResult.usage?.inputTokens,
      outputTokens: providerResult.usage?.outputTokens,
      reasoningTokens: providerResult.usage?.reasoningTokens,
      totalTokens: providerResult.usage?.totalTokens,
      estimatedCostUsdMicros: estimatedCost,
      usageEventPersisted: record.ok,
      latencyMs,
    },
  };
}
