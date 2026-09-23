/**
 * M1.0B B4.1 — staging retrieval hardening driver.
 *
 * Deploys process+gateway+probe → runs Edge MVT resume (includes B4.1 rank asserts)
 * → undeploys probe → restores Production CLI link.
 *
 *   node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingB41RetrievalHardening.ts
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  ASK_COURSE_FINAL_HARD_MAX,
  ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT,
  ASK_COURSE_RPC_CANDIDATE_LIMIT,
} from '../../supabase/functions/_shared/ai/askCourse/bounds.ts';

const STAGING_REF = 'lmgrhmyurhjlwwdedojk';
const PRODUCTION_REF = 'comxmviofnotfwzbupxg';
const OUT = 'tmp/m10b41_hardening_report.json';

type Meta = Record<string, unknown>;
const report: Meta = {
  milestone: 'M1.0B B4.1 Retrieval Hardening',
  stagingRef: STAGING_REF,
  productionWrites: 0,
  constants: {
    FINAL_HARD_MAX: ASK_COURSE_FINAL_HARD_MAX,
    RPC_CANDIDATE_LIMIT: ASK_COURSE_RPC_CANDIDATE_LIMIT,
    MAX_CHUNKS_PER_PDF_OBJECT: ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT,
  },
  steps: [] as Meta[],
};

function step(name: string, data: Meta = {}) {
  const row = { name, ...data, at: new Date().toISOString() };
  (report.steps as Meta[]).push(row);
  console.log(JSON.stringify({ event: 'staging_b41', ...row }));
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

function deploy(fn: string): void {
  const r = spawnSync(
    'npx',
    ['supabase', 'functions', 'deploy', fn, '--project-ref', STAGING_REF],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 30 << 20 },
  );
  step('deploy', {
    fn,
    status: r.status,
    outFrag: ((r.stdout || '') + (r.stderr || '')).slice(-280),
  });
  if (r.status !== 0) throw new Error(`deploy_failed:${fn}`);
}

function undeployProbe(): void {
  const r = spawnSync(
    'npx',
    [
      'supabase',
      'functions',
      'delete',
      'ai-staging-embed-probe',
      '--project-ref',
      STAGING_REF,
      '--yes',
    ],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 5 << 20 },
  );
  step('undeploy_probe', {
    status: r.status,
    outFrag: ((r.stdout || '') + (r.stderr || '')).slice(-240),
  });
}

function relinkProduction(): void {
  spawnSync('npx', ['supabase', 'link', '--project-ref', PRODUCTION_REF], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    stdio: 'ignore',
  });
  const restored = spawnSync('cat', [`${process.cwd()}/supabase/.temp/project-ref`], {
    encoding: 'utf8',
  }).stdout?.trim();
  step('cli_restored', { projectRef: restored });
  if (restored !== PRODUCTION_REF) throw new Error(`cli_not_production:${restored}`);
}

function main() {
  step('start', { hardMax: ASK_COURSE_FINAL_HARD_MAX, rpc: ASK_COURSE_RPC_CANDIDATE_LIMIT });

  deploy('ai-knowledge-process');
  deploy('ai-gateway');
  deploy('ai-staging-embed-probe'); // temporary for B4.1 question-rank only

  const r = spawnSync(
    'node',
    ['--experimental-strip-types', 'scripts/m10b2-page-ocr-recovery/runStagingB4MvtEdgeResume.ts'],
    { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 50 << 20 },
  );
  const text = (r.stdout || '') + (r.stderr || '');
  writeFileSync('tmp/m10b41_edge_resume_out.txt', text);
  const objs = extractJsonObjects(text);
  const b41 = objs.filter((o) => o.event === 'staging_b4_edge' && o.name === 'b41_question_rank').pop();
  const ask = objs.filter((o) => o.event === 'staging_b4_edge' && o.name === 'phase3_ask').pop();
  const stored = objs.filter((o) => o.event === 'staging_b4_edge' && o.name === 'b41_stored_text').pop();
  const done = objs.filter((o) => o.event === 'staging_b4_edge' && o.name === 'done').pop();

  step('edge_resume', {
    status: r.status,
    askCitedPage3: ask?.citedPage3 ?? null,
    askSemantic: ask?.citedSemanticOverall ?? null,
    storedPrefixed: stored?.prefixedCount ?? null,
    page3Rank: b41?.page3Rank ?? null,
    page3Sim: b41?.page3Sim ?? null,
    sparseBeatPage3: b41?.sparseBeatPage3 ?? null,
    page3InHardMax: b41?.page3InHardMax ?? null,
    finalPages: b41?.finalPages ?? null,
    hardMax: b41?.hardMax ?? null,
    doneResult: done?.result ?? null,
  });

  undeployProbe();
  relinkProduction();

  const rg = spawnSync(
    'rg',
    [
      'ai-staging-embed-probe',
      'supabase/functions',
      'src',
      '--glob',
      '!**/ai-staging-embed-probe/**',
    ],
    { encoding: 'utf8' },
  );
  const matches = (rg.stdout || '').trim();
  step('probe_product_deps', { matches: matches || 'none' });
  if (matches) throw new Error('product_depends_on_staging_probe');

  if (r.status !== 0) throw new Error(`edge_resume_failed:${r.status}`);
  if (b41?.page3InHardMax !== true) throw new Error('b41_page3_not_in_hard_max');
  if (b41?.sparseBeatPage3 === true) throw new Error('b41_sparse_beat_page3');
  if (Number(stored?.prefixedCount ?? -1) !== 0) throw new Error('b41_prefixed_chunks');
  if (ask?.citedPage3 !== true) throw new Error('b41_ask_citation_failed');

  report.result = 'PASS';
  report.b41 = b41 ?? null;
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ event: 'staging_b41', name: 'COMPLETE', out: OUT }));
  console.log('M1.0B B4.1 STAGING HARDENING PASS');
}

try {
  main();
} catch (e) {
  report.result = 'FAIL';
  report.error = String(e instanceof Error ? e.message : e).slice(0, 500);
  try {
    undeployProbe();
  } catch {
    /* best-effort */
  }
  try {
    relinkProduction();
  } catch {
    /* best-effort */
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ event: 'staging_b41', name: 'FAIL', error: report.error }));
  process.exit(1);
}
