/**
 * M1.1E E1 — staging continuous worker acceptance (real OCR).
 *
 * Staging ONLY (lmgrhmyurhjlwwdedojk). Never targets Production.
 * Proves: queue job → worker loop claims → OCR → commit → idle.
 *
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingWorkerAcceptance.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PAGE_OCR_RECOVERY_VERSION } from './src/bounds.ts';
import { runRecoveryWorkerLoop } from './src/recoveryWorkerLoop.ts';
import { claimAndProcessNextRecoveryJob } from './src/runClaimedRecoveryJob.ts';
import { createSupabaseTrustedLedger } from './src/supabaseTrustedLedger.ts';
import {
  ZIKUK_PRODUCTION_PROJECT_REF,
  ZIKUK_STAGING_PROJECT_REF,
} from './src/workerConfig.ts';

const STAGING_REF = ZIKUK_STAGING_PROJECT_REF;
const PRODUCTION_REF = ZIKUK_PRODUCTION_PROJECT_REF;
const EXTRACTION_VERSION = 'pdf-extract-v2-metrics';
const RUN_ID = `m11e_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const EXPECTED_PHRASE = `ZIKUKWRK${RUN_ID.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()}`;

type Meta = Record<string, unknown>;
const report: Meta = {
  milestone: 'M1.1E staging worker acceptance',
  runId: RUN_ID,
  stagingRef: STAGING_REF,
  productionWrites: 0,
  steps: [] as Meta[],
};

function step(name: string, data: Meta = {}) {
  const row = { name, ...data, at: new Date().toISOString() };
  (report.steps as Meta[]).push(row);
  console.log(JSON.stringify({ event: 'm11e_staging_worker', ...row }));
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
  const service = objs.find(k => k.id === 'service_role' || k.name === 'service_role');
  const key = typeof service?.api_key === 'string' ? service.api_key : '';
  if (!key || key.length < 20) throw new Error('staging_service_role_missing');
  return { url: `https://${STAGING_REF}.supabase.co`, serviceKey: key };
}

function assertNotProductionUrl(url: string) {
  if (url.includes(PRODUCTION_REF)) throw new Error('refused_production_url');
  if (!url.includes(STAGING_REF)) throw new Error('url_not_staging');
}

function buildSyntheticPdf(phrase: string): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content1 = `BT /F1 18 Tf 72 720 Td (${esc('PAGE1 NATIVE OK')}) Tj ET`;
  const content2 = `BT /F1 28 Tf 72 700 Td (${esc(phrase)}) Tj ET`;
  const objs: string[] = [];
  objs.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objs.push('2 0 obj<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>endobj\n');
  objs.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources<< /Font<< /F1 7 0 R >> >> >>endobj\n',
  );
  objs.push(
    '4 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources<< /Font<< /F1 7 0 R >> >> >>endobj\n',
  );
  objs.push(`5 0 obj<< /Length ${content1.length} >>stream\n${content1}\nendstream\nendobj\n`);
  objs.push(`6 0 obj<< /Length ${content2.length} >>stream\n${content2}\nendstream\nendobj\n`);
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
    rpc: (fn: string, args: Record<string, unknown>) => sb.rpc(fn, args),
    storage: sb.storage,
    from: (table: string) => sb.from(table),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const tess = spawnSync('tesseract', ['--version'], { encoding: 'utf8' });
  if (tess.status !== 0) throw new Error('tesseract_not_available');
  step('tesseract_ok', { versionLine: (tess.stdout || tess.stderr || '').split('\n')[0]?.slice(0, 60) });

  const { url, serviceKey } = loadStagingServiceRole();
  assertNotProductionUrl(url);
  step('staging_keys_loaded', { urlHost: new URL(url).host, serviceKeyLen: serviceKey.length });

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    createSupabaseTrustedLedger(asLedgerClient(sb) as never, {
      projectRef: PRODUCTION_REF,
    });
    throw new Error('production_guard_failed_to_throw');
  } catch (e) {
    step('production_ref_refused', {
      ok: String(e).includes('refuses_production_ref'),
    });
  }

  const ledger = createSupabaseTrustedLedger(asLedgerClient(sb) as never, {
    projectRef: STAGING_REF,
    pdfBucket: 'user-content',
  });

  let userId: string | null = null;
  let sectionId: string | null = null;
  let objectId: string | null = null;
  let sourceId: string | null = null;
  let storagePath: string | null = null;
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (sourceId) {
        await sb.from('ai_knowledge_page_recovery_jobs').delete().eq('source_id', sourceId);
        await sb.from('ai_knowledge_page_texts').delete().eq('source_id', sourceId);
        await sb.from('ai_knowledge_sources').delete().eq('id', sourceId);
      }
      if (storagePath) await sb.storage.from('user-content').remove([storagePath]);
      if (objectId) await sb.from('free_space_objects').delete().eq('id', objectId);
      if (sectionId) await sb.from('sections').delete().eq('id', sectionId);
      if (userId) await sb.auth.admin.deleteUser(userId);
      step('cleanup', { attempted: true, complete: true });
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
      title: `M11E ${RUN_ID}`,
    });
    if (secErr) throw new Error(`section_insert:${secErr.message}`);

    objectId = `pdf_${RUN_ID}`;
    storagePath = `${userId}/${sectionId}/${objectId}/pdf/${objectId}`;
    const pdfBytes = buildSyntheticPdf(EXPECTED_PHRASE);
    const hash = contentHash(pdfBytes);

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

    const { error: upErr } = await sb.storage.from('user-content').upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (upErr) throw new Error(`upload:${upErr.message}`);

    const begin = await sb.rpc('ai_knowledge_begin_ingest', {
      p_user_id: userId,
      p_section_id: sectionId,
      p_source_object_id: objectId,
      p_content_hash: hash,
    });
    if (begin.error) throw new Error(`begin_ingest:${begin.error.message}`);
    const beginRow = begin.data as Record<string, unknown>;
    if (beginRow?.ok !== true) {
      throw new Error(`begin_ingest_not_ok:${JSON.stringify(beginRow).slice(0, 160)}`);
    }
    sourceId = String(beginRow.source_id);
    const sourceVersion = Number(beginRow.source_version);
    step('source_begun', { sourceIdPrefix: sourceId.slice(0, 8), sourceVersion });

    const upsert = await sb.rpc('ai_knowledge_upsert_page_texts_native', {
      p_source_id: sourceId,
      p_source_version: sourceVersion,
      p_extraction_version: EXTRACTION_VERSION,
      p_pages: [
        {
          page_number: 2,
          native_text: 'If is a continuous',
          detector_reasons: ['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT'],
        },
      ],
    });
    if (upsert.error) throw new Error(`upsert:${upsert.error.message}`);
    const upsertRow = upsert.data as Record<string, unknown>;
    if (upsertRow?.ok !== true) throw new Error(`upsert_not_ok:${JSON.stringify(upsertRow).slice(0, 120)}`);

    const enqueue = await sb.rpc('ai_knowledge_enqueue_page_recovery_jobs', {
      p_source_id: sourceId,
      p_source_version: sourceVersion,
      p_extraction_version: EXTRACTION_VERSION,
      p_recovery_version: PAGE_OCR_RECOVERY_VERSION,
      p_pages: [
        {
          page_number: 2,
          detector_reasons: ['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT'],
        },
      ],
    });
    if (enqueue.error) throw new Error(`enqueue:${enqueue.error.message}`);
    const enqueueRow = enqueue.data as Record<string, unknown>;
    if (enqueueRow?.ok !== true) {
      throw new Error(`enqueue_not_ok:${JSON.stringify(enqueueRow).slice(0, 120)}`);
    }
    step('job_queued', {
      enqueued: enqueueRow.enqueued,
      pageNumber: 2,
      sourceVersion,
    });

    const ac = new AbortController();
    let processedSoFar = 0;

    const loopResult = await runRecoveryWorkerLoop({
      claimAndProcess: async () => {
        const r = await claimAndProcessNextRecoveryJob({
          ledger,
          recoveryEnabled: true,
          log: line => console.log(line),
        });
        if (r.processed) processedSoFar += 1;
        return r;
      },
      concurrency: 1,
      idleMs: 1500,
      sleep: async ms => {
        // After a successful process, one idle poll then stop.
        if (processedSoFar >= 1) {
          ac.abort();
          return;
        }
        await sleep(ms);
      },
      signal: ac.signal,
      maxCycles: 12,
      log: line => console.log(line),
    });

    step('worker_loop_done', {
      stoppedReason: loopResult.stoppedReason,
      cycles: loopResult.cycles,
      processedCount: loopResult.processedCount,
      idleCount: loopResult.idleCount,
      commitStatus: loopResult.lastOutcome?.commitStatus ?? null,
      returnedToIdle: loopResult.idleCount >= 1 || processedSoFar >= 1,
    });

    if (loopResult.processedCount < 1) {
      throw new Error('worker_did_not_process_job');
    }

    const { data: pageAfter, error: pageReadErr } = await sb
      .from('ai_knowledge_page_texts')
      .select('recovered_text,canonical_text,extraction_method,recovery_version')
      .eq('source_id', sourceId)
      .eq('source_version', sourceVersion)
      .eq('page_number', 2)
      .maybeSingle();
    if (pageReadErr) throw new Error(`page_read:${pageReadErr.message}`);

    const recovered = String((pageAfter as { recovered_text?: string } | null)?.recovered_text ?? '');
    const hasPhrase = recovered.replace(/\s+/g, '').includes(EXPECTED_PHRASE);
    step('ocr_commit_verified', {
      extractionMethod: (pageAfter as { extraction_method?: string } | null)?.extraction_method,
      recoveryVersion: (pageAfter as { recovery_version?: string } | null)?.recovery_version,
      recoveredCharCount: recovered.length,
      phrasePresent: hasPhrase,
      // never log recovered text
    });

    if (!hasPhrase || recovered.length < 8) {
      throw new Error('ocr_phrase_missing_or_too_short');
    }

    report.pass = true;
    step('PASS', { productionWrites: 0 });
  } catch (e) {
    report.pass = false;
    step('FAIL', {
      message: String(e instanceof Error ? e.message : e).slice(0, 200),
    });
    throw e;
  } finally {
    await cleanup();
    console.log(JSON.stringify({ event: 'm11e_staging_worker_report', ...report }));
  }
}

main().catch(() => {
  process.exitCode = 1;
});
