import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { plan } from './core.mjs';
import { serializePlan } from './scope.mjs';
import { REF } from './adapter.mjs';
import { RecoveryDeadlines, RECOVERY_LIMITS } from './recovery-deadlines.mjs';
import { verifyRecoverySession, unknownRecoveryResults, RECOVERY_GUARD_SQL, RECOVERY_COUNTS_SQL, RECOVERY_SESSION_GUARD_SQL } from './recovery-verify.mjs';
import { finishRecoveryReports } from './recovery-operator.mjs';

const limits = { connectMs: 40, queryMs: 40, rollbackMs: 40, endMs: 40, overallMs: 400 };
const never = () => new Promise(() => {});
const zero = () => ({ rows: [{ rows_count: '0', storage_count: '0', total_count: '0' }] });
function fixture() {
  const ids = [randomUUID(), randomUUID()];
  return { ids, manifests: Array.from({ length: 5 }, () => serializePlan(plan(ids.map(id => ({ id }))))) };
}
function database(options = {}) {
  const calls = []; let count = 0;
  return {
    calls,
    connect() { calls.push('connect'); return options.connect?.() ?? Promise.resolve(); },
    end() { calls.push('end'); return options.end?.() ?? Promise.resolve(); },
    async query(sql) {
      calls.push(sql);
      if (sql === RECOVERY_SESSION_GUARD_SQL) return { rows: [{ default_read_only: true, read_only: true }] };
      if (sql === 'ROLLBACK') return options.rollback?.() ?? { rows: [] };
      if (sql === RECOVERY_GUARD_SQL) return { rows: [{ read_only: true, stable_snapshot: true,
        no_hidden_rows: true, bypass_rls: true, can_inspect: true }] };
      if (sql === RECOVERY_COUNTS_SQL) return options.count?.(++count) ?? zero();
      return { rows: [] };
    },
  };
}
async function inspect(db, customLimits = limits, f = fixture()) {
  let watchdog;
  try {
    return await Promise.race([
      verifyRecoverySession(f.manifests, f.ids, db, REF, { limits: customLimits }),
      new Promise((_, reject) => { watchdog = setTimeout(() => reject(Error('LOCAL_TEST_WATCHDOG')), 1500); }),
    ]);
  } finally { clearTimeout(watchdog); }
}
const unknown = r => assert.deepEqual(r, unknownRecoveryResults());

test('never-settling count query ends the dedicated client and returns five UNKNOWN results', async () => {
  const db = database({ count: never }); unknown(await inspect(db));
  assert.equal(db.calls.filter(x => x === RECOVERY_COUNTS_SQL).length, 1);
  assert.equal(db.calls.filter(x => x === 'end').length, 1);
  assert.equal(db.calls.includes('ROLLBACK'), false); // Do not queue rollback behind a stalled operation.
});
test('never-settling rollback invalidates completed zero counts and ends without waiting', async () => {
  const db = database({ rollback: never }); unknown(await inspect(db));
  assert.equal(db.calls.filter(x => x === RECOVERY_COUNTS_SQL).length, 5);
  assert.equal(db.calls.filter(x => x === 'ROLLBACK').length, 1);
  assert.equal(db.calls.filter(x => x === 'end').length, 1);
});
test('never-settling disconnect invalidates CLEAR and operator finalization closes the process boundary', async () => {
  const db = database({ end: never }); const reports = await inspect(db); unknown(reports);
  const writes = [], exits = [];
  finishRecoveryReports(reports, { write: s => writes.push(s), exit: code => exits.push(code),
    setExitCode: () => assert.fail('UNKNOWN must not leave a potentially open socket alive') });
  assert.equal(writes.length, 5); assert.deepEqual(writes.map(s => JSON.parse(s)), unknownRecoveryResults());
  assert.deepEqual(exits, [1]); assert.equal(db.calls.filter(x => x === 'end').length, 1);
});
test('late query success cannot resume the count loop or replace final UNKNOWN', async () => {
  let release;
  const db = database({ count: () => new Promise(resolve => { release = resolve; }) });
  const reports = await inspect(db); unknown(reports); const before = JSON.stringify(reports);
  release(zero()); await Promise.resolve(); await Promise.resolve();
  assert.equal(JSON.stringify(reports), before);
  assert.equal(db.calls.filter(x => x === RECOVERY_COUNTS_SQL).length, 1);
});
test('partial successful scopes followed by a never-settling count cannot emit partial CLEAR', async () => {
  const db = database({ count: i => i === 3 ? never() : zero() }); unknown(await inspect(db));
  assert.equal(db.calls.filter(x => x === RECOVERY_COUNTS_SQL).length, 3);
  assert.equal(db.calls.filter(x => x === 'end').length, 1);
});
test('a connection failure during cancellation is suppressed and cannot hang or restore CLEAR', async () => {
  const db = database({ count: never, end: () => { throw Error('PRIVATE_SENTINEL'); } });
  const r = await inspect(db); unknown(r); assert.ok(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));
});
test('rejected cancellation promises do not become unhandled errors or expose driver detail', async () => {
  const db = database({ count: never, end: () => Promise.reject(Error('PRIVATE_SENTINEL')) });
  const r = await inspect(db); unknown(r); await Promise.resolve();
  assert.ok(!JSON.stringify(r).includes('PRIVATE_SENTINEL'));
});
test('connect rejection or nonsettlement returns UNKNOWN without starting a transaction', async () => {
  for (const connect of [() => Promise.reject(Error('PRIVATE_SENTINEL')), never]) {
    const db = database({ connect }); unknown(await inspect(db));
    assert.equal(db.calls.filter(x => x === 'end').length, 1);
    assert.equal(db.calls.some(x => x.startsWith('BEGIN')), false);
  }
});
test('overall deadline includes all queries and disconnect, even when individual operations stay below their limits', async () => {
  const db = database({ count: () => new Promise(resolve => setTimeout(() => resolve(zero()), 40)) });
  unknown(await inspect(db, { ...limits, queryMs: 100, overallMs: 60 }));
  assert.ok(db.calls.filter(x => x === RECOVERY_COUNTS_SQL).length < 5);
  assert.equal(db.calls.filter(x => x === 'end').length, 1);
});
test('late disconnect completion cannot promote a returned UNKNOWN result', async () => {
  let release;
  const db = database({ end: () => new Promise(resolve => { release = resolve; }) });
  const reports = await inspect(db); unknown(reports); release(); await Promise.resolve(); unknown(reports);
});
test('all five manifests still validate before connect, query or termination is attempted', async () => {
  const f = fixture(); f.manifests[4] = {};
  const db = database(); unknown(await inspect(db, limits, f)); assert.deepEqual(db.calls, []);
});
test('normal completion preserves CLEAR only after rollback and disconnect complete', async () => {
  const db = database(); const reports = await inspect(db);
  assert.ok(reports.every(r => r.status === 'CLEAR'));
  assert.equal(db.calls.at(-2), 'ROLLBACK'); assert.equal(db.calls.at(-1), 'end');
  const outputs = [], codes = [];
  finishRecoveryReports(reports, { write: s => outputs.push(s), exit: () => assert.fail('no hard exit for CLEAR'), setExitCode: c => codes.push(c) });
  assert.equal(outputs.length, 5); assert.deepEqual(codes, [0]);
});
test('test overrides may shorten, never disable or extend the production deadlines', () => {
  for (const overrides of [{ queryMs: 0 }, { endMs: Infinity }, { overallMs: RECOVERY_LIMITS.overallMs + 1 }, { unknown: 10 }]) {
    assert.throws(() => new RecoveryDeadlines(database(), overrides), /RECOVERY_DEADLINE_EXPIRED/);
  }
});
test('an output failure cannot prevent bounded process termination or print a raw exception', () => {
  const exits = [];
  assert.doesNotThrow(() => finishRecoveryReports(unknownRecoveryResults(), {
    write: () => { throw Error('PRIVATE_SENTINEL'); }, exit: code => exits.push(code),
    setExitCode: () => assert.fail('must terminate'),
  }));
  assert.deepEqual(exits, [1]);
});
