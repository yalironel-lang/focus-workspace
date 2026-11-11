import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { plan } from './core.mjs';
import { serializePlan } from './scope.mjs';
import { REF } from './adapter.mjs';
import { createRecoveryDiagnostics, failureCategory, tlsSubcategory } from './recovery-diagnostics.mjs';
import { verifyRecoverySession, unknownRecoveryResults, RECOVERY_COUNTS_SQL, RECOVERY_GUARD_SQL, RECOVERY_SESSION_GUARD_SQL } from './recovery-verify.mjs';
import { finishRecoveryReports } from './recovery-operator.mjs';

const limits = { connectMs: 40, queryMs: 40, rollbackMs: 40, endMs: 40, overallMs: 400 };
const never = () => new Promise(() => {});
const secretError = code => Object.assign(Error('PRIVATE_SENTINEL'), { code, detail: 'PRIVATE_SENTINEL' });
const zero = () => ({ rows: [{ rows_count: '0', storage_count: '0', total_count: '0' }] });
async function inspect(options = {}) {
  const ids = [randomUUID(), randomUUID()];
  const manifests = Array.from({ length: 5 }, () => serializePlan(plan(ids.map(id => ({ id })))));
  const diagnostic = createRecoveryDiagnostics(); let counts = 0;
  const db = {
    async connect() { if (options.connect) return options.connect(diagnostic); },
    async end() { if (options.end) return options.end(); },
    async query(sql) {
      if (sql === RECOVERY_SESSION_GUARD_SQL) return { rows: [{ default_read_only: true, read_only: true }] };
      if (sql === 'ROLLBACK') return options.rollback?.() ?? { rows: [] };
      if (sql.startsWith('BEGIN') && options.setup) return options.setup();
      if (sql === RECOVERY_GUARD_SQL) return options.guard?.() ?? { rows: [{ read_only: true, stable_snapshot: true,
        no_hidden_rows: true, bypass_rls: true, can_inspect: true }] };
      if (sql === RECOVERY_COUNTS_SQL) return options.count?.(++counts, diagnostic) ?? zero();
      return { rows: [] };
    },
  };
  if (options.invalidManifest) manifests[4].digest = 'invalid';
  const reports = await verifyRecoverySession(manifests, ids, db, REF, { diagnostic, limits });
  return { reports, diagnostic, counts };
}
function checkUnknown(result, stage, category) {
  assert.deepEqual(result.reports, unknownRecoveryResults());
  const summary = result.diagnostic.summary();
  assert.equal(summary.firstFailedStage, stage); assert.equal(summary.failureCategory, category);
  assert(!JSON.stringify(summary).includes('PRIVATE_SENTINEL'));
}

test('allowlisted categories never expose codes or arbitrary exception fields', () => {
  for (const [code, expected] of [['ENOTFOUND','network'], ['ERR_TLS_CERT_ALTNAME_INVALID','tls'],
    ['28P01','authentication'], ['42501','privilege'], ['57014','deadline'], ['PRIVATE_SENTINEL','unexplained']]) {
    assert.equal(failureCategory(secretError(code)), expected);
  }
  let reads = 0;
  assert.equal(failureCategory(Object.create({ code: '28P01' })), 'unexplained');
  assert.equal(failureCategory(Object.defineProperty({}, 'code', { get() { reads++; throw Error('PRIVATE_SENTINEL'); } })), 'unexplained');
  assert.equal(reads, 0);
});
test('validation failures are anonymous and precede connection', async () => {
  let connected = false;
  checkUnknown(await inspect({ invalidManifest: true, connect: () => { connected = true; } }), 'validation', 'unexplained');
  assert.equal(connected, false);
});
test('connect distinguishes network, TLS, authentication and unknown errors without raw values', async () => {
  for (const [code, expected] of [['ECONNREFUSED','network'],['CERT_HAS_EXPIRED','tls'],['28P01','authentication'],['other','unexplained']]) {
    checkUnknown(await inspect({ connect: () => { throw secretError(code); } }), 'connect', expected);
  }
});
test('setup, visibility, counts, rollback and disconnect failures retain correct stages', async () => {
  for (const [options, stage, category] of [
    [{ setup: () => { throw secretError('42501'); } }, 'transaction_setup', 'privilege'],
    [{ guard: () => ({ rows: [] }) }, 'visibility', 'invalid_result'],
    [{ count: () => ({ rows: [] }) }, 'counts', 'invalid_result'],
    [{ rollback: () => { throw secretError('ECONNRESET'); } }, 'rollback', 'network'],
    [{ end: () => { throw secretError('ECONNRESET'); } }, 'disconnect', 'network'],
  ]) checkUnknown(await inspect(options), stage, category);
});
test('visibility exposes only the existing boolean outcomes', async () => {
  const r = await inspect({ guard: () => ({ rows: [{ read_only: true, stable_snapshot: true,
    no_hidden_rows: true, bypass_rls: false, can_inspect: true }] }) });
  checkUnknown(r, 'visibility', 'privilege');
  assert.deepEqual(r.diagnostic.summary().visibility, { read_only: true, stable_snapshot: true,
    no_hidden_rows: true, bypass_rls: false, can_inspect: true });
  const malformed = await inspect({ guard: () => ({ rows: [{ read_only: 'PRIVATE_SENTINEL' }] }) });
  assert.equal(malformed.diagnostic.summary().visibility, null);
});
test('first count failure survives subsequent rollback and disconnect failure', async () => {
  const r = await inspect({ count: () => { throw secretError('42501'); },
    rollback: () => { throw secretError('ECONNRESET'); }, end: () => { throw secretError('ECONNRESET'); } });
  checkUnknown(r, 'counts', 'privilege'); assert.equal(r.diagnostic.summary().shutdownFailed, true);
});
test('stalls at connect, counts, rollback and disconnect remain UNKNOWN with deadline classification', async () => {
  for (const [options, stage] of [[{ connect: never },'connect'], [{ count: never },'counts'],
    [{ rollback: never },'rollback'], [{ end: never },'disconnect']]) {
    checkUnknown(await inspect(options), stage, 'deadline');
  }
});
test('partial counts and late resolution cannot restore CLEAR or replace first diagnostic', async () => {
  let release;
  const r = await inspect({ count: i => i === 3 ? new Promise(resolve => { release = resolve; }) : zero() });
  checkUnknown(r, 'counts', 'deadline'); assert.equal(r.counts, 3);
  const before = JSON.stringify(r.diagnostic.summary()); release(zero());
  await Promise.resolve(); await Promise.resolve();
  checkUnknown(r, 'counts', 'deadline'); assert.equal(JSON.stringify(r.diagnostic.summary()), before);
});
test('concurrent connection-error recording retains the first failure independently of later errors', async () => {
  const r = await inspect({ count: (i, d) => {
    d.fail(secretError('ECONNRESET')); throw secretError('42501');
  } });
  checkUnknown(r, 'counts', 'network');
});
test('diagnostic output appends one fixed summary without changing five result lines or exit behavior', async () => {
  const r = await inspect({ count: () => { throw secretError('PRIVATE_SENTINEL'); } });
  const writes = [], exits = [];
  finishRecoveryReports(r.reports, { write: s => writes.push(s), exit: c => exits.push(c), setExitCode: () => assert.fail() }, r.diagnostic);
  assert.equal(writes.length, 6);
  assert.deepEqual(writes.slice(0, 5).map(s => JSON.parse(s)), unknownRecoveryResults());
  assert.deepEqual(exits, [1]); assert(!writes.join('').includes('PRIVATE_SENTINEL'));
  assert.deepEqual(Object.keys(JSON.parse(writes[5])).sort(), ['failureCategory','firstFailedStage','shutdownFailed','tlsSubcategory','type','visibility'].sort());
});
test('success has no failure summary fields and diagnostic collector cannot promote invalid counts', async () => {
  const r = await inspect(); assert(r.reports.every(x => x.status === 'CLEAR'));
  assert.deepEqual(r.diagnostic.summary(), { type: 'RECOVERY_DIAGNOSTIC', firstFailedStage: null,
    failureCategory: null, tlsSubcategory: null, shutdownFailed: false, visibility: { read_only: true, stable_snapshot: true,
      no_hidden_rows: true, bypass_rls: true, can_inspect: true } });
  checkUnknown(await inspect({ count: () => ({ rows: [{ rows_count: '0', storage_count: '0', total_count: '1' }] }) }), 'counts', 'invalid_result');
});
test('unexplained stage and classification are fixed even with arbitrary supplied stage values', () => {
  const d = createRecoveryDiagnostics(); d.enter('PRIVATE_SENTINEL'); d.fail(secretError('PRIVATE_SENTINEL'));
  assert.equal(d.summary().firstFailedStage, 'unexplained'); assert.equal(d.summary().failureCategory, 'unexplained');
});

test('every allowlisted certificate code has a fixed TLS subcategory and full-session UNKNOWN', async () => {
  for (const [code, expected] of [
    ['DEPTH_ZERO_SELF_SIGNED_CERT','untrusted_chain'], ['SELF_SIGNED_CERT_IN_CHAIN','untrusted_chain'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE','untrusted_chain'], ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY','untrusted_chain'],
    ['CERT_HAS_EXPIRED','expired_certificate'], ['ERR_TLS_CERT_ALTNAME_INVALID','hostname_mismatch'],
    ['CERT_NOT_YET_VALID','other_tls'], ['CERT_REVOKED','other_tls'], ['CERT_SIGNATURE_FAILURE','other_tls'],
  ]) {
    const r = await inspect({ connect: () => { throw secretError(code); } });
    checkUnknown(r, 'connect', 'tls'); assert.equal(r.counts, 0);
    assert.equal(r.diagnostic.summary().tlsSubcategory, expected);
  }
});
test('unknown or malformed code cannot leak text or invent a TLS classification', () => {
  for (const code of ['PRIVATE_SENTINEL', 'ERR_TLS_PRIVATE_SENTINEL', undefined, null, {}, false, 42]) {
    const error = { code, message: 'PRIVATE_SENTINEL', cert: { subject: 'PRIVATE_SENTINEL' } };
    assert.equal(tlsSubcategory(error), 'other_tls');
    const d = createRecoveryDiagnostics(); d.enter('connect'); d.fail(error);
    assert.equal(d.summary().failureCategory, 'unexplained');
    assert.equal(d.summary().tlsSubcategory, null);
    assert(!JSON.stringify(d.summary()).includes('PRIVATE_SENTINEL'));
  }
});
test('inherited and accessor certificate codes are not evaluated or trusted', () => {
  let reads = 0;
  for (const error of [Object.create({ code: 'CERT_HAS_EXPIRED' }),
    Object.defineProperty({}, 'code', { get() { reads++; throw Error('PRIVATE_SENTINEL'); } })]) {
    assert.equal(tlsSubcategory(error), 'other_tls');
    const d = createRecoveryDiagnostics(); d.fail(error); assert.equal(d.summary().tlsSubcategory, null);
  }
  assert.equal(reads, 0);
});
test('concurrent TLS failures and shutdown errors cannot replace first TLS subtype', async () => {
  const d = createRecoveryDiagnostics(); d.enter('connect');
  await Promise.all([
    Promise.resolve().then(() => d.fail(secretError('CERT_HAS_EXPIRED'))),
    Promise.resolve().then(() => d.fail(secretError('ERR_TLS_CERT_ALTNAME_INVALID'))),
  ]);
  d.enter('disconnect'); d.fail(secretError('SELF_SIGNED_CERT_IN_CHAIN'));
  assert.equal(d.summary().tlsSubcategory, 'expired_certificate');
  assert.equal(d.summary().firstFailedStage, 'connect'); assert.equal(d.summary().shutdownFailed, true);
  const n = createRecoveryDiagnostics(); n.enter('connect'); n.fail(secretError('ENOTFOUND'));
  n.enter('disconnect'); n.fail(secretError('CERT_HAS_EXPIRED'));
  assert.equal(n.summary().failureCategory, 'network'); assert.equal(n.summary().tlsSubcategory, null);
});
test('certificate metadata and arbitrary exception fields never enter appended diagnostic output', async () => {
  const r = await inspect({ connect: () => { throw Object.assign(secretError('SELF_SIGNED_CERT_IN_CHAIN'),
    { hostname: 'PRIVATE_SENTINEL', cert: { issuer: 'PRIVATE_SENTINEL', subject: 'PRIVATE_SENTINEL' },
      stack: 'PRIVATE_SENTINEL', password: 'PRIVATE_SENTINEL' }); } });
  const writes = [];
  finishRecoveryReports(r.reports, { write: s => writes.push(s), exit: c => assert.equal(c, 1), setExitCode: () => assert.fail() }, r.diagnostic);
  assert.equal(writes.length, 6); assert(!writes.join('').includes('PRIVATE_SENTINEL'));
  assert.deepEqual(writes.slice(0, 5).map(s => JSON.parse(s)), unknownRecoveryResults());
  assert.equal(JSON.parse(writes[5]).tlsSubcategory, 'untrusted_chain');
});
