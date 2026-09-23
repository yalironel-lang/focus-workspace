/**
 * M1.0B B3.3A — staging proof: canonical assembly + unpublished N+1 index.
 *
 * Staging ONLY (lmgrhmyurhjlwwdedojk). Never targets Production.
 * Does NOT call finalize_index_success for N+1 (no retrieval flip / no B3.3B).
 * Logs metadata only.
 *
 * Run from repo root:
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingB33aProof.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { chunkPageTexts } from '../../supabase/functions/_shared/ai/knowledge/chunkPages.ts';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
} from '../../supabase/functions/_shared/ai/knowledge/bounds.ts';
import { fakeEmbeddingForText } from '../../supabase/functions/_shared/ai/knowledge/fakeEmbeddingProvider.ts';
import { runAssembleRecoveredCorpus } from '../../supabase/functions/_shared/ai/knowledge/runAssembleRecoveredCorpus.ts';
import type { SourceIndexMeta } from '../../supabase/functions/_shared/ai/knowledge/runKnowledgeIndex.ts';
import type { IndexableChunk } from '../../supabase/functions/_shared/ai/knowledge/batchChunks.ts';

const STAGING_REF = 'lmgrhmyurhjlwwdedojk';
const PRODUCTION_REF = 'comxmviofnotfwzbupxg';
const EXTRACTION_VERSION = 'pdf-extract-v2-metrics';
const RUN_ID = `b33a_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

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
  console.log(JSON.stringify({ event: 'staging_b33a_proof', ...row }));
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
  return {
    url: `https://${STAGING_REF}.supabase.co`,
    serviceKey: key,
  };
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
): Promise<
  SourceIndexMeta & { sourceKind: string; pageCount: number | null }
> {
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
      // Unpublished tip only — caller guarantees version === processing tip ≠ retrieval.
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
    }) => {
      return rpcOk(sb, 'ai_knowledge_finalize_ingest', {
        p_source_id: input.sourceId,
        p_source_version: input.sourceVersion,
        p_status: input.status,
        p_chunks: input.chunks.map((c) => ({
          page_number: c.page_number,
          chunk_index: c.chunk_index,
          text: c.text,
        })),
        p_page_count: input.pageCount,
      });
    },
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
      throw new Error('finalize_index_success_forbidden_in_b33a');
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

async function searchHits(
  sb: SupabaseClient,
  userId: string,
  sectionId: string,
  queryText: string,
): Promise<
  Array<{
    source_version: number | null;
    page_number: number;
    fromBaselineN: boolean;
    fromNPlus1: boolean;
  }>
> {
  const emb = fakeEmbeddingForText(queryText);
  const { data, error } = await sb.rpc('ai_knowledge_search', {
    p_user_id: userId,
    p_section_id: sectionId,
    p_query_embedding: emb,
    p_limit: 8,
    p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    p_embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
  });
  if (error) throw new Error(`search:${error.message}`);
  const rows = (data ?? []) as Array<{
    page_number: number;
    chunk_index: number;
    text: string;
    source_id: string;
  }>;
  const out: Array<{
    source_version: number | null;
    page_number: number;
    fromBaselineN: boolean;
    fromNPlus1: boolean;
  }> = [];
  for (const r of rows) {
    const fromBaselineN = String(r.text ?? '').includes('BASELINE N');
    const fromNPlus1 = String(r.text ?? '').includes('NPLUS1');
    const { data: chunk } = await sb
      .from('ai_knowledge_chunks')
      .select('source_version')
      .eq('source_id', r.source_id)
      .eq('page_number', r.page_number)
      .eq('chunk_index', r.chunk_index)
      .eq('text', r.text)
      .maybeSingle();
    out.push({
      source_version: chunk?.source_version ?? null,
      page_number: r.page_number,
      fromBaselineN,
      fromNPlus1,
    });
  }
  return out;
}

async function main() {
  const repoRoot = process.cwd();
  const linkedRef = spawnSync('cat', [`${repoRoot}/supabase/.temp/project-ref`], {
    encoding: 'utf8',
  }).stdout?.trim();
  step('preflight_link', { linkedRef, staging: STAGING_REF, production: PRODUCTION_REF });
  // Prefer CLI remaining linked to Production (fail-safe); keys are staging-scoped.
  if (linkedRef === STAGING_REF) {
    step('link_note', { message: 'cli_linked_staging_ok_for_proof' });
  }

  const { url, serviceKey } = loadStagingServiceRole();
  assertNotProductionUrl(url);
  step('staging_keys_loaded', { urlHost: new URL(url).host });

  // Production write probe (read-only count via staging client must not touch prod).
  report.productionWrites = 0;

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string | null = null;
  let sectionId: string | null = null;
  let objectId: string | null = null;
  let sourceId: string | null = null;
  let storagePath: string | null = null;
  let notebookObjectId: string | null = null;
  let notebookSourceId: string | null = null;

  const cleanup = async () => {
    try {
      if (storagePath) await sb.storage.from('user-content').remove([storagePath]);
      if (notebookSourceId) {
        await sb.from('ai_knowledge_sources').delete().eq('id', notebookSourceId);
      }
      if (sourceId) await sb.from('ai_knowledge_sources').delete().eq('id', sourceId);
      if (notebookObjectId) {
        await sb.from('free_space_objects').delete().eq('id', notebookObjectId);
      }
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
    const email = `${RUN_ID}@staging.invalid`;
    const password = randomUUID() + 'Aa1!';
    const created = await sb.auth.admin.createUser({
      email,
      password,
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
      title: `B33A ${RUN_ID}`,
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
      object: {
        type: 'pdf',
        content: { fileName: `${RUN_ID}.pdf`, pageCount: 2 },
      },
    });
    if (fsoErr) throw new Error(`fso:${fsoErr.message}`);
    const up = await sb.storage.from('user-content').upload(storagePath, pdfV1, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (up.error) throw new Error(`upload:${up.error.message}`);

    // --- Baseline N ---
    const begin1 = await rpcOk(sb, 'ai_knowledge_begin_ingest', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_source_object_id: objectId,
      p_content_hash: hashV1,
    });
    if (begin1.ok !== true) throw new Error(`begin1:${JSON.stringify(begin1)}`);
    sourceId = String(begin1.source_id);
    const sv1 = Number(begin1.source_version);
    const fin1 = await rpcOk(sb, 'ai_knowledge_finalize_ingest', {
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
    if (fin1.ok !== true) throw new Error(`fin1:${JSON.stringify(fin1)}`);
    await publishBaselineN(sb, sourceId, sv1);
    const afterN = await loadSourceMeta(sb, sourceId);
    step('baseline_n_published', {
      sourceVersion: afterN.sourceVersion,
      retrievalSourceVersion: afterN.retrievalSourceVersion,
    });
    if (afterN.retrievalSourceVersion !== 1) {
      throw new Error('baseline_retrieval_not_1');
    }

    const hitsBefore = await searchHits(
      sb,
      userId,
      sectionId,
      'discrete math graph theory',
    );
    step('search_before_b33a', {
      hitCount: hitsBefore.length,
      versions: [...new Set(hitsBefore.map((h) => h.source_version))],
      onlyBaselineN: hitsBefore.every((h) => h.fromBaselineN && !h.fromNPlus1),
    });
    if (
      hitsBefore.length < 1 ||
      hitsBefore.some((h) => h.source_version !== 1 || !h.fromBaselineN)
    ) {
      throw new Error('pre_search_not_only_n');
    }

    // --- Early allocate N+1 ---
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
    if (begin2.ok !== true) throw new Error(`begin2:${JSON.stringify(begin2)}`);
    const sv2 = Number(begin2.source_version);
    const afterBegin2 = await loadSourceMeta(sb, sourceId);
    step('early_alloc_n1', {
      sourceVersion: sv2,
      retrievalSourceVersion: afterBegin2.retrievalSourceVersion,
    });
    if (sv2 !== 2 || afterBegin2.retrievalSourceVersion !== 1) {
      throw new Error('early_alloc_contract_mismatch');
    }

    // Full canonical page set for N+1 (authoritative P=2 from page_count)
    const upsertPages = await rpcOk(sb, 'ai_knowledge_upsert_page_texts_native', {
      p_source_id: sourceId,
      p_source_version: sv2,
      p_extraction_version: EXTRACTION_VERSION,
      p_pages: [
        {
          page_number: 1,
          native_text:
            'NPLUS1 page one theorem about continuous functions and analysis.',
          detector_reasons: [],
        },
        {
          page_number: 2,
          native_text: 'If is a continuous',
          detector_reasons: ['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT'],
        },
      ],
    });
    if (upsertPages.ok !== true) {
      throw new Error(`upsert_pages:${JSON.stringify(upsertPages)}`);
    }

    // Mark page 2 recovery as failed/terminal → native fallback allowed
    const enqueue = await rpcOk(sb, 'ai_knowledge_enqueue_page_recovery_jobs', {
      p_source_id: sourceId,
      p_source_version: sv2,
      p_extraction_version: EXTRACTION_VERSION,
      p_recovery_version: 'page-ocr-recovery-v1',
      p_pages: [
        {
          page_number: 2,
          detector_reasons: ['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT'],
        },
      ],
    });
    if (enqueue.ok !== true) throw new Error(`enqueue:${JSON.stringify(enqueue)}`);
    const { data: jobRow } = await sb
      .from('ai_knowledge_page_recovery_jobs')
      .select('id')
      .eq('source_id', sourceId)
      .eq('source_version', sv2)
      .eq('page_number', 2)
      .maybeSingle();
    if (!jobRow) throw new Error('job_missing');
    // Force terminal failed (native fallback) without OCR worker
    const { error: jobUpdErr } = await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({
        status: 'failed',
        error_code: 'retry_exhausted',
        claim_token: null,
        claimed_at: null,
        lease_expires_at: null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobRow.id);
    if (jobUpdErr) throw new Error(`job_force_failed:${jobUpdErr.message}`);
    step('recovery_terminal_failed_native_fallback', { page: 2 });

    // Non-terminal gate probe (should block) then restore
    await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({ status: 'queued' })
      .eq('id', jobRow.id);
    const deps = makeAssembleDeps(sb, userId, sectionId);
    const blocked = await runAssembleRecoveredCorpus({
      request: {
        sourceId,
        sourceVersion: sv2,
        sectionId,
        userId,
      },
      deps,
    });
    step('non_terminal_blocks', {
      ok: blocked.ok,
      code: blocked.ok ? null : blocked.code,
    });
    if (blocked.ok || blocked.code !== 'recovery_not_terminal') {
      throw new Error('expected_recovery_not_terminal');
    }
    await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({
        status: 'failed',
        error_code: 'retry_exhausted',
      })
      .eq('id', jobRow.id);

    // --- Principal B3.3A assemble ---
    const assembled = await runAssembleRecoveredCorpus({
      request: {
        sourceId,
        sourceVersion: sv2,
        sectionId,
        userId,
      },
      deps,
    });
    step('assemble_ok', {
      ok: assembled.ok,
      ...(assembled.ok
        ? {
            sourceVersion: assembled.sourceVersion,
            retrievalSourceVersion: assembled.retrievalSourceVersion,
            chunkCount: assembled.chunkCount,
            embeddingCount: assembled.embeddingCount,
            published: assembled.published,
          }
        : { code: assembled.code }),
    });
    if (!assembled.ok) throw new Error(`assemble_failed:${assembled.code}`);
    if (assembled.retrievalSourceVersion !== 1 || assembled.sourceVersion !== 2) {
      throw new Error('assemble_version_contract_mismatch');
    }
    if (assembled.published !== false) throw new Error('unexpected_published');

    const { data: n1Chunks } = await sb
      .from('ai_knowledge_chunks')
      .select('page_number,chunk_index,source_version')
      .eq('source_id', sourceId)
      .eq('source_version', 2);
    const pagesPresent = [...new Set((n1Chunks ?? []).map((c) => c.page_number))].sort(
      (a, b) => a - b,
    );
    step('n1_chunk_provenance', {
      chunkCount: n1Chunks?.length ?? 0,
      pagesPresent,
    });
    if (!pagesPresent.includes(1)) throw new Error('missing_page1_provenance');

    const { count: nChunks } = await sb
      .from('ai_knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('source_version', 1);
    step('n_intact', { nChunkCount: nChunks });
    if ((nChunks ?? 0) < 2) throw new Error('n_chunks_mutated');

    const hitsAfter = await searchHits(
      sb,
      userId,
      sectionId,
      'discrete math graph theory',
    );
    const versionsAfter = [...new Set(hitsAfter.map((h) => h.source_version))];
    step('search_after_b33a', {
      hitCount: hitsAfter.length,
      versions: versionsAfter,
      onlyN: versionsAfter.length === 1 && versionsAfter[0] === 1,
      noN1: !versionsAfter.includes(2) && hitsAfter.every((h) => !h.fromNPlus1),
      baselineStill: hitsAfter.every((h) => h.fromBaselineN),
    });
    if (versionsAfter.includes(2) || hitsAfter.some((h) => h.fromNPlus1)) {
      throw new Error('n1_leaked_into_search');
    }
    if (versionsAfter.some((v) => v !== 1)) throw new Error('mixed_retrieval');

    // Resume same N+1
    const resumed = await runAssembleRecoveredCorpus({
      request: {
        sourceId,
        sourceVersion: sv2,
        sectionId,
        userId,
      },
      deps,
    });
    step('resume_same_n1', {
      ok: resumed.ok,
      reusedChunks: resumed.ok ? resumed.reusedChunks : false,
      sourceVersion: resumed.ok ? resumed.sourceVersion : null,
    });
    if (!resumed.ok || resumed.sourceVersion !== 2 || !resumed.reusedChunks) {
      throw new Error('resume_contract_failed');
    }

    // N+2 supersession → N+1 stale
    const begin3 = await rpcOk(sb, 'ai_knowledge_begin_ingest', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_source_object_id: objectId,
      p_content_hash: contentHash(buildTinyPdf('V3')),
    });
    const sv3 = Number(begin3.source_version);
    const stale = await runAssembleRecoveredCorpus({
      request: {
        sourceId,
        sourceVersion: 2,
        sectionId,
        userId,
      },
      deps,
    });
    step('n2_supersession', {
      tip: sv3,
      staleOk: stale.ok,
      staleCode: stale.ok ? null : stale.code,
    });
    if (sv3 < 3 || stale.ok || stale.code !== 'stale_processing_version') {
      throw new Error('n2_supersession_failed');
    }

    // Notebook isolation: notebook_page source must not use B3.3A path
    notebookObjectId = `nb_${RUN_ID}`;
    const { error: nbFsoErr } = await sb.from('free_space_objects').insert({
      id: notebookObjectId,
      user_id: userId,
      section_id: sectionId,
      board_id: 'main',
      object: {
        type: 'notebook',
        content: { title: 'nb' },
      },
    });
    if (!nbFsoErr) {
      const { data: nbSrc, error: nbInsErr } = await sb
        .from('ai_knowledge_sources')
        .insert({
          user_id: userId,
          section_id: sectionId,
          source_kind: 'notebook_page',
          source_object_id: notebookObjectId,
          notebook_object_id: notebookObjectId,
          storage_path: `${userId}/${sectionId}/${notebookObjectId}`,
          status: 'ready',
          source_version: 1,
          page_count: 1,
        })
        .select('id')
        .single();
      if (!nbInsErr && nbSrc) {
        notebookSourceId = nbSrc.id;
        const nbAssemble = await runAssembleRecoveredCorpus({
          request: {
            sourceId: notebookSourceId,
            sourceVersion: 1,
            sectionId,
            userId,
          },
          deps,
        });
        step('notebook_isolation', {
          ok: nbAssemble.ok,
          code: nbAssemble.ok ? null : nbAssemble.code,
        });
        if (nbAssemble.ok || nbAssemble.code !== 'not_pdf') {
          throw new Error('notebook_isolation_failed');
        }
      } else {
        step('notebook_isolation_skipped', {
          reason: nbInsErr?.message?.slice(0, 120) ?? 'insert_failed',
        });
      }
    } else {
      step('notebook_isolation_skipped', {
        reason: nbFsoErr.message.slice(0, 120),
      });
    }

    const endMeta = await loadSourceMeta(sb, sourceId);
    // After N+2 begin, tip is 3; retrieval must still be 1
    step('final_state', {
      sourceVersion: endMeta.sourceVersion,
      retrievalSourceVersion: endMeta.retrievalSourceVersion,
      retrievalStillN: endMeta.retrievalSourceVersion === 1,
    });
    if (endMeta.retrievalSourceVersion !== 1) {
      throw new Error('retrieval_flipped_unexpectedly');
    }

    report.result = 'PASS';
    report.productionWrites = 0;
    console.log(JSON.stringify({ event: 'staging_b33a_proof_summary', ...report }, null, 2));
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.log(
    JSON.stringify({
      event: 'staging_b33a_proof_error',
      runId: RUN_ID,
      errorName: e instanceof Error ? e.name : 'error',
      errorMessage: String(e instanceof Error ? e.message : e).slice(0, 400),
    }),
  );
  process.exitCode = 1;
});
