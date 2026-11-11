// PRIVATE OPERATOR ENTRY POINT. Never execute with AI tools or a terminal recorder.
import { constants, lstatSync, readdirSync, openSync, fstatSync, readSync, closeSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REF, requireCheck } from './adapter.mjs';
import { privatePrompt, requirePrivacyAttestation } from './operator.mjs';
import { validateRecoveryScopes, verifyRecoverySession, unknownRecoveryResults } from './recovery-verify.mjs';
import { RECOVERY_LIMITS } from './recovery-deadlines.mjs';
import { createRecoveryDiagnostics } from './recovery-diagnostics.mjs';
import { loadRecoveryCA, recoveryCABytes } from './recovery-ca.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const RECOVERY_ENDPOINT = Object.freeze({ host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432, database: 'postgres', user: 'postgres.lmgrhmyurhjlwwdedojk' });
export function recoveryConnectionConfig(password, projectRef = REF, endpoint = RECOVERY_ENDPOINT, trustedCA) {
  requireCheck(projectRef === REF && endpoint && Object.keys(endpoint).length === 4
    && Object.entries(RECOVERY_ENDPOINT).every(([key, value]) => endpoint[key] === value), 'WRONG_PROJECT_OR_ENDPOINT');
  requireCheck(typeof password === 'string' && password.length > 0, 'PRIVATE_CONNECTION_UNAVAILABLE');
  return { ...RECOVERY_ENDPOINT, password, ssl: { rejectUnauthorized: true, ca: recoveryCABytes(trustedCA) },
    connectionTimeoutMillis: RECOVERY_LIMITS.connectMs, query_timeout: RECOVERY_LIMITS.queryMs,
    // Defense in depth only: Supavisor may discard this startup option.
    options: '-c default_transaction_read_only=on',
    application_name: 'zikuk_readonly_recovery_verification' };
}
export function loadPrivateRecoveryManifests(directory, io = { lstatSync, readdirSync, openSync, fstatSync, readSync, closeSync }, uid = process.getuid()) {
  const dir = io.lstatSync(directory);
  requireCheck(dir.isDirectory() && !dir.isSymbolicLink() && dir.uid === uid && (dir.mode & 0o077) === 0, 'PRIVATE_SCOPE_UNAVAILABLE');
  const names = io.readdirSync(directory).sort();
  // A temporary or unrecognized entry means the five-run inventory is incomplete.
  requireCheck(names.length === 5 && names.every(n => n.endsWith('.json') && UUID.test(n.slice(0, -5))), 'PRIVATE_SCOPE_UNAVAILABLE');
  return names.map(name => {
    const fd = io.openSync(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = io.fstatSync(fd);
      requireCheck(stat.isFile() && stat.uid === uid && (stat.mode & 0o077) === 0 && stat.size <= 200000, 'PRIVATE_SCOPE_UNAVAILABLE');
      const buffer = Buffer.alloc(200001); let used = 0;
      while (used < buffer.length) {
        const n = io.readSync(fd, buffer, used, buffer.length - used, used);
        if (n === 0) break;
        used += n;
      }
      requireCheck(used > 0 && used <= 200000, 'PRIVATE_SCOPE_UNAVAILABLE');
      const manifest = JSON.parse(buffer.subarray(0, used).toString('utf8'));
      requireCheck(manifest?.run === name.slice(0, -5), 'PRIVATE_SCOPE_UNAVAILABLE');
      return manifest;
    } finally { io.closeSync(fd); }
  });
}

export function finishRecoveryReports(reports, output = {
  write: value => writeSync(1, value), exit: code => process.exit(code), setExitCode: code => { process.exitCode = code; },
}, diagnostic) {
  // Synchronous sanitized output precedes the hard exit, so queued stdout is not lost.
  try {
    for (const report of reports) output.write(JSON.stringify(report) + '\n');
    if (diagnostic) output.write(JSON.stringify(diagnostic.summary()) + '\n');
  }
  catch { output.exit(1); return; }
  if (reports.some(r => r.status === 'UNKNOWN')) {
    // Last resort for a stalled pg.end(): process termination closes the dedicated
    // socket at the OS boundary. Never retain an open connection waiting on a promise.
    output.exit(1);
  } else output.setExitCode(reports.every(r => r.status === 'CLEAR') ? 0 : 1);
}

async function main() {
  let reports = unknownRecoveryResults(), client;
  const diagnostic = createRecoveryDiagnostics();
  try {
    requireCheck(process.argv.length === 2 && process.stdin.isTTY && process.stdout.isTTY, 'PRIVATE_TERMINAL_REQUIRED');
    requireCheck(process.execArgv.length === 0 && !['NODE_OPTIONS','NODE_DEBUG','NODE_DEBUG_NATIVE','SSLKEYLOGFILE',
      'PGOPTIONS','PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGPASSFILE',
      'PGSERVICE','PGSERVICEFILE','PGSSLMODE','PGSSLROOTCERT','PGSSLCERT','PGSSLKEY'].some(k => process.env[k]), 'UNSAFE_RUNTIME');
    // Optional existing operator dependency; no automatic installation or fallback.
    const pg = await import('pg');
    const Client = pg.Client ?? pg.default?.Client;
    requireCheck(typeof Client === 'function', 'DATABASE_DRIVER_UNAVAILABLE');
    requireCheck(await privatePrompt('After separate approval type APPROVE G2.85 READ ONLY RECOVERY VERIFICATION')
      === 'APPROVE G2.85 READ ONLY RECOVERY VERIFICATION', 'NOT_AUTHORIZED');
    process.stdout.write('Privacy is procedural; a TTY does not exclude same-account observation. No recording, AI execution, debugger or shared terminal.\n');
    requirePrivacyAttestation(await privatePrompt('Type I ACCEPT PROCEDURAL PRIVACY'));
    requireCheck(await privatePrompt('Confirm staging project reference, hidden') === REF, 'WRONG_PROJECT');
    const trustedCA = loadRecoveryCA(); // Missing/unproven trust stops before private inputs.
    const accountIds = [await privatePrompt('Designated account A UUID, hidden'), await privatePrompt('Designated account B UUID, hidden')];
    const manifests = loadPrivateRecoveryManifests(join(homedir(), '.zikuk-g285-private'));
    validateRecoveryScopes(manifests, accountIds, REF);
    let password = await privatePrompt('Staging postgres database password, hidden');
    try {
      requireCheck(password.length > 0, 'PRIVATE_CONNECTION_UNAVAILABLE');
      client = new Client(recoveryConnectionConfig(password, REF, RECOVERY_ENDPOINT, trustedCA));
    } finally { password = ''; }
    // Never print driver errors: they may include SQL parameters or connection data.
    let connectionError = false;
    client.on('error', error => { connectionError = true; diagnostic.fail(error); });
    reports = await verifyRecoverySession(manifests, accountIds, client, REF, { diagnostic });
    if (connectionError) reports = unknownRecoveryResults();
  } catch (error) { diagnostic.fail(error); reports = unknownRecoveryResults(); }
  finishRecoveryReports(reports, undefined, diagnostic);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    finishRecoveryReports(unknownRecoveryResults());
  });
}
