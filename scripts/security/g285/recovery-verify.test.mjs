import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { REF } from './adapter.mjs';
import { plan } from './core.mjs';
import { serializePlan } from './scope.mjs';
import { loadPrivateRecoveryManifests } from './recovery-operator.mjs';
import { validateRecoveryScopes, verifyRecoveryScopes, RECOVERY_GUARD_SQL, RECOVERY_COUNTS_SQL } from './recovery-verify.mjs';

// Synthetic in-memory registries only. No existing private directory is accessed.
function fixtures() {
  const ids = [randomUUID(), randomUUID()];
  return { ids, manifests: Array.from({ length: 5 }, () => serializePlan(plan(ids.map(id => ({ id }))))) };
}
function connection({ guard = {}, counts = [], failAt = -1, rollbackFails = false } = {}) {
  const calls = []; let countQueries = 0;
  return { calls, async query(sql, parameters) {
    calls.push({ sql, parameters });
    if (sql === 'ROLLBACK') { if (rollbackFails) throw Error('PRIVATE_SENTINEL'); return { rows: [] }; }
    if (calls.length === failAt) throw Error('PRIVATE_SENTINEL');
    if (sql === RECOVERY_GUARD_SQL) return { rows: [{ read_only: true, stable_snapshot: true,
      no_hidden_rows: true, bypass_rls: true, can_inspect: true, ...guard }] };
    if (sql === RECOVERY_COUNTS_SQL) {
      const row = counts[countQueries++] ?? { rows_count: '0', storage_count: '0', total_count: '0' };
      return { rows: [row] };
    }
    return { rows: [] };
  } };
}
function assertUnknown(reports) {
  assert.equal(reports.length, 5);
  reports.forEach((r, i) => assert.deepEqual(r, { run: `Run ${i + 1}`, rowsRemaining: null,
    storageRemaining: null, totalRemaining: null, status: 'UNKNOWN' }));
}
test('five fully checked zero-count scopes report anonymous CLEAR without exposing inputs', async () => {
  const f = fixtures(), db = connection(); const r = await verifyRecoveryScopes(f.manifests, f.ids, db);
  assert.equal(r.length, 5); assert.ok(r.every(x => x.status === 'CLEAR' && x.totalRemaining === 0));
  assert.equal(db.calls.filter(x => x.sql === RECOVERY_COUNTS_SQL).length, 5);
  assert.equal(db.calls[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
  const output = JSON.stringify(r);
  for (const m of f.manifests) { assert.ok(!output.includes(m.run)); assert.ok(!output.includes(m.objects[0].path)); }
  for (const id of f.ids) assert.ok(!output.includes(id));
});
test('nonzero rows or Storage counts report LEFTOVERS, never cleanup or CLEAR', async () => {
  const f = fixtures(), db = connection({ counts: [{ rows_count: '2', storage_count: '3', total_count: '5' }] });
  const r = await verifyRecoveryScopes(f.manifests, f.ids, db);
  assert.deepEqual(r[0], { run: 'Run 1', rowsRemaining: 2, storageRemaining: 3, totalRemaining: 5, status: 'LEFTOVERS' });
  assert.ok(r.slice(1).every(x => x.status === 'CLEAR'));
});
test('incomplete batch or omitted required typed scope prevents every remote query', async () => {
  const f = fixtures();
  const p = plan(f.ids.map(id => ({ id }))); p.objects.pop();
  const missing = [serializePlan(p), ...f.manifests.slice(1)];
  for (const manifests of [f.manifests.slice(1), missing, [{ ...f.manifests[0], rows: [] }, ...f.manifests.slice(1)]]) {
    const db = connection(); assertUnknown(await verifyRecoveryScopes(manifests, f.ids, db)); assert.equal(db.calls.length, 0);
  }
});
test('wrong project binding and wrong designated accounts fail before remote inspection', async () => {
  const f = fixtures();
  for (const [manifests, ids, ref] of [[f.manifests, f.ids, 'wrong-project'],
    [[{ ...f.manifests[0], ref: 'wrong-project' }, ...f.manifests.slice(1)], f.ids, REF],
    [f.manifests, [...f.ids].reverse(), REF]]) {
    const db = connection(); assertUnknown(await verifyRecoveryScopes(manifests, ids, db, ref)); assert.equal(db.calls.length, 0);
  }
});
test('malformed, wrong-digest and duplicate-run registries cannot trigger queries', async () => {
  const f = fixtures();
  for (const first of [null, {}, { ...f.manifests[0], digest: 'invalid' }, { ...f.manifests[0], marker: 'wrong-run' }]) {
    const db = connection(); assertUnknown(await verifyRecoveryScopes([first, ...f.manifests.slice(1)], f.ids, db)); assert.equal(db.calls.length, 0);
  }
  const db = connection(); assertUnknown(await verifyRecoveryScopes(Array(5).fill(f.manifests[0]), f.ids, db)); assert.equal(db.calls.length, 0);
});
test('ordinary role that could hide existing rows under RLS must report UNKNOWN', async () => {
  const f = fixtures(), db = connection({ guard: { bypass_rls: false } });
  assertUnknown(await verifyRecoveryScopes(f.manifests, f.ids, db));
  assert.equal(db.calls.filter(x => x.sql === RECOVERY_COUNTS_SQL).length, 0);
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
});
test('missing visibility privileges or unsafe transaction settings never produce CLEAR', async () => {
  const f = fixtures();
  for (const key of ['read_only','stable_snapshot','no_hidden_rows','bypass_rls','can_inspect']) {
    const db = connection({ guard: { [key]: false } });
    assertUnknown(await verifyRecoveryScopes(f.manifests, f.ids, db));
    assert.equal(db.calls.filter(x => x.sql === RECOVERY_COUNTS_SQL).length, 0);
  }
});
test('an interrupted third scope invalidates the entire batch, with no partial CLEAR output', async () => {
  const f = fixtures(), db = connection({ failAt: 10 });
  assertUnknown(await verifyRecoveryScopes(f.manifests, f.ids, db)); assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
});
test('malformed, incomplete, inconsistent or overflowing count results are UNKNOWN', async () => {
  const f = fixtures();
  for (const row of [{}, { rows_count: '0', storage_count: '0' },
    { rows_count: 0, storage_count: '0', total_count: '0' },
    { rows_count: '1', storage_count: '0', total_count: '0' },
    { rows_count: '-1', storage_count: '0', total_count: '-1' },
    { rows_count: '9007199254740992', storage_count: '0', total_count: '9007199254740992' },
    { rows_count: '0', storage_count: '0', total_count: '0', raw: 'PRIVATE_SENTINEL' }]) {
    const db = connection({ counts: [row] }); assertUnknown(await verifyRecoveryScopes(f.manifests, f.ids, db));
  }
});
test('rollback failure removes otherwise complete CLEAR results', async () => {
  const f = fixtures(); assertUnknown(await verifyRecoveryScopes(f.manifests, f.ids, connection({ rollbackFails: true })));
});
test('scope includes all unattempted IDs, exact objects, known IDs and reserved section prefixes', () => {
  const f = fixtures();
  const scopes = validateRecoveryScopes(f.manifests, f.ids);
  const first = scopes[0], manifest = f.manifests[0];
  assert.equal(first.sections.length + first.groups.length + first.items.length, manifest.rows.length);
  assert.equal(first.objects.length, manifest.objects.length);
  for (const o of manifest.objects) assert.ok(first.prefixes.some(x => x.bucket === o.bucket && x.prefix === o.prefix));
  for (const s of manifest.rows.filter(r => r.table === 'sections')) for (const bucket of ['pdfs','user-content']) {
    assert.ok(first.prefixes.some(x => x.bucket === bucket && x.prefix === `${s.value.user_id}/${s.value.id}`));
  }
  assert.ok(RECOVERY_COUNTS_SQL.includes('o.id::text'));
  assert.ok(RECOVERY_COUNTS_SQL.includes('scoped_sections') && RECOVERY_COUNTS_SQL.includes('scoped_groups'));
  assert.ok(!RECOVERY_COUNTS_SQL.includes('LIKE'));
});
test('SQL is static and parameterized; only read-only transaction settings, SELECT and ROLLBACK are submitted', async () => {
  const f = fixtures(), db = connection(); await verifyRecoveryScopes(f.manifests, f.ids, db);
  for (const call of db.calls) {
    assert.match(call.sql, /^(BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY|SET LOCAL|SELECT|WITH|ROLLBACK)/);
    assert.doesNotMatch(call.sql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|COPY|CALL|COMMIT|GRANT|REVOKE)\b/i);
    for (const id of f.ids) assert.ok(!call.sql.includes(id));
    if (call.sql === RECOVERY_COUNTS_SQL) assert.equal(call.parameters.length, 1);
  }
});

function privateFs(manifests) {
  const data = manifests.map(m => Buffer.from(JSON.stringify(m))); let opened = -1;
  const names = manifests.map(m => m.run + '.json');
  return {
    names, data,
    io: {
      lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: 123, mode: 0o700 }),
      readdirSync: () => [...names],
      openSync: (path, flags) => { assert.equal(flags, constants.O_RDONLY | constants.O_NOFOLLOW); opened = names.indexOf(path.split('/').at(-1)); return opened; },
      fstatSync: fd => ({ isFile: () => true, uid: 123, mode: 0o600, size: data[fd].length }),
      readSync: (fd, buffer, offset, length, position) => { const chunk = data[fd].subarray(position, position + length); chunk.copy(buffer, offset); return chunk.length; },
      closeSync: () => {},
    },
  };
}
test('operator loader uses read-only no-follow descriptors and validates filename/run binding', () => {
  const f = fixtures(), fs = privateFs(f.manifests);
  const loaded = loadPrivateRecoveryManifests('/operator-private', fs.io, 123);
  assert.equal(loaded.length, 5);
  fs.data[0] = Buffer.from(JSON.stringify({ ...f.manifests[0], run: randomUUID() }));
  assert.throws(() => loadPrivateRecoveryManifests('/operator-private', fs.io, 123));
});
test('operator loader rejects incomplete inventory, temporary files, unsafe permissions and malformed JSON', () => {
  for (const mode of ['missing','temporary','permissions','json','oversized','symlink']) {
    const f = fixtures(), fs = privateFs(f.manifests);
    if (mode === 'missing') fs.names.pop();
    if (mode === 'temporary') fs.names.push('interrupted.tmp');
    if (mode === 'permissions') fs.io.lstatSync = () => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: 123, mode: 0o755 });
    if (mode === 'json') fs.data[0] = Buffer.from('{');
    if (mode === 'oversized') fs.data[0] = Buffer.alloc(200001);
    if (mode === 'symlink') fs.io.openSync = () => { throw Error('PRIVATE_SENTINEL'); };
    assert.throws(() => loadPrivateRecoveryManifests('/operator-private', fs.io, 123), mode);
  }
});
