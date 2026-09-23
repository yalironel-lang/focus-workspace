/**
 * M1.0B B4 resume — real embeddings + normal Ask via STAGING Edge only.
 *
 * Requires staging secrets (names): AI_PROVIDER_API_KEY, AI_MODEL, AI_PROVIDER_BASE_URL.
 * Uses deployed ai-knowledge-process + ai-gateway on lmgrhmyurhjlwwdedojk.
 * Local OCR worker only (no Edge secret read; no fake embeddings).
 *
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingB4MvtEdgeResume.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ASK_COURSE_FINAL_HARD_MAX,
  ASK_COURSE_RPC_CANDIDATE_LIMIT,
} from '../../supabase/functions/_shared/ai/askCourse/bounds.ts';
import { filterAskCourseHitsWithDiagnostics } from '../../supabase/functions/_shared/ai/askCourse/retrievalPolicy.ts';
import type { KnowledgeSearchHit } from '../../supabase/functions/_shared/ai/askCourse/retrievalTypes.ts';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
  KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED,
} from '../../supabase/functions/_shared/ai/knowledge/bounds.ts';
import { meaningfulCharCount } from '../../supabase/functions/_shared/ai/knowledge/normalizeText.ts';
import { loadPdfJsModule } from '../../supabase/functions/_shared/ai/knowledge/loadPdfJs.ts';
import { decidePageRecoveryTrigger } from '../../supabase/functions/_shared/ai/knowledge/pageRecoveryPolicy.ts';
import { detectPageExtractionSuspicion } from '../../supabase/functions/_shared/ai/knowledge/detectPageExtractionSuspicion.ts';
import { scoreMvtTheoremEvidence } from './src/scoreMvtSemantic.ts';
import { createSupabaseTrustedLedger } from './src/supabaseTrustedLedger.ts';
import { claimAndProcessNextRecoveryJob } from './src/runClaimedRecoveryJob.ts';

const STAGING_REF = 'lmgrhmyurhjlwwdedojk';
const PRODUCTION_REF = 'comxmviofnotfwzbupxg';
const RUN_ID = `b4edge_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const MVT_PAGE = 3;
const ASK_QUESTION =
  'What is the Mean Value Theorem? State its conditions and mathematical conclusion.';
const HEALTHY_QUESTION =
  'What topics or headings appear early in this Mean Value Theorem lecture PDF?';
const REQUIRED_SECRETS = [
  'AI_PROVIDER_API_KEY',
  'AI_MODEL',
  'AI_PROVIDER_BASE_URL',
] as const;

const MVT_CANDIDATES = [
  '/Users/ylyrwnl/focus-dev/focus-main-notebook-ff/tmp/m10b4_mvt/1C_Mean_Value_Theorem.pdf',
  '/Users/ylyrwnl/Desktop/Calculus 2/1.C. Mean Value Theorem.pdf',
  '/Users/ylyrwnl/Downloads/1.C. Mean Value Theorem.pdf',
];

type Meta = Record<string, unknown>;
const report: Meta = {
  milestone: 'M1.0B B4 Edge Resume',
  runId: RUN_ID,
  stagingRef: STAGING_REF,
  productionWrites: 0,
  steps: [] as Meta[],
};

function step(name: string, data: Meta = {}) {
  const row = { name, ...data, at: new Date().toISOString() };
  (report.steps as Meta[]).push(row);
  console.log(JSON.stringify({ event: 'staging_b4_edge', ...row }));
}

function shortFrag(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
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
            out.push(JSON.parse(text.slice(i, j + 1)));
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

function listStagingSecretNames(): string[] {
  const r = spawnSync(
    'npx',
    ['supabase', 'secrets', 'list', '--project-ref', STAGING_REF],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 5 << 20 },
  );
  const text = (r.stdout || '') + (r.stderr || '');
  const objs = extractJsonObjects(text);
  const payload = objs.find((o) => Array.isArray(o.secrets));
  if (!payload) throw new Error('staging_secrets_list_parse_failed');
  return (payload.secrets as Array<{ name?: string }>)
    .map((s) => String(s.name ?? ''))
    .filter(Boolean)
    .sort();
}

function loadStagingKeys(): { url: string; serviceKey: string; anonKey: string } {
  const r = spawnSync(
    'npx',
    ['supabase', 'projects', 'api-keys', '--project-ref', STAGING_REF, '--output', 'json'],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 20 << 20 },
  );
  if (r.status !== 0) throw new Error('staging_keys_cli_failed');
  const objs = extractJsonObjects((r.stdout || '') + (r.stderr || ''));
  const service = objs.find((k) => k.id === 'service_role' || k.name === 'service_role');
  const anon = objs.find((k) => k.id === 'anon' || k.name === 'anon');
  const serviceKey = typeof service?.api_key === 'string' ? service.api_key : '';
  const anonKey = typeof anon?.api_key === 'string' ? anon.api_key : '';
  if (!serviceKey || serviceKey.length < 20) throw new Error('staging_service_role_missing');
  if (!anonKey || anonKey.length < 20) throw new Error('staging_anon_missing');
  return {
    url: `https://${STAGING_REF}.supabase.co`,
    serviceKey,
    anonKey,
  };
}

function findMvtPdf(): string {
  for (const p of MVT_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error('mvt_pdf_not_found_local');
}

async function invokeEdgeJson(input: {
  url: string;
  anonKey: string;
  accessToken: string;
  functionName: string;
  body: unknown;
}): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${input.url}/functions/v1/${input.functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      apikey: input.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { parseError: true, rawFrag: text.slice(0, 160) };
  }
  return { status: res.status, json };
}

async function drainUntilTerminal(
  sb: SupabaseClient,
  sourceId: string,
  sourceVersion: number,
  opts?: { requirePage3Recovered?: boolean },
): Promise<{
  processed: number;
  page3Status: string | null;
  page3Error: string | null;
}> {
  const ledger = createSupabaseTrustedLedger(sb as never, { projectRef: STAGING_REF });
  let processed = 0;
  for (let round = 0; round < 40; round++) {
    await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({ available_at: new Date(0).toISOString() })
      .eq('source_id', sourceId)
      .eq('source_version', sourceVersion)
      .eq('status', 'queued');

    const r = await claimAndProcessNextRecoveryJob({
      ledger,
      recoveryEnabled: true,
      log: (line) => console.log(line),
    });
    if (!r.processed) {
      const { data: open } = await sb
        .from('ai_knowledge_page_recovery_jobs')
        .select('id')
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion)
        .in('status', ['queued', 'claimed']);
      if (!open?.length) break;
      if (round > 30) break;
      continue;
    }
    processed += 1;
  }

  const { data: p3 } = await sb
    .from('ai_knowledge_page_recovery_jobs')
    .select('status,error_code')
    .eq('source_id', sourceId)
    .eq('source_version', sourceVersion)
    .eq('page_number', MVT_PAGE)
    .maybeSingle();

  if (opts?.requirePage3Recovered && p3?.status !== 'succeeded') {
    throw new Error(`page3_ocr_not_succeeded:${p3?.status ?? 'missing'}:${p3?.error_code ?? ''}`);
  }
  return {
    processed,
    page3Status: (p3?.status as string) ?? null,
    page3Error: (p3?.error_code as string) ?? null,
  };
}

function answerChecks(answer: string) {
  return {
    continuity: /continu/i.test(answer),
    differentiability: /differenti/i.test(answer),
    closedInterval: /\[.*a.*b.*\]|closed interval/i.test(answer),
    interiorPoint: /interior|\(a\s*,\s*b\)|there exists|point c/i.test(answer),
    derivativeRelation:
      /f\s*['′]\s*\(\s*c\s*\)|secant|\(f\s*\(\s*b\s*\)|f\(b\).*f\(a\).*b.*a/i.test(answer),
  };
}

async function main() {
  const linkedRef = spawnSync('cat', [`${process.cwd()}/supabase/.temp/project-ref`], {
    encoding: 'utf8',
  }).stdout?.trim();
  step('preflight', {
    linkedRef,
    staging: STAGING_REF,
    production: PRODUCTION_REF,
    recoveryEnabled: KNOWLEDGE_SELECTIVE_PAGE_RECOVERY_ENABLED,
  });

  const secretNames = listStagingSecretNames();
  const missing = REQUIRED_SECRETS.filter((n) => !secretNames.includes(n));
  step('phase1_secrets', {
    present: secretNames,
    required: [...REQUIRED_SECRETS],
    missing,
  });
  if (missing.length) {
    report.result = 'BLOCKED';
    console.log(JSON.stringify(report, null, 2));
    process.exit(3);
  }

  const pdfPath = findMvtPdf();
  const pdfBytes = new Uint8Array(readFileSync(pdfPath));
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  step('mvt_pdf_located', {
    pathKind: 'workspace_tmp_copy',
    byteLength: pdfBytes.byteLength,
    sha256Prefix: pdfHash.slice(0, 16),
    productionStorage: false,
  });

  const pdfjs = await loadPdfJsModule();
  const doc = await pdfjs.getDocument({
    data: pdfBytes.slice(),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
  const pageCount = doc.numPages;
  const page = await doc.getPage(MVT_PAGE);
  const content = await page.getTextContent();
  const items = content.items ?? [];
  const parts: string[] = [];
  for (const item of items) {
    if (item && typeof item === 'object' && 'str' in item && typeof (item as { str: unknown }).str === 'string') {
      parts.push((item as { str: string }).str);
    }
  }
  const nativeText = parts.join(' ').replace(/\s+/g, ' ').trim();
  const meaningfulChars = nativeText.replace(/\s+/g, '').length;
  const suspicion = detectPageExtractionSuspicion({
    pageNumber: MVT_PAGE,
    text: nativeText,
    itemCount: items.length,
    meaningfulChars,
    suspiciousUnicodeCount: 0,
  });
  const trigger = decidePageRecoveryTrigger(suspicion.reasons, { enabled: true });
  const nativeSemantic = scoreMvtTheoremEvidence(nativeText);
  step('phase1_page3_native', {
    pageCount,
    pageNumber: MVT_PAGE,
    itemCount: items.length,
    meaningfulChars,
    reasons: suspicion.reasons,
    autoRecover: trigger.autoRecover,
    decision: trigger.decision,
    nativeSemanticOverall: nativeSemantic.overall,
    nativeSemanticScore: nativeSemantic.score,
  });
  await doc.destroy?.();
  if (!trigger.autoRecover) {
    report.result = 'FAIL';
    step('fail_detector_gap', {});
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const keys = loadStagingKeys();
  if (keys.url.includes(PRODUCTION_REF)) throw new Error('refused_production_url');
  step('staging_keys', { urlHost: new URL(keys.url).host, edgeMode: true, lexicalFake: false });

  const sb = createClient(keys.url, keys.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string | null = null;
  let sectionId: string | null = null;
  let objectId: string | null = null;
  let sourceId: string | null = null;
  let storagePath: string | null = null;
  let userPassword: string | null = null;

  const cleanup = async () => {
    try {
      if (storagePath) await sb.storage.from('user-content').remove([storagePath]);
      if (sourceId) await sb.from('ai_knowledge_sources').delete().eq('id', sourceId);
      if (objectId) await sb.from('free_space_objects').delete().eq('id', objectId);
      if (sectionId) await sb.from('sections').delete().eq('id', sectionId);
      if (userId) await sb.auth.admin.deleteUser(userId);
      step('cleanup', { ok: true });
    } catch (e) {
      step('cleanup_error', {
        message: String(e instanceof Error ? e.message : e).slice(0, 160),
      });
    }
  };

  try {
    userPassword = randomUUID() + 'Aa1!';
    const created = await sb.auth.admin.createUser({
      email: `${RUN_ID}@staging.invalid`,
      password: userPassword,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(`create_user:${created.error?.message ?? 'unknown'}`);
    }
    userId = created.data.user.id;

    const userClient = createClient(keys.url, keys.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await userClient.auth.signInWithPassword({
      email: `${RUN_ID}@staging.invalid`,
      password: userPassword,
    });
    if (signed.error || !signed.data.session?.access_token) {
      throw new Error(`sign_in:${signed.error?.message ?? 'no_token'}`);
    }
    const accessToken = signed.data.session.access_token;

    sectionId = randomUUID();
    const { error: secErr } = await sb.from('sections').insert({
      id: sectionId,
      user_id: userId,
      title: `B4 Edge MVT ${RUN_ID}`,
    });
    if (secErr) throw new Error(`section:${secErr.message}`);

    objectId = `pdf_mvt_${RUN_ID}`;
    storagePath = `${userId}/${sectionId}/${objectId}/pdf/${objectId}`;
    const { error: fsoErr } = await sb.from('free_space_objects').insert({
      id: objectId,
      user_id: userId,
      section_id: sectionId,
      board_id: 'main',
      object: {
        type: 'pdf',
        content: { fileName: '1.C. Mean Value Theorem.pdf', pageCount },
      },
    });
    if (fsoErr) throw new Error(`fso:${fsoErr.message}`);

    const up = await sb.storage.from('user-content').upload(
      storagePath,
      new Blob([pdfBytes], { type: 'application/pdf' }),
      { contentType: 'application/pdf', upsert: true },
    );
    if (up.error) throw new Error(`upload:${up.error.message}`);
    const verify = await sb.storage.from('user-content').download(storagePath);
    if (verify.error || !verify.data) throw new Error('upload_verify_download_failed');
    const verifyBuf = new Uint8Array(await verify.data.arrayBuffer());
    const verifyHash = createHash('sha256').update(verifyBuf).digest('hex');
    step('storage_integrity', {
      uploadedBytes: pdfBytes.byteLength,
      downloadedBytes: verifyBuf.byteLength,
      shaMatch: verifyHash === pdfHash,
    });
    if (verifyHash !== pdfHash) throw new Error('storage_sha_mismatch_after_upload');

    const processBody = { version: 1, sectionId, sourceObjectId: objectId };

    // Edge process #1 → expect recovery_pending
    const proc1 = await invokeEdgeJson({
      url: keys.url,
      anonKey: keys.anonKey,
      accessToken,
      functionName: 'ai-knowledge-process',
      body: processBody,
    });
    step('process_initial_edge', {
      httpStatus: proc1.status,
      ok: proc1.json.ok === true,
      code:
        proc1.json.ok === true
          ? null
          : ((proc1.json.error as { code?: string } | undefined)?.code ??
            proc1.json.code ??
            null),
    });
    const proc1Code =
      proc1.json.ok === true
        ? null
        : String(
            (proc1.json.error as { code?: string } | undefined)?.code ??
              proc1.json.code ??
              '',
          );
    if (proc1Code !== 'recovery_pending') {
      throw new Error(`expected_recovery_pending_got:${proc1Code || proc1.status}`);
    }

    const srcRow = await sb
      .from('ai_knowledge_sources')
      .select('id,source_version,retrieval_source_version,page_count,file_name')
      .eq('source_object_id', objectId)
      .single();
    if (srcRow.error || !srcRow.data) throw new Error('source_row_missing');
    sourceId = srcRow.data.id as string;
    const tip = Number(srcRow.data.source_version);
    step('state_after_ingest', {
      tip,
      retrieval: srcRow.data.retrieval_source_version,
      pageCount: srcRow.data.page_count,
      fileName: srcRow.data.file_name,
    });

    const { data: jobs } = await sb
      .from('ai_knowledge_page_recovery_jobs')
      .select('page_number,status,detector_reasons')
      .eq('source_id', sourceId)
      .eq('source_version', tip)
      .order('page_number');
    const p3Job = (jobs ?? []).find((j) => j.page_number === MVT_PAGE);
    step('recovery_jobs', {
      count: jobs?.length ?? 0,
      pages: (jobs ?? []).map((j) => j.page_number),
      page3Present: Boolean(p3Job),
    });
    if (!p3Job) throw new Error('page3_job_not_enqueued');

    const drained = await drainUntilTerminal(sb, sourceId, tip, {
      requirePage3Recovered: true,
    });
    step('worker_drain', drained);

    const { data: page3 } = await sb
      .from('ai_knowledge_page_texts')
      .select(
        'page_number,native_text,recovered_text,canonical_text,extraction_method,fallback_result,source_version',
      )
      .eq('source_id', sourceId)
      .eq('source_version', tip)
      .eq('page_number', MVT_PAGE)
      .single();
    if (!page3) throw new Error('page3_row_missing');
    const recoveredLen = page3.recovered_text == null ? 0 : String(page3.recovered_text).length;
    const canonical = String(page3.canonical_text ?? '');
    const canonicalSemantic = scoreMvtTheoremEvidence(canonical);
    step('phase3_canonical', {
      nativeLen: String(page3.native_text ?? '').length,
      recoveredLen,
      canonicalLen: canonical.length,
      extractionMethod: page3.extraction_method,
      canonicalIsRecovered:
        page3.extraction_method === 'ocr_tesseract' &&
        page3.recovered_text != null &&
        page3.canonical_text === page3.recovered_text,
      semanticOverall: canonicalSemantic.overall,
      semanticScore: canonicalSemantic.score,
      canonicalFrag: shortFrag(canonical, 100),
    });
    if (page3.extraction_method !== 'ocr_tesseract' || recoveredLen < 1) {
      throw new Error('page3_ocr_or_canonical_selector_failed');
    }
    if (canonicalSemantic.overall !== 'PASS' || canonicalSemantic.score < 6) {
      throw new Error(`page3_canonical_semantic_insufficient:${canonicalSemantic.score}`);
    }

    // Edge process #2 → publish with REAL embeddings
    let proc2 = await invokeEdgeJson({
      url: keys.url,
      anonKey: keys.anonKey,
      accessToken,
      functionName: 'ai-knowledge-process',
      body: processBody,
    });
    for (
      let i = 0;
      i < 5 &&
      proc2.json.ok !== true &&
      String((proc2.json.error as { code?: string } | undefined)?.code) === 'recovery_pending';
      i++
    ) {
      await drainUntilTerminal(sb, sourceId, tip, { requirePage3Recovered: false });
      proc2 = await invokeEdgeJson({
        url: keys.url,
        anonKey: keys.anonKey,
        accessToken,
        functionName: 'ai-knowledge-process',
        body: processBody,
      });
    }
    step('process_publish_edge', {
      httpStatus: proc2.status,
      ok: proc2.json.ok === true,
      code:
        proc2.json.ok === true
          ? null
          : ((proc2.json.error as { code?: string } | undefined)?.code ?? null),
      resultFrag: shortFrag(JSON.stringify(proc2.json).slice(0, 240), 200),
    });
    if (proc2.json.ok !== true) {
      const code = String(
        (proc2.json.error as { code?: string } | undefined)?.code ?? 'unknown',
      );
      const msg = String(
        (proc2.json.error as { message?: string } | undefined)?.message ?? '',
      ).slice(0, 200);
      throw new Error(`publish_process:${code}:${msg}`);
    }

    const { data: meta } = await sb
      .from('ai_knowledge_sources')
      .select('source_version,retrieval_source_version,status')
      .eq('id', sourceId)
      .single();
    if (!meta || meta.retrieval_source_version !== meta.source_version) {
      throw new Error('retrieval_tip_mismatch_after_publish');
    }
    const publishedVersion = Number(meta.retrieval_source_version);

    const { data: vi } = await sb
      .from('ai_knowledge_version_index')
      .select('status,embedding_model,embedding_dimensions')
      .eq('source_id', sourceId)
      .eq('source_version', publishedVersion)
      .maybeSingle();
    const { data: p3Chunks } = await sb
      .from('ai_knowledge_chunks')
      .select('id,text,page_number')
      .eq('source_id', sourceId)
      .eq('source_version', publishedVersion)
      .eq('page_number', MVT_PAGE);
    const { count: embedCount } = await sb
      .from('ai_knowledge_embeddings')
      .select('chunk_id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('source_version', publishedVersion)
      .eq('embedding_model', KNOWLEDGE_EMBEDDING_MODEL_DEFAULT)
      .eq('embedding_dimensions', KNOWLEDGE_EMBEDDING_DIMENSIONS);

    const indexedJoined = (p3Chunks ?? []).map((c) => c.text).join('\n');
    const indexedSemantic = scoreMvtTheoremEvidence(indexedJoined);
    step('phase2_real_embeddings', {
      publishedVersion,
      indexStatus: vi?.status ?? null,
      embeddingModel: vi?.embedding_model ?? null,
      embeddingDimensions: vi?.embedding_dimensions ?? null,
      expectedModel: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      expectedDimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      page3ChunkCount: p3Chunks?.length ?? 0,
      embedCount: embedCount ?? 0,
      indexedSemanticOverall: indexedSemantic.overall,
      indexedSemanticScore: indexedSemantic.score,
    });
    if (vi?.status !== 'indexed') throw new Error('version_not_indexed');
    if (vi.embedding_model !== KNOWLEDGE_EMBEDDING_MODEL_DEFAULT) {
      throw new Error(`unexpected_embedding_model:${vi.embedding_model}`);
    }
    if (Number(vi.embedding_dimensions) !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
      throw new Error(`unexpected_embedding_dims:${vi.embedding_dimensions}`);
    }
    if ((p3Chunks?.length ?? 0) < 1 || (embedCount ?? 0) < 1) {
      throw new Error('missing_page3_chunks_or_embeddings');
    }
    if (indexedSemantic.overall !== 'PASS') {
      throw new Error('indexed_page3_lacks_theorem_evidence');
    }

    // Search plumbing with stored real page-3 embedding (no local provider key)
    const p3ChunkId = p3Chunks![0]!.id as string;
    const { data: p3EmbRow, error: embErr } = await sb
      .from('ai_knowledge_embeddings')
      .select('embedding,embedding_dimensions,embedding_model')
      .eq('chunk_id', p3ChunkId)
      .eq('source_version', publishedVersion)
      .single();
    if (embErr || !p3EmbRow?.embedding) throw new Error(`page3_embedding_load:${embErr?.message}`);
    const storedDims = Number(p3EmbRow.embedding_dimensions);
    if (storedDims !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
      throw new Error(`page3_embedding_dims:${storedDims}`);
    }
    const { data: searchRaw, error: searchErr } = await sb.rpc('ai_knowledge_search', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_query_embedding: p3EmbRow.embedding,
      p_limit: 8,
      p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      p_embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    });
    if (searchErr) throw new Error(`search:${searchErr.message}`);
    const hits = (Array.isArray(searchRaw) ? searchRaw : []) as Array<{
      source_id?: string;
      file_name?: string | null;
      page_number?: number;
      text?: string;
    }>;
    const page3Hits = hits.filter((h) => h.page_number === MVT_PAGE);
    const hitSemantic = scoreMvtTheoremEvidence(page3Hits.map((h) => h.text ?? '').join('\n'));
    step('phase2_retrieval_search', {
      hitCount: hits.length,
      allFromPublishedSource: hits.every((h) => h.source_id === sourceId),
      page3HitCount: page3Hits.length,
      topPages: hits.slice(0, 5).map((h) => h.page_number),
      mvtFileNamePresent: hits.some(
        (h) =>
          typeof h.file_name === 'string' &&
          (h.file_name.includes('Mean Value') || h.file_name.includes('1.C')),
      ),
      hitSemanticOverall: hitSemantic.overall,
      hitSemanticScore: hitSemantic.score,
      probe: 'stored_page3_real_embedding',
    });
    if (hits.length < 1 || page3Hits.length < 1 || hitSemantic.overall !== 'PASS') {
      throw new Error('retrieval_missing_page3_theorem_evidence');
    }
    if (!hits.every((h) => h.source_id === sourceId)) {
      throw new Error('n_n1_mixture_in_retrieval');
    }

    // Phase 3–4 — normal Ask via ai-gateway (real embed of question + generate)
    report.askQuestion = ASK_QUESTION;
    const askRes = await invokeEdgeJson({
      url: keys.url,
      anonKey: keys.anonKey,
      accessToken,
      functionName: 'ai-gateway',
      body: {
        version: 1,
        capability: 'ask_course',
        sectionId,
        question: ASK_QUESTION,
      },
    });
    step('phase3_ask_http', {
      httpStatus: askRes.status,
      ok: askRes.json.ok === true,
      errorCode:
        askRes.json.ok === true
          ? null
          : ((askRes.json.error as { code?: string } | undefined)?.code ?? null),
    });
    if (askRes.json.ok !== true) {
      const code = String(
        (askRes.json.error as { code?: string } | undefined)?.code ?? 'ask_failed',
      );
      const msg = String(
        (askRes.json.error as { message?: string } | undefined)?.message ?? '',
      ).slice(0, 200);
      throw new Error(`ask_failed:${code}:${msg}`);
    }
    const result = askRes.json.result as {
      type?: string;
      text?: string;
      sources?: Array<Record<string, unknown>>;
    };
    if (result?.type !== 'ask_course' || typeof result.text !== 'string') {
      throw new Error('ask_bad_result_type');
    }
    const answer = result.text;
    const sources = Array.isArray(result.sources) ? result.sources : [];
    const checks = answerChecks(answer);
    const citationOk = sources.some((s) => {
      if (s.sourceKind !== 'free_space_pdf') return false;
      const name = String(s.fileName ?? '');
      return name.includes('Mean Value') || name.includes('1.C') || s.pageNumber === MVT_PAGE;
    });
    const citedPage3 = sources.some(
      (s) => s.sourceKind === 'free_space_pdf' && s.pageNumber === MVT_PAGE,
    );
    const citedPageNumbers = sources
      .filter((s) => s.sourceKind === 'free_space_pdf')
      .map((s) => Number(s.pageNumber))
      .filter((n) => Number.isFinite(n));

    // Grounding: cited pages' indexed chunk text must contain theorem facts
    const { data: citedChunks } = await sb
      .from('ai_knowledge_chunks')
      .select('page_number,text')
      .eq('source_id', sourceId)
      .eq('source_version', publishedVersion)
      .in('page_number', citedPageNumbers.length ? citedPageNumbers : [MVT_PAGE]);
    const citedJoined = (citedChunks ?? []).map((c) => c.text).join('\n');
    const citedSemantic = scoreMvtTheoremEvidence(citedJoined);
    const page3AmongCited = citedPageNumbers.includes(MVT_PAGE);

    step('phase3_ask', {
      answerChars: answer.length,
      answerFrag: shortFrag(answer, 200),
      answerChecks: checks,
      sourceCount: sources.length,
      citationOk,
      citedPage3,
      page3AmongCited,
      citedSemanticOverall: citedSemantic.overall,
      citedSemanticScore: citedSemantic.score,
      sources: sources.map((s) =>
        s.sourceKind === 'free_space_pdf'
          ? { sourceKind: s.sourceKind, fileName: s.fileName, pageNumber: s.pageNumber }
          : { sourceKind: s.sourceKind, pageTitle: s.pageTitle },
      ),
    });

    const allAnswerOk = Object.values(checks).every(Boolean);
    if (!allAnswerOk) throw new Error('ask_missing_mvt_components');
    if (!citationOk || !citedPage3 || !page3AmongCited) {
      throw new Error('ask_citation_or_page3_failed');
    }
    if (citedSemantic.overall !== 'PASS') {
      throw new Error('ask_not_grounded_in_retrieved_evidence');
    }

    // Phase 5 — healthy native Ask
    const healthyRes = await invokeEdgeJson({
      url: keys.url,
      anonKey: keys.anonKey,
      accessToken,
      functionName: 'ai-gateway',
      body: {
        version: 1,
        capability: 'ask_course',
        sectionId,
        question: HEALTHY_QUESTION,
      },
    });
    const healthyOk = healthyRes.json.ok === true;
    const healthyResult = healthyRes.json.result as {
      type?: string;
      text?: string;
      sources?: Array<Record<string, unknown>>;
    };
    const healthySources = Array.isArray(healthyResult?.sources) ? healthyResult.sources : [];
    const healthyHasNativePage = healthySources.some(
      (s) =>
        s.sourceKind === 'free_space_pdf' &&
        typeof s.pageNumber === 'number' &&
        s.pageNumber !== MVT_PAGE &&
        ![10, 17, 18].includes(s.pageNumber as number),
    );
    step('phase5_healthy_ask', {
      httpStatus: healthyRes.status,
      ok: healthyOk,
      answerChars:
        healthyOk && healthyResult?.type === 'ask_course' && typeof healthyResult.text === 'string'
          ? healthyResult.text.length
          : 0,
      sourceCount: healthySources.length,
      healthyHasNativePage,
      sources: healthySources.map((s) =>
        s.sourceKind === 'free_space_pdf'
          ? { fileName: s.fileName, pageNumber: s.pageNumber }
          : { sourceKind: s.sourceKind },
      ),
    });
    if (!healthyOk || healthySources.length < 1) {
      throw new Error('healthy_ask_failed');
    }

    // B4.1 — question-rank diagnostics via staging embed probe (real embeddings)
    const { data: allChunks } = await sb
      .from('ai_knowledge_chunks')
      .select('page_number,chunk_index,text')
      .eq('source_id', sourceId)
      .eq('source_version', publishedVersion);
    const prefixedChunks = (allChunks ?? []).filter((c) =>
      String(c.text ?? '').includes(' — page '),
    );
    const page3Stored = String(
      (allChunks ?? []).find((c) => c.page_number === MVT_PAGE)?.text ?? '',
    );
    step('b41_stored_text', {
      chunkCount: allChunks?.length ?? 0,
      prefixedCount: prefixedChunks.length,
      page3Meaningful: meaningfulCharCount(page3Stored),
      page3HasPrefix: page3Stored.includes(' — page '),
      page3Frag: shortFrag(page3Stored, 100),
    });
    if (prefixedChunks.length > 0) {
      throw new Error('b41_stored_chunks_still_prefixed');
    }

    const probeRes = await fetch(`${keys.url}/functions/v1/ai-staging-embed-probe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.serviceKey}`,
        apikey: keys.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ texts: [ASK_QUESTION] }),
    });
    const probeJson = (await probeRes.json()) as {
      ok?: boolean;
      embeddings?: number[][];
      error?: string;
    };
    if (!probeJson.ok || !probeJson.embeddings?.[0]) {
      throw new Error(`b41_probe_embed:${probeJson.error ?? probeRes.status}`);
    }

    const { data: qSearchRaw, error: qSearchErr } = await sb.rpc('ai_knowledge_search', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_query_embedding: probeJson.embeddings[0],
      p_limit: ASK_COURSE_RPC_CANDIDATE_LIMIT,
      p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      p_embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    });
    if (qSearchErr) throw new Error(`b41_qsearch:${qSearchErr.message}`);
    const qRows = (Array.isArray(qSearchRaw) ? qSearchRaw : []) as Array<{
      source_id?: string;
      source_object_id?: string;
      file_name?: string | null;
      page_number?: number;
      chunk_index?: number;
      text?: string;
      similarity?: number;
    }>;
    const ranked = qRows.map((r, i) => ({
      rank: i + 1,
      page: r.page_number,
      similarity: r.similarity,
      hasPrefix: String(r.text ?? '').includes(' — page '),
      meaningful: meaningfulCharCount(String(r.text ?? '')),
      frag: shortFrag(String(r.text ?? ''), 60),
    }));
    const page3Rank = ranked.find((r) => r.page === MVT_PAGE)?.rank ?? null;
    const page3Sim = ranked.find((r) => r.page === MVT_PAGE)?.similarity ?? null;
    const sparsePages = [10, 17, 18].map((p) => ({
      page: p,
      rank: ranked.find((r) => r.page === p)?.rank ?? null,
      similarity: ranked.find((r) => r.page === p)?.similarity ?? null,
    }));
    const sparseBeatPage3 = sparsePages.some(
      (s) =>
        s.rank != null &&
        page3Rank != null &&
        s.rank < page3Rank,
    );

    const policyHits: KnowledgeSearchHit[] = qRows
      .filter((r) => r.source_id === sourceId)
      .map((r) => ({
        sourceKind: 'free_space_pdf' as const,
        sourceObjectId: String(r.source_object_id ?? objectId),
        notebookObjectId: null,
        fileName: r.file_name ?? null,
        pageNumber: Number(r.page_number ?? 0),
        chunkIndex: Number(r.chunk_index ?? 0),
        text: String(r.text ?? ''),
        similarity: Number(r.similarity ?? 0),
      }));
    const filtered = filterAskCourseHitsWithDiagnostics(policyHits);
    const page3InHardMax = filtered.chunks.some((c) => c.pageNumber === MVT_PAGE);
    const page3InTop8 = page3Rank != null && page3Rank <= 8;

    step('b41_question_rank', {
      hardMax: ASK_COURSE_FINAL_HARD_MAX,
      rpcLimit: ASK_COURSE_RPC_CANDIDATE_LIMIT,
      page3Rank,
      page3Sim,
      sparsePages,
      sparseBeatPage3,
      page3InHardMax,
      page3InTop8,
      finalPages: filtered.chunks.map((c) => c.pageNumber),
      rankedTop: ranked.slice(0, 12),
    });
    if (page3Rank == null) throw new Error('b41_page3_missing_from_question_search');
    if (sparseBeatPage3) throw new Error('b41_sparse_outranked_page3');
    if (!page3InHardMax) {
      throw new Error(
        `b41_page3_not_in_hard_max_${ASK_COURSE_FINAL_HARD_MAX}:rank=${page3Rank}:inTop8=${page3InTop8}`,
      );
    }

    report.result = 'PASS';
    report.askAnswerFrag = shortFrag(answer, 240);
    report.b41 = {
      page3Rank,
      page3Sim,
      sparsePages,
      page3InHardMax,
      hardMax: ASK_COURSE_FINAL_HARD_MAX,
    };
    step('done', {
      result: 'PASS',
      productionWrites: 0,
      sourceId,
      sectionId,
      userId,
    });
  } catch (e) {
    report.result = 'FAIL';
    step('failed', {
      message: String(e instanceof Error ? e.message : e).slice(0, 400),
    });
    await cleanup();
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
