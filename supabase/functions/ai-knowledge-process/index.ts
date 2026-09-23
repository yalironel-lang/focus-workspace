/**
 * ZIKUK AI — ai-knowledge-process (M0.7A)
 *
 * Authenticated ingest → index orchestration via shared run* functions.
 * Does NOT HTTP-call ai-knowledge-ingest / ai-knowledge-index.
 *
 * DO NOT deploy until explicitly approved. No real provider calls in unit tests.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
  KNOWLEDGE_MAX_PDF_BYTES,
  KNOWLEDGE_MAX_REQUEST_BODY_BYTES,
  KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED,
  USER_CONTENT_BUCKET,
} from '../_shared/ai/knowledge/bounds.ts';
import type { IndexableChunk } from '../_shared/ai/knowledge/batchChunks.ts';
import type { KnowledgeChunk } from '../_shared/ai/knowledge/chunkPages.ts';
import {
  installPdfJsEdgeCompatGlobals,
  loadPdfJsModule,
} from '../_shared/ai/knowledge/loadPdfJs.ts';
import { createOpenAICompatibleEmbeddingProvider } from '../_shared/ai/knowledge/providerEmbeddings.ts';
import { formatKnowledgeProcessLogLine } from '../_shared/ai/knowledge/privacyLogProcess.ts';
import {
  knowledgeProcessRequestBodyTooLarge,
  runKnowledgeProcess,
  type KnowledgeProcessErrorCode,
  type KnowledgeProcessResponse,
} from '../_shared/ai/knowledge/runKnowledgeProcess.ts';
import type { KnowledgeIngestDeps } from '../_shared/ai/knowledge/runKnowledgeIngest.ts';
import type { KnowledgeIndexDeps } from '../_shared/ai/knowledge/runKnowledgeIndex.ts';
import type { FinalizeRecoveredPdfDeps } from '../_shared/ai/knowledge/runFinalizeRecoveredPdf.ts';
import type { SourceIndexMeta } from '../_shared/ai/knowledge/runKnowledgeIndex.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: KnowledgeProcessResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function httpStatusFor(code: KnowledgeProcessErrorCode): number {
  switch (code) {
    case 'unauthenticated':
      return 401;
    case 'auth_mismatch':
      return 403;
    case 'invalid_request':
    case 'not_pdf':
      return 400;
    case 'not_found':
      return 404;
    case 'not_ready':
    case 'recovery_pending':
      return 409;
    case 'too_large':
    case 'too_many_pages':
      return 413;
    case 'no_extractable_text':
    case 'extract_failed':
      return 422;
    case 'embedding_rate_limited':
    case 'embedding_quota_exceeded':
      return 429;
    case 'embedding_timeout':
      return 504;
    case 'stale_job':
    case 'stale_processing_version':
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
    if (knowledgeProcessRequestBodyTooLarge(raw.byteLength)) {
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

    let pdfjs;
    try {
      installPdfJsEdgeCompatGlobals();
      pdfjs = await loadPdfJsModule();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        formatKnowledgeProcessLogLine({
          event: 'knowledge_process_failed',
          requestId,
          stage: 'request',
          code: 'internal_error',
          latencyMs: Date.now() - started,
        }),
      );
      console.log(
        JSON.stringify({
          event: 'ai_knowledge_process_pdfjs_load',
          ok: false,
          message: msg,
        }),
      );
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'internal_error',
            message: `pdfjs_unavailable: ${msg}`,
          },
        },
        500,
      );
    }

    const ingestDeps: KnowledgeIngestDeps = {
      async loadOwnedPdfObject({ userId, sectionId, sourceObjectId }) {
        const { data: section, error: secErr } = await admin
          .from('sections')
          .select('id, user_id')
          .eq('id', sectionId)
          .maybeSingle();
        if (secErr || !section) return { ok: false, code: 'not_found' };
        if (section.user_id !== userId) return { ok: false, code: 'auth_mismatch' };

        const { data: fso, error: fsoErr } = await admin
          .from('free_space_objects')
          .select('id, user_id, section_id, object')
          .eq('id', sourceObjectId)
          .maybeSingle();
        if (fsoErr || !fso) return { ok: false, code: 'not_found' };
        if (fso.user_id !== userId || fso.section_id !== sectionId) {
          return { ok: false, code: 'auth_mismatch' };
        }
        const obj = fso.object as { type?: string } | null;
        if (!obj || obj.type !== 'pdf') return { ok: false, code: 'not_pdf' };
        return { ok: true, objectType: 'pdf' };
      },

      async downloadPdfBytes({ bucket, storagePath }) {
        if (bucket !== USER_CONTENT_BUCKET) {
          return { ok: false, code: 'internal_error' };
        }
        const { data, error } = await admin.storage.from(bucket).download(storagePath);
        if (error || !data) {
          const msg = error?.message ?? '';
          if (/not found|404/i.test(msg)) return { ok: false, code: 'not_found' };
          return { ok: false, code: 'internal_error' };
        }
        const buf = new Uint8Array(await data.arrayBuffer());
        if (buf.byteLength > KNOWLEDGE_MAX_PDF_BYTES) {
          return { ok: false, code: 'too_large' };
        }
        return { ok: true, bytes: buf };
      },

      async beginIngest({ userId, sectionId, sourceObjectId, contentHash }) {
        const { data, error } = await admin.rpc('ai_knowledge_begin_ingest', {
          p_user_id: userId,
          p_section_id: sectionId,
          p_source_object_id: sourceObjectId,
          p_content_hash: contentHash,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          source_id?: string;
          source_version?: number;
          status?: string;
          idempotent?: boolean;
        };
      },

      async finalizeIngest({ sourceId, sourceVersion, status, errorCode, chunks, pageCount }) {
        const { data, error } = await admin.rpc('ai_knowledge_finalize_ingest', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_status: status,
          p_error_code: errorCode ?? null,
          p_chunks: chunks ?? null,
          p_page_count:
            typeof pageCount === 'number' && pageCount >= 1 && pageCount <= 50
              ? pageCount
              : null,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          source_id?: string;
          source_version?: number;
          status?: string;
          chunk_count?: number;
          preserved_corpus?: boolean;
        };
      },

      async upsertPageTextsNative({ sourceId, sourceVersion, extractionVersion, pages }) {
        const { data, error } = await admin.rpc('ai_knowledge_upsert_page_texts_native', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_extraction_version: extractionVersion,
          p_pages: pages,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          page_count?: number;
        };
      },

      async enqueuePageRecoveryJobs({
        sourceId,
        sourceVersion,
        extractionVersion,
        recoveryVersion,
        pages,
      }) {
        if (pages.length === 0) {
          return { ok: true, enqueued: 0, already_present: 0 };
        }
        const { data, error } = await admin.rpc('ai_knowledge_enqueue_page_recovery_jobs', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_extraction_version: extractionVersion,
          p_recovery_version: recoveryVersion,
          p_pages: pages,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          enqueued?: number;
          already_present?: number;
        };
      },

      pdfjs,
    };

    const indexDeps: KnowledgeIndexDeps = {
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

    async function loadSourceMetaById(
      sourceId: string,
    ): Promise<
      | {
          ok: true;
          source: SourceIndexMeta & { sourceKind: string; pageCount: number | null };
        }
      | { ok: false; code: 'not_found' | 'auth_mismatch' }
    > {
      const { data: source, error } = await admin
        .from('ai_knowledge_sources')
        .select(
          'id, user_id, section_id, source_version, status, retrieval_source_version, source_kind, page_count, file_name',
        )
        .eq('id', sourceId)
        .maybeSingle();
      if (error || !source) return { ok: false, code: 'not_found' };
      const { data: vidx } = await admin
        .from('ai_knowledge_version_index')
        .select('status, embedding_model, embedding_dimensions')
        .eq('source_id', source.id)
        .eq('source_version', source.source_version)
        .maybeSingle();
      return {
        ok: true,
        source: {
          sourceId: source.id as string,
          userId: source.user_id as string,
          sectionId: source.section_id as string,
          sourceVersion: source.source_version as number,
          status: source.status as string,
          retrievalSourceVersion: (source.retrieval_source_version as number | null) ?? null,
          indexStatus: (vidx?.status as SourceIndexMeta['indexStatus']) ?? null,
          indexModel: (vidx?.embedding_model as string | null) ?? null,
          indexDimensions: (vidx?.embedding_dimensions as number | null) ?? null,
          sourceKind: source.source_kind as string,
          pageCount: (source.page_count as number | null) ?? null,
          fileName: (source.file_name as string | null) ?? null,
        },
      };
    }

    // B3.3C — assemble + 019 publish deps (used when selective recovery is enabled).
    const finalizeDeps: FinalizeRecoveredPdfDeps = {
      embeddingModel,
      embeddingDimensions,
      embeddingProvider: indexDeps.embeddingProvider,
      loadSourceForObject: indexDeps.loadSourceForObject,
      loadSourceById: loadSourceMetaById,
      async loadPageTexts({ sourceId, sourceVersion }) {
        const { data, error } = await admin
          .from('ai_knowledge_page_texts')
          .select('source_id, source_version, page_number, canonical_text, detector_reasons')
          .eq('source_id', sourceId)
          .eq('source_version', sourceVersion)
          .order('page_number', { ascending: true });
        if (error || !data) return [];
        return data.map((r) => ({
          sourceId: r.source_id as string,
          sourceVersion: r.source_version as number,
          pageNumber: r.page_number as number,
          canonicalText: (r.canonical_text as string | null) ?? '',
          detectorReasons: (r.detector_reasons as string[] | null) ?? [],
        }));
      },
      async loadRecoveryJobs({ sourceId, sourceVersion }) {
        const { data, error } = await admin
          .from('ai_knowledge_page_recovery_jobs')
          .select('page_number, status, detector_reasons')
          .eq('source_id', sourceId)
          .eq('source_version', sourceVersion);
        if (error || !data) return [];
        return data.map((r) => ({
          pageNumber: r.page_number as number,
          status: r.status as string,
          detectorReasons: (r.detector_reasons as string[] | null) ?? [],
        }));
      },
      async countChunks({ sourceId, sourceVersion }) {
        const { count, error } = await admin
          .from('ai_knowledge_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('source_id', sourceId)
          .eq('source_version', sourceVersion);
        if (error) return 0;
        return count ?? 0;
      },
      async deleteVersionChunks({ sourceId, sourceVersion }) {
        const loaded = await loadSourceMetaById(sourceId);
        if (
          loaded.ok &&
          loaded.source.retrievalSourceVersion === sourceVersion
        ) {
          throw new Error('refused_delete_published_version');
        }
        await admin
          .from('ai_knowledge_embeddings')
          .delete()
          .eq('source_id', sourceId)
          .eq('source_version', sourceVersion);
        await admin
          .from('ai_knowledge_chunks')
          .delete()
          .eq('source_id', sourceId)
          .eq('source_version', sourceVersion);
      },
      async finalizeIngest({ sourceId, sourceVersion, status, chunks, pageCount }) {
        const { data, error } = await admin.rpc('ai_knowledge_finalize_ingest', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_status: status,
          p_chunks: (chunks as KnowledgeChunk[]).map((c) => ({
            page_number: c.page_number,
            chunk_index: c.chunk_index,
            text: c.text,
          })),
          p_page_count: pageCount,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          source_version?: number;
          chunk_count?: number;
          code?: string;
        };
      },
      beginIndex: indexDeps.beginIndex,
      loadChunks: indexDeps.loadChunks,
      upsertEmbeddings: indexDeps.upsertEmbeddings,
      finalizeIndexSuccess: async () => {
        // Never publish via classic finalize on the recovered-corpus path.
        return { ok: false, code: 'internal_error' };
      },
      finalizeIndexFailure: indexDeps.finalizeIndexFailure,
      async countEmbeddings({ sourceId, sourceVersion, embeddingModel, embeddingDimensions }) {
        const { count, error } = await admin
          .from('ai_knowledge_embeddings')
          .select('chunk_id', { count: 'exact', head: true })
          .eq('source_id', sourceId)
          .eq('source_version', sourceVersion)
          .eq('embedding_model', embeddingModel)
          .eq('embedding_dimensions', embeddingDimensions);
        if (error) return 0;
        return count ?? 0;
      },
      recoveryEnabled: KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED,
      async publishRecoveredCorpus({ sourceId, expectedSourceVersion }) {
        const { data, error } = await admin.rpc('ai_knowledge_publish_recovered_corpus', {
          p_source_id: sourceId,
          p_expected_source_version: expectedSourceVersion,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          already_published?: boolean;
          source_id?: string;
          source_version?: number;
          retrieval_source_version?: number | null;
          previous_retrieval_source_version?: number | null;
          chunk_count?: number;
          page_count?: number;
        };
      },
    };

    void KNOWLEDGE_MAX_REQUEST_BODY_BYTES;

    const response = await runKnowledgeProcess({
      authUserId,
      body,
      deps: {
        ingest: {
          ...ingestDeps,
          recoveryEnabled: KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED,
        },
        index: indexDeps,
        finalize: finalizeDeps,
        onEvent: (event) => {
          console.log(
            formatKnowledgeProcessLogLine({
              ...event,
              requestId,
              latencyMs: Date.now() - started,
            }),
          );
        },
      },
    });

    if (!response.ok) {
      return jsonResponse(response, httpStatusFor(response.error.code));
    }
    return jsonResponse(response, 200);
  } catch {
    console.log(
      formatKnowledgeProcessLogLine({
        event: 'knowledge_process_failed',
        requestId,
        stage: 'request',
        code: 'internal_error',
        latencyMs: Date.now() - started,
      }),
    );
    return jsonResponse(
      {
        version: 1,
        ok: false,
        error: { code: 'internal_error', message: 'Unexpected server error.' },
      },
      500,
    );
  }
});
