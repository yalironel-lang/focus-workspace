/**
 * ZIKUK AI — ai-knowledge-index (M0.5C Phase 2)
 *
 * Authenticated index of READY knowledge chunks via embedding adapter.
 * DO NOT deploy until explicitly approved. No real provider calls in unit tests.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_MAX_REQUEST_BODY_BYTES,
} from '../_shared/ai/knowledge/bounds.ts';
import type { IndexableChunk } from '../_shared/ai/knowledge/batchChunks.ts';
import { createOpenAICompatibleEmbeddingProvider } from '../_shared/ai/knowledge/providerEmbeddings.ts';
import { formatKnowledgeIndexLogLine } from '../_shared/ai/knowledge/privacyLogIndex.ts';
import {
  knowledgeIndexRequestBodyTooLarge,
  runKnowledgeIndex,
  type KnowledgeIndexDeps,
  type KnowledgeIndexErrorCode,
  type KnowledgeIndexResponse,
} from '../_shared/ai/knowledge/runKnowledgeIndex.ts';
import { KNOWLEDGE_EMBEDDING_MODEL_DEFAULT } from '../_shared/ai/knowledge/bounds.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: KnowledgeIndexResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function httpStatusFor(code: KnowledgeIndexErrorCode): number {
  switch (code) {
    case 'unauthenticated':
      return 401;
    case 'auth_mismatch':
      return 403;
    case 'invalid_request':
      return 400;
    case 'not_found':
      return 404;
    case 'not_ready':
      return 409;
    case 'embedding_rate_limited':
    case 'embedding_quota_exceeded':
      return 429;
    case 'embedding_timeout':
      return 504;
    case 'stale_job':
    case 'incomplete_embeddings':
    case 'embedding_invalid_response':
      return 422;
    default:
      return 500;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const started = Date.now();
  const requestId = crypto.randomUUID();
  let lastChunkCount = 0;
  let lastBatchCount = 0;

  try {
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

    const raw = await req.arrayBuffer();
    if (knowledgeIndexRequestBodyTooLarge(raw.byteLength)) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Request too large.' },
        },
        413,
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Invalid JSON.' },
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const apiKey = Deno.env.get('AI_PROVIDER_API_KEY') ?? '';
    const baseUrl = Deno.env.get('AI_PROVIDER_BASE_URL') ?? '';
    const embeddingModel =
      Deno.env.get('AI_EMBEDDING_MODEL')?.trim() || KNOWLEDGE_EMBEDDING_MODEL_DEFAULT;
    const dimsRaw = Deno.env.get('AI_EMBEDDING_DIMENSIONS');
    const embeddingDimensions = dimsRaw ? Number(dimsRaw) : KNOWLEDGE_EMBEDDING_DIMENSIONS;

    if (!supabaseUrl || !supabaseAnon || !serviceKey || !apiKey || !baseUrl) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'internal_error', message: 'Server configuration error.' },
        },
        500,
      );
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const authUserId = userError || !userData?.user?.id ? null : userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const deps: KnowledgeIndexDeps = {
      embeddingModel,
      embeddingDimensions,
      embeddingProvider: createOpenAICompatibleEmbeddingProvider({ apiKey, baseUrl }),

      async loadSourceForObject({ userId, sectionId, sourceObjectId }) {
        const { data: section, error: secErr } = await admin
          .from('sections')
          .select('id, user_id')
          .eq('id', sectionId)
          .maybeSingle();
        if (secErr || !section) return { ok: false as const, code: 'not_found' as const };
        if (section.user_id !== userId) return { ok: false as const, code: 'auth_mismatch' as const };

        const { data: source, error } = await admin
          .from('ai_knowledge_sources')
          .select(
            'id, user_id, section_id, source_version, status, retrieval_source_version, source_object_id',
          )
          .eq('source_object_id', sourceObjectId)
          .eq('section_id', sectionId)
          .maybeSingle();
        if (error || !source) return { ok: false as const, code: 'not_found' as const };
        if (source.user_id !== userId) return { ok: false as const, code: 'auth_mismatch' as const };
        if (source.status !== 'ready') return { ok: false as const, code: 'not_ready' as const };

        const { data: vidx } = await admin
          .from('ai_knowledge_version_index')
          .select('status, embedding_model, embedding_dimensions')
          .eq('source_id', source.id)
          .eq('source_version', source.source_version)
          .maybeSingle();

        return {
          ok: true as const,
          source: {
            sourceId: source.id as string,
            userId: source.user_id as string,
            sectionId: source.section_id as string,
            sourceVersion: source.source_version as number,
            status: source.status as string,
            retrievalSourceVersion: (source.retrieval_source_version as number | null) ?? null,
            indexStatus: (vidx?.status as
              | 'unindexed'
              | 'indexing'
              | 'indexed'
              | 'index_failed'
              | null) ?? null,
            indexModel: (vidx?.embedding_model as string | null) ?? null,
            indexDimensions: (vidx?.embedding_dimensions as number | null) ?? null,
          },
        };
      },

      async beginIndex({ sourceId, sourceVersion, embeddingModel, embeddingDimensions }) {
        const { data, error } = await admin.rpc('ai_knowledge_begin_index', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_embedding_model: embeddingModel,
          p_embedding_dimensions: embeddingDimensions,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          job_id?: string;
          source_version?: number;
          chunk_count?: number;
        };
      },

      async loadChunks({ sourceId, sourceVersion }) {
        const { data: sourceRow } = await admin
          .from('ai_knowledge_sources')
          .select('file_name, source_kind')
          .eq('id', sourceId)
          .maybeSingle();
        const fileName =
          sourceRow?.source_kind === 'free_space_pdf'
            ? ((sourceRow.file_name as string | null) ?? null)
            : null;

        const { data, error } = await admin
          .from('ai_knowledge_chunks')
          .select('id, page_number, chunk_index, text, source_version')
          .eq('source_id', sourceId)
          .eq('source_version', sourceVersion)
          .order('page_number', { ascending: true })
          .order('chunk_index', { ascending: true });
        if (error || !data) return [];
        return (data as IndexableChunk[]).map((c) =>
          fileName ? { ...c, fileName } : c,
        );
      },

      async upsertEmbeddings({
        sourceId,
        sourceVersion,
        jobId,
        embeddingModel,
        embeddingDimensions,
        rows,
      }) {
        const { data, error } = await admin.rpc('ai_knowledge_upsert_embeddings', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_job_id: jobId,
          p_embedding_model: embeddingModel,
          p_embedding_dimensions: embeddingDimensions,
          p_rows: rows.map((r) => ({
            chunk_id: r.chunkId,
            embedding: r.embedding,
          })),
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          upserted?: number;
        };
      },

      async finalizeIndexSuccess({
        sourceId,
        sourceVersion,
        jobId,
        embeddingModel,
        embeddingDimensions,
      }) {
        const { data, error } = await admin.rpc('ai_knowledge_finalize_index_success', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_job_id: jobId,
          p_embedding_model: embeddingModel,
          p_embedding_dimensions: embeddingDimensions,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          retrieval_source_version?: number | null;
        };
      },

      async finalizeIndexFailure({ sourceId, sourceVersion, jobId, errorCode }) {
        const { data, error } = await admin.rpc('ai_knowledge_finalize_index_failure', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_job_id: jobId,
          p_error_code: errorCode,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          retrieval_source_version?: number | null;
          ignored?: boolean;
        };
      },
    };

    void KNOWLEDGE_MAX_REQUEST_BODY_BYTES;

    const response = await runKnowledgeIndex({
      authUserId,
      body,
      deps,
    });

    if (response.ok) {
      lastChunkCount = response.result.chunkCount;
      lastBatchCount = response.result.batchCount;
    }

    console.log(
      formatKnowledgeIndexLogLine({
        event: 'ai_knowledge_index',
        requestId,
        outcome: response.ok ? 'ok' : 'error',
        code: response.ok ? 'ok' : response.error.code,
        hasUser: Boolean(authUserId),
        hasSection: true,
        hasObject: true,
        chunkCount: lastChunkCount,
        batchCount: lastBatchCount,
        latencyMs: Date.now() - started,
      }),
    );

    if (!response.ok) {
      return jsonResponse(response, httpStatusFor(response.error.code));
    }
    return jsonResponse(response, 200);
  } catch {
    console.log(
      formatKnowledgeIndexLogLine({
        event: 'ai_knowledge_index',
        requestId,
        outcome: 'error',
        code: 'internal_error',
        hasUser: false,
        hasSection: false,
        hasObject: false,
        latencyMs: Date.now() - started,
      }),
    );
    return jsonResponse(
      {
        version: 1,
        ok: false,
        error: { code: 'internal_error', message: 'Unexpected index error.' },
      },
      500,
    );
  }
});
