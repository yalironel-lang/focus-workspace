import { confirmProjectDispatch, finalizeProjectAccounting } from '../_shared/ai/projectAccounting.ts';
/**
 * ZIKUK AI Gateway — Supabase Edge Function (M0.2 + M0.2.6 + M0.4 + M0.5D ask_course).
 *
 * Flow:
 *   platform verify_jwt
 *   → auth.getUser()
 *   → preflight (authz + validate)   ← independent of AI secrets
 *   → AI_* config gate
 *   → entitlement / safety / quota (fail-closed, service role)
 *   → [ask_course: section auth → embed → search → grounded generate]
 *   → explain_selection: sanitize / prompt / router / provider
 *   → usage event (fail-open after provider success)
 *
 * Never mutates Notebook / Free Space / product tables.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import {
  MAX_ASK_COURSE_VISUAL_BODY_BYTES,
  MAX_REQUEST_BODY_BYTES,
} from '../_shared/ai/bounds.ts';
import { allowVisualSizedGatewayBody } from '../_shared/ai/visualCapture/visualSelectionContract.ts';
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '../_shared/ai/knowledge/bounds.ts';
import { createOpenAICompatibleEmbeddingProvider } from '../_shared/ai/knowledge/providerEmbeddings.ts';
import { preflightGatewayRequest } from '../_shared/ai/preflightGatewayRequest.ts';
import { createOpenAICompatibleProvider } from '../_shared/ai/providerOpenAICompatible.ts';
import { createCompositeProvider } from '../_shared/ai/providerGemini.ts';
import { resolveEffectiveModelForUser } from '../_shared/ai/userScopedRouting.ts';
import {
  calculateAuthoritativePayloadInputBound,
  checkProjectSpendingGuard,
  createPostgresProjectSpendingStore,
  requireVerifiedTokenReservation,
  verifyFinalProviderPayloadBound,
} from '../_shared/ai/projectLevelSpendingGuard.ts';
import {
  formatUsageLogLine,
  runGatewayPipelineAfterPreflight,
} from '../_shared/ai/runGatewayPipeline.ts';
import { createSupabaseEnforcementStore } from '../_shared/ai/supabaseEnforcement.ts';
import type { ZikukAiResponse } from '../_shared/ai/requestTypes.ts';
import {
  buildEmergencyDisabledResponse,
  httpStatusFor,
  isEmergencyDisabled,
} from '../_shared/ai/gatewayHttpStatus.ts';
import { PILOT_HEADER, pilotContext } from '../_shared/ai/tutorPilotEvidence.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${PILOT_HEADER}`,
};

function jsonResponse(body: ZikukAiResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}


Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        version: 1,
        ok: false,
        error: { code: 'invalid_request', message: 'POST required.' },
      },
      405,
    );
  }

  const requestStartedAt = Date.now();

  try {
    const contentLength = Number(req.headers.get('content-length') ?? '0');
    // Hard ceiling is the visual budget; text-only stays at 64 KiB after body inspection.
    if (contentLength > MAX_ASK_COURSE_VISUAL_BODY_BYTES) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Request body too large.' },
        },
        413,
      );
    }

    const rawText = await req.text();
    const bodyBytes = new TextEncoder().encode(rawText).byteLength;
    if (bodyBytes > MAX_ASK_COURSE_VISUAL_BODY_BYTES) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Request body too large.' },
        },
        413,
      );
    }
    if (bodyBytes > MAX_REQUEST_BODY_BYTES && !allowVisualSizedGatewayBody(rawText)) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Request body too large.' },
        },
        413,
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawText || 'null');
    } catch {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Invalid JSON body.' },
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    let authUserId: string | null = null;
    if (supabaseUrl && supabaseAnon && authHeader) {
      const supabase = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user?.id) {
        authUserId = data.user.id;
      }
    }

    // Authz + validation BEFORE AI provider configuration.
    const preflight = preflightGatewayRequest({ body, authUserId });
    if (!preflight.ok) {
      const status = httpStatusFor(preflight.response.error.code);
      return jsonResponse(preflight.response, status);
    }

    const emergencyDisable = isEmergencyDisabled(Deno.env.get('AI_EMERGENCY_DISABLE'));
    if (emergencyDisable) {
      console.warn(
        JSON.stringify({
          event: 'zikuk_ai_gateway',
          ok: false,
          errorCode: 'ai_disabled',
          reason: 'emergency_disabled',
        }),
      );
      const disabled = buildEmergencyDisabledResponse();
      return jsonResponse(disabled.response, disabled.status);
    }

    const apiKey = Deno.env.get('AI_PROVIDER_API_KEY') ?? '';
    const baseUrl = Deno.env.get('AI_PROVIDER_BASE_URL') ?? 'https://api.openai.com/v1';
    const defaultModel = Deno.env.get('AI_MODEL') ?? '';
    const visionModel = Deno.env.get('AI_VISION_MODEL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
    const geminiBaseUrl = Deno.env.get('GEMINI_BASE_URL') ?? undefined;
    const geminiAllowedUsers = Deno.env.get('AI_GEMINI_ALLOWED_USERS') ?? '';
    const geminiTestModel = Deno.env.get('AI_GEMINI_TEST_MODEL') ?? 'gemini-3.6-flash';
    const thinkingBudgetRaw = Deno.env.get('AI_GEMINI_THINKING_BUDGET');
    const thinkingBudget = thinkingBudgetRaw ? Number(thinkingBudgetRaw) : undefined;

    // Resolve user-scoped model (allows designated staging QA accounts to evaluate Gemini while preserving baseline)
    const routing = resolveEffectiveModelForUser({
      authUserId: preflight.authUserId,
      defaultModel,
      geminiAllowedUsersRaw: geminiAllowedUsers,
      geminiTestModelRaw: geminiTestModel,
      hasGeminiApiKey: Boolean(geminiApiKey || (defaultModel.toLowerCase().startsWith('gemini-') ? apiKey : '')),
    });

    if (!routing.ok) {
      console.error(
        JSON.stringify({
          event: 'zikuk_ai_gateway',
          ok: false,
          errorCode: routing.error.code,
          reason: routing.error.reason,
        }),
      );
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'internal_error',
            message: 'AI Gateway is not configured.',
          },
        },
        500,
      );
    }

    const model = routing.model;
    const isGeminiModel = model.toLowerCase().startsWith('gemini-');
    const hasConfiguredKey = isGeminiModel ? Boolean(geminiApiKey || apiKey) : Boolean(apiKey);

    if (!hasConfiguredKey || !model) {
      console.error(
        JSON.stringify({
          event: 'zikuk_ai_gateway',
          ok: false,
          errorCode: 'internal_error',
          reason: 'missing_server_ai_config',
        }),
      );
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'internal_error',
            message: 'AI Gateway is not configured.',
          },
        },
        500,
      );
    }

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        JSON.stringify({
          event: 'zikuk_ai_gateway',
          ok: false,
          errorCode: 'internal_error',
          reason: 'missing_enforcement_config',
        }),
      );
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'internal_error',
            message: 'AI usage controls are temporarily unavailable. Try again shortly.',
          },
        },
        500,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const enforcement = createSupabaseEnforcementStore(admin);

    const maxDailyRequestsRaw = Deno.env.get('AI_PROJECT_MAX_DAILY_REQUESTS');
    const maxDailyTokensRaw = Deno.env.get('AI_PROJECT_MAX_DAILY_TOKENS');
    const maxDailyBudgetMicrosRaw = Deno.env.get('AI_PROJECT_MAX_DAILY_BUDGET_USD_MICROS');

    const projectSpendingConfig = {
      emergencyDisable,
      maxDailyRequests: maxDailyRequestsRaw ? Number(maxDailyRequestsRaw) : null,
      maxDailyTokens: maxDailyTokensRaw ? Number(maxDailyTokensRaw) : null,
      maxDailyCostMicros: maxDailyBudgetMicrosRaw ? Number(maxDailyBudgetMicrosRaw) : null,
    };

    let estimatedRequestTokens: number;
    try {
      const bound = calculateAuthoritativePayloadInputBound(preflight.request, model);
      estimatedRequestTokens = requireVerifiedTokenReservation(
        preflight.request.capability,
        model,
        bound.isAuthoritative
          ? {
              declaredInputTokens: bound.declaredInputTokens,
              hasVision: bound.hasVision,
              visionTileCount: bound.visionTileCount,
              maxAttempts: 1,
              hasAuthoritativeTokenizerProof: true,
            }
          : undefined,
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'zikuk_ai_gateway',
          ok: false,
          errorCode: 'unauthorized_inference',
          reason: err instanceof Error ? err.message : 'TOKEN_INPUT_BOUND_UNVERIFIED',
          model,
        }),
      );
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'internal_error',
            message: 'AI usage controls are temporarily unavailable. Try again shortly.',
          },
        },
        500,
      );
    }
    const postgresSpendingStore = createPostgresProjectSpendingStore(admin);

    const spendingGuardDecision = await checkProjectSpendingGuard({
      config: projectSpendingConfig,
      estimatedRequestTokens,
      userId: preflight.authUserId,
      capability: preflight.request.capability,
      store: postgresSpendingStore,
    });

    if (!spendingGuardDecision.allowed) {
      console.warn(
        JSON.stringify({
          event: 'zikuk_ai_gateway',
          ok: false,
          errorCode: spendingGuardDecision.code,
          reason: spendingGuardDecision.reason,
          stats: spendingGuardDecision.stats,
        }),
      );
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: spendingGuardDecision.code,
            message: spendingGuardDecision.message,
          },
        },
        httpStatusFor(spendingGuardDecision.code),
      );
    }

    const provider = createCompositeProvider({
      openAi: apiKey ? { apiKey, baseUrl } : undefined,
      gemini: (geminiApiKey || (isGeminiModel ? apiKey : ''))
        ? {
            apiKey: geminiApiKey || apiKey,
            baseUrl: geminiBaseUrl,
            thinkingBudget,
            resilience: {
              maxCumulativeTokens: estimatedRequestTokens,
            },
          }
        : undefined,
      enableFallback: false,
    });
    const embeddingModel = Deno.env.get('AI_EMBEDDING_MODEL')?.trim() || undefined;
    const dimsRaw = Deno.env.get('AI_EMBEDDING_DIMENSIONS');
    const embeddingDimensions = dimsRaw ? Number(dimsRaw) : undefined;


    const askCourseDeps =
      preflight.request.capability === 'ask_course'
        ? {
            pilotEvidence: pilotContext({ supabaseUrl, origin: req.headers.get('Origin'), key: req.headers.get(PILOT_HEADER) }),
            loadPdfCaptureSource: async (input: { userId: string; sectionId: string; sourceObjectId: string }) => {
              const { data, error } = await admin
                .from('free_space_objects')
                .select('id, user_id, section_id, object')
                .eq('id', input.sourceObjectId)
                .eq('user_id', input.userId)
                .eq('section_id', input.sectionId)
                .maybeSingle();
              if (error || !data) return null;
              return data;
            },
            loadSectionOwner: async (sectionId: string) => {
              const { data, error } = await admin
                .from('sections')
                .select('user_id')
                .eq('id', sectionId)
                .maybeSingle();
              if (error || !data?.user_id) return null;
              return { userId: data.user_id as string };
            },
            embeddingProvider: createOpenAICompatibleEmbeddingProvider({ apiKey, baseUrl }),
            embeddingRouterConfig: {
              model: embeddingModel,
              dimensions: embeddingDimensions,
            },
            searchKnowledge: async (input: {
              userId: string;
              sectionId: string;
              queryEmbedding: number[];
              limit: number;
              embeddingModel: string;
              embeddingDimensions: number;
            }) => {
              const { data, error } = await admin.rpc('ai_knowledge_search', {
                p_user_id: input.userId,
                p_section_id: input.sectionId,
                p_query_embedding: input.queryEmbedding,
                p_limit: input.limit,
                p_embedding_model: input.embeddingModel,
                p_embedding_dimensions: input.embeddingDimensions ?? KNOWLEDGE_EMBEDDING_DIMENSIONS,
              });
              if (error) {
                console.error(
                  JSON.stringify({
                    event: 'zikuk_ai_knowledge_search_error',
                    error: error.message,
                  }),
                );
                return { ok: false as const };
              }
              return { ok: true as const, raw: data ?? [] };
            },
            searchPdfSource: async (input: {
              userId: string;
              sectionId: string;
              sourceObjectId: string;
              queryEmbedding: number[];
              limit: number;
              embeddingModel: string;
              embeddingDimensions: number;
            }) => {
              const { data, error } = await admin.rpc('ai_knowledge_search_pdf_source', {
                p_user_id: input.userId,
                p_section_id: input.sectionId,
                p_source_object_id: input.sourceObjectId,
                p_query_embedding: input.queryEmbedding,
                p_limit: input.limit,
                p_embedding_model: input.embeddingModel,
                p_embedding_dimensions: input.embeddingDimensions ?? KNOWLEDGE_EMBEDDING_DIMENSIONS,
              });
              if (error) {
                console.error(
                  JSON.stringify({
                    event: 'zikuk_ai_knowledge_search_pdf_source_error',
                    error: error.message,
                  }),
                );
                return { ok: false as const };
              }
              return { ok: true as const, raw: data ?? [] };
            },
            loadDocumentWindow: async (input: {
              userId: string;
              sectionId: string;
              sourceObjectId: string;
              pageFrom: number;
              pageTo: number;
              limit: number;
            }) => {
              const { data, error } = await admin.rpc('ai_knowledge_document_window', {
                p_user_id: input.userId,
                p_section_id: input.sectionId,
                p_source_object_id: input.sourceObjectId,
                p_page_from: input.pageFrom,
                p_page_to: input.pageTo,
                p_limit: input.limit,
              });
              if (error) return { ok: false as const };
              const rows = Array.isArray(data) ? data : [];
              return {
                ok: true as const,
                rows: rows.flatMap((row) => {
                  if (!row || typeof row !== 'object') return [];
                  const value = row as Record<string, unknown>;
                  if (typeof value.text !== 'string' || typeof value.page_number !== 'number') return [];
                  return [
                    {
                      sourceObjectId:
                        typeof value.source_object_id === 'string'
                          ? value.source_object_id
                          : input.sourceObjectId,
                      fileName: typeof value.file_name === 'string' ? value.file_name : null,
                      pageCount: typeof value.page_count === 'number' ? value.page_count : null,
                      pageNumber: value.page_number,
                      chunkIndex: typeof value.chunk_index === 'number' ? value.chunk_index : 0,
                      text: value.text,
                    },
                  ];
                }),
              };
            },
            loadNotebookFsoForCitation: async (input: {
              userId: string;
              sectionId: string;
              notebookObjectId: string;
            }) => {
              const { data, error } = await admin
                .from('free_space_objects')
                .select('id, user_id, section_id, object')
                .eq('id', input.notebookObjectId)
                .maybeSingle();
              if (error || !data) return null;
              return {
                id: data.id as string,
                user_id: data.user_id as string,
                section_id: data.section_id as string,
                object: data.object,
              };
            },
          }
        : undefined;

    let pipelineResult: Awaited<ReturnType<typeof runGatewayPipelineAfterPreflight>> | undefined;
    try {
      pipelineResult = await runGatewayPipelineAfterPreflight({
        authUserId: preflight.authUserId,
        request: preflight.request,
        provider,
        routerConfig: { model, visionModel: visionModel || null },
        enforcement,
        askCourseDeps,
        signal: req.signal,
        requestStartedAt,
        onProviderDispatch: async (finalPayload?: {
          capability?: string;
          model?: string;
          messages?: any;
          maxTokens?: number;
          embeddingTokens?: number;
        }) => {
          if (finalPayload?.messages && finalPayload.model) {
            const verification = verifyFinalProviderPayloadBound({
              capability: finalPayload.capability ?? preflight.request.capability,
              model: finalPayload.model,
              messages: finalPayload.messages,
              maxTokens: finalPayload.maxTokens ?? 2048,
              reservedTokens: estimatedRequestTokens,
              embeddingTokens: finalPayload.embeddingTokens ?? 0,
            });
            if (!verification.ok) {
              console.error(
                JSON.stringify({
                  event: 'zikuk_ai_gateway',
                  ok: false,
                  errorCode: 'quota_exceeded',
                  reason: 'RESERVATION_EXPOSURE_EXCEEDED',
                  error: verification.error,
                  totalRequiredTokens: verification.totalRequiredTokens,
                  reservedTokens: verification.reservedTokens,
                }),
              );
              throw new Error(verification.error || 'RESERVATION_EXPOSURE_EXCEEDED');
            }
          }
          await confirmProjectDispatch(spendingGuardDecision);
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('RESERVATION_EXPOSURE_EXCEEDED')) {
        return jsonResponse(
          {
            version: 1,
            ok: false,
            error: {
              code: 'quota_exceeded',
              message: 'Request payload exceeds token reservation limit.',
            },
          },
          429,
        );
      }
      throw err;
    } finally {
      // A successful answer is not proof that every billable attempt supplied
      // complete usage. Retain the full reservation until provenance is verified.
      await finalizeProjectAccounting(spendingGuardDecision, pipelineResult?.usageLog?.totalTokens, estimatedRequestTokens);
    }

    if (!pipelineResult) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'internal_error', message: 'Something went wrong.' },
        },
        500,
      );
    }

    const { response, usageLog } = pipelineResult;

    if (usageLog) {
      console.log(formatUsageLogLine(usageLog));
    }
    if (response.ok && response.result.type === 'ask_course' && response.meta?.capability === 'ask_course' && response.meta.pilotEvidence) {
      const receipt = response.meta.pilotEvidence;
      // IDs only: context fingerprints and comparison key never enter logs.
      console.log(JSON.stringify({ event: 'tutor_pilot', requestId: receipt.requestId, providerRequestId: receipt.providerRequestId }));
    }

    const status = response.ok ? 200 : httpStatusFor(response.error.code);
    return jsonResponse(response, status);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'zikuk_ai_gateway',
        ok: false,
        errorCode: 'internal_error',
        reason: e instanceof Error ? e.name : 'unknown',
      }),
    );
    return jsonResponse(
      {
        version: 1,
        ok: false,
        error: { code: 'internal_error', message: 'Something went wrong.' },
      },
      500,
    );
  }
});
