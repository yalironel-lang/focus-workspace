/**
 * M1.0B B3.3B — staging proof: atomic retrieval publication.
 *
 * Staging ONLY (lmgrhmyurhjlwwdedojk). Never targets Production.
 *
 * Run from repo root:
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingB33bProof.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
} from '../../supabase/functions/_shared/ai/knowledge/bounds.ts';
import { detectPageExtractionSuspicion } from '../../supabase/functions/_shared/ai/knowledge/detectPageExtractionSuspicion.ts';
import { fakeEmbeddingForText } from '../../supabase/functions/_shared/ai/knowledge/fakeEmbeddingProvider.ts';
import { buildNativePageLedgerPlan } from '../../supabase/functions/_shared/ai/knowledge/persistNativePageLedger.ts';
import { runAssembleRecoveredCorpus } from '../../supabase/functions/_shared/ai/knowledge/runAssembleRecoveredCorpus.ts';
import { runPublishRecoveredCorpus } from '../../supabase/functions/_shared/ai/knowledge/runPublishRecoveredCorpus.ts';
import type { SourceIndexMeta } from '../../supabase/functions/_shared/ai/knowledge/runKnowledgeIndex.ts';
import type { IndexableChunk } from '../../supabase/functions/_shared/ai/knowledge/batchChunks.ts';
import { chunkPageTexts } from '../../supabase/functions/_shared/ai/knowledge/chunkPages.ts';

const STAGING_REF = 'lmgrhmyurhjlwwdedojk';
const PRODUCTION_REF = 'comxmviofnotfwzbupxg';
const RUN_ID = `b33b_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

type Meta = Record<string, unknown>;
const report: Meta = {
  runId: RUN_ID,
  stagingRef: STAGING_REF,
  productionWrites: 0,
  steps: [] as Meta[],
};

function step(name: string, data: Meta = {}) {
  const row = { name, ...data, at: new Date().toISOString() };
  (report.steps as Meta[]).push(row);
  console.log(JSON.stringify({ event: 'staging_b33b_proof', ...row }));
}

function extractJsonObjects(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (c === '\\') {
          esc = true;
          continue;
        }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            out.push(JSON.parse(text.slice(i, j + 1)) as Record<string, unknown>);
          } catch {
            /* ignore */
          }
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

function loadStagingServiceRole(): { url: string; serviceKey: string } {
  const r = spawnSync(
    'npx',
    ['supabase', 'projects', 'api-keys', '--project-ref', STAGING_REF, '--output', 'json'],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 20 << 20 },
  );
  if (r.status !== 0) throw new Error('staging_keys_cli_failed');
  const objs = extractJsonObjects((r.stdout || '') + (r.stderr || ''));
  const service = objs.find((k) => k.id === 'service_role' || k.name === 'service_role');
  const key = typeof service?.api_key === 'string' ? service.api_key : '';
  if (!key || key.length < 20) throw new Error('staging_service_role_missing');
  return { url: `https://${STAGING_REF}.supabase.co`, serviceKey: key };
}

function assertNotProductionUrl(url: string) {
  if (url.includes(PRODUCTION_REF)) throw new Error('refused_production_url');
  if (!url.includes(STAGING_REF)) throw new Error('url_not_staging');
}

function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function buildTinyPdf(label: string): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const c1 = `BT /F1 14 Tf 72 720 Td (${esc(`P1 ${label}`)}) Tj ET`;
  const c2 = `BT /F1 14 Tf 72 720 Td (${esc(`P2 ${label}`)}) Tj ET`;
  const objs: string[] = [];
  objs.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objs.push('2 0 obj<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>endobj\n');
  objs.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources<< /Font<< /F1 7 0 R >> >> >>endobj\n',
  );
  objs.push(
    '4 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources<< /Font<< /F1 7 0 R >> >> >>endobj\n',
  );
  objs.push(`5 0 obj<< /Length ${c1.length} >>stream\n${c1}\nendstream\nendobj\n`);
  objs.push(`6 0 obj<< /Length ${c2.length} >>stream\n${c2}\nendstream\nendobj\n`);
  objs.push('7 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += o;
  }
  const xrefStart = Buffer.byteLength(body, 'utf8');
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'utf8'));
}

async function rpcOk(sb: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`rpc_${fn}:${error.message}`);
  return data as Record<string, unknown>;
}

async function loadSourceMeta(
  sb: SupabaseClient,
  sourceId: string,
): Promise<SourceIndexMeta & { sourceKind: string; pageCount: number | null }> {
  const { data, error } = await sb
    .from('ai_knowledge_sources')
    .select(
      'id,user_id,section_id,source_version,status,retrieval_source_version,source_kind,page_count',
    )
    .eq('id', sourceId)
    .single();
  if (error || !data) throw new Error(`load_source:${error?.message ?? 'missing'}`);
  const { data: vi } = await sb
    .from('ai_knowledge_version_index')
    .select('status,embedding_model,embedding_dimensions')
    .eq('source_id', sourceId)
    .eq('source_version', data.source_version)
    .maybeSingle();
  return {
    sourceId: data.id,
    userId: data.user_id,
    sectionId: data.section_id,
    sourceVersion: data.source_version,
    status: data.status,
    retrievalSourceVersion: data.retrieval_source_version,
    indexStatus: (vi?.status as SourceIndexMeta['indexStatus']) ?? null,
    indexModel: vi?.embedding_model ?? null,
    indexDimensions: vi?.embedding_dimensions ?? null,
    sourceKind: data.source_kind,
    pageCount: data.page_count,
  };
}

async function publishBaselineN(
  sb: SupabaseClient,
  sourceId: string,
  sourceVersion: number,
): Promise<void> {
  const begin = await rpcOk(sb, 'ai_knowledge_begin_index', {
    p_source_id: sourceId,
    p_source_version: sourceVersion,
    p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    p_embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
  });
  if (begin.ok !== true || !begin.job_id) {
    throw new Error(`begin_index_n:${JSON.stringify(begin)}`);
  }
  const { data: chunks, error } = await sb
    .from('ai_knowledge_chunks')
    .select('id,text')
    .eq('source_id', sourceId)
    .eq('source_version', sourceVersion);
  if (error || !chunks?.length) throw new Error(`chunks_n:${error?.message ?? 'empty'}`);
  const rows = chunks.map((c) => ({
    chunk_id: c.id,
    embedding: fakeEmbeddingForText(String(c.text)),
  }));
  const up = await rpcOk(sb, 'ai_knowledge_upsert_embeddings', {
    p_source_id: sourceId,
    p_source_version: sourceVersion,
    p_job_id: begin.job_id,
    p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    p_embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    p_rows: rows,
  });
  if (up.ok !== true) throw new Error(`upsert_n:${JSON.stringify(up)}`);
  const fin = await rpcOk(sb, 'ai_knowledge_finalize_index_success', {
    p_source_id: sourceId,
    p_source_version: sourceVersion,
    p_job_id: begin.job_id,
    p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    p_embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
  });
  if (fin.ok !== true) throw new Error(`finalize_n:${JSON.stringify(fin)}`);
}

function makeAssembleDeps(sb: SupabaseClient, userId: string, sectionId: string) {
  return {
    embeddingModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    embeddingDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    embeddingProvider: {
      async embed(input: { model: string; dimensions: number; inputs: string[] }) {
        return {
          ok: true as const,
          embeddings: input.inputs.map((t) => fakeEmbeddingForText(t, input.dimensions)),
          model: input.model,
          dimensions: input.dimensions,
          usage: { inputTokens: 1 },
          latencyMs: 1,
          retryable: false,
        };
      },
    },
    loadSourceForObject: async () => ({ ok: false as const, code: 'not_found' as const }),
    loadSourceById: async (sourceId: string) => {
      const source = await loadSourceMeta(sb, sourceId);
      if (source.userId !== userId || source.sectionId !== sectionId) {
        return { ok: false as const, code: 'auth_mismatch' as const };
      }
      return { ok: true as const, source };
    },
    loadPageTexts: async (input: { sourceId: string; sourceVersion: number }) => {
      const { data, error } = await sb
        .from('ai_knowledge_page_texts')
        .select('source_id,source_version,page_number,canonical_text,detector_reasons')
        .eq('source_id', input.sourceId)
        .eq('source_version', input.sourceVersion)
        .order('page_number', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        sourceId: r.source_id,
        sourceVersion: r.source_version,
        pageNumber: r.page_number,
        canonicalText: r.canonical_text ?? '',
        detectorReasons: (r.detector_reasons as string[] | null) ?? [],
      }));
    },
    loadRecoveryJobs: async (input: { sourceId: string; sourceVersion: number }) => {
      const { data, error } = await sb
        .from('ai_knowledge_page_recovery_jobs')
        .select('page_number,status,detector_reasons')
        .eq('source_id', input.sourceId)
        .eq('source_version', input.sourceVersion);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        pageNumber: r.page_number,
        status: r.status,
        detectorReasons: (r.detector_reasons as string[] | null) ?? [],
      }));
    },
    countChunks: async (input: { sourceId: string; sourceVersion: number }) => {
      const { count, error } = await sb
        .from('ai_knowledge_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', input.sourceId)
        .eq('source_version', input.sourceVersion);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    deleteVersionChunks: async (input: { sourceId: string; sourceVersion: number }) => {
      const meta = await loadSourceMeta(sb, input.sourceId);
      if (meta.retrievalSourceVersion === input.sourceVersion) {
        throw new Error('refused_delete_published_version');
      }
      await sb
        .from('ai_knowledge_embeddings')
        .delete()
        .eq('source_id', input.sourceId)
        .eq('source_version', input.sourceVersion);
      await sb
        .from('ai_knowledge_chunks')
        .delete()
        .eq('source_id', input.sourceId)
        .eq('source_version', input.sourceVersion);
    },
    finalizeIngest: async (input: {
      sourceId: string;
      sourceVersion: number;
      status: 'ready';
      chunks: ReturnType<typeof chunkPageTexts>;
      pageCount: number;
    }) =>
      rpcOk(sb, 'ai_knowledge_finalize_ingest', {
        p_source_id: input.sourceId,
        p_source_version: input.sourceVersion,
        p_status: input.status,
        p_chunks: input.chunks.map((c) => ({
          page_number: c.page_number,
          chunk_index: c.chunk_index,
          text: c.text,
        })),
        p_page_count: input.pageCount,
      }),
    beginIndex: async (input: {
      sourceId: string;
      sourceVersion: number;
      embeddingModel: string;
      embeddingDimensions: number;
    }) =>
      rpcOk(sb, 'ai_knowledge_begin_index', {
        p_source_id: input.sourceId,
        p_source_version: input.sourceVersion,
        p_embedding_model: input.embeddingModel,
        p_embedding_dimensions: input.embeddingDimensions,
      }),
    loadChunks: async (input: {
      sourceId: string;
      sourceVersion: number;
    }): Promise<IndexableChunk[]> => {
      const { data, error } = await sb
        .from('ai_knowledge_chunks')
        .select('id,page_number,chunk_index,text,source_version')
        .eq('source_id', input.sourceId)
        .eq('source_version', input.sourceVersion)
        .order('page_number', { ascending: true })
        .order('chunk_index', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((c) => ({
        id: c.id,
        page_number: c.page_number,
        chunk_index: c.chunk_index,
        text: c.text,
        source_version: c.source_version,
      }));
    },
    upsertEmbeddings: async (input: {
      sourceId: string;
      sourceVersion: number;
      jobId: string;
      embeddingModel: string;
      embeddingDimensions: number;
      rows: Array<{ chunkId: string; embedding: number[] }>;
    }) =>
      rpcOk(sb, 'ai_knowledge_upsert_embeddings', {
        p_source_id: input.sourceId,
        p_source_version: input.sourceVersion,
        p_job_id: input.jobId,
        p_embedding_model: input.embeddingModel,
        p_embedding_dimensions: input.embeddingDimensions,
        p_rows: input.rows.map((r) => ({
          chunk_id: r.chunkId,
          embedding: r.embedding,
        })),
      }),
    finalizeIndexSuccess: async () => {
      throw new Error('finalize_index_success_forbidden_use_publish_rpc');
    },
    finalizeIndexFailure: async (input: {
      sourceId: string;
      sourceVersion: number;
      jobId: string;
      errorCode: string;
    }) =>
      rpcOk(sb, 'ai_knowledge_finalize_index_failure', {
        p_source_id: input.sourceId,
        p_source_version: input.sourceVersion,
        p_job_id: input.jobId,
        p_error_code: input.errorCode,
      }),
    countEmbeddings: async (input: {
      sourceId: string;
      sourceVersion: number;
      embeddingModel: string;
      embeddingDimensions: number;
    }) => {
      const { count, error } = await sb
        .from('ai_knowledge_embeddings')
        .select('chunk_id', { count: 'exact', head: true })
        .eq('source_id', input.sourceId)
        .eq('source_version', input.sourceVersion)
        .eq('embedding_model', input.embeddingModel)
        .eq('embedding_dimensions', input.embeddingDimensions);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    recoveryEnabled: true,
    allowResumeExistingChunks: true,
  };
}

async function searchTexts(
  sb: SupabaseClient,
  userId: string,
  sectionId: string,
  query: string,
): Promise<string[]> {
  const emb = fakeEmbeddingForText(query);
  const { data, error } = await sb.rpc('ai_knowledge_search', {
    p_user_id: userId,
    p_section_id: sectionId,
    p_query_embedding: emb,
    p_limit: 8,
    p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    p_embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
  });
  if (error) throw new Error(`search:${error.message}`);
  return ((data ?? []) as Array<{ text: string }>).map((r) => String(r.text ?? ''));
}

async function main() {
  const repoRoot = process.cwd();
  const linkedRef = spawnSync('cat', [`${repoRoot}/supabase/.temp/project-ref`], {
    encoding: 'utf8',
  }).stdout?.trim();
  step('preflight_link', { linkedRef, staging: STAGING_REF, production: PRODUCTION_REF });

  const { url, serviceKey } = loadStagingServiceRole();
  assertNotProductionUrl(url);
  step('staging_keys_loaded', { urlHost: new URL(url).host });
  report.productionWrites = 0;

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ensure publish RPC exists
  const probe = await sb.rpc('ai_knowledge_publish_recovered_corpus', {
    p_source_id: '00000000-0000-4000-8000-000000000000',
    p_expected_source_version: 1,
  });
  if (probe.error && /Could not find the function/i.test(probe.error.message)) {
    throw new Error('publish_rpc_missing_apply_019');
  }
  step('publish_rpc_present', { ok: true });

  let userId: string | null = null;
  let sectionId: string | null = null;
  let objectId: string | null = null;
  let sourceId: string | null = null;
  let storagePath: string | null = null;

  const cleanup = async () => {
    try {
      if (storagePath) await sb.storage.from('user-content').remove([storagePath]);
      if (sourceId) await sb.from('ai_knowledge_sources').delete().eq('id', sourceId);
      if (objectId) await sb.from('free_space_objects').delete().eq('id', objectId);
      if (sectionId) await sb.from('sections').delete().eq('id', sectionId);
      if (userId) await sb.auth.admin.deleteUser(userId);
      step('cleanup', { attempted: true, ok: true });
    } catch (e) {
      step('cleanup_error', {
        message: String(e instanceof Error ? e.message : e).slice(0, 160),
      });
    }
  };

  try {
    const created = await sb.auth.admin.createUser({
      email: `${RUN_ID}@staging.invalid`,
      password: randomUUID() + 'Aa1!',
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(`create_user:${created.error?.message ?? 'unknown'}`);
    }
    userId = created.data.user.id;
    sectionId = randomUUID();
    const { error: secErr } = await sb.from('sections').insert({
      id: sectionId,
      user_id: userId,
      title: `B33B ${RUN_ID}`,
    });
    if (secErr) throw new Error(`section:${secErr.message}`);

    objectId = `pdf_${RUN_ID}`;
    storagePath = `${userId}/${sectionId}/${objectId}/pdf/${objectId}`;
    const pdfV1 = buildTinyPdf('V1');
    const pdfV2 = buildTinyPdf('V2');
    const hashV1 = contentHash(pdfV1);
    const hashV2 = contentHash(pdfV2);

    const { error: fsoErr } = await sb.from('free_space_objects').insert({
      id: objectId,
      user_id: userId,
      section_id: sectionId,
      board_id: 'main',
      object: { type: 'pdf', content: { fileName: `${RUN_ID}.pdf`, pageCount: 2 } },
    });
    if (fsoErr) throw new Error(`fso:${fsoErr.message}`);
    await sb.storage.from('user-content').upload(storagePath, pdfV1, {
      contentType: 'application/pdf',
      upsert: true,
    });

    const begin1 = await rpcOk(sb, 'ai_knowledge_begin_ingest', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_source_object_id: objectId,
      p_content_hash: hashV1,
    });
    sourceId = String(begin1.source_id);
    const sv1 = Number(begin1.source_version);
    await rpcOk(sb, 'ai_knowledge_finalize_ingest', {
      p_source_id: sourceId,
      p_source_version: sv1,
      p_status: 'ready',
      p_chunks: [
        {
          page_number: 1,
          chunk_index: 0,
          text: 'BASELINE N chunk page one about discrete math.',
        },
        {
          page_number: 2,
          chunk_index: 0,
          text: 'BASELINE N chunk page two about graph theory.',
        },
      ],
      p_page_count: 2,
    });
    await publishBaselineN(sb, sourceId, sv1);

    await sb.storage.from('user-content').upload(storagePath, pdfV2, {
      contentType: 'application/pdf',
      upsert: true,
    });
    const begin2 = await rpcOk(sb, 'ai_knowledge_begin_ingest', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_source_object_id: objectId,
      p_content_hash: hashV2,
    });
    const sv2 = Number(begin2.source_version);
    const afterBegin = await loadSourceMeta(sb, sourceId);
    step('state_processing_n1', {
      sourceVersion: afterBegin.sourceVersion,
      retrievalSourceVersion: afterBegin.retrievalSourceVersion,
    });
    if (sv2 !== 2 || afterBegin.retrievalSourceVersion !== 1) {
      throw new Error('early_alloc_mismatch');
    }

    const extractedPages = [
      {
        pageNumber: 1,
        text: 'NPLUS1 published page one theorem about continuous analysis.',
        itemCount: 40,
        meaningfulChars: 70,
        suspiciousUnicodeCount: 0,
      },
      {
        pageNumber: 2,
        text: 'If is a continuous',
        itemCount: 8,
        meaningfulChars: 16,
        suspiciousUnicodeCount: 0,
      },
    ];
    const plan = buildNativePageLedgerPlan({
      pages: extractedPages,
      suspicionResults: extractedPages.map((p) => detectPageExtractionSuspicion(p)),
      recoveryEnabled: true,
    });
    await rpcOk(sb, 'ai_knowledge_upsert_page_texts_native', {
      p_source_id: sourceId,
      p_source_version: sv2,
      p_extraction_version: plan.extractionVersion,
      p_pages: plan.nativePages,
    });
    await rpcOk(sb, 'ai_knowledge_enqueue_page_recovery_jobs', {
      p_source_id: sourceId,
      p_source_version: sv2,
      p_extraction_version: plan.extractionVersion,
      p_recovery_version: plan.recoveryVersion,
      p_pages: plan.recoveryPages,
    });
    const { data: job } = await sb
      .from('ai_knowledge_page_recovery_jobs')
      .select('id')
      .eq('source_id', sourceId)
      .eq('source_version', sv2)
      .eq('page_number', 2)
      .maybeSingle();
    if (!job) throw new Error('job_missing');
    await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({
        status: 'failed',
        error_code: 'retry_exhausted',
        completed_at: new Date().toISOString(),
        claim_token: null,
        claimed_at: null,
        lease_expires_at: null,
      })
      .eq('id', job.id);

    const deps = makeAssembleDeps(sb, userId, sectionId);
    const assembled = await runAssembleRecoveredCorpus({
      request: {
        sourceId,
        sourceVersion: sv2,
        sectionId,
        userId,
      },
      deps,
    });
    if (!assembled.ok) throw new Error(`assemble:${assembled.code}`);
    step('assemble_unpublished', {
      sourceVersion: assembled.sourceVersion,
      retrievalSourceVersion: assembled.retrievalSourceVersion,
      chunkCount: assembled.chunkCount,
    });

    const beforeHits = await searchTexts(sb, userId, sectionId, 'discrete math graph theory');
    const beforeOnlyN =
      beforeHits.length > 0 &&
      beforeHits.every((t) => t.includes('BASELINE N')) &&
      beforeHits.every((t) => !t.includes('NPLUS1'));
    step('search_before_publish', {
      hitCount: beforeHits.length,
      onlyN: beforeOnlyN,
      retrieval: (await loadSourceMeta(sb, sourceId)).retrievalSourceVersion,
    });
    if (!beforeOnlyN) throw new Error('pre_publish_search_not_only_n');

    // Failed publication fixture: force non-terminal then reject
    await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({ status: 'queued', completed_at: null, error_code: null })
      .eq('id', job.id);
    const publishDeps = {
      loadSourceById: deps.loadSourceById,
      publishRecoveredCorpus: async (input: {
        sourceId: string;
        expectedSourceVersion: number;
      }) =>
        rpcOk(sb, 'ai_knowledge_publish_recovered_corpus', {
          p_source_id: input.sourceId,
          p_expected_source_version: input.expectedSourceVersion,
        }),
    };
    const rejected = await runPublishRecoveredCorpus({
      request: {
        sourceId,
        expectedSourceVersion: sv2,
        sectionId,
        userId,
      },
      deps: publishDeps,
    });
    const mid = await loadSourceMeta(sb, sourceId);
    step('reject_non_terminal', {
      ok: rejected.ok,
      code: rejected.ok ? null : rejected.code,
      retrievalStillN: mid.retrievalSourceVersion === 1,
    });
    if (rejected.ok || rejected.code !== 'recovery_not_terminal' || mid.retrievalSourceVersion !== 1) {
      throw new Error('reject_non_terminal_failed');
    }
    await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({
        status: 'failed',
        error_code: 'retry_exhausted',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // N+2 supersession BEFORE publish wins → publish(N+1) rejects; N stays active
    const begin3 = await rpcOk(sb, 'ai_knowledge_begin_ingest', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_source_object_id: objectId,
      p_content_hash: contentHash(buildTinyPdf('V3')),
    });
    const sv3 = Number(begin3.source_version);
    const stalePub = await runPublishRecoveredCorpus({
      request: {
        sourceId,
        expectedSourceVersion: sv2,
        sectionId,
        userId,
      },
      deps: publishDeps,
    });
    const afterStale = await loadSourceMeta(sb, sourceId);
    step('n2_blocks_unpublished_n1', {
      tip: sv3,
      ok: stalePub.ok,
      code: stalePub.ok ? null : stalePub.code,
      retrievalStillN: afterStale.retrievalSourceVersion === 1,
    });
    if (
      sv3 < 3 ||
      stalePub.ok ||
      stalePub.code !== 'stale_processing_version' ||
      afterStale.retrievalSourceVersion !== 1
    ) {
      throw new Error('n2_stale_publish_failed');
    }

    // Complete tip N+2 (=3) and publish that as the successful atomic flip
    const extractedV3 = [
      {
        pageNumber: 1,
        text: 'NPLUS1 published page one theorem about continuous analysis.',
        itemCount: 40,
        meaningfulChars: 70,
        suspiciousUnicodeCount: 0,
      },
      {
        pageNumber: 2,
        text: 'If is a continuous',
        itemCount: 8,
        meaningfulChars: 16,
        suspiciousUnicodeCount: 0,
      },
    ];
    const plan3 = buildNativePageLedgerPlan({
      pages: extractedV3,
      suspicionResults: extractedV3.map((p) => detectPageExtractionSuspicion(p)),
      recoveryEnabled: true,
    });
    await rpcOk(sb, 'ai_knowledge_upsert_page_texts_native', {
      p_source_id: sourceId,
      p_source_version: sv3,
      p_extraction_version: plan3.extractionVersion,
      p_pages: plan3.nativePages,
    });
    await rpcOk(sb, 'ai_knowledge_enqueue_page_recovery_jobs', {
      p_source_id: sourceId,
      p_source_version: sv3,
      p_extraction_version: plan3.extractionVersion,
      p_recovery_version: plan3.recoveryVersion,
      p_pages: plan3.recoveryPages,
    });
    const { data: job3 } = await sb
      .from('ai_knowledge_page_recovery_jobs')
      .select('id')
      .eq('source_id', sourceId)
      .eq('source_version', sv3)
      .eq('page_number', 2)
      .maybeSingle();
    if (!job3) throw new Error('job3_missing');
    await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({
        status: 'failed',
        error_code: 'retry_exhausted',
        completed_at: new Date().toISOString(),
        claim_token: null,
        claimed_at: null,
        lease_expires_at: null,
      })
      .eq('id', job3.id);

    const assembled3 = await runAssembleRecoveredCorpus({
      request: {
        sourceId,
        sourceVersion: sv3,
        sectionId,
        userId,
      },
      deps,
    });
    if (!assembled3.ok) throw new Error(`assemble3:${assembled3.code}`);
    step('assemble_tip3_unpublished', {
      sourceVersion: assembled3.sourceVersion,
      retrievalSourceVersion: assembled3.retrievalSourceVersion,
    });
    if (assembled3.retrievalSourceVersion !== 1) {
      throw new Error('tip3_assemble_flipped_retrieval');
    }

    const stillN = await searchTexts(sb, userId, sectionId, 'discrete math graph theory');
    if (!stillN.every((t) => t.includes('BASELINE N'))) {
      throw new Error('pre_final_publish_not_n');
    }

    // Atomic publish tip 3
    const published = await runPublishRecoveredCorpus({
      request: {
        sourceId,
        expectedSourceVersion: sv3,
        sectionId,
        userId,
      },
      deps: publishDeps,
    });
    step('publish_ok', {
      ok: published.ok,
      ...(published.ok
        ? {
            retrievalSourceVersion: published.retrievalSourceVersion,
            previous: published.previousRetrievalSourceVersion,
            alreadyPublished: published.alreadyPublished,
          }
        : { code: published.code }),
    });
    if (
      !published.ok ||
      published.retrievalSourceVersion !== 3 ||
      published.alreadyPublished ||
      published.previousRetrievalSourceVersion !== 1
    ) {
      throw new Error('publish_contract_failed');
    }

    const after = await loadSourceMeta(sb, sourceId);
    const { data: vi3 } = await sb
      .from('ai_knowledge_version_index')
      .select('status')
      .eq('source_id', sourceId)
      .eq('source_version', 3)
      .single();
    step('after_publish_state', {
      retrievalSourceVersion: after.retrievalSourceVersion,
      indexStatus: vi3?.status,
      tip: after.sourceVersion,
    });
    if (after.retrievalSourceVersion !== 3 || vi3?.status !== 'indexed') {
      throw new Error('post_publish_state_bad');
    }

    const afterHits = await searchTexts(
      sb,
      userId,
      sectionId,
      'continuous analysis theorem',
    );
    const afterOnlyNew =
      afterHits.length > 0 &&
      afterHits.every((t) => !t.includes('BASELINE N')) &&
      afterHits.some((t) => t.includes('NPLUS1') || t.includes('continuous'));
    step('search_after_publish', {
      hitCount: afterHits.length,
      onlyPublishedTip: afterOnlyNew,
      noBaseline: afterHits.every((t) => !t.includes('BASELINE N')),
    });
    if (!afterOnlyNew) throw new Error('post_publish_search_mixed_or_n');

    // N retained
    const { count: nChunks } = await sb
      .from('ai_knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('source_version', 1);
    const { count: nEmbeds } = await sb
      .from('ai_knowledge_embeddings')
      .select('chunk_id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('source_version', 1);
    step('n_retained', { nChunks, nEmbeds });
    if ((nChunks ?? 0) < 2 || (nEmbeds ?? 0) < 2) throw new Error('n_deleted');

    // Idempotent republish
    const again = await runPublishRecoveredCorpus({
      request: {
        sourceId,
        expectedSourceVersion: sv3,
        sectionId,
        userId,
      },
      deps: publishDeps,
    });
    step('idempotent_republish', {
      ok: again.ok,
      alreadyPublished: again.ok ? again.alreadyPublished : false,
    });
    if (!again.ok || !again.alreadyPublished) throw new Error('idempotent_failed');

    // Provenance on published tip
    const { data: tipChunks } = await sb
      .from('ai_knowledge_chunks')
      .select('page_number,source_version')
      .eq('source_id', sourceId)
      .eq('source_version', 3);
    const pages = [...new Set((tipChunks ?? []).map((c) => c.page_number))].sort(
      (a, b) => a - b,
    );
    step('provenance', { pagesPresent: pages });
    if (!pages.includes(1)) throw new Error('missing_page_provenance');

    report.result = 'PASS';
    report.productionWrites = 0;
    console.log(JSON.stringify({ event: 'staging_b33b_proof_summary', ...report }, null, 2));
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.log(
    JSON.stringify({
      event: 'staging_b33b_proof_error',
      runId: RUN_ID,
      errorName: e instanceof Error ? e.name : 'error',
      errorMessage: String(e instanceof Error ? e.message : e).slice(0, 400),
    }),
  );
  process.exitCode = 1;
});
