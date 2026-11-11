import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { checkServerIdentity } from 'node:tls';
import { REF } from './adapter.mjs';
import { plan } from './core.mjs';
import { serializePlan } from './scope.mjs';
import { recoveryConnectionConfig, RECOVERY_ENDPOINT } from './recovery-operator.mjs';
import { verifyRecoverySession, unknownRecoveryResults, RECOVERY_SESSION_SETUP_SQL,
  RECOVERY_SESSION_GUARD_SQL, RECOVERY_GUARD_SQL, RECOVERY_COUNTS_SQL } from './recovery-verify.mjs';
import { createRecoveryDiagnostics } from './recovery-diagnostics.mjs';
import { validateRecoveryCA } from './recovery-ca.mjs';
import { syntheticCA, syntheticProvenance } from './test-ca-fixture.mjs';
const pem = syntheticCA();
const trustedCA = validateRecoveryCA(pem, syntheticProvenance(pem));

const limits = { connectMs: 40, queryMs: 40, rollbackMs: 40, endMs: 40, overallMs: 400 };
const never = () => new Promise(() => {});
async function inspect(options = {}) {
  const ids = [randomUUID(), randomUUID()];
  const manifests = Array.from({ length: 5 }, () => serializePlan(plan(ids.map(id => ({ id })))));
  const calls = []; let readOnly = false, ended = 0;
  const db = {
    async connect() { calls.push('connect'); if (options.connect) return options.connect(); },
    async end() { ended++; if (options.end) return options.end(); },
    async query(sql, parameters) {
      calls.push(sql);
      if (sql === RECOVERY_SESSION_SETUP_SQL) {
        if (options.setup) return options.setup();
        readOnly = true; return { rows: [] };
      }
      if (sql === RECOVERY_SESSION_GUARD_SQL) {
        if (options.session) return options.session();
        return { rows: [{ default_read_only: readOnly, read_only: readOnly }] };
      }
      if (sql.startsWith('BEGIN') && options.begin) return options.begin();
      if (sql === RECOVERY_GUARD_SQL) return { rows: [{ read_only: options.transactionReadOnly ?? true,
        stable_snapshot: true, no_hidden_rows: true, bypass_rls: true, can_inspect: true }] };
      if (sql === RECOVERY_COUNTS_SQL) {
        assert.equal(readOnly, true); assert.equal(parameters.length, 1);
        return { rows: [{ rows_count: '0', storage_count: '0', total_count: '0' }] };
      }
      if (sql === 'ROLLBACK' && options.rollback) return options.rollback();
      return { rows: [] };
    },
  };
  if (options.invalid) manifests[4].digest = 'invalid';
  const diagnostic = createRecoveryDiagnostics();
  const reports = await verifyRecoverySession(manifests, ids, db, REF, { limits, diagnostic });
  return { reports, calls, diagnostic, ended };
}
function unknown(r) { assert.deepEqual(r.reports, unknownRecoveryResults()); }
function noInspection(r) {
  assert(!r.calls.some(sql => sql.startsWith('BEGIN') || sql === RECOVERY_COUNTS_SQL || sql === RECOVERY_GUARD_SQL));
}

test('exact staging session pooler settings retain TLS and original deadlines without overrides', () => {
  const c = recoveryConnectionConfig('synthetic-not-a-credential', REF, RECOVERY_ENDPOINT, trustedCA);
  assert.equal(c.host, 'aws-0-eu-west-1.pooler.supabase.com'); assert.equal(c.port, 5432);
  assert.equal(c.database, 'postgres'); assert.equal(c.user, 'postgres.lmgrhmyurhjlwwdedojk');
  assert.equal(c.ssl.rejectUnauthorized, true); assert.equal(c.ssl.ca, pem);
  assert.equal(c.ssl.checkServerIdentity, undefined); assert.equal(c.ssl.servername, undefined);
  assert.equal(c.connectionTimeoutMillis, 5000); assert.equal(c.query_timeout, 6000);
  assert.equal(c.options, '-c default_transaction_read_only=on');
  assert.equal(checkServerIdentity(c.host, { subjectaltname: `DNS:${c.host}` }), undefined);
  assert(checkServerIdentity('wrong.invalid', { subjectaltname: `DNS:${c.host}` }) instanceof Error);
});
test('wrong project, host, port, database, user or injected connection string are rejected', () => {
  assert.throws(() => recoveryConnectionConfig('synthetic', 'wrong'), /WRONG_PROJECT_OR_ENDPOINT/);
  for (const patch of [{ host: 'wrong.invalid' }, { port: 6543 }, { database: 'wrong' }, { user: 'postgres' },
    { connectionString: 'synthetic' }]) {
    assert.throws(() => recoveryConnectionConfig('synthetic', REF, { ...RECOVERY_ENDPOINT, ...patch }), /WRONG_PROJECT_OR_ENDPOINT/);
  }
});
test('dropped startup option is safely replaced before any transaction or scope inspection', async () => {
  const r = await inspect(); assert(r.reports.every(x => x.status === 'CLEAR'));
  assert.deepEqual(r.calls.slice(0, 3), ['connect', RECOVERY_SESSION_SETUP_SQL, RECOVERY_SESSION_GUARD_SQL]);
  assert(r.calls[3].startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  assert.equal(r.calls.filter(x => x === RECOVERY_COUNTS_SQL).length, 5); assert.equal(r.ended, 1);
  assert.equal(r.calls.filter(x => x === 'ROLLBACK').length, 1);
});
test('failed or silently ignored session SET never permits data inspection', async () => {
  for (const setup of [async () => { throw Error('PRIVATE_SENTINEL'); }, async () => ({ rows: [] })]) {
    const r = await inspect({ setup }); unknown(r); noInspection(r); assert.equal(r.ended, 1);
    assert.equal(r.diagnostic.summary().firstFailedStage, 'transaction_setup');
  }
});
test('false, missing and malformed read-only verification fail closed before inspection', async () => {
  for (const rows of [[], [{ default_read_only: true, read_only: false }],
    [{ default_read_only: false, read_only: true }], [{ default_read_only: 'on', read_only: true }],
    [{ default_read_only: true, read_only: true, extra: 'PRIVATE_SENTINEL' }]]) {
    const r = await inspect({ session: async () => ({ rows }) }); unknown(r); noInspection(r);
    assert.equal(r.diagnostic.summary().failureCategory, 'invalid_result');
    assert(!JSON.stringify(r.diagnostic.summary()).includes('PRIVATE_SENTINEL'));
  }
});
test('setup/query deadlines and interruption stop before scope inspection and end once', async () => {
  for (const options of [{ setup: never }, { session: never },
    { session: async () => { throw Object.assign(Error('PRIVATE_SENTINEL'), { code: 'ECONNRESET' }); } }]) {
    const r = await inspect(options); unknown(r); noInspection(r); assert.equal(r.ended, 1);
  }
});
test('late session guard success cannot resume inspection after deadline', async () => {
  let release;
  const r = await inspect({ session: () => new Promise(resolve => { release = resolve; }) });
  unknown(r); release({ rows: [{ default_read_only: true, read_only: true }] });
  await Promise.resolve(); await Promise.resolve(); unknown(r); noInspection(r);
});
test('BEGIN failure and effective writable transaction prohibit all counts', async () => {
  for (const options of [{ begin: async () => { throw Error('PRIVATE_SENTINEL'); } }, { transactionReadOnly: false }]) {
    const r = await inspect(options); unknown(r); assert(!r.calls.includes(RECOVERY_COUNTS_SQL));
    assert(r.calls.includes('ROLLBACK')); assert.equal(r.ended, 1);
  }
});
test('shutdown failure cannot retain CLEAR after successful enforced inspection', async () => {
  for (const options of [{ end: never }, { rollback: async () => { throw Error('PRIVATE_SENTINEL'); } },
    { end: async () => { throw Error('PRIVATE_SENTINEL'); } }]) {
    const r = await inspect(options); unknown(r); assert.equal(r.ended, 1);
    assert.equal(r.diagnostic.summary().shutdownFailed, true);
  }
});
test('all-five validation remains before even session setup or connection', async () => {
  const r = await inspect({ invalid: true }); unknown(r); assert.equal(r.calls.length, 0); assert.equal(r.ended, 0);
});
