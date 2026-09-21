/**
 * ZIKUK AI — ai-knowledge-notebook-process (M0.8D)
 *
 * Thin Notebook adapter over shared ingest + runKnowledgeIndexForSource.
 * Does NOT widen Ask search. Does NOT alter the PDF ai-knowledge-process contract.
 *
 * DO NOT deploy until explicitly approved. Unit tests use fake embeddings only.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
  KNOWLEDGE_MAX_REQUEST_BODY_BYTES,
} from '../_shared/ai/knowledge/bounds.ts';
import type { IndexableChunk } from '../_shared/ai/knowledge/batchChunks.ts';
import { createOpenAICompatibleEmbeddingProvider } from '../_shared/ai/knowledge/providerEmbeddings.ts';
import {
  notebookKnowledgeProcessRequestBodyTooLarge,
  runNotebookKnowledgeProcess,
  type NotebookKnowledgeProcessErrorCode,
  type NotebookKnowledgeProcessResponse,
} from '../_shared/ai/knowledge/runNotebookKnowledgeProcess.ts';
import type { NotebookKnowledgeIngestDeps } from '../_shared/ai/knowledge/runNotebookKnowledgeIngest.ts';
import type {
  KnowledgeIndexDeps,
  SourceIndexMeta,
} from '../_shared/ai/knowledge/runKnowledgeIndex.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: NotebookKnowledgeProcessResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function httpStatusFor(code: NotebookKnowledgeProcessErrorCode): number {
  switch (code) {
    case 'unauthenticated':
      return 401;
    case 'auth_mismatch':
      return 403;
    case 'invalid_request':
    case 'not_notebook':
      return 400;
    case 'not_found':
    case 'notebook_page_not_found':
      return 404;
    case 'not_ready':
      return 409;
    case 'too_large':
      return 413;
    case 'no_extractable_text':
    case 'notebook_extract_failed':
    case 'notebook_codec_unsupported':
      return 422;
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

  try {
    if (req.method !== 'POST') {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'invalid_request',
            message: 'POST required.',
            class: 'permanent',
          },
        },
        405,
      );
    }

    const raw = await req.arrayBuffer();
    if (notebookKnowledgeProcessRequestBodyTooLarge(raw.byteLength)) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'invalid_request',
            message: 'Request too large.',
            class: 'permanent',
          },
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
          error: {
            code: 'invalid_request',
            message: 'Invalid JSON.',
            class: 'permanent',
          },
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'unauthenticated',
            message: 'Sign in required.',
            class: 'permanent',
          },
        },
        401,
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // M0.8E: authoritative page-source removal (soft-delete).
    if (
      body &&
      typeof body === 'object' &&
      (body as { action?: string }).action === 'remove_page_source'
    ) {
      const o = body as Record<string, unknown>;
      const sectionId = typeof o.sectionId === 'string' ? o.sectionId : '';
      const notebookObjectId =
        typeof o.notebookObjectId === 'string' ? o.notebookObjectId.trim() : '';
      const pageId = typeof o.pageId === 'string' ? o.pageId.trim() : '';
      if (!sectionId || !notebookObjectId || !pageId) {
        return jsonResponse(
          {
            version: 1,
            ok: false,
            error: {
              code: 'invalid_request',
              message: 'Invalid remove request.',
              class: 'permanent',
            },
          },
          400,
        );
      }
      const { data, error } = await admin.rpc('ai_knowledge_remove_notebook_page_source', {
        p_user_id: user.id,
        p_section_id: sectionId,
        p_notebook_object_id: notebookObjectId,
        p_page_id: pageId,
      });
      if (error) {
        return jsonResponse(
          {
            version: 1,
            ok: false,
            error: {
              code: 'internal_error',
              message: 'Could not remove Notebook knowledge source.',
              class: 'retryable',
            },
          },
          500,
        );
      }
      return new Response(JSON.stringify(data ?? { ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ingestDeps: NotebookKnowledgeIngestDeps = {
      loadOwnedNotebookFso: async ({ userId, sectionId, notebookObjectId }) => {
        const { data, error } = await admin
          .from('free_space_objects')
          .select('id, user_id, section_id, object')
          .eq('id', notebookObjectId)
          .maybeSingle();
        if (error || !data) return { ok: false, code: 'not_found' };
        if (data.user_id !== userId || data.section_id !== sectionId) {
          return { ok: false, code: 'auth_mismatch' };
        }
        const typ = (data.object as { type?: string } | null)?.type;
        if (typ !== 'notebook') return { ok: false, code: 'not_notebook' };
        return {
          ok: true,
          fso: {
            id: data.id,
            user_id: data.user_id,
            section_id: data.section_id,
            object: data.object,
          },
        };
      },
      beginNotebookPageIngest: async (input) => {
        const { data, error } = await admin.rpc('ai_knowledge_begin_notebook_page_ingest', {
          p_user_id: input.userId,
          p_section_id: input.sectionId,
          p_notebook_object_id: input.notebookObjectId,
          p_page_id: input.pageId,
          p_content_hash: input.contentHash,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          source_id?: string;
          source_version?: number;
          status?: string;
          idempotent?: boolean;
          retrieval_source_version?: number | null;
        };
      },
      finalizeIngest: async (input) => {
        const { data, error } = await admin.rpc('ai_knowledge_finalize_ingest', {
          p_source_id: input.sourceId,
          p_source_version: input.sourceVersion,
          p_status: input.status,
          p_error_code: input.errorCode ?? null,
          p_chunks: input.chunks ?? null,
          p_page_count: input.pageCount ?? null,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false }) as {
          ok: boolean;
          code?: string;
          source_id?: string;
          source_version?: number;
          status?: string;
          chunk_count?: number;
        };
      },
      invalidateNotebookPageCorpus: async (input) => {
        const { data, error } = await admin.rpc(
          'ai_knowledge_invalidate_notebook_page_corpus',
          {
            p_user_id: input.userId,
            p_section_id: input.sectionId,
            p_notebook_object_id: input.notebookObjectId,
            p_page_id: input.pageId,
          },
        );
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: true, cleared: false }) as {
          ok: boolean;
          cleared?: boolean;
          source_id?: string;
        };
      },
    };

    const apiKey = Deno.env.get('AI_EMBEDDING_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? '';
    const baseUrl = Deno.env.get('AI_EMBEDDING_BASE_URL') ?? 'https://api.openai.com/v1';
    const embeddingProvider = createOpenAICompatibleEmbeddingProvider({
      apiKey,
      baseUrl,
    });

    const indexDeps: Omit<KnowledgeIndexDeps, 'loadSourceForObject'> = {
      embeddingModel:
        Deno.env.get('AI_EMBEDDING_MODEL') ?? KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      embeddingDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      embeddingProvider,
      beginIndex: async (input) => {
        const { data, error } = await admin.rpc('ai_knowledge_begin_index', {
          p_source_id: input.sourceId,
          p_source_version: input.sourceVersion,
          p_embedding_model: input.embeddingModel,
          p_embedding_dimensions: input.embeddingDimensions,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false }) as {
          ok: boolean;
          code?: string;
          job_id?: string;
          source_version?: number;
        };
      },
      loadChunks: async ({ sourceId, sourceVersion }) => {
        const { data, error } = await admin
          .from('ai_knowledge_chunks')
          .select('id, page_number, chunk_index, text, source_version')
          .eq('source_id', sourceId)
          .eq('source_version', sourceVersion)
          .order('page_number', { ascending: true })
          .order('chunk_index', { ascending: true });
        if (error || !data) return [] as IndexableChunk[];
        return data as IndexableChunk[];
      },
      upsertEmbeddings: async (input) => {
        const { data, error } = await admin.rpc('ai_knowledge_upsert_embeddings', {
          p_source_id: input.sourceId,
          p_source_version: input.sourceVersion,
          p_job_id: input.jobId,
          p_embedding_model: input.embeddingModel,
          p_embedding_dimensions: input.embeddingDimensions,
          p_rows: input.rows.map((r) => ({
            chunk_id: r.chunkId,
            embedding: r.embedding,
          })),
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false }) as { ok: boolean; code?: string; upserted?: number };
      },
      finalizeIndexSuccess: async (input) => {
        const { data, error } = await admin.rpc('ai_knowledge_finalize_index_success', {
          p_source_id: input.sourceId,
          p_source_version: input.sourceVersion,
          p_job_id: input.jobId,
          p_embedding_model: input.embeddingModel,
          p_embedding_dimensions: input.embeddingDimensions,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false }) as {
          ok: boolean;
          code?: string;
          retrieval_source_version?: number | null;
        };
      },
      finalizeIndexFailure: async (input) => {
        const { data, error } = await admin.rpc('ai_knowledge_finalize_index_failure', {
          p_source_id: input.sourceId,
          p_source_version: input.sourceVersion,
          p_job_id: input.jobId,
          p_error_code: input.errorCode,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false }) as {
          ok: boolean;
          retrieval_source_version?: number | null;
        };
      },
    };

    const result = await runNotebookKnowledgeProcess({
      authUserId: user.id,
      body,
      deps: {
        ingest: ingestDeps,
        index: indexDeps,
        loadNotebookSource: async ({ userId, sectionId, notebookObjectId, pageId }) => {
          const { data, error } = await admin
            .from('ai_knowledge_sources')
            .select(
              'id, user_id, section_id, source_version, status, retrieval_source_version, source_kind, notebook_object_id, source_object_id',
            )
            .eq('source_kind', 'notebook_page')
            .eq('notebook_object_id', notebookObjectId)
            .eq('source_object_id', pageId)
            .eq('user_id', userId)
            .eq('section_id', sectionId)
            .maybeSingle();
          if (error || !data) return { ok: false, code: 'not_found' };
          if (data.status !== 'ready' && data.status !== 'stale') {
            return { ok: false, code: 'not_ready' };
          }

          const { data: vi } = await admin
            .from('ai_knowledge_version_index')
            .select('status, embedding_model, embedding_dimensions')
            .eq('source_id', data.id)
            .eq('source_version', data.source_version)
            .maybeSingle();

          const source: SourceIndexMeta = {
            sourceId: data.id,
            userId: data.user_id,
            sectionId: data.section_id,
            sourceVersion: data.source_version,
            status: data.status,
            retrievalSourceVersion: data.retrieval_source_version,
            indexStatus: (vi?.status as SourceIndexMeta['indexStatus']) ?? null,
            indexModel: vi?.embedding_model ?? null,
            indexDimensions: vi?.embedding_dimensions ?? null,
          };
          return { ok: true, source };
        },
      },
    });

    if (!result.ok) {
      return jsonResponse(result, httpStatusFor(result.error.code));
    }
    return jsonResponse(result, 200);
  } catch {
    return jsonResponse(
      {
        version: 1,
        ok: false,
        error: {
          code: 'internal_error',
          message: 'Notebook knowledge process failed.',
          class: 'retryable',
        },
      },
      500,
    );
  }
});

// Silence unused import warning in some Deno analyzers.
void KNOWLEDGE_MAX_REQUEST_BODY_BYTES;
