/**
 * M0.5D ask_course orchestrator (injectable I/O — no network in unit tests).
 *
 * Order:
 *   section ownership → PDF capture ownership → active-document ownership
 *   → beginRequest once
 *   → document window OR embed + section search
 *   → filter → knowledge_not_found OR generate → recordUsage
 *
 * A window route reads indexed pages of the owned PDF and skips section search.
 * A topical question about the open PDF searches that PDF only.
 * A general question still uses section-wide retrieval.
 */

import { resolveServerMaxOutputTokens } from '../chatCompletionsRequestPolicy.ts';
import { completeChatWithinDeadline } from '../chatAttempt.ts';
import { mapProviderFailureToClient } from '../mapProviderFailure.ts';
import type { AiEnforcementStore, UsageOutcome } from '../enforcement.ts';
import { estimateCostUsdMicros } from '../aiPricing.ts';
import type { AiEmbeddingProvider } from '../knowledge/embeddingTypes.ts';
import { routeEmbeddingModel, type EmbeddingRouterConfig } from '../knowledge/routeEmbedding.ts';
import { KNOWLEDGE_EMBEDDING_DIMENSIONS, KNOWLEDGE_EMBEDDING_MODEL_DEFAULT } from '../knowledge/bounds.ts';
import { formatProviderDiagnosticLog } from '../providerOpenAICompatible.ts';
import type { AiProvider } from '../providerTypes.ts';
import { routeModel, type RouterConfig } from '../routeModel.ts';
import type {
  ContextAvailable,
  DocumentWindowCoverage,
  DocumentWindowCursor,
  KnowledgeTier,
  ZikukAiAskCourseRequest,
  ZikukAiResponse,
} from '../requestTypes.ts';
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
import type { KnowledgeSearchHit, PromptCourseChunk } from './retrievalTypes.ts';
import { buildAskCourseRetrievalQuery } from './buildAskCourseRetrievalQuery.ts';
import type { AskCourseRecentTurn } from '../requestTypes.ts';
import { isOwnedPdfCaptureSource, isOwnedPdfSource, type LoadPdfCaptureSource } from './pdfCapture.ts';
import {
  classifyActiveDocumentQuestion,
  documentWindowRange,
  namedDocumentPage,
  DOCUMENT_WINDOW_FETCH_LIMIT,
  fitDocumentWindow,
  scopeCurrentPageChunks,
  type DocumentWindowChunk,
} from './documentWindow.ts';
import type { ActiveDocumentBrief } from './promptAskCourse.ts';
import {
  applyClaimLevelGrounding,
  contextAvailableForGrounding,
  sourceOnlyLimitationMessage,
} from './evaluateGroundingProvenance.ts';
import { createGroundingDecisionDiagnosticSink } from './groundingDecisionDiagnostics.ts';

export type AskCourseSearchFn = (input: {
  userId: string;
  sectionId: string;
  queryEmbedding: number[];
  limit: number;
  embeddingModel: string;
  embeddingDimensions: number;
}) => Promise<{ ok: true; raw: unknown } | { ok: false }>;

/** Similarity search restricted to one PDF before ranking. Not section search. */
export type SearchPdfSource = (input: {
  userId: string;
  sectionId: string;
  sourceObjectId: string;
  queryEmbedding: number[];
  limit: number;
  embeddingModel: string;
  embeddingDimensions: number;
}) => Promise<{ ok: true; raw: unknown } | { ok: false }>;

export type LoadDocumentWindow = (input: {
  userId: string;
  sectionId: string;
  sourceObjectId: string;
  pageFrom: number;
  pageTo: number;
  limit: number;
}) => Promise<{ ok: true; rows: DocumentWindowChunk[] } | { ok: false }>;

export type AskCourseDeps = {
  loadSectionOwner: LoadSectionOwner;
  loadPdfCaptureSource?: LoadPdfCaptureSource;
  /** Page-ordered indexed text for one owned PDF. Absent in older test doubles. */
  loadDocumentWindow?: LoadDocumentWindow;
  embeddingProvider: AiEmbeddingProvider;
  embeddingRouterConfig?: EmbeddingRouterConfig;
  searchKnowledge: AskCourseSearchFn;
  /** Required for topical questions about one open PDF. Absent means that route cannot search. */
  searchPdfSource?: SearchPdfSource;
  /** Required for notebook_page citation title resolution (fail-closed). */
  loadNotebookFsoForCitation: LoadNotebookFsoForCitation;
  generationProvider: AiProvider;
  routerConfig: RouterConfig;
  enforcement: AiEnforcementStore;
  signal?: AbortSignal;
  /** Epoch ms when the Edge request began. Enables the chat idle deadline. */
  requestStartedAt?: number;
};

export type AskCourseUsageExtras = {
  retrievalHitCount?: number;
  embeddingInputTokens?: number;
  embeddingLatencyMs?: number;
};

function mapProviderOutcome(code: string): UsageOutcome {
  if (code === 'provider_timeout') return 'provider_timeout';
  if (code === 'rate_limited') return 'rate_limited';
  if (code === 'bad_response' || code === 'output_budget_exhausted') return 'bad_response';
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
    knowledgeTier?: KnowledgeTier;
    contextAvailable?: ContextAvailable;
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
  const capture = request.version === 3 ? request.capture : undefined;
  const activeDocument = request.version === 1 ? undefined : request.activeDocument;
  const recentTurns: AskCourseRecentTurn[] =
    request.version !== 1 && request.recentTurns ? request.recentTurns : [];
  // v1: embed question only. v2/v3: deterministic contextual retrieval query (SKE1.2).
  const embeddingInputText =
    request.version !== 1
      ? buildAskCourseRetrievalQuery({ question, recentTurns, capture })
      : question;

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

  // Reject missing/foreign/deleted/non-PDF sources before quota or provider work.
  if (capture) {
    let source = null;
    try {
      source =
        (await deps.loadPdfCaptureSource?.({
          userId: authUserId,
          sectionId,
          sourceObjectId: capture.sourceObjectId,
        })) ?? null;
    } catch {
      /* fail closed */
    }
    if (!isOwnedPdfCaptureSource(source, authUserId, capture)) {
      return {
        response: {
          version: 1,
          ok: false,
          error: {
            code: 'not_found',
            message: 'The attached PDF is no longer available in this course. Capture it again.',
          },
        },
        meta: { ...baseMeta, ok: false, errorCode: 'not_found', latencyMs: Date.now() - started },
      };
    }
  }

  // Identity check only. Do not add this document's text to retrieval or the prompt.
  if (activeDocument) {
    let source = null;
    try {
      source =
        (await deps.loadPdfCaptureSource?.({
          userId: authUserId,
          sectionId,
          sourceObjectId: activeDocument.sourceObjectId,
        })) ?? null;
    } catch {
      /* fail closed */
    }
    if (
      !isOwnedPdfSource(source, authUserId, {
        sourceObjectId: activeDocument.sourceObjectId,
        sectionId,
        pageNumber: activeDocument.pageNumber,
      })
    ) {
      return {
        response: {
          version: 1,
          ok: false,
          error: {
            code: 'not_found',
            message: 'That PDF is not available in this course.',
          },
        },
        meta: { ...baseMeta, ok: false, errorCode: 'not_found', latencyMs: Date.now() - started },
      };
    }
  }

  deps.signal?.throwIfAborted();

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

  const retrieve = async (scope?: { sourceObjectId: string }) => {
    // 3) Embed retrieval text (v1 = question; v2 = contextual query; v3 = capture + instruction)
    const routeEmb = routeEmbeddingModel(deps.embeddingRouterConfig ?? {});
    const embedded = await deps.embeddingProvider.embed({
      model: routeEmb.model,
      dimensions: routeEmb.dimensions,
      inputs: [embeddingInputText],
      signal: deps.signal,
    });
    if (!embedded.ok) {
      const code = mapEmbeddingToGateway(embedded.code);
      return {
        response: {
          version: 1 as const,
          ok: false as const,
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
          ok: false as boolean,
          errorCode: code,
          embeddingInputTokens: undefined,
          latencyMs: Date.now() - started,
        },
      };
    }
    if (embedded.embeddings.length !== 1 || embedded.embeddings[0]!.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
      return {
        response: {
          version: 1 as const,
          ok: false as const,
          error: { code: 'internal_error' as const, message: 'Something went wrong.' },
        },
        meta: {
          ...baseMeta,
          plan: begin.plan,
          ok: false as boolean,
          errorCode: 'internal_error',
          latencyMs: Date.now() - started,
        },
      };
    }

    const embeddingInputTokens = embedded.usage?.inputTokens;

    // 4) Search
    const search = scope
      ? deps.searchPdfSource
        ? await deps.searchPdfSource({
            userId: authUserId,
            sectionId,
            sourceObjectId: scope.sourceObjectId,
            queryEmbedding: embedded.embeddings[0]!,
            limit: ASK_COURSE_RPC_CANDIDATE_LIMIT,
            embeddingModel: routeEmb.model || KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
            embeddingDimensions: routeEmb.dimensions,
          })
        : { ok: false as const }
      : await deps.searchKnowledge({
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
          version: 1 as const,
          ok: false as const,
          error: { code: 'internal_error' as const, message: 'Something went wrong.' },
        },
        meta: {
          ...baseMeta,
          plan: begin.plan,
          ok: false as boolean,
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
          version: 1 as const,
          ok: false as const,
          error: { code: 'internal_error' as const, message: 'Something went wrong.' },
        },
        meta: {
          ...baseMeta,
          plan: begin.plan,
          ok: false as boolean,
          errorCode: 'internal_error',
          embeddingInputTokens,
          latencyMs: Date.now() - started,
        },
      };
    }

    // Defense: drop any hit that somehow isn't for this section's search contract
    // (RPC already scopes; this is belt-and-suspenders on object shape only.)
    const parsedHits: KnowledgeSearchHit[] = scope
      ? parsed.hits.filter(
          (hit) => hit.sourceKind === 'free_space_pdf' && hit.sourceObjectId === scope.sourceObjectId,
        )
      : parsed.hits;

    // Resolve live Notebook titles; drop unresolvable notebook evidence.
    const scopedHits = await resolveAskCourseHitMetadata({
      userId: authUserId,
      sectionId,
      hits: parsedHits,
      loadNotebookFso: deps.loadNotebookFsoForCitation,
    });
    const { chunks, diagnostics } = filterAskCourseHitsWithDiagnostics(scopedHits);
    console.log(formatAskCourseRetrievalLogLine(diagnostics));
    const pageCount = scopedHits.find((hit) => typeof hit.pageCount === 'number')?.pageCount ?? null;

    return { chunks, diagnostics, embeddingInputTokens, pageCount };
  };

  const documentRoute = activeDocument ? classifyActiveDocumentQuestion(question) : null;
  const usePdfSource = Boolean(activeDocument && documentRoute === 'pdf_source');
  const useWindow = Boolean(
    activeDocument && documentRoute && documentRoute !== 'topical' && documentRoute !== 'pdf_source',
  );

  let chunks: PromptCourseChunk[] = [];
  let embeddingInputTokens: number | undefined;
  let diagnostics: { reason: string; candidateCount: number } = {
    reason: 'retrieval_unavailable',
    candidateCount: 0,
  };
  let activeBrief: ActiveDocumentBrief | undefined;
  let documentWindow: DocumentWindowCoverage | undefined;

  if (useWindow && activeDocument && documentRoute) {
    const cursor: DocumentWindowCursor | undefined =
      request.version !== 1 ? request.documentCursor : undefined;
    const namedPage = documentRoute === 'named_page' ? namedDocumentPage(question) : null;
    const range = documentWindowRange({
      route: documentRoute,
      visiblePage: activeDocument.pageNumber,
      namedPage,
      cursor,
      sourceObjectId: activeDocument.sourceObjectId,
    });
    const loaded = deps.loadDocumentWindow
      ? await deps.loadDocumentWindow({
          userId: authUserId,
          sectionId,
          sourceObjectId: activeDocument.sourceObjectId,
          pageFrom: range.pageFrom,
          pageTo: range.pageTo,
          limit: DOCUMENT_WINDOW_FETCH_LIMIT,
        })
      : { ok: false as const };
    deps.signal?.throwIfAborted();
    const rows = loaded.ok ? loaded.rows : [];
    const scoped =
      documentRoute === 'current_page'
        ? scopeCurrentPageChunks(rows, activeDocument.pageNumber)
        : documentRoute === 'named_page' && namedPage
          ? rows.filter((row) => row.pageNumber === namedPage)
          : rows;
    const fitted = fitDocumentWindow(
      scoped,
      undefined,
      rows.length >= DOCUMENT_WINDOW_FETCH_LIMIT,
    );
    const fileName = rows.find((row) => row.fileName)?.fileName ?? null;
    const pageCount = rows.find((row) => typeof row.pageCount === 'number')?.pageCount ?? null;
    activeBrief = {
      fileName,
      pageCount,
      visiblePage: activeDocument.pageNumber,
      route: documentRoute,
      fromPage: fitted.fromPage,
      toPage: fitted.toPage,
      partial: fitted.partial,
      empty: fitted.chunks.length === 0,
    };
    chunks = fitted.chunks.map((chunk, index) => ({
      citationIndex: index + 1,
      sourceKind: 'free_space_pdf' as const,
      sourceObjectId: chunk.sourceObjectId,
      notebookObjectId: null,
      fileName: chunk.fileName,
      pageNumber: chunk.pageNumber,
      text: chunk.text,
    }));
    let resumeFromPage = fitted.resumeFromPage;
    let partial = fitted.partial;
    // A page that cannot fit has already been resumed once. Move on.
    if (
      documentRoute === 'continue' &&
      cursor &&
      cursor.sourceObjectId === activeDocument.sourceObjectId &&
      fitted.fromPage !== null &&
      cursor.resumeFromPage === fitted.fromPage &&
      fitted.partial &&
      fitted.fromPage === fitted.toPage &&
      fitted.resumeFromPage === fitted.fromPage
    ) {
      resumeFromPage = fitted.fromPage + 1;
      partial = false;
    }
    if (fitted.fromPage !== null && fitted.toPage !== null && resumeFromPage !== null) {
      documentWindow = {
        sourceObjectId: activeDocument.sourceObjectId,
        fileName,
        pageCount,
        fromPage: fitted.fromPage,
        toPage: fitted.toPage,
        resumeFromPage,
        partial,
      };
    }
    if (activeBrief) activeBrief.partial = partial;
    diagnostics = {
      reason: loaded.ok ? 'document_window' : 'document_window_unavailable',
      candidateCount: rows.length,
    };
  } else if (usePdfSource && activeDocument) {
    const retrieval = await retrieve({ sourceObjectId: activeDocument.sourceObjectId });
    deps.signal?.throwIfAborted();
    if ('response' in retrieval) return retrieval;
    chunks = retrieval.chunks;
    embeddingInputTokens = retrieval.embeddingInputTokens;
    diagnostics = retrieval.diagnostics;
    const matchedPages = [...new Set(chunks.map((chunk) => chunk.pageNumber))].sort((a, b) => a - b);
    activeBrief = {
      fileName: chunks.find((chunk) => chunk.fileName)?.fileName ?? null,
      pageCount: retrieval.pageCount,
      visiblePage: activeDocument.pageNumber,
      route: 'pdf_source',
      fromPage: null,
      toPage: null,
      partial: false,
      empty: chunks.length === 0,
      matchedPages,
    };
  } else {
    const retrieval = await retrieve();
    deps.signal?.throwIfAborted();
    if ('response' in retrieval && !capture) return retrieval;

    chunks = 'chunks' in retrieval ? retrieval.chunks : [];
    embeddingInputTokens =
      'embeddingInputTokens' in retrieval
        ? retrieval.embeddingInputTokens
        : retrieval.meta.embeddingInputTokens;
    diagnostics =
      'diagnostics' in retrieval
        ? retrieval.diagnostics
        : { reason: 'retrieval_unavailable', candidateCount: 0 };

    if (activeDocument && documentRoute === 'topical') {
      const identity = deps.loadDocumentWindow
        ? await deps.loadDocumentWindow({
            userId: authUserId,
            sectionId,
            sourceObjectId: activeDocument.sourceObjectId,
            pageFrom: activeDocument.pageNumber,
            pageTo: activeDocument.pageNumber,
            limit: 1,
          })
        : { ok: false as const };
      const row = identity.ok ? identity.rows[0] : undefined;
      activeBrief = {
        fileName: row?.fileName ?? null,
        pageCount: row?.pageCount ?? null,
        visiblePage: activeDocument.pageNumber,
        route: 'topical',
        fromPage: null,
        toPage: null,
        partial: false,
        empty: true,
      };
    }
  }

  // A window route does not fall through to section search when the PDF has no text.
  // A source-scoped search does not fall through to another PDF, a notebook, or the model.
  if (usePdfSource && chunks.length === 0 && !capture) {
    const contextAvailable = { hasIndexedChunks: false, hasPdfCapture: false } as const;
    const text = sourceOnlyLimitationMessage(contextAvailable);
    return {
      response: {
        version: 1,
        ok: true,
        result: {
          type: 'ask_course',
          text,
          sources: [],
          knowledgeTier: 'mixed',
          contextAvailable,
        },
        meta: {
          capability: 'ask_course',
          latencyMs: Date.now() - started,
          retrievalHitCount: 0,
          knowledgeTier: 'mixed',
          contextAvailable,
        },
      },
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: true,
        knowledgeTier: 'mixed',
        contextAvailable,
        retrievalHitCount: 0,
        embeddingInputTokens,
        latencyMs: Date.now() - started,
      },
    };
  }

  if (chunks.length === 0 && !capture) {
    const isExpansionEligible = Boolean(request.version !== 1 && request.teachingMode);
    if (!isExpansionEligible) {
      // Legacy request without teachingMode: preserve fail-closed knowledge_not_found
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

    // Smart Knowledge Expansion (SKE1.1): Teach using general academic knowledge
    console.log(
      JSON.stringify({
        event: 'ask_course_outcome',
        outcome: 'knowledge_expansion',
        tier: 'general_academic',
        reason: diagnostics.reason,
        retrievalCandidateCount: diagnostics.candidateCount,
        finalEvidenceCount: 0,
        teachingMode: request.teachingMode,
      }),
    );
  }

  const sources = sourcesFromPromptChunks(chunks);
  const messages = buildAskCourseMessages({
    question,
    chunks,
    recentTurns: request.version !== 1 ? recentTurns : undefined,
    capture,
    teachingMode: request.version !== 1 ? request.teachingMode : undefined,
    activeDocument: activeBrief,
  });
  const route = routeModel({ capability: 'ask_course', modality: 'text' }, deps.routerConfig);

  const providerResult = await completeChatWithinDeadline(
    deps.generationProvider,
    {
      model: route.model,
      messages,
      maxTokens: resolveServerMaxOutputTokens(route.model),
    },
    { requestStartedAt: deps.requestStartedAt, parent: deps.signal },
  );

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
      inputTokens: providerResult.usage?.inputTokens ?? null,
      outputTokens: providerResult.usage?.outputTokens ?? null,
      reasoningTokens: providerResult.usage?.reasoningTokens ?? null,
      totalTokens: providerResult.usage?.totalTokens ?? null,
      estimatedCostUsdMicros: null,
      latencyMs: providerResult.latencyMs,
      sectionId,
      providerRequestId: providerResult.providerRequestId ?? null,
    });
    const mapped = mapProviderFailureToClient(providerResult.code);
    return {
      response: {
        version: 1,
        ok: false,
        error: mapped,
      },
      meta: {
        ...baseMeta,
        plan: begin.plan,
        ok: false,
        errorCode: mapped.code,
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

  const contextAvailable = contextAvailableForGrounding({
    indexedChunkTexts: chunks.map((chunk) => chunk.text),
    captureText: capture?.text,
  });
  const grounded = applyClaimLevelGrounding({
    question,
    answerText: providerResult.text,
    chunks: chunks.map((chunk) => ({
      citationIndex: chunk.citationIndex,
      text: chunk.text,
    })),
    captureText: capture?.text,
    contextAvailable,
    diagnostics: createGroundingDecisionDiagnosticSink(),
  });
  const knowledgeTier: KnowledgeTier = grounded.knowledgeTier;
  const answerText = grounded.text;

  return {
    response: {
      version: 1,
      ok: true,
      result: {
        type: 'ask_course',
        text: answerText,
        sources,
        knowledgeTier,
        contextAvailable,
        ...(providerResult.generationIncomplete ? { generationIncomplete: true } : {}),
        ...(documentWindow ? { documentWindow } : {}),
      },
      meta: {
        capability: 'ask_course',
        latencyMs,
        retrievalHitCount: chunks.length,
        knowledgeTier,
        contextAvailable,
      },
    },
    meta: {
      ...baseMeta,
      plan: begin.plan,
      ok: true,
      knowledgeTier,
      contextAvailable,
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
