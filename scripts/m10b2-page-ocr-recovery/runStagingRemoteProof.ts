/**
 * M1.0B B3.2.1 — staging remote trusted OCR integration proof.
 *
 * Staging ONLY (lmgrhmyurhjlwwdedojk). Never targets Production.
 * Logs metadata only — no OCR/PDF/academic text, no secrets.
 *
 * Run:
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingRemoteProof.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PAGE_OCR_DEFAULT_DPI,
  PAGE_OCR_RECOVERY_VERSION,
} from './src/bounds.ts';
import {
  claimAndProcessNextRecoveryJob,
  processClaimedRecoveryJob,
} from './src/runClaimedRecoveryJob.ts';
import { createSupabaseTrustedLedger } from './src/supabaseTrustedLedger.ts';
import type { ClaimedRecoveryJob, TrustedRecoveryLedger } from './src/trustedJobTypes.ts';

const STAGING_REF = 'lmgrhmyurhjlwwdedojk';
const PRODUCTION_REF = 'comxmviofnotfwzbupxg';
const EXTRACTION_VERSION = 'pdf-extract-v2-metrics';
const RUN_ID = `b321_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const EXPECTED_PHRASE = `ZIKUKSYNTH${RUN_ID.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase()}`;

type Meta = Record<string, unknown>;
const report: Meta = { runId: RUN_ID, stagingRef: STAGING_REF, steps: [] as Meta[] };

function step(name: string, data: Meta = {}) {
  const row = { name, ...data, at: new Date().toISOString() };
  (report.steps as Meta[]).push(row);
  // metadata-only log
  console.log(JSON.stringify({ event: 'staging_remote_proof', ...row }));
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

/** Minimal 2-page PDF: page1 label + page2 large synthetic phrase (OCR target). */
function buildSyntheticPdf(phrase: string): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content1 = `BT /F1 18 Tf 72 720 Td (${esc('PAGE1 NATIVE OK')}) Tj ET`;
  const content2 = `BT /F1 28 Tf 72 700 Td (${esc(phrase)}) Tj ET`;
  const objs: string[] = [];
  objs.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objs.push(
    '2 0 obj<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>endobj\n',
  );
  objs.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources<< /Font<< /F1 7 0 R >> >> >>endobj\n',
  );
  objs.push(
    '4 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources<< /Font<< /F1 7 0 R >> >> >>endobj\n',
  );
  objs.push(
    `5 0 obj<< /Length ${content1.length} >>stream\n${content1}\nendstream\nendobj\n`,
  );
  objs.push(
    `6 0 obj<< /Length ${content2.length} >>stream\n${content2}\nendstream\nendobj\n`,
  );
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

function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function asLedgerClient(sb: SupabaseClient) {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await sb.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          const { data, error } = await sb.storage.from(bucket).download(path);
          return { data, error: error ? { message: error.message } : null };
        },
      }),
    },
    from: (table: string) => ({
      select: (cols: string) => {
        const builder = sb.from(table).select(cols);
        const wrap = (b: typeof builder) => ({
          eq: (col: string, val: unknown) => wrap(b.eq(col, val)),
          maybeSingle: async () => {
            const { data, error } = await b.maybeSingle();
            return { data, error: error ? { message: error.message } : null };
          },
          single: async () => {
            const { data, error } = await b.single();
            return { data, error: error ? { message: error.message } : null };
          },
        });
        return wrap(builder);
      },
    }),
  };
}

async function rpcOk(sb: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`rpc_${fn}:${error.message}`);
  return data as Record<string, unknown>;
}

async function main() {
  const linked = spawnSync('cat', ['supabase/.temp/project-ref'], {
    encoding: 'utf8',
    cwd: new URL('../../..', import.meta.url).pathname.replace(/\/$/, '') || process.cwd(),
  });
  // Resolve repo root relative to this file more reliably:
  const repoRoot = process.cwd();
  const linkedRef = spawnSync('cat', [`${repoRoot}/supabase/.temp/project-ref`], {
    encoding: 'utf8',
  })
    .stdout?.trim();
  step('preflight_link', { linkedRef, expectProd: PRODUCTION_REF });
  if (linkedRef !== PRODUCTION_REF) {
    throw new Error(`expected_cli_linked_production_got_${linkedRef}`);
  }

  const { url, serviceKey } = loadStagingServiceRole();
  assertNotProductionUrl(url);
  step('staging_keys_loaded', { urlHost: new URL(url).host, serviceKeyLen: serviceKey.length });

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Refuse constructing ledger against production
  try {
    createSupabaseTrustedLedger(asLedgerClient(sb), { projectRef: PRODUCTION_REF });
    throw new Error('production_guard_failed_to_throw');
  } catch (e) {
    step('production_ref_refused', {
      ok: String(e).includes('refuses_production_ref'),
    });
  }

  const ledger = createSupabaseTrustedLedger(asLedgerClient(sb), {
    projectRef: STAGING_REF,
    pdfBucket: 'user-content',
  });

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
      step('cleanup', { attempted: true });
    } catch (e) {
      step('cleanup_error', {
        message: String(e instanceof Error ? e.message : e).slice(0, 120),
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
    throw new Error(`create_user_failed:${created.error?.message ?? 'unknown'}`);
  }
  userId = created.data.user.id;
  step('user_created', { userIdPrefix: userId.slice(0, 8) });

  sectionId = randomUUID();
  const { error: secErr } = await sb.from('sections').insert({
    id: sectionId,
    user_id: userId,
    title: `B321 ${RUN_ID}`,
  });
  if (secErr) throw new Error(`section_insert:${secErr.message}`);
  step('section_created', { sectionIdPrefix: sectionId.slice(0, 8) });

  objectId = `pdf_${RUN_ID}`;
  storagePath = `${userId}/${sectionId}/${objectId}/pdf/${objectId}`;
  const pdfBytes = buildSyntheticPdf(EXPECTED_PHRASE);
  const hashV1 = contentHash(pdfBytes);
  // Second attempt hash = hash of slightly different PDF (page1 label tweak)
  const pdfBytesV2 = buildSyntheticPdf(EXPECTED_PHRASE + 'X');
  const hashV2 = contentHash(pdfBytesV2);

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
  if (fsoErr) throw new Error(`fso_insert:${fsoErr.message}`);

  const up = await sb.storage.from('user-content').upload(storagePath, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (up.error) throw new Error(`storage_upload:${up.error.message}`);
  step('fixture_uploaded', {
    objectId,
    storagePathParts: storagePath.split('/').length,
    pdfBytes: pdfBytes.byteLength,
    phraseLen: EXPECTED_PHRASE.length,
  });

  // --- First ingest → tip 1 corpus ---
  const begin1 = await rpcOk(sb, 'ai_knowledge_begin_ingest', {
    p_user_id: userId,
    p_section_id: sectionId,
    p_source_object_id: objectId,
    p_content_hash: hashV1,
  });
  if (begin1.ok !== true) throw new Error(`begin1:${JSON.stringify(begin1)}`);
  sourceId = String(begin1.source_id);
  const sv1 = Number(begin1.source_version);
  step('begin_v1', { sourceIdPrefix: sourceId.slice(0, 8), sourceVersion: sv1 });

  const fin1 = await rpcOk(sb, 'ai_knowledge_finalize_ingest', {
    p_source_id: sourceId,
    p_source_version: sv1,
    p_status: 'ready',
    p_chunks: [
      { page_number: 1, chunk_index: 0, text: 'PAGE1 NATIVE CHUNK V1' },
      { page_number: 2, chunk_index: 0, text: 'PAGE2 SPARSE NATIVE V1' },
    ],
    p_page_count: 2,
  });
  if (fin1.ok !== true) throw new Error(`finalize1:${JSON.stringify(fin1)}`);

  // Publish retrieval pointer N=1 for Option A lag proof (test fixture only; not B3.3 product path)
  const { error: retErr } = await sb
    .from('ai_knowledge_sources')
    .update({ retrieval_source_version: 1 })
    .eq('id', sourceId);
  if (retErr) throw new Error(`set_retrieval:${retErr.message}`);

  const { data: beforeReplace } = await sb
    .from('ai_knowledge_sources')
    .select('source_version,retrieval_source_version,status')
    .eq('id', sourceId)
    .single();
  step('state_before_n1_processing', {
    sourceVersion: beforeReplace?.source_version,
    retrievalSourceVersion: beforeReplace?.retrieval_source_version,
    status: beforeReplace?.status,
  });

  // Upload v2 bytes to same authoritative path (replacement content)
  const up2 = await sb.storage.from('user-content').upload(storagePath, pdfBytesV2, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (up2.error) throw new Error(`storage_upload_v2:${up2.error.message}`);

  // --- Replacement begin → early allocate N+1 ---
  const begin2 = await rpcOk(sb, 'ai_knowledge_begin_ingest', {
    p_user_id: userId,
    p_section_id: sectionId,
    p_source_object_id: objectId,
    p_content_hash: hashV2,
  });
  if (begin2.ok !== true) throw new Error(`begin2:${JSON.stringify(begin2)}`);
  const sv2 = Number(begin2.source_version);
  const { data: afterBegin2 } = await sb
    .from('ai_knowledge_sources')
    .select('source_version,retrieval_source_version,status,pending_content_hash')
    .eq('id', sourceId)
    .single();
  step('begin_v2_early_alloc', {
    sourceVersion: sv2,
    retrievalSourceVersion: afterBegin2?.retrieval_source_version,
    status: afterBegin2?.status,
    idempotent: begin2.idempotent === true,
    allocatedNPlus1: sv2 === 2,
    retrievalStillN: afterBegin2?.retrieval_source_version === 1,
  });
  if (sv2 !== 2 || afterBegin2?.retrieval_source_version !== 1) {
    throw new Error('early_source_version_contract_mismatch');
  }

  // Same-hash resume must not bump
  const begin2b = await rpcOk(sb, 'ai_knowledge_begin_ingest', {
    p_user_id: userId,
    p_section_id: sectionId,
    p_source_object_id: objectId,
    p_content_hash: hashV2,
  });
  step('same_hash_resume', {
    sourceVersion: begin2b.source_version,
    idempotent: begin2b.idempotent === true,
  });
  if (begin2b.idempotent !== true || Number(begin2b.source_version) !== 2) {
    throw new Error('same_hash_resume_bumped');
  }

  // Native page evidence for processing tip N+1 (sparse native on page 2)
  const upsert = await rpcOk(sb, 'ai_knowledge_upsert_page_texts_native', {
    p_source_id: sourceId,
    p_source_version: sv2,
    p_extraction_version: EXTRACTION_VERSION,
    p_pages: [
      {
        page_number: 2,
        native_text: 'If is a continuous',
        detector_reasons: ['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT'],
      },
    ],
  });
  if (upsert.ok !== true) throw new Error(`upsert:${JSON.stringify(upsert)}`);

  const enqueue = await rpcOk(sb, 'ai_knowledge_enqueue_page_recovery_jobs', {
    p_source_id: sourceId,
    p_source_version: sv2,
    p_extraction_version: EXTRACTION_VERSION,
    p_recovery_version: PAGE_OCR_RECOVERY_VERSION,
    p_pages: [
      {
        page_number: 2,
        detector_reasons: ['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT'],
      },
    ],
  });
  if (enqueue.ok !== true) throw new Error(`enqueue:${JSON.stringify(enqueue)}`);
  step('enqueued', {
    enqueued: enqueue.enqueued,
    alreadyPresent: enqueue.already_present,
    sourceVersion: sv2,
  });

  // --- A. Concurrent claim ---
  const [c1, c2] = await Promise.all([ledger.claimJob(), ledger.claimJob()]);
  const owners = [c1, c2].filter((c) => c.ok && c.job);
  step('concurrent_claim', {
    claim1Ok: c1.ok,
    claim2Ok: c2.ok,
    claim1HasJob: !!(c1.ok && c1.job),
    claim2HasJob: !!(c2.ok && c2.job),
    singleOwner: owners.length === 1,
  });
  if (owners.length !== 1 || !c1.ok || !c1.job) {
    // If c2 won, use that job
  }
  const winner = (c1.ok && c1.job ? c1.job : c2.ok && c2.job ? c2.job : null) as
    | ClaimedRecoveryJob
    | null;
  if (!winner || owners.length !== 1) throw new Error('concurrent_claim_unexpected');

  // Path injection: ledger download must reject
  const inj = await ledger.downloadPdfByStoragePath('https://evil.example/x.pdf');
  const inj2 = await ledger.downloadPdfByStoragePath('/etc/passwd');
  step('path_injection_rejected', { urlNull: inj === null, absNull: inj2 === null });

  // Trusted download via authoritative path
  const trustedBytes = await ledger.downloadPdfByStoragePath(storagePath);
  step('trusted_download', {
    ok: !!trustedBytes && trustedBytes.byteLength > 0,
    byteLength: trustedBytes?.byteLength ?? 0,
  });
  if (!trustedBytes?.byteLength) throw new Error('trusted_download_failed');

  // Wrong claim token commit
  const badCommit = await ledger.commitRecoveryResult({
    jobId: winner.id,
    claimToken: randomUUID(),
    status: 'recovered',
    recoveredText: 'SHOULD_NOT_COMMIT',
  });
  step('wrong_token_commit', {
    ok: badCommit.ok,
    code: badCommit.code ?? null,
    rejected: badCommit.ok === false || badCommit.code === 'stale_version',
  });

  // --- C/D. Real OCR principal path ---
  const logs: string[] = [];
  const principal = await processClaimedRecoveryJob(winner, {
    ledger,
    recoveryEnabled: true,
    log: (line) => {
      logs.push(line);
      console.log(line);
    },
  });
  step('principal_ocr_commit', {
    processed: principal.processed,
    commitStatus: principal.commitStatus ?? null,
    errorCode: principal.errorCode ?? null,
  });

  // Evidence checks without dumping text
  const { data: pageRow, error: pageErr } = await sb
    .from('ai_knowledge_page_texts')
    .select(
      'native_text,recovered_text,canonical_text,extraction_method,fallback_result,source_version,page_number',
    )
    .eq('source_id', sourceId)
    .eq('source_version', sv2)
    .eq('page_number', 2)
    .maybeSingle();
  if (pageErr || !pageRow) throw new Error(`page_read:${pageErr?.message ?? 'missing'}`);

  const nativeLen = String(pageRow.native_text ?? '').length;
  const recoveredLen = pageRow.recovered_text == null ? 0 : String(pageRow.recovered_text).length;
  const canonicalLen = String(pageRow.canonical_text ?? '').length;
  const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const recoveredNorm = normalize(String(pageRow.recovered_text ?? ''));
  const expectedNorm = normalize(EXPECTED_PHRASE);
  const phraseHit =
    recoveredNorm.includes(expectedNorm) ||
    expectedNorm.includes(recoveredNorm) ||
    (recoveredNorm.length >= 8 &&
      expectedNorm.length >= 8 &&
      (recoveredNorm.includes(expectedNorm.slice(0, 8)) ||
        expectedNorm.includes(recoveredNorm.slice(0, 8))));
  const nativePreserved = String(pageRow.native_text ?? '').includes('If is a continuous');
  const canonicalIsRecovered =
    pageRow.extraction_method === 'ocr_tesseract' &&
    pageRow.recovered_text != null &&
    pageRow.canonical_text === pageRow.recovered_text;

  step('canonical_evidence', {
    sourceVersion: pageRow.source_version,
    pageNumber: pageRow.page_number,
    nativeLen,
    recoveredLen,
    canonicalLen,
    phraseHit,
    nativePreserved,
    extractionMethod: pageRow.extraction_method,
    fallbackResult: pageRow.fallback_result,
    canonicalIsRecovered,
    recoveredNormLen: recoveredNorm.length,
    expectedNormLen: expectedNorm.length,
  });
  if (!phraseHit || !nativePreserved || !canonicalIsRecovered) {
    throw new Error('ocr_or_native_evidence_failed');
  }

  // Duplicate commit idempotent
  const dup = await ledger.commitRecoveryResult({
    jobId: winner.id,
    claimToken: winner.claimToken,
    status: 'recovered',
    recoveredText: pageRow.recovered_text,
  });
  step('duplicate_commit', {
    ok: dup.ok,
    idempotent: dup.idempotent === true,
    status: dup.status ?? null,
  });

  // Retrieval still N; tip still N+1; old chunks intact
  const { data: afterOcr } = await sb
    .from('ai_knowledge_sources')
    .select('source_version,retrieval_source_version,status')
    .eq('id', sourceId)
    .single();
  const { count: v1Chunks } = await sb
    .from('ai_knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', sourceId)
    .eq('source_version', 1);
  step('version_isolation_after_ocr', {
    sourceVersion: afterOcr?.source_version,
    retrievalSourceVersion: afterOcr?.retrieval_source_version,
    v1ChunkCount: v1Chunks,
    retrievalStill1: afterOcr?.retrieval_source_version === 1,
    tipStill2: afterOcr?.source_version === 2,
  });

  // --- E. Wrong-version / stale: enqueue job for v1 cannot mutate v2 page ---
  await rpcOk(sb, 'ai_knowledge_upsert_page_texts_native', {
    p_source_id: sourceId,
    p_source_version: 1,
    p_extraction_version: EXTRACTION_VERSION,
    p_pages: [
      {
        page_number: 2,
        native_text: 'OLD V1 NATIVE',
        detector_reasons: ['SHELL_WITH_MISSING_CONTENT'],
      },
    ],
  });
  await rpcOk(sb, 'ai_knowledge_enqueue_page_recovery_jobs', {
    p_source_id: sourceId,
    p_source_version: 1,
    p_extraction_version: EXTRACTION_VERSION,
    p_recovery_version: PAGE_OCR_RECOVERY_VERSION,
    p_pages: [{ page_number: 2, detector_reasons: ['SHELL_WITH_MISSING_CONTENT'] }],
  });
  const staleClaim = await ledger.claimJob();
  if (!staleClaim.ok || !staleClaim.job) throw new Error('stale_claim_missing');
  // Mutate v1 page extraction_version mid-flight to force stale discard on commit path
  const staleResult = await processClaimedRecoveryJob(staleClaim.job, {
    ledger,
    recoveryEnabled: true,
    afterResolveBeforeOcr: async () => {
      await sb
        .from('ai_knowledge_page_texts')
        .update({ extraction_version: 'mutated-during-ocr' })
        .eq('source_id', sourceId)
        .eq('source_version', 1)
        .eq('page_number', 2);
    },
    log: (line) => console.log(line),
  });
  const { data: v2AfterStale } = await sb
    .from('ai_knowledge_page_texts')
    .select('recovered_text,canonical_text,extraction_method')
    .eq('source_id', sourceId)
    .eq('source_version', 2)
    .eq('page_number', 2)
    .single();
  const v2Unchanged =
    v2AfterStale?.extraction_method === 'ocr_tesseract' &&
    typeof v2AfterStale.recovered_text === 'string' &&
    (() => {
      const r = normalize(v2AfterStale.recovered_text);
      const e = normalize(EXPECTED_PHRASE);
      return r.includes(e.slice(0, 8)) || e.includes(r.slice(0, 8));
    })();
  step('stale_during_ocr', {
    commitStatus: staleResult.commitStatus ?? null,
    errorCode: staleResult.errorCode ?? null,
    v2Unchanged,
  });

  // --- F. Retry fixture (controlled OCR failure → real DB requeue) ---
  await rpcOk(sb, 'ai_knowledge_upsert_page_texts_native', {
    p_source_id: sourceId,
    p_source_version: sv2,
    p_extraction_version: EXTRACTION_VERSION,
    p_pages: [
      {
        page_number: 1,
        native_text: 'retry native',
        detector_reasons: ['LOW_TEXT_ITEM_COUNT'],
      },
    ],
  });
  // Unique recovery_version identity for this job while still using the worker
  // contract version is enforced only at OCR validate — enqueue allows distinct
  // recovery_version strings. For OCR path we pass through job.recoveryVersion;
  // use the canonical PAGE_OCR_RECOVERY_VERSION and a free page_number.
  await rpcOk(sb, 'ai_knowledge_enqueue_page_recovery_jobs', {
    p_source_id: sourceId,
    p_source_version: sv2,
    p_extraction_version: EXTRACTION_VERSION,
    p_recovery_version: PAGE_OCR_RECOVERY_VERSION,
    p_pages: [{ page_number: 1, detector_reasons: ['LOW_TEXT_ITEM_COUNT'] }],
  });
  const claimRetry = await ledger.claimJob();
  if (!claimRetry.ok || !claimRetry.job) throw new Error('retry_claim_missing');
  const fail1 = await processClaimedRecoveryJob(claimRetry.job, {
    ledger,
    recoveryEnabled: true,
    // Controlled failure for retry proof only (principal path above used real OCR).
    recoverPageFn: async () => ({
      sourceId: claimRetry.job!.sourceId,
      sourceVersion: claimRetry.job!.sourceVersion,
      pageNumber: claimRetry.job!.pageNumber,
      recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
      status: 'failed',
      recoveredText: null,
      metadata: {
        durationMs: 1,
        renderDpi: PAGE_OCR_DEFAULT_DPI,
        engine: 'tesseract',
        engineVersion: 'test-hook',
        renderer: 'pdfjs+napi-canvas',
        recoveryIdentity: 'retry-fixture',
      },
      errorCode: 'ocr_failed',
    }),
    log: (line) => console.log(line),
  });
  const { data: retryJob } = await sb
    .from('ai_knowledge_page_recovery_jobs')
    .select('status,attempt_count,error_code')
    .eq('id', claimRetry.job.id)
    .single();
  step('retry_transient', {
    commitStatus: fail1.commitStatus ?? null,
    jobStatus: retryJob?.status ?? null,
    attemptCount: retryJob?.attempt_count ?? null,
    errorCode: retryJob?.error_code ?? null,
    requeued: retryJob?.status === 'queued',
  });
  if (retryJob?.status !== 'queued') throw new Error('retry_did_not_requeue');

  // Privacy: logs must not contain phrase or service key material
  const joined = logs.join('\n');
  const privacyOk =
    !joined.includes(EXPECTED_PHRASE) &&
    !joined.includes(serviceKey.slice(0, 12)) &&
    !joined.toLowerCase().includes('recoveredtext');
  step('privacy_logs', { privacyOk, logLines: logs.length });

  const pass =
    owners.length === 1 &&
    phraseHit &&
    nativePreserved &&
    afterOcr?.retrieval_source_version === 1 &&
    afterOcr?.source_version === 2 &&
    v2Unchanged &&
    privacyOk &&
    retryJob?.status === 'queued';

  report.result = pass ? 'PASS' : 'PARTIAL';
  console.log(JSON.stringify({ event: 'staging_remote_proof_summary', ...report }, null, 2));
  if (!pass) process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.log(
    JSON.stringify({
      event: 'staging_remote_proof_error',
      runId: RUN_ID,
      errorName: e instanceof Error ? e.name : 'error',
      errorMessage: String(e instanceof Error ? e.message : e).slice(0, 240),
    }),
  );
  process.exitCode = 1;
});
