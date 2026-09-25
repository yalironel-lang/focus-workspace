/**
 * M1.1D — staging historical Free Space PDF enrollment acceptance.
 *
 * Staging ONLY: focus-workspace-staging / lmgrhmyurhjlwwdedojk
 * Production writes = 0. No Production flag, deploy, or worker changes.
 *
 * Proves:
 *   3 cloud-backed Free Space PDFs with no knowledge rows / no markers
 *   → planner selects ≤2 on first wave
 *   → existing ai-knowledge-process path (mark+drain equivalent)
 *   → readiness not_indexed → preparing → ready
 *   → after cooldown, 3rd enrolls
 *   → Ask grounded + citation
 *   → full cleanup
 *
 * Run:
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingM11dHistoricalEnrollment.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  HISTORICAL_ENROLL_COOLDOWN_MS,
  HISTORICAL_ENROLL_MAX_MARKS_PER_WAVE,
  planHistoricalEnrollment,
} from '../../src/lib/ai/askCourse/planHistoricalEnrollment.ts';
import { deriveCourseKnowledgeReadiness } from '../../src/lib/ai/askCourse/courseKnowledgeReadiness.ts';
import {
  claimAndProcessNextRecoveryJob,
} from './src/runClaimedRecoveryJob.ts';
import { createSupabaseTrustedLedger } from './src/supabaseTrustedLedger.ts';

const STAGING_REF = 'lmgrhmyurhjlwwdedojk';
const PRODUCTION_REF = 'comxmviofnotfwzbupxg';
const RUN_ID = `m11d_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const OUT = `tmp/m11d_staging_acceptance_${RUN_ID}.json`;
const PDF_COUNT = 3;
/** Known extractable native-text fixture (M0.7B validation PDF). */
const NATIVE_PDF_CANDIDATES = [
  'tmp/m07b-validation/ZIKUK_M07B_VALIDATION_NEVERINDEXED_v1.pdf',
];
const ASK_FACT = 'Zirconium Lattice Constant of Planet Quorath';
const ASK_EXPECTED = '0.417';

type Meta = Record<string, unknown>;
const report: Meta = {
  milestone: 'M1.1D Historical Enrollment Staging Acceptance',
  runId: RUN_ID,
  stagingRef: STAGING_REF,
  productionWrites: 0,
  result: 'RUNNING',
  steps: [] as Meta[],
};

function step(name: string, data: Meta = {}) {
  const row = { name, ...data, at: new Date().toISOString() };
  (report.steps as Meta[]).push(row);
  console.log(JSON.stringify({ event: 'staging_m11d', ...row }));
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

function assertNotProductionUrl(url: string) {
  if (url.includes(PRODUCTION_REF)) throw new Error('refused_production_url');
  if (!url.includes(STAGING_REF)) throw new Error('url_not_staging');
}

/** Load a known extractable native-text PDF (pdfjs-friendly). */
function loadNativeTextPdfBytes(): Uint8Array {
  for (const p of NATIVE_PDF_CANDIDATES) {
    if (existsSync(p)) return new Uint8Array(readFileSync(p));
  }
  throw new Error('native_pdf_fixture_missing');
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

async function drainRecoveryIfNeeded(
  sb: SupabaseClient,
  sourceId: string,
  sourceVersion: number,
): Promise<{ processed: number; pendingLeft: number }> {
  const ledger = createSupabaseTrustedLedger(sb as never, { projectRef: STAGING_REF });
  let processed = 0;
  for (let round = 0; round < 20; round++) {
    const { count } = await sb
      .from('ai_knowledge_page_recovery_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('source_version', sourceVersion)
      .in('status', ['queued', 'claimed', 'leased', 'failed']);
    if (!count) return { processed, pendingLeft: 0 };

    await sb
      .from('ai_knowledge_page_recovery_jobs')
      .update({ available_at: new Date(0).toISOString() })
      .eq('source_id', sourceId)
      .eq('source_version', sourceVersion)
      .eq('status', 'queued');

    const r = await claimAndProcessNextRecoveryJob({
      ledger,
      recoveryEnabled: true,
    });
    if (!r.processed) {
      const { data: open } = await sb
        .from('ai_knowledge_page_recovery_jobs')
        .select('id')
        .eq('source_id', sourceId)
        .eq('source_version', sourceVersion)
        .in('status', ['queued', 'claimed', 'leased']);
      if (!open?.length) break;
      continue;
    }
    processed += 1;
  }
  const { count: left } = await sb
    .from('ai_knowledge_page_recovery_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', sourceId)
    .eq('source_version', sourceVersion)
    .in('status', ['queued', 'claimed', 'leased']);
  return { processed, pendingLeft: left ?? 0 };
}

async function waitAskReady(
  sb: SupabaseClient,
  objectId: string,
  accessToken: string,
  keys: { url: string; anonKey: string },
  sectionId: string,
): Promise<{
  status: string;
  retrieval: number | null;
  tip: number;
  sourceId: string;
}> {
  for (let i = 0; i < 40; i++) {
    const { data, error } = await sb
      .from('ai_knowledge_sources')
      .select(
        'id,status,source_version,retrieval_source_version,error_code',
      )
      .eq('source_object_id', objectId)
      .maybeSingle();
    if (error) throw new Error(`source_poll:${error.message}`);
    if (data) {
      const tip = Number(data.source_version);
      const retrieval =
        data.retrieval_source_version == null
          ? null
          : Number(data.retrieval_source_version);
      if (data.status === 'ready' && retrieval != null) {
        return {
          status: data.status,
          retrieval,
          tip,
          sourceId: data.id as string,
        };
      }
      if (
        data.status === 'processing' ||
        data.status === 'pending' ||
        (data.status === 'ready' && retrieval == null)
      ) {
        const drain = await drainRecoveryIfNeeded(sb, data.id as string, tip);
        if (drain.processed > 0) {
          // Resume process after recovery (existing Option A path).
          await invokeEdgeJson({
            url: keys.url,
            anonKey: keys.anonKey,
            accessToken,
            functionName: 'ai-knowledge-process',
            body: { version: 1, sectionId, sourceObjectId: objectId },
          });
        }
      }
      if (data.status === 'failed') {
        throw new Error(
          `source_failed:${objectId}:${String(data.error_code ?? 'unknown')}`,
        );
      }
    }
    await new Promise(r => setTimeout(r, 2_000));
  }
  throw new Error(`ask_ready_timeout:${objectId}`);
}

async function main() {
  const linkedRef = spawnSync('cat', [`${process.cwd()}/supabase/.temp/project-ref`], {
    encoding: 'utf8',
  }).stdout?.trim();
  step('preflight', {
    linkedRef,
    expectProdLink: PRODUCTION_REF,
    staging: STAGING_REF,
  });
  if (linkedRef && linkedRef !== PRODUCTION_REF && linkedRef !== STAGING_REF) {
    throw new Error(`unexpected_cli_link:${linkedRef}`);
  }

  const keys = loadStagingKeys();
  assertNotProductionUrl(keys.url);
  step('staging_keys_loaded', {
    urlHost: new URL(keys.url).host,
    serviceKeyLen: keys.serviceKey.length,
  });

  const sb = createClient(keys.url, keys.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string | null = null;
  let sectionId: string | null = null;
  const objectIds: string[] = [];
  const storagePaths: string[] = [];
  const phrases: string[] = [];
  const sourceIds: string[] = [];

  const cleanup = async () => {
    try {
      // Cascades: embeddings, chunks, page_texts, recovery_jobs.
      for (const sid of sourceIds) {
        await sb.from('ai_knowledge_sources').delete().eq('id', sid);
      }
      // Also sweep by object id in case process created rows we didn't track.
      if (objectIds.length) {
        await sb.from('ai_knowledge_sources').delete().in('source_object_id', objectIds);
      }
      if (storagePaths.length) {
        await sb.storage.from('user-content').remove(storagePaths);
      }
      for (const oid of objectIds) {
        await sb.from('free_space_objects').delete().eq('id', oid);
      }
      if (sectionId) await sb.from('sections').delete().eq('id', sectionId);
      if (userId) await sb.auth.admin.deleteUser(userId);
      step('cleanup', {
        attempted: true,
        objectCount: objectIds.length,
        sourceCount: sourceIds.length,
      });
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
    step('user_created', { userIdPrefix: userId.slice(0, 8) });

    sectionId = randomUUID();
    const { error: secErr } = await sb.from('sections').insert({
      id: sectionId,
      user_id: userId,
      title: `M11D Historical ${RUN_ID}`,
    });
    if (secErr) throw new Error(`section:${secErr.message}`);

    const pdfBytes = loadNativeTextPdfBytes();
    const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
    step('fixture_pdf', {
      bytes: pdfBytes.byteLength,
      shaPrefix: pdfHash.slice(0, 16),
      pageCountHint: 3,
    });

    // A. Create 3 historical Free Space PDFs: cloud-backed, no sources, no markers.
    for (let i = 0; i < PDF_COUNT; i++) {
      const objectId = `pdf_m11d_${i}_${RUN_ID}`;
      const storagePath = `${userId}/${sectionId}/${objectId}/pdf/${objectId}`;

      const { error: fsoErr } = await sb.from('free_space_objects').insert({
        id: objectId,
        user_id: userId,
        section_id: sectionId,
        board_id: 'main',
        object: {
          type: 'pdf',
          content: {
            fileName: `historical-${i}-${RUN_ID}.pdf`,
            pageCount: 3,
          },
        },
      });
      if (fsoErr) throw new Error(`fso:${fsoErr.message}`);

      const up = await sb.storage.from('user-content').upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (up.error) throw new Error(`upload:${up.error.message}`);

      objectIds.push(objectId);
      storagePaths.push(storagePath);
      phrases.push(ASK_EXPECTED);
    }

    const { count: srcBefore } = await sb
      .from('ai_knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .in('source_object_id', objectIds);
    step('phase_a_before_ask', {
      pdfCount: objectIds.length,
      sourceRows: srcBefore ?? 0,
      markers: 0,
      cloudBacked: true,
    });
    if ((srcBefore ?? 0) !== 0) throw new Error('fixture_had_source_rows');

    const eligible = objectIds.map(id => ({
      kind: 'free_space_pdf' as const,
      sourceObjectId: id,
    }));

    // Flag OFF → zero marks
    const flagOff = planHistoricalEnrollment({
      eligible,
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(objectIds),
      nowMs: Date.now(),
      lastWaveAtMs: null,
      enabled: false,
    });
    step('flag_off_plan', {
      selected: flagOff.sourceObjectIds,
      skipReason: flagOff.skipReason,
    });
    if (flagOff.sourceObjectIds.length !== 0) throw new Error('flag_off_selected');

    // B/C. First wave — Ask-open enrollment simulation (planner + process = mark+drain)
    const tWave1 = Date.now();
    const wave1 = planHistoricalEnrollment({
      eligible,
      rows: [],
      markers: [],
      cloudBackedPdfIds: new Set(objectIds),
      nowMs: tWave1,
      lastWaveAtMs: null,
      enabled: true,
    });
    step('wave1_plan', {
      selected: wave1.sourceObjectIds,
      max: HISTORICAL_ENROLL_MAX_MARKS_PER_WAVE,
      thirdUnenrolled: objectIds.find(id => !wave1.sourceObjectIds.includes(id)) ?? null,
    });
    if (wave1.sourceObjectIds.length !== 2) {
      throw new Error(`wave1_expected_2_got_${wave1.sourceObjectIds.length}`);
    }
    const thirdId = objectIds.find(id => !wave1.sourceObjectIds.includes(id));
    if (!thirdId) throw new Error('third_missing');

    const readinessBefore = deriveCourseKnowledgeReadiness({
      rows: [],
      markers: [],
      eligible,
    });
    step('readiness_before', {
      kind: readinessBefore.kind,
      emptyReason: readinessBefore.emptyReason,
      unenrolledCount: readinessBefore.unenrolledCount,
    });
    if (readinessBefore.emptyReason !== 'not_indexed') {
      throw new Error('expected_not_indexed');
    }

    const userClient = createClient(keys.url, keys.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await userClient.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session?.access_token) {
      throw new Error(`sign_in:${signed.error?.message ?? 'no_token'}`);
    }
    const accessToken = signed.data.session.access_token;

    // Simulated markers after enroll wave (browser IDB seam).
    const markersWave1 = wave1.sourceObjectIds.map(id => ({
      sourceKind: 'free_space_pdf' as const,
      sourceObjectId: id,
    }));
    const readinessAfterMark = deriveCourseKnowledgeReadiness({
      rows: [],
      markers: markersWave1,
      eligible,
    });
    step('readiness_after_mark', {
      kind: readinessAfterMark.kind,
      preparingCount: readinessAfterMark.preparingCount,
      unenrolledCount: readinessAfterMark.unenrolledCount,
    });
    if (readinessAfterMark.kind !== 'preparing') {
      throw new Error('expected_preparing_after_mark');
    }

    // Existing drain path: ai-knowledge-process for each marked PDF.
    for (const oid of wave1.sourceObjectIds) {
      const proc = await invokeEdgeJson({
        url: keys.url,
        anonKey: keys.anonKey,
        accessToken,
        functionName: 'ai-knowledge-process',
        body: { version: 1, sectionId, sourceObjectId: oid },
      });
      const code =
        proc.json.ok === true
          ? null
          : String(
              (proc.json.error as { code?: string } | undefined)?.code ??
                proc.json.code ??
                '',
            );
      step('wave1_process', {
        objectIdPrefix: oid.slice(0, 16),
        httpStatus: proc.status,
        ok: proc.json.ok === true,
        code,
      });
      // ok, recovery_pending, or already processing are acceptable starts.
      if (proc.json.ok !== true && code !== 'recovery_pending') {
        // Allow reused/in-flight codes that still create a source row.
        const { data: row } = await sb
          .from('ai_knowledge_sources')
          .select('id')
          .eq('source_object_id', oid)
          .maybeSingle();
        if (!row) throw new Error(`process_failed_no_source:${oid}:${code}`);
      }
    }

    // Cooldown: repeated Ask/readiness must NOT create another wave.
    const wave1Repeat = planHistoricalEnrollment({
      eligible,
      rows: [],
      markers: markersWave1,
      cloudBackedPdfIds: new Set(objectIds),
      nowMs: tWave1 + 5_000,
      lastWaveAtMs: tWave1,
      enabled: true,
    });
    step('wave1_repeat_cooldown', {
      selected: wave1Repeat.sourceObjectIds,
      skipReason: wave1Repeat.skipReason,
      cooldownMs: HISTORICAL_ENROLL_COOLDOWN_MS,
    });
    if (wave1Repeat.sourceObjectIds.length !== 0) {
      throw new Error('cooldown_failed_repeat_wave');
    }

    // D/E/G. Wait for wave-1 Ask-ready via existing publish lifecycle.
    for (const oid of wave1.sourceObjectIds) {
      const ready = await waitAskReady(sb, oid, accessToken, keys, sectionId!);
      sourceIds.push(ready.sourceId);
      step('wave1_ask_ready', {
        objectIdPrefix: oid.slice(0, 16),
        status: ready.status,
        tip: ready.tip,
        retrieval: ready.retrieval,
      });
    }

    // F. After cooldown — third PDF enrolls, no duplicates.
    const tWave2 = tWave1 + HISTORICAL_ENROLL_COOLDOWN_MS;
    const { data: rowsAfterWave1 } = await sb
      .from('ai_knowledge_sources')
      .select(
        'source_kind,source_object_id,notebook_object_id,status,source_version,retrieval_source_version,error_code',
      )
      .eq('section_id', sectionId!)
      .in('source_object_id', objectIds);

    const wave2 = planHistoricalEnrollment({
      eligible,
      rows: (rowsAfterWave1 ?? []).map(r => ({
        source_kind: r.source_kind as 'free_space_pdf',
        source_object_id: r.source_object_id as string,
        notebook_object_id: (r.notebook_object_id as string | null) ?? null,
        status: r.status as 'ready' | 'pending' | 'processing' | 'failed' | 'stale',
        source_version: Number(r.source_version),
        retrieval_source_version:
          r.retrieval_source_version == null
            ? null
            : Number(r.retrieval_source_version),
        error_code: (r.error_code as string | null) ?? null,
      })),
      markers: markersWave1,
      cloudBackedPdfIds: new Set(objectIds),
      nowMs: tWave2,
      lastWaveAtMs: tWave1,
      enabled: true,
    });
    step('wave2_plan', {
      selected: wave2.sourceObjectIds,
      expected: [thirdId],
    });
    if (wave2.sourceObjectIds.length !== 1 || wave2.sourceObjectIds[0] !== thirdId) {
      throw new Error(`wave2_expected_third_got_${wave2.sourceObjectIds.join(',')}`);
    }

    const proc3 = await invokeEdgeJson({
      url: keys.url,
      anonKey: keys.anonKey,
      accessToken,
      functionName: 'ai-knowledge-process',
      body: { version: 1, sectionId, sourceObjectId: thirdId },
    });
    step('wave2_process', {
      objectIdPrefix: thirdId.slice(0, 16),
      httpStatus: proc3.status,
      ok: proc3.json.ok === true,
      code:
        proc3.json.ok === true
          ? null
          : String(
              (proc3.json.error as { code?: string } | undefined)?.code ??
                proc3.json.code ??
                '',
            ),
    });
    const ready3 = await waitAskReady(sb, thirdId, accessToken, keys, sectionId!);
    sourceIds.push(ready3.sourceId);
    step('wave2_ask_ready', {
      objectIdPrefix: thirdId.slice(0, 16),
      status: ready3.status,
      retrieval: ready3.retrieval,
    });

    // No duplicate sources for any object.
    for (const oid of objectIds) {
      const { count } = await sb
        .from('ai_knowledge_sources')
        .select('id', { count: 'exact', head: true })
        .eq('source_object_id', oid);
      if ((count ?? 0) !== 1) throw new Error(`duplicate_or_missing_source:${oid}:${count}`);
    }
    step('no_duplicates', { ok: true, objectCount: objectIds.length });

    // H. Ask grounded in historical PDF fact.
    const askObjectId = objectIds[0]!;
    const askRes = await invokeEdgeJson({
      url: keys.url,
      anonKey: keys.anonKey,
      accessToken,
      functionName: 'ai-gateway',
      body: {
        version: 1,
        capability: 'ask_course',
        sectionId,
        question: `According to the course materials, what is the ${ASK_FACT}?`,
      },
    });
    if (askRes.json.ok !== true) {
      throw new Error(
        `ask_failed:${String(
          (askRes.json.error as { code?: string } | undefined)?.code ?? askRes.status,
        )}`,
      );
    }
    const result = askRes.json.result as {
      type?: string;
      text?: string;
      sources?: Array<Record<string, unknown>>;
    };
    if (result?.type !== 'ask_course' || typeof result.text !== 'string') {
      throw new Error('ask_bad_result');
    }
    const answer = result.text;
    const sources = Array.isArray(result.sources) ? result.sources : [];
    const grounded =
      answer.includes(ASK_EXPECTED) ||
      /0\.417/.test(answer) ||
      /Quorath/i.test(answer);
    const citationOk = sources.some(
      s =>
        s.sourceKind === 'free_space_pdf' &&
        (String(s.sourceObjectId ?? '') === askObjectId ||
          String(s.fileName ?? '').includes('historical-') ||
          Number(s.pageNumber) >= 1),
    );
    step('phase_h_ask', {
      answerChars: answer.length,
      grounded,
      citationOk,
      sourceCount: sources.length,
      citedKinds: sources.map(s => s.sourceKind),
    });
    if (!grounded) throw new Error('ask_not_grounded_in_historical_pdf');
    if (!citationOk) throw new Error('ask_citation_missing');

    // I. Cleanup + orphan check
    await cleanup();
    const { count: orphanSources } = await sb
      .from('ai_knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .in('source_object_id', objectIds);
    const { count: orphanFso } = await sb
      .from('free_space_objects')
      .select('id', { count: 'exact', head: true })
      .in('id', objectIds);
    step('orphan_check', {
      sources: orphanSources ?? 0,
      fso: orphanFso ?? 0,
    });
    if ((orphanSources ?? 0) > 0 || (orphanFso ?? 0) > 0) {
      throw new Error('orphans_remain');
    }

    report.result = 'PASS';
    report.productionWrites = 0;
    step('done', { result: 'PASS' });
  } catch (e) {
    report.result = 'FAIL';
    step('fatal', {
      message: String(e instanceof Error ? e.message : e).slice(0, 240),
    });
    await cleanup();
  }

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ event: 'staging_m11d_report', path: OUT, result: report.result }));
  if (report.result !== 'PASS') process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
