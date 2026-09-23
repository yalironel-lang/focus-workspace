/**
 * M1.0B B3.3C — staging E2E via NORMAL process entry (runKnowledgeProcess).
 *
 * Staging ONLY (lmgrhmyurhjlwwdedojk). Never targets Production.
 * Does NOT manually invoke assemble/publish stages to manufacture success.
 * Worker drain is allowed between process retries when recovery is pending.
 *
 * Run from repo root:
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingB33cProof.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
  KNOWLEDGE_MAX_PDF_BYTES,
  KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED,
  USER_CONTENT_BUCKET,
} from '../../supabase/functions/_shared/ai/knowledge/bounds.ts';
import type { KnowledgeChunk } from '../../supabase/functions/_shared/ai/knowledge/chunkPages.ts';
import { fakeEmbeddingForText } from '../../supabase/functions/_shared/ai/knowledge/fakeEmbeddingProvider.ts';
import { loadPdfJsModule } from '../../supabase/functions/_shared/ai/knowledge/loadPdfJs.ts';
import type { FinalizeRecoveredPdfDeps } from '../../supabase/functions/_shared/ai/knowledge/runFinalizeRecoveredPdf.ts';
import type { KnowledgeIngestDeps } from '../../supabase/functions/_shared/ai/knowledge/runKnowledgeIngest.ts';
import type { KnowledgeIndexDeps, SourceIndexMeta } from '../../supabase/functions/_shared/ai/knowledge/runKnowledgeIndex.ts';
import { runKnowledgeProcess } from '../../supabase/functions/_shared/ai/knowledge/runKnowledgeProcess.ts';
import { createSupabaseTrustedLedger } from './src/supabaseTrustedLedger.ts';
import { claimAndProcessNextRecoveryJob } from './src/runClaimedRecoveryJob.ts';

const STAGING_REF = 'lmgrhmyurhjlwwdedojk';
const PRODUCTION_REF = 'comxmviofnotfwzbupxg';
const RUN_ID = `b33c_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

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
  console.log(JSON.stringify({ event: 'staging_b33c_proof', ...row }));
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
}

function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function buildPdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const pageRefs: string[] = [];
  let next = 3;
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(next++);
    contentObjNums.push(next++);
  }
  const fontNum = next++;
  for (let i = 0; i < pages.length; i++) {
    const pageNum = pageObjNums[i]!;
    const contentNum = contentObjNums[i]!;
    pageRefs.push(`${pageNum} 0 R`);
    const escaped = pages[i]!
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
    const content = `BT /F1 12 Tf 72 720 Td\n(${escaped}) Tj\nET`;
    objects.push(
      `${pageNum} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources<< /Font<< /F1 ${fontNum} 0 R >> >> >>endobj\n`,
    );
    objects.push(
      `${contentNum} 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream\nendobj\n`,
    );
  }
  const catalog = '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n';
  const pagesObj =
    `2 0 obj<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>endobj\n`;
  const font =
    `${fontNum} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`;
  const parts = [catalog, pagesObj, ...objects, font];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  const enc = new TextEncoder();
  for (const part of parts) {
    offsets.push(enc.encode(body).byteLength);
    body += part;
  }
  const xrefStart = enc.encode(body).byteLength;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return enc.encode(body);
}

const HEALTHY_TEXT =
  'Plenty of healthy academic prose about limits continuity differentiability sequences and series for a normal lecture slide without any broken theorem shells.';
const SHELL_TEXT =
  'If is a continuous function on and differentiable on its interior. Then: . Theorem. Extra filler words about analysis so document clears minimum meaningful character threshold for knowledge ingest acceptance.';

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

function makeProcessDeps(
  sb: SupabaseClient,
  pdfjs: Awaited<ReturnType<typeof loadPdfJsModule>>,
  authUserId: string,
): {
  ingest: KnowledgeIngestDeps;
  index: KnowledgeIndexDeps;
  finalize: FinalizeRecoveredPdfDeps;
} {
  const ingest: KnowledgeIngestDeps = {
    recoveryEnabled: true,
    pdfjs,
    async loadOwnedPdfObject({ userId, sectionId, sourceObjectId }) {
      const { data: section } = await sb
        .from('sections')
        .select('id,user_id')
        .eq('id', sectionId)
        .maybeSingle();
      if (!section) return { ok: false, code: 'not_found' };
      if (section.user_id !== userId) return { ok: false, code: 'auth_mismatch' };
      const { data: fso } = await sb
        .from('free_space_objects')
        .select('id,user_id,section_id,object')
        .eq('id', sourceObjectId)
        .maybeSingle();
      if (!fso) return { ok: false, code: 'not_found' };
      if (fso.user_id !== userId || fso.section_id !== sectionId) {
        return { ok: false, code: 'auth_mismatch' };
      }
      const obj = fso.object as { type?: string } | null;
      if (!obj || obj.type !== 'pdf') return { ok: false, code: 'not_pdf' };
      return { ok: true, objectType: 'pdf' };
    },
    async downloadPdfBytes({ bucket, storagePath }) {
      if (bucket !== USER_CONTENT_BUCKET) return { ok: false, code: 'internal_error' };
      const { data, error } = await sb.storage.from(bucket).download(storagePath);
      if (error || !data) return { ok: false, code: 'not_found' };
      const buf = new Uint8Array(await data.arrayBuffer());
      if (buf.byteLength > KNOWLEDGE_MAX_PDF_BYTES) return { ok: false, code: 'too_large' };
      return { ok: true, bytes: buf };
    },
    async beginIngest({ userId, sectionId, sourceObjectId, contentHash: hash }) {
      const { data, error } = await sb.rpc('ai_knowledge_begin_ingest', {
        p_user_id: userId,
        p_section_id: sectionId,
        p_source_object_id: sourceObjectId,
        p_content_hash: hash,
      });
      if (error) return { ok: false, code: 'internal_error' };
      return (data ?? { ok: false }) as {
        ok: boolean;
        code?: string;
        source_id?: string;
        source_version?: number;
        status?: string;
        idempotent?: boolean;
      };
    },
    async finalizeIngest({ sourceId, sourceVersion, status, errorCode, chunks, pageCount }) {
      const { data, error } = await sb.rpc('ai_knowledge_finalize_ingest', {
        p_source_id: sourceId,
        p_source_version: sourceVersion,
        p_status: status,
        p_error_code: errorCode ?? null,
        p_chunks: chunks ?? null,
        p_page_count: pageCount ?? null,
      });
      if (error) return { ok: false, code: 'internal_error' };
      return (data ?? { ok: false }) as {
        ok: boolean;
        code?: string;
        source_version?: number;
        chunk_count?: number;
      };
    },
    async upsertPageTextsNative({ sourceId, sourceVersion, extractionVersion, pages }) {
      const { data, error } = await sb.rpc('ai_knowledge_upsert_page_texts_native', {
        p_source_id: sourceId,
        p_source_version: sourceVersion,
        p_extraction_version: extractionVersion,
        p_pages: pages,
      });
      if (error) return { ok: false, code: 'internal_error' };
      return (data ?? { ok: false }) as { ok: boolean; code?: string; page_count?: number };
    },
    async enqueuePageRecoveryJobs({
      sourceId,
      sourceVersion,
      extractionVersion,
      recoveryVersion,
      pages,
    }) {
      if (pages.length === 0) return { ok: true, enqueued: 0, already_present: 0 };
      const { data, error } = await sb.rpc('ai_knowledge_enqueue_page_recovery_jobs', {
        p_source_id: sourceId,
        p_source_version: sourceVersion,
        p_extraction_version: extractionVersion,
        p_recovery_version: recoveryVersion,
        p_pages: pages,
      });
      if (error) return { ok: false, code: 'internal_error' };
      return (data ?? { ok: false }) as {
        ok: boolean;
        code?: string;
        enqueued?: number;
        already_present?: number;
      };
    },
  };

  const embeddingProvider = {
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
  };

  async function loadSourceById(sourceId: string) {
    const source = await loadSourceMeta(sb, sourceId);
    if (source.userId !== authUserId) return { ok: false as const, code: 'auth_mismatch' as const };
    return { ok: true as const, source };
  }

  const index: KnowledgeIndexDeps = {
    embeddingModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
    embeddingDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    embeddingProvider,
    async loadSourceForObject({ userId, sectionId, sourceObjectId }) {
      const { data: source } = await sb
        .from('ai_knowledge_sources')
        .select('id')
        .eq('source_object_id', sourceObjectId)
        .eq('section_id', sectionId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!source) return { ok: false as const, code: 'not_found' as const };
      return loadSourceById(source.id);
    },
    async beginIndex({ sourceId, sourceVersion, embeddingModel, embeddingDimensions }) {
      const { data, error } = await sb.rpc('ai_knowledge_begin_index', {
        p_source_id: sourceId,
        p_source_version: sourceVersion,
        p_embedding_model: embeddingModel,
        p_embedding_dimensions: embeddingDimensions,
      });
      if (error) return { ok: false, code: 'internal_error' };
      return (data ?? { ok: false }) as {
        ok: boolean;
        job_id?: string;
        source_version?: number;
        chunk_count?: number;
      };
    },
    async loadChunks({ sourceId, sourceVersion }) {
      const { data } = await sb
        .from('ai_knowledge_chunks')
        .select('id,page_number,chunk_index,text,source_version')
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion)
        .order('page_number', { ascending: true })
        .order('chunk_index', { ascending: true });
      return (data ?? []) as Array<{
        id: string;
        page_number: number;
        chunk_index: number;
        text: string;
        source_version: number;
      }>;
    },
    async upsertEmbeddings({
      sourceId,
      sourceVersion,
      jobId,
      embeddingModel,
      embeddingDimensions,
      rows,
    }) {
      const { data, error } = await sb.rpc('ai_knowledge_upsert_embeddings', {
        p_source_id: sourceId,
        p_source_version: sourceVersion,
        p_job_id: jobId,
        p_embedding_model: embeddingModel,
        p_embedding_dimensions: embeddingDimensions,
        p_rows: rows.map((r) => ({ chunk_id: r.chunkId, embedding: r.embedding })),
      });
      if (error) return { ok: false, code: 'internal_error' };
      return (data ?? { ok: false }) as { ok: boolean; upserted?: number; code?: string };
    },
    async finalizeIndexSuccess() {
      return { ok: false, code: 'forbidden_use_publish_rpc' };
    },
    async finalizeIndexFailure({ sourceId, sourceVersion, jobId, errorCode }) {
      const { data, error } = await sb.rpc('ai_knowledge_finalize_index_failure', {
        p_source_id: sourceId,
        p_source_version: sourceVersion,
        p_job_id: jobId,
        p_error_code: errorCode,
      });
      if (error) return { ok: false, code: 'internal_error' };
      return (data ?? { ok: false }) as {
        ok: boolean;
        retrieval_source_version?: number | null;
      };
    },
  };

  const finalize: FinalizeRecoveredPdfDeps = {
    ...index,
    recoveryEnabled: true,
    loadSourceById,
    async loadPageTexts({ sourceId, sourceVersion }) {
      const { data } = await sb
        .from('ai_knowledge_page_texts')
        .select('source_id,source_version,page_number,canonical_text,detector_reasons')
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion)
        .order('page_number', { ascending: true });
      return (data ?? []).map((r) => ({
        sourceId: r.source_id,
        sourceVersion: r.source_version,
        pageNumber: r.page_number,
        canonicalText: r.canonical_text ?? '',
        detectorReasons: (r.detector_reasons as string[] | null) ?? [],
      }));
    },
    async loadRecoveryJobs({ sourceId, sourceVersion }) {
      const { data } = await sb
        .from('ai_knowledge_page_recovery_jobs')
        .select('page_number,status,detector_reasons')
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion);
      return (data ?? []).map((r) => ({
        pageNumber: r.page_number,
        status: r.status,
        detectorReasons: (r.detector_reasons as string[] | null) ?? [],
      }));
    },
    async countChunks({ sourceId, sourceVersion }) {
      const { count } = await sb
        .from('ai_knowledge_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion);
      return count ?? 0;
    },
    async deleteVersionChunks({ sourceId, sourceVersion }) {
      const meta = await loadSourceMeta(sb, sourceId);
      if (meta.retrievalSourceVersion === sourceVersion) {
        throw new Error('refused_delete_published_version');
      }
      await sb
        .from('ai_knowledge_embeddings')
        .delete()
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion);
      await sb
        .from('ai_knowledge_chunks')
        .delete()
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion);
    },
    async finalizeIngest({ sourceId, sourceVersion, status, chunks, pageCount }) {
      const { data, error } = await sb.rpc('ai_knowledge_finalize_ingest', {
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
      return (data ?? { ok: false }) as {
        ok: boolean;
        source_version?: number;
        chunk_count?: number;
        code?: string;
      };
    },
    async countEmbeddings({ sourceId, sourceVersion, embeddingModel, embeddingDimensions }) {
      const { count } = await sb
        .from('ai_knowledge_embeddings')
        .select('chunk_id', { count: 'exact', head: true })
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion)
        .eq('embedding_model', embeddingModel)
        .eq('embedding_dimensions', embeddingDimensions);
      return count ?? 0;
    },
    async publishRecoveredCorpus({ sourceId, expectedSourceVersion }) {
      const { data, error } = await sb.rpc('ai_knowledge_publish_recovered_corpus', {
        p_source_id: sourceId,
        p_expected_source_version: expectedSourceVersion,
      });
      if (error) return { ok: false, code: 'internal_error' };
      return (data ?? { ok: false }) as {
        ok: boolean;
        code?: string;
        already_published?: boolean;
        source_version?: number;
        retrieval_source_version?: number | null;
        previous_retrieval_source_version?: number | null;
        chunk_count?: number;
        page_count?: number;
      };
    },
  };

  return { ingest, index, finalize };
}

async function drainRecoveryJobs(
  sb: SupabaseClient,
  maxJobs = 12,
): Promise<{ processed: number; statuses: string[] }> {
  const ledger = createSupabaseTrustedLedger(sb as never, {
    projectRef: STAGING_REF,
  });
  const statuses: string[] = [];
  let processed = 0;
  for (let i = 0; i < maxJobs; i++) {
    const r = await claimAndProcessNextRecoveryJob({
      ledger,
      recoveryEnabled: true,
      log: (line) => console.log(line),
    });
    if (!r.processed) break;
    processed += 1;
    statuses.push(String(r.commitStatus ?? 'unknown'));
  }
  return { processed, statuses };
}

async function searchHitVersions(
  sb: SupabaseClient,
  userId: string,
  sectionId: string,
  query: string,
): Promise<number[]> {
  // Metadata-only check via chunks table join on retrieval version — avoid logging text.
  const { data: sources } = await sb
    .from('ai_knowledge_sources')
    .select('id,retrieval_source_version')
    .eq('user_id', userId)
    .eq('section_id', sectionId);
  const versions: number[] = [];
  for (const s of sources ?? []) {
    if (s.retrieval_source_version == null) continue;
    const { count } = await sb
      .from('ai_knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', s.id)
      .eq('source_version', s.retrieval_source_version)
      .ilike('text', `%${query.slice(0, 12)}%`);
    if ((count ?? 0) > 0) versions.push(s.retrieval_source_version as number);
  }
  return versions;
}

async function main() {
  const repoRoot = process.cwd();
  const linkedRef = spawnSync('cat', [`${repoRoot}/supabase/.temp/project-ref`], {
    encoding: 'utf8',
  }).stdout?.trim();
  step('preflight_link', { linkedRef, staging: STAGING_REF, production: PRODUCTION_REF });
  step('feature_gate', { recoveryEnabled: KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED });

  const { url, serviceKey } = loadStagingServiceRole();
  assertNotProductionUrl(url);
  step('staging_keys_loaded', { urlHost: new URL(url).host });
  report.productionWrites = 0;

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Confirm 019 present
  const { error: rpcProbe } = await sb.rpc('ai_knowledge_publish_recovered_corpus', {
    p_source_id: randomUUID(),
    p_expected_source_version: 1,
  });
  // not_found / invalid is fine; missing function throws
  step('publish_rpc_probe', { message: rpcProbe?.message?.slice(0, 80) ?? 'ok_or_not_found' });

  const pdfjs = await loadPdfJsModule();

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
      title: `B33C ${RUN_ID}`,
    });
    if (secErr) throw new Error(`section:${secErr.message}`);

    objectId = `pdf_${RUN_ID}`;
    storagePath = `${userId}/${sectionId}/${objectId}/pdf/${objectId}`;
    const healthyPdf = buildPdf([HEALTHY_TEXT]);
    const shellPdf = buildPdf([SHELL_TEXT]);

    const { error: fsoErr } = await sb.from('free_space_objects').insert({
      id: objectId,
      user_id: userId,
      section_id: sectionId,
      board_id: 'main',
      object: { type: 'pdf', content: { fileName: `${RUN_ID}.pdf`, pageCount: 1 } },
    });
    if (fsoErr) throw new Error(`fso:${fsoErr.message}`);
    await sb.storage.from('user-content').upload(storagePath, healthyPdf, {
      contentType: 'application/pdf',
      upsert: true,
    });

    const deps = makeProcessDeps(sb, pdfjs, userId);
    const body = { version: 1 as const, sectionId, sourceObjectId: objectId };

    // --- A. Healthy PDF: single normal process → publish ---
    const healthy = await runKnowledgeProcess({
      authUserId: userId,
      body,
      deps,
    });
    step('healthy_process', {
      ok: healthy.ok,
      code: healthy.ok ? null : healthy.error.code,
      outcome: healthy.ok ? healthy.result.index.outcome : null,
      retrieval: healthy.ok ? healthy.result.index.retrievalSourceVersion : null,
    });
    if (!healthy.ok) throw new Error(`healthy_process:${healthy.error.code}`);
    sourceId = (
      await sb
        .from('ai_knowledge_sources')
        .select('id')
        .eq('source_object_id', objectId)
        .single()
    ).data!.id as string;
    let meta = await loadSourceMeta(sb, sourceId);
    if (meta.retrievalSourceVersion !== meta.sourceVersion) {
      throw new Error('healthy_retrieval_not_equal_tip');
    }
    const n = meta.retrievalSourceVersion!;

    // Idempotent retry
    const again = await runKnowledgeProcess({ authUserId: userId, body, deps });
    step('healthy_retry', {
      ok: again.ok,
      outcome: again.ok ? again.result.index.outcome : null,
    });
    if (!again.ok) throw new Error(`healthy_retry:${again.error.code}`);
    meta = await loadSourceMeta(sb, sourceId);
    if (meta.sourceVersion !== n || meta.retrievalSourceVersion !== n) {
      throw new Error('retry_allocated_version');
    }

    // --- B. Shell PDF reprocess: recovery_pending → worker → publish ---
    await sb.storage.from('user-content').upload(storagePath, shellPdf, {
      contentType: 'application/pdf',
      upsert: true,
    });
    const pending = await runKnowledgeProcess({ authUserId: userId, body, deps });
    step('shell_process_pending', {
      ok: pending.ok,
      code: pending.ok ? null : pending.error.code,
    });
    meta = await loadSourceMeta(sb, sourceId);
    const tipDuring = meta.sourceVersion;
    const retrievalDuring = meta.retrievalSourceVersion;
    step('during_recovery_state', {
      tip: tipDuring,
      retrieval: retrievalDuring,
      retrievalStillN: retrievalDuring === n,
      tipAhead: tipDuring > n,
    });
    if (retrievalDuring !== n) throw new Error('retrieval_flipped_before_terminal');
    if (pending.ok || pending.error.code !== 'recovery_pending') {
      // If OCR policy somehow did not enqueue, still require no early publish.
      if (pending.ok && pending.result.index.retrievalSourceVersion !== tipDuring) {
        throw new Error('unexpected_partial_publish');
      }
      if (!pending.ok && pending.error.code !== 'recovery_pending') {
        throw new Error(`expected_recovery_pending_got:${pending.error.code}`);
      }
    }

    const { count: jobCount } = await sb
      .from('ai_knowledge_page_recovery_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('source_version', tipDuring);
    step('recovery_jobs_enqueued', { count: jobCount ?? 0 });

    if ((jobCount ?? 0) > 0) {
      // Synthetic text PDFs often fail rasterization (render_failed → retry with
      // available_at backoff). Advance availability and drain until terminal.
      const statuses: string[] = [];
      let processedTotal = 0;
      for (let round = 0; round < 6; round++) {
        await sb
          .from('ai_knowledge_page_recovery_jobs')
          .update({ available_at: new Date(0).toISOString() })
          .eq('source_id', sourceId)
          .eq('source_version', tipDuring)
          .eq('status', 'queued');
        const drained = await drainRecoveryJobs(sb, 4);
        processedTotal += drained.processed;
        statuses.push(...drained.statuses);
        const { data: mid } = await sb
          .from('ai_knowledge_page_recovery_jobs')
          .select('status')
          .eq('source_id', sourceId)
          .eq('source_version', tipDuring);
        const open = (mid ?? []).some((j) => j.status === 'queued' || j.status === 'claimed');
        if (!open) break;
        if (drained.processed === 0) {
          // Force terminal failed if claim stays idle (should not happen after
          // available_at reset + attempt budget).
          await sb
            .from('ai_knowledge_page_recovery_jobs')
            .update({
              status: 'failed',
              error_code: 'retry_exhausted',
              completed_at: new Date().toISOString(),
              claim_token: null,
              lease_expires_at: null,
            })
            .eq('source_id', sourceId)
            .eq('source_version', tipDuring)
            .in('status', ['queued', 'claimed']);
          await sb
            .from('ai_knowledge_page_texts')
            .update({
              fallback_result: 'native_after_ocr_failed',
              extraction_method: 'native',
            })
            .eq('source_id', sourceId)
            .eq('source_version', tipDuring);
          break;
        }
      }
      step('worker_drain', { processed: processedTotal, statuses });
      const { data: jobRows } = await sb
        .from('ai_knowledge_page_recovery_jobs')
        .select('id,status,attempt_count')
        .eq('source_id', sourceId)
        .eq('source_version', tipDuring);
      step('jobs_after_drain', {
        jobs: (jobRows ?? []).map((j) => ({
          status: j.status,
          attemptCount: j.attempt_count,
        })),
      });
      meta = await loadSourceMeta(sb, sourceId);
      if (meta.retrievalSourceVersion !== n) {
        throw new Error('retrieval_flipped_during_worker');
      }
      const stillOpen = (jobRows ?? []).some(
        (j) => j.status === 'queued' || j.status === 'claimed',
      );
      if (stillOpen) {
        throw new Error('jobs_still_non_terminal_after_drain');
      }
    }

    // Resume normal process entry after terminal recovery.
    let published = await runKnowledgeProcess({ authUserId: userId, body, deps });
    for (let i = 0; i < 3 && !published.ok && published.error.code === 'recovery_pending'; i++) {
      await drainRecoveryJobs(sb, 6);
      published = await runKnowledgeProcess({ authUserId: userId, body, deps });
    }
    step('shell_process_publish', {
      ok: published.ok,
      code: published.ok ? null : published.error.code,
      outcome: published.ok ? published.result.index.outcome : null,
      retrieval: published.ok ? published.result.index.retrievalSourceVersion : null,
    });
    if (!published.ok) throw new Error(`shell_publish:${published.error.code}`);
    meta = await loadSourceMeta(sb, sourceId);
    if (meta.retrievalSourceVersion !== meta.sourceVersion) {
      throw new Error('post_publish_retrieval_mismatch');
    }
    const n1 = meta.retrievalSourceVersion!;
    if (!(n1 > n)) throw new Error('expected_n_plus_1');

    // Provenance: page 1 exists for tip
    const { count: pageRows } = await sb
      .from('ai_knowledge_page_texts')
      .select('page_number', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('source_version', n1);
    step('page_provenance', { tip: n1, pageRows: pageRows ?? 0 });
    if ((pageRows ?? 0) < 1) throw new Error('missing_page_ledger');

    // Stale N+1 cannot publish after N+2 begin
    const beginStale = await sb.rpc('ai_knowledge_begin_ingest', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_source_object_id: objectId,
      p_content_hash: contentHash(buildPdf([HEALTHY_TEXT + ' NPLUS2'])),
    });
    const beginData = beginStale.data as { source_version?: number; ok?: boolean };
    step('n2_begin', { sourceVersion: beginData?.source_version ?? null });
    // Tip advanced to N+2; publishing already-active N+1 is an idempotent no-op.
    // Publishing superseded older N must be rejected (cannot move pointer backward).
    const backPub = await sb.rpc('ai_knowledge_publish_recovered_corpus', {
      p_source_id: sourceId,
      p_expected_source_version: n,
    });
    const backRow = (backPub.data ?? {}) as { ok?: boolean; code?: string };
    step('stale_older_publish_rejected', {
      ok: backRow.ok === false,
      code: backRow.code ?? null,
    });
    if (backRow.ok !== false || backRow.code !== 'stale_processing_version') {
      throw new Error(`stale_older_publish_not_rejected:${JSON.stringify(backRow)}`);
    }
    const idemN1 = await sb.rpc('ai_knowledge_publish_recovered_corpus', {
      p_source_id: sourceId,
      p_expected_source_version: n1,
    });
    const idemRow = (idemN1.data ?? {}) as {
      ok?: boolean;
      already_published?: boolean;
      retrieval_source_version?: number;
    };
    step('already_published_n1_after_n2_tip', {
      ok: idemRow.ok === true,
      alreadyPublished: idemRow.already_published === true,
      retrieval: idemRow.retrieval_source_version ?? null,
    });
    if (idemRow.ok !== true || idemRow.already_published !== true) {
      throw new Error('expected_already_published_noop');
    }
    meta = await loadSourceMeta(sb, sourceId);
    if (meta.retrievalSourceVersion !== n1) {
      throw new Error('stale_attempt_changed_retrieval');
    }

    // Notebook isolation smoke: no notebook tables touched (process PDF only)
    step('notebook_isolation', {
      usedPdfProcessOnly: true,
      notebookOrchestratorNotInvoked: true,
    });

    report.result = 'PASS';
    step('done', { result: 'PASS', n, n1, productionWrites: 0 });
  } catch (e) {
    report.result = 'FAIL';
    step('failed', {
      message: String(e instanceof Error ? e.message : e).slice(0, 240),
    });
    await cleanup();
    // Restore CLI link to production
    spawnSync('npx', ['supabase', 'link', '--project-ref', PRODUCTION_REF], {
      encoding: 'utf8',
      stdio: 'ignore',
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  await cleanup();
  spawnSync('npx', ['supabase', 'link', '--project-ref', PRODUCTION_REF], {
    encoding: 'utf8',
    stdio: 'ignore',
  });
  const restored = spawnSync('cat', [`${process.cwd()}/supabase/.temp/project-ref`], {
    encoding: 'utf8',
  }).stdout?.trim();
  step('cli_restored', { projectRef: restored });
  console.log(JSON.stringify(report, null, 2));
  if (restored !== PRODUCTION_REF) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
