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
import { MAX_REQUEST_BODY_BYTES } from '../_shared/ai/bounds.ts';
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '../_shared/ai/knowledge/bounds.ts';
import { createOpenAICompatibleEmbeddingProvider } from '../_shared/ai/knowledge/providerEmbeddings.ts';
import { preflightGatewayRequest } from '../_shared/ai/preflightGatewayRequest.ts';
import { createOpenAICompatibleProvider } from '../_shared/ai/providerOpenAICompatible.ts';
import {
  formatUsageLogLine,
  runGatewayPipelineAfterPreflight,
} from '../_shared/ai/runGatewayPipeline.ts';
import { createSupabaseEnforcementStore } from '../_shared/ai/supabaseEnforcement.ts';
import type { ZikukAiResponse } from '../_shared/ai/requestTypes.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: ZikukAiResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function httpStatusFor(code: string): number {
  switch (code) {
    case 'unauthenticated':
      return 401;
    case 'auth_mismatch':
    case 'ai_disabled':
      return 403;
    case 'invalid_request':
    case 'unsupported_capability':
    case 'unsupported_content':
      return 400;
    case 'not_found':
    case 'knowledge_not_found':
      return 404;
    case 'rate_limited':
    case 'quota_exceeded':
      return 429;
    case 'provider_timeout':
      return 504;
    case 'provider_unavailable':
      return 502;
    default:
      return 500;
  }
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

  try {
    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (contentLength > MAX_REQUEST_BODY_BYTES) {
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
    if (rawText.length > MAX_REQUEST_BODY_BYTES) {
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

    const apiKey = Deno.env.get('AI_PROVIDER_API_KEY') ?? '';
    const baseUrl = Deno.env.get('AI_PROVIDER_BASE_URL') ?? 'https://api.openai.com/v1';
    const model = Deno.env.get('AI_MODEL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!apiKey || !model) {
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

    const provider = createOpenAICompatibleProvider({ apiKey, baseUrl });
    const embeddingModel = Deno.env.get('AI_EMBEDDING_MODEL')?.trim() || undefined;
    const dimsRaw = Deno.env.get('AI_EMBEDDING_DIMENSIONS');
    const embeddingDimensions = dimsRaw ? Number(dimsRaw) : undefined;

    const askCourseDeps =
      preflight.request.capability === 'ask_course'
        ? {
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
              if (error) return { ok: false as const };
              return { ok: true as const, raw: data ?? [] };
            },
          }
        : undefined;

    const { response, usageLog } = await runGatewayPipelineAfterPreflight({
      authUserId: preflight.authUserId,
      request: preflight.request,
      provider,
      routerConfig: { model },
      enforcement,
      askCourseDeps,
    });

    if (usageLog) {
      console.log(formatUsageLogLine(usageLog));
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
