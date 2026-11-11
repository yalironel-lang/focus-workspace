// Operator Terminal only. Never launch through an AI exec/PTY or debugger.
import { emitKeypressEvents } from 'node:readline';
import { mkdirSync, writeFileSync, readFileSync, lstatSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { makeClient, authenticate, adapter, boundedFetch, Stop, requireCheck, REF } from './adapter.mjs';
import { runAcceptance, cleanupPlan, EXPECTED_CASES } from './core.mjs';
import { collectSummary } from './collect-mode.mjs';
import { assertionRequestLimit } from './request-budget.mjs';
import { serializePlan, restorePlan } from './scope.mjs';

const say = value => process.stdout.write(JSON.stringify(value) + '\n');
export function privatePrompt(label) {
  requireCheck(process.stdin.isTTY && process.stdout.isTTY, 'PRIVATE_TERMINAL_REQUIRED');
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(`${label}: `);
    emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
    const done = (error) => {
      process.stdin.off('keypress', key); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n');
      if (error) { value = ''; reject(error); } else resolve(value);
    };
    const key = (text, event = {}) => {
      if (event.ctrl && event.name === 'c') return done(new Stop('OPERATOR_CANCELLED'));
      if (event.name === 'return') return done();
      if (event.name === 'backspace') value = value.slice(0, -1);
      else if (text && !event.ctrl && !event.meta && !/[\x00-\x1f\x7f]/.test(text)) {
        value += text;
        if (value.length > 4096) done(new Stop('PRIVATE_INPUT_TOO_LONG'));
      }
    };
    process.stdin.on('keypress', key);
  });
}
// This is an operator procedure, not an enforced isolation boundary from the AI host.
export const PRIVACY_ASSURANCE = Object.freeze({ technicalIsolationVerified: false, mode: 'procedural' });
export function requirePrivacyAttestation(value) {
  requireCheck(value === 'I ACCEPT PROCEDURAL PRIVACY', 'PRIVACY_BOUNDARY_NOT_ACCEPTED');
}
export { serializePlan, restorePlan } from './scope.mjs';
export function durableManifest(path, manifest, io = { openSync, writeFileSync, fsyncSync, closeSync, renameSync }) {
  const temporary = `${path}.tmp`;
  const fd = io.openSync(temporary, 'wx', 0o600);
  try { io.writeFileSync(fd, JSON.stringify(manifest)); io.fsyncSync(fd); } finally { io.closeSync(fd); }
  io.renameSync(temporary, path);
  const directory = io.openSync(dirname(path), 'r');
  try { io.fsyncSync(directory); } finally { io.closeSync(directory); }
}
async function main() {
  requireCheck(process.argv.length <= 3 && process.stdin.isTTY && process.stdout.isTTY, 'PRIVATE_TERMINAL_REQUIRED');
  requireCheck(process.execArgv.length === 0 && !['NODE_OPTIONS', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_USE_ENV_PROXY', 'SSLKEYLOGFILE'].some(k => process.env[k]), 'UNSAFE_RUNTIME_INSTRUMENTATION');
  const cleanupOnly = process.argv[2] === '--cleanup-only';
  const collect = process.argv[2] === '--diagnostic-collect';
  requireCheck(!process.argv[2] || cleanupOnly || collect, 'INVALID_ARGUMENT');
  const phrase = cleanupOnly ? 'APPROVE G2.85 SCOPED CLEANUP' : collect
    ? 'APPROVE G2.85 STAGING DIAGNOSTIC COLLECT' : 'APPROVE G2.85 STAGING AUTH AND ISOLATION EXECUTION';
  const approval = await privatePrompt(`Type ${phrase} after separate approval for ${REF}`);
  requireCheck(approval === phrase, 'NOT_AUTHORIZED');
  process.stdout.write('Privacy notice: a TTY does not prove exclusion of AI, recordings, debuggers or other processes. Use only a trusted, separately controlled operator context.\n');
  requirePrivacyAttestation(await privatePrompt('Type I ACCEPT PROCEDURAL PRIVACY only after accepting that residual risk'));
  requireCheck(await privatePrompt('Type DISPOSABLE to attest both accounts are exclusive fresh test accounts') === 'DISPOSABLE', 'ACCOUNTS_NOT_ATTESTED');
  let key = await privatePrompt('Staging publishable key (or legacy anon key), hidden');
  const fetcher = boundedFetch(globalThis.fetch, assertionRequestLimit(collect ? 'DIAGNOSTIC_COLLECT' : 'ACCEPTANCE'));
  const clients = []; const users = [];
  let report;
  try {
    for (const label of ['A', 'B']) {
      const client = makeClient(key, fetcher); clients.push(client);
      let email = await privatePrompt(`Account ${label} email, hidden`);
      let password = await privatePrompt(`Account ${label} password, hidden`);
      let id;
      try { id = await authenticate(client, email, password, label, users.map(u => u.id)); } finally { email = ''; password = ''; }
      users.push(adapter(client, id)); say({ case: `AUTH_${label}`, status: 'PASS' });
    }
    key = '';
    requireCheck(users[0].id !== users[1].id, 'DISTINCT_USERS_REQUIRED');
    const directory = join(homedir(), '.zikuk-g285-private');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const dir = lstatSync(directory);
    requireCheck(dir.isDirectory() && !dir.isSymbolicLink() && (dir.mode & 0o077) === 0 && dir.uid === process.getuid(), 'UNSAFE_MANIFEST_DIRECTORY');
    if (cleanupOnly) {
      const run = await privatePrompt('Recovery run UUID, hidden'); requireCheck(/^[0-9a-f-]{36}$/.test(run), 'INVALID_MANIFEST');
      const path = join(directory, `${run}.json`); const stat = lstatSync(path);
      requireCheck(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid() && stat.size < 200_000, 'UNSAFE_MANIFEST');
      const p = restorePlan(JSON.parse(readFileSync(path, 'utf8')), users);
      fetcher.beginCleanup();
      const cleanup = await cleanupPlan(p); report = { status: cleanup === 'PASS' ? 'PASS' : 'FAIL', cleanup };
    } else {
      const checkpoint = p => {
        durableManifest(join(directory, `${p.run}.json`), serializePlan(p));
      };
      // The sole persisted artifact is the private fixture manifest. No auth objects are serialized.
      report = await runAcceptance(users, e => { if (e.case !== 'FINAL') say(e); }, randomUUID, checkpoint, fetcher.beginCleanup,
        { mode: collect ? 'DIAGNOSTIC_COLLECT' : 'ACCEPTANCE' });
    }
  } finally {
    key = '';
    fetcher.beginCleanup();
    let signoutFailed = false;
    for (const c of clients) {
      try { const r = await c.auth.signOut({ scope: 'local' }); if (r.error) signoutFailed = true; }
      catch { signoutFailed = true; }
    }
    if (signoutFailed) report = { ...report, status: 'FAIL', sessionCleanup: 'FAIL' };
    else if (report) report.sessionCleanup = 'PASS';
  }
  if (collect && report?.summary) say({ case: 'DIAGNOSTIC_SUMMARY', ...report.summary,
    criticalSafetyStop: report.summary.criticalSafetyStop || report.sessionCleanup !== 'PASS',
    status: report.status, sessionCleanup: report.sessionCleanup, requestBudget: fetcher.stats() });
  say({ case: cleanupOnly ? 'CLEANUP_FINAL' : 'FINAL', mode: cleanupOnly ? 'CLEANUP_ONLY' : collect ? 'DIAGNOSTIC_COLLECT' : 'ACCEPTANCE', status: report?.status ?? 'FAIL', failure: report?.failure ?? null, cleanup: report?.cleanup ?? 'UNKNOWN', sessionCleanup: report?.sessionCleanup ?? 'UNKNOWN', cases: report?.cases ?? 0 });
  if (report?.status !== 'PASS') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    if (process.argv[2] === '--diagnostic-collect') {
      const summary = collectSummary(EXPECTED_CASES, [], [], 'UNKNOWN', false);
      say({ case: 'DIAGNOSTIC_SUMMARY', ...summary, criticalSafetyStop: true, integrity: 'UNKNOWN',
        status: 'FAIL', sessionCleanup: 'UNKNOWN' });
    }
    say({ case: 'FINAL', status: 'FAIL', failure: 'STOPPED_PRIVATE_DETAILS_SUPPRESSED' }); process.exitCode = 1;
  });
}
