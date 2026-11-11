import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { runAcceptance, pdf, plan, cleanupPlan, deniedError, crossDownloadDiagnostic, crossSignDiagnostic, compositePdfIsolation, compositePdfSigningIsolation, EXPECTED_CASES, requireComplete } from './core.mjs';
import { checkKey, REF, ORIGIN, boundedFetch, authenticate, makeClient, adapter, TEST_ACCOUNTS } from './adapter.mjs';
import { serializePlan, restorePlan, privatePrompt, PRIVACY_ASSURANCE, requirePrivacyAttestation, durableManifest } from './operator.mjs';

import { backend, ok, denied, copy } from './synthetic-backend.mjs';
test('complete symmetric matrix passes and cleans fixtures; existing unrelated data survives', async () => {
  const b = backend(); const outsider = randomUUID(); const id = randomUUID();
  b.db.sections.set(id, { id, user_id: outsider, title: 'Existing unrelated data' });
  const events = []; const report = await runAcceptance(b.clients, e => events.push(e));
  assert.equal(report.status, 'PASS'); assert.equal(report.cleanup, 'PASS'); assert.equal(report.cases, 72);
  assert.equal(b.db.sections.size, 1); assert.equal(b.db.groups.size, 0); assert.equal(b.db.items.size, 0); assert.equal(b.objects.size, 0);
  assert.equal(b.db.sections.get(id).title, 'Existing unrelated data');
  for (const direction of ['0', '1']) for (const bucket of ['pdfs', 'user-content']) for (const op of ['list', 'download', 'sign', 'upload', 'overwrite', 'update', 'move-foreign-source', 'move-owned-to-foreign', 'delete'])
    assert.ok(report.results.some(r => r.case === `cross-${direction}-${bucket}-${op}` && r.status === 'PASS'));
  const output = JSON.stringify(events);
  assert.ok(!output.includes('PRIVATE_SENTINEL')); assert.ok(!output.includes('signed-url')); for (const c of b.clients) assert.ok(!output.includes(c.id));
});
test('identity collision stops before any fixture write', async () => {
  const b = backend(); await assert.rejects(() => runAcceptance([b.clients[0], b.clients[0]]), /DISTINCT_USERS_REQUIRED/);
  assert.equal(b.db.sections.size, 0);
});
test('an actual cross-user update is caught by integrity checks and stops further cases', async () => {
  const b = backend(); const a = b.clients[0]; const original = a.update;
  a.update = async (t, id, patch) => {
    const row = b.db[t].get(id);
    if (t === 'sections' && row && row.user_id !== a.id) { b.db[t].set(id, { ...row, ...patch }); return ok([{ id }]); }
    return original(t, id, patch);
  };
  const r = await runAcceptance(b.clients); assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'ROW_INTEGRITY_FAILURE');
  assert.equal(r.results.at(-1).case, 'cross-0-sections-update'); assert.equal(r.cleanup, 'PASS'); assert.equal(b.db.sections.size, 0);
});
test('mutation hidden behind an error is caught; storage owner cannot falsely report unchanged', async () => {
  const b = backend(); const a = b.clients[0]; const orig = a.overwrite;
  a.overwrite = async (bucket, path, bytes) => {
    if (!path.startsWith(a.id + '/')) { const o = b.objects.get(bucket + ':' + path); if (o) o.bytes = Buffer.from('corrupt'); return denied(); }
    return orig(bucket, path, bytes);
  };
  const r = await runAcceptance(b.clients); assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'OBJECT_BYTES_MISMATCH'); assert.equal(r.cleanup, 'PASS');
});
test('service/schema error cannot be counted as an authorization denial', async () => {
  const b = backend(); const a = b.clients[0]; const original = a.download;
  a.download = (bucket, path) => path.startsWith(a.id + '/') ? original(bucket, path) : { data: null, error: { status: 503, message: 'PRIVATE_SENTINEL' } };
  const r = await runAcceptance(b.clients); assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED');
  assert.equal(deniedError({ error: { status: 400 } }), false);
  assert.equal(deniedError({ error: { status: 403, statusCode: 'AccessDenied' } }), true);
  assert.equal(deniedError({ error: { status: 400, statusCode: 'NoSuchKey' } }), true);
  for (const [status, code] of [[401, 'InvalidJWT'], [404, 'NoSuchBucket'], [404, 'TenantNotFound'], [403, 'InvalidSignature']])
    assert.equal(deniedError({ error: { status, statusCode: code } }), false);
});
test('cleanup refuses parent deletion with unregistered children', async () => {
  const b = backend(); const p = plan(b.clients); const row = p.actors[0].main[0]; row.attempted = true;
  await row.owner.insert('sections', row.value);
  const extra = { id: randomUUID(), section_id: row.value.id, title: 'NOT A RUN FIXTURE' }; b.db.groups.set(extra.id, extra);
  assert.equal(await cleanupPlan(p), 'BLOCKED'); assert.ok(b.db.sections.has(row.value.id)); assert.ok(b.db.groups.has(extra.id));
});
test('cleanup failures force final FAIL even when every isolation assertion passes', async () => {
  const b = backend(); let checkpoint;
  const emit = e => { if (e.case === 'cross-1-items-reassign') b.clients[0].removeObject = async () => { throw new Error('PRIVATE_SENTINEL'); }; };
  const r = await runAcceptance(b.clients, emit, randomUUID, p => { checkpoint = p; });
  assert.equal(r.status, 'FAIL'); assert.equal(r.cleanup, 'BLOCKED'); assert.ok(checkpoint);
});
test('checkpoint retains the complete typed registry without clients or sessions', async () => {
  const b = backend(); let last;
  const r = await runAcceptance(b.clients, () => {}, randomUUID, p => { last = serializePlan(p); });
  assert.equal(r.status, 'PASS'); assert.equal(last.ref, REF);
  const json = JSON.stringify(last); assert.ok(!/password|email|access_token|refresh_token|signedUrl/.test(json));
  const restored = restorePlan(last, b.clients); assert.equal(await cleanupPlan(restored), 'PASS');
  assert.throws(() => restorePlan({ ...last, ref: 'another-project' }, b.clients), /MANIFEST_DIGEST_MISMATCH/);
  const tampered = copy(last); tampered.objects[0].path = `${b.clients[0].id}/../real.pdf`;
  assert.throws(() => restorePlan(tampered, b.clients), /MANIFEST_DIGEST_MISMATCH/);
  assert.throws(() => restorePlan(last, [...b.clients].reverse()), /RECOVERY_IDENTITY_MISMATCH/);
});
test('PDF is validly structured with a correct xref offset', () => {
  const bytes = pdf('G285-example'); const text = bytes.toString(); const start = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(bytes.subarray(start, start + 4).toString(), 'xref'); assert.ok(text.includes('/Type /Page')); assert.throws(() => pdf('bad)label'), /INVALID_PDF_LABEL/);
});
test('admin and other-project keys are rejected; no ambient environment is loaded', () => {
  const jwt = c => `e30.${Buffer.from(JSON.stringify(c)).toString('base64url')}.signature`;
  assert.doesNotThrow(() => checkKey('sb_publishable_synthetic'));
  assert.doesNotThrow(() => checkKey(jwt({ role: 'anon', ref: REF })));
  assert.throws(() => checkKey(jwt({ role: 'service_role', ref: REF })), /NON_STAGING_OR_ADMIN_KEY/);
  assert.throws(() => checkKey(jwt({ role: 'anon', ref: 'other' })), /NON_STAGING_OR_ADMIN_KEY/);
  assert.throws(() => checkKey('sb_secret_synthetic'), /INVALID_KEY_OR_SESSION/);
});
test('endpoint guard blocks production/redirects/unrelated APIs and bounds requests', async () => {
  let called = 0; const fetcher = boundedFetch(async (url, opts) => { called++; assert.equal(opts.redirect, 'error'); return { status: 200 }; }, 1);
  await assert.rejects(() => fetcher('https://other.supabase.co/auth/v1/user'), /ENDPOINT_MISMATCH/);
  await assert.rejects(() => fetcher(`${ORIGIN}/rest/v1/unrelated`), /UNEXPECTED_API/);
  await assert.rejects(() => fetcher(`${ORIGIN}/auth/v1/user-other`), /UNEXPECTED_API/);
  assert.equal(called, 0); await fetcher(`${ORIGIN}/auth/v1/user`); await assert.rejects(() => fetcher(`${ORIGIN}/auth/v1/user`), /REQUEST_OR_TIME_BUDGET/);
  fetcher.beginCleanup(); await fetcher(`${ORIGIN}/auth/v1/user`); assert.equal(called, 2);
});
test('private handoff refuses a captured/non-TTY process before accepting input', () => {
  assert.throws(() => privatePrompt('unused'), /PRIVATE_TERMINAL_REQUIRED/);
});
test('cross-user signed URL creation succeeds unexpectedly: stop without reporting URL', async () => {
  const b = backend(); const original = b.clients[0].sign;
  b.clients[0].sign = (bucket, path) => path.startsWith(b.clients[0].id + '/') ? original(bucket, path) : ok({ signedUrl: 'PRIVATE_SENTINEL' });
  const emitted = []; const r = await runAcceptance(b.clients, e => emitted.push(e));
  assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'CROSS_USER_SIGN_ALLOWED_OR_UNEXPLAINED'); assert.equal(r.cleanup, 'PASS');
  assert.ok(!JSON.stringify(emitted).includes('PRIVATE_SENTINEL'));
});
test('signed URL ambiguous denials and successful empty responses fail at case nine without leaking output', async () => {
  for (const response of [
    { data: null, error: { status: 400, statusCode: '404', name: 'StorageApiError' } },
    { data: null, error: { status: 400, statusCode: 'NoSuchBucket' } },
    { data: null, error: { status: 400, statusCode: 'InvalidJWT' } },
    { data: null, error: { status: 409 } },
    { data: null, error: null }, { data: {}, error: null },
    { data: { signedUrl: '' }, error: null },
    { data: { signedUrl: 'PRIVATE_SENTINEL' }, error: { status: 403 } },
  ]) {
    const b = backend(), original = b.clients[0].sign, events = [];
    b.clients[0].sign = (bucket, path) => path.startsWith(b.clients[0].id + '/') ? original(bucket, path) : response;
    const r = await runAcceptance(b.clients, e => events.push(e));
    assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'CROSS_USER_SIGN_ALLOWED_OR_UNEXPLAINED');
    assert.equal(r.cases, 9); assert.equal(r.cleanup, 'PASS');
    assert(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
  }
});
test('installed SDK signing preserves original symbolic distinction diagnostically without accepting normalized denial', async () => {
  for (const code of ['NoSuchKey', 'NoSuchBucket']) {
    let calls = 0;
    const client = makeClient('sb_publishable_synthetic', boundedFetch(async (url, init) => {
      calls++; assert.equal(init.method, 'POST'); assert(new URL(url).pathname.includes('/object/sign/'));
      return new Response(JSON.stringify({ code, statusCode: '404', message: 'PRIVATE_SENTINEL' }),
        { status: 400, headers: { 'content-type': 'application/json' } });
    }));
    const r = await adapter(client, randomUUID()).sign('pdfs', 'synthetic/object.pdf');
    assert.equal(calls, 1); assert.equal(r.data, null);
    assert.equal(r.error.status, 400); assert.equal(r.error.statusCode, '404');
    assert.equal(r.transportClassification, code === 'NoSuchKey' ? 'STORAGE_NO_SUCH_KEY' : 'STORAGE_NO_SUCH_BUCKET'); assert.equal(deniedError(r), false);
    assert.equal(compositePdfIsolation(r, { classification: 'OWNER_READBACK_MATCH', ownerAccessible: true,
      pathUnchanged: true, identityMatches: true, bytesMatch: true }, 'cross-0-pdfs-sign', 0), false);
  }
});
test('sign diagnostic only checks URL presence and never invokes a getter or emits sensitive values', () => {
  const r = { data: { signedUrl: 'PRIVATE_SENTINEL' }, error: null, transportClassification: 'TRANSPORT_SUCCESS_RESPONSE' };
  const d = crossSignDiagnostic(r, 'cross-0-pdfs-sign', 0);
  assert.equal(d.signedUrlPresent, true); assert.equal(d.dataPresent, true); assert.equal(d.classification, 'UNEXPECTED_SIGNING_DATA');
  assert(!JSON.stringify(d).includes('PRIVATE_SENTINEL'));
  let reads = 0;
  const data = Object.defineProperty({}, 'signedUrl', { get() { reads++; throw Error('PRIVATE_SENTINEL'); } });
  assert.equal(crossSignDiagnostic({ data, error: null }, 'cross-0-pdfs-sign', 0).classification, 'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  assert.equal(reads, 0);
  for (const response of [null, {}, [], { data: null }, { data: { signedUrl: 1 }, error: null }])
    assert.equal(crossSignDiagnostic(response, 'cross-0-pdfs-sign', 0).classification, 'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  assert.throws(() => crossSignDiagnostic(r, 'cross-0-pdfs-sign', 1), /INVALID_DIAGNOSTIC_CASE/);
});
test('signing transport evidence remains diagnostic only for normalized, operational and conflicting responses', async () => {
  for (const [body, status, expected] of [
    [{ code: 'NoSuchKey', statusCode: '404' }, 400, 'STORAGE_NO_SUCH_KEY'],
    [{ code: 'NoSuchBucket', statusCode: '404' }, 400, 'STORAGE_NO_SUCH_BUCKET'],
    [{ code: 'NoSuchKey', statusCode: '403' }, 400, 'TRANSPORT_CONTRADICTORY_ERROR'],
    [{ code: 'InvalidJWT', statusCode: '401' }, 400, 'STORAGE_AUTHENTICATION_ERROR'],
    [{ code: 'InternalError', statusCode: '500' }, 400, 'STORAGE_OPERATIONAL_ERROR'],
    [{ code: 'NoSuchKey', statusCode: '404' }, 409, 'TRANSPORT_CONTRADICTORY_ERROR'],
  ]) {
    const client = makeClient('sb_publishable_synthetic', boundedFetch(async () => new Response(JSON.stringify(body),
      { status, headers: { 'content-type': 'application/json' } })));
    const r = await adapter(client, randomUUID()).sign('pdfs', 'synthetic/object.pdf');
    const d = crossSignDiagnostic(r, 'cross-0-pdfs-sign', 0);
    assert.equal(d.transportClassification, expected); assert.equal(d.signedUrlPresent, false);
    assert(!JSON.stringify(d).includes('synthetic/object.pdf'));
  }
});
test('exact composite signing preserves both actor bindings, immediate owner readback and scoped cleanup', async () => {
  for (const direction of [0, 1]) {
    const b = backend(), events = [], original = b.clients[direction].sign;
    b.clients[direction].sign = (bucket, path) => bucket !== 'pdfs' || path.startsWith(b.clients[direction].id + '/') ? original(bucket, path)
      : { data: null, error: { name: 'StorageApiError', status: 400, statusCode: '404' }, transportClassification: 'STORAGE_NO_SUCH_KEY' };
    const r = await runAcceptance(b.clients, e => events.push(e));
    assert.equal(r.status, 'PASS'); assert.equal(r.cases, 72); assert.equal(r.cleanup, 'PASS'); requireComplete(r.results);
    const d = events.find(e => e.case === `cross-${direction}-pdfs-sign` && e.classification);
    assert.equal(d.actor, direction === 0 ? 'A' : 'B'); assert.equal(d.owner, direction === 0 ? 'B' : 'A');
    assert.equal(d.classification, 'UNRECOGNIZED_SDK_ERROR');
    const readbacks = events.filter(e => e.case === `cross-${direction}-pdfs-sign` && e.classification === 'OWNER_READBACK_MATCH');
    assert.equal(readbacks.length, 1);
    for (const client of b.clients) assert(!JSON.stringify(events).includes(client.id));
  }
});
test('sign transport only observes exact POST request and leaves successful responses unread', async () => {
  const { createDownloadTransport } = await import('./transport.mjs');
  let clones = 0; const response = { ok: true, clone() { clones++; throw Error('PRIVATE_SENTINEL'); } };
  const t = createDownloadTransport(async () => response, ORIGIN);
  const path = '/storage/v1/object/sign/pdfs/synthetic/object.pdf';
  for (const [url, method, expected] of [[ORIGIN + path, 'POST', 'TRANSPORT_SUCCESS_RESPONSE'],
    [ORIGIN + path, 'GET', 'TRANSPORT_NOT_OBSERVED'],
    [ORIGIN + path + '-other', 'POST', 'TRANSPORT_NOT_OBSERVED'],
    ['https://other.invalid' + path, 'POST', 'TRANSPORT_NOT_OBSERVED']]) {
    const r = await t.observeSign(path, () => t.fetch(url, { method }));
    assert.equal(r.response, response); assert.equal(r.transportClassification, expected);
  }
  assert.equal(clones, 0);
});
test('concurrent signing of same target is ambiguous; distinct and successive targets stay separate', async () => {
  const { createDownloadTransport } = await import('./transport.mjs');
  const path = '/storage/v1/object/sign/pdfs/synthetic/object.pdf';
  const t = createDownloadTransport(async () => new Response(JSON.stringify({ code: 'NoSuchKey', statusCode: '404' }),
    { status: 400 }), ORIGIN);
  let release; const gate = new Promise(resolve => { release = resolve; });
  const action = () => gate.then(() => t.fetch(ORIGIN + path, { method: 'POST' }));
  const a = t.observeSign(path, action), b = t.observeSign(path, action); release();
  const results = await Promise.all([a, b]);
  assert(results.every(r => r.transportClassification === 'TRANSPORT_CONTRADICTORY_ERROR'));
  const next = await t.observeSign(path, () => t.fetch(ORIGIN + path, { method: 'POST' }));
  assert.equal(next.transportClassification, 'STORAGE_NO_SUCH_KEY');
});
test('unknown setup outcome still leaves an exact attempted-fixture ledger and scoped cleanup', async () => {
  const b = backend(); const original = b.clients[0].insert; let first = true; let saved;
  b.clients[0].insert = async (...args) => { const r = await original(...args); if (first) { first = false; throw new Error('PRIVATE_SENTINEL'); } return r; };
  const r = await runAcceptance(b.clients, () => {}, randomUUID, p => { saved = serializePlan(p); });
  assert.equal(r.status, 'FAIL'); assert.equal(r.cleanup, 'PASS'); assert.equal(saved.rows.length, 12); assert.equal(saved.rows.filter(x => x.attempted).length, 1); assert.equal(b.db.sections.size, 0);
});
test('clients do not persist or refresh sessions, and authentication is server verified', async () => {
  let calls = 0; const client = makeClient('sb_publishable_synthetic', async () => { calls++; throw new Error('NO_NETWORK'); });
  assert.equal(client.auth.persistSession, false); assert.equal(client.auth.autoRefreshToken, false); assert.equal(client.auth.detectSessionInUrl, false); assert.equal(calls, 0);
  const id = randomUUID(); const token = `e30.${Buffer.from(JSON.stringify({ role: 'authenticated', iss: ORIGIN + '/auth/v1', sub: id })).toString('base64url')}.s`;
  const mock = { auth: { signInWithPassword: async () => ok({ session: { access_token: token } }), getUser: async () => ok({ user: { id, email: TEST_ACCOUNTS.A } }) } };
  assert.equal(await authenticate(mock, 'hidden', 'hidden', 'A'), id);
  mock.auth.getUser = async () => ok({ user: { id, email: TEST_ACCOUNTS.A, factors: [{ status: 'verified' }] } });
  await assert.rejects(() => authenticate(mock, 'hidden', 'hidden', 'A'), /MFA_OPERATOR_FLOW_REQUIRED/);
  mock.auth.getUser = async () => ok({ user: { id, email: TEST_ACCOUNTS.A, is_anonymous: true } });
  await assert.rejects(() => authenticate(mock, 'hidden', 'hidden', 'A'), /ANONYMOUS_SESSION_REJECTED/);
  mock.auth.getUser = async () => ok({ user: { id: randomUUID() } }); await assert.rejects(() => authenticate(mock, 'hidden', 'hidden', 'A'), /IDENTITY_UNVERIFIED/);
});
test('SDK row adapter scopes update/delete to exact ID and deletion to marker', async () => {
  const calls = []; const chain = new Proxy({}, { get: (_, prop) => (...args) => { calls.push([prop, ...args]); return chain; } });
  const c = { from: table => { calls.push(['from', table]); return chain; } };
  const a = adapter(c, randomUUID()); a.update('items', 'synthetic-id', { title: 'new' }); a.remove('items', 'synthetic-id', 'run:');
  assert.deepEqual(calls.filter(x => x[0] === 'eq'), [['eq', 'id', 'synthetic-id'], ['eq', 'id', 'synthetic-id']]);
  assert.ok(calls.some(x => x[0] === 'like' && x[1] === 'title' && x[2] === 'run:%'));
  assert.deepEqual(calls.filter(x => x[0] === 'retry'), [['retry', false], ['retry', false]]);
});

// G2.86/G2.87 adversarial regressions. All records and clients below are in memory.
function watchDeletes(b) {
  const events = [];
  for (const u of b.clients) for (const method of ['remove','removeObject']) {
    const orig = u[method]; u[method] = async (...args) => { events.push(method); return orig(...args); };
  }
  return events;
}
async function seedPlan(b) {
  const p = plan(b.clients);
  for (const r of p.rows) { r.attempted = true; const result = await r.owner.insert(r.table, r.value); assert.equal(result.error, null); }
  for (const o of p.objects) {
    o.attempted = true; await o.owner.upload(o.bucket, o.path, o.bytes);
    o.snapshot = { id: b.objects.get(`${o.bucket}:${o.path}`).id };
  }
  return p;
}
test('G2.86 false PASS: disappearing owner-updated items fail before any cross-user case', async () => {
  const b = backend(); let removed = 0;
  for (const u of b.clients) {
    const orig = u.update;
    u.update = async (t, id, patch) => {
      const result = await orig(t, id, patch);
      if (t === 'items' && patch.title?.endsWith(':owner-updated') && result.data?.length === 1) { b.db.items.delete(id); removed++; }
      return result;
    };
  }
  const r = await runAcceptance(b.clients);
  assert.equal(removed, 1); assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'ROW_INTEGRITY_FAILURE');
  assert.ok(!r.results.some(x => x.case.startsWith('cross-'))); assert.equal(r.cleanup, 'PASS');
});
test('owner update returning an ID without applying the requested change fails closed', async () => {
  const b = backend(); b.clients[0].update = async (t, id) => ok([{ id }]);
  const r = await runAcceptance(b.clients);
  assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'ROW_INTEGRITY_FAILURE'); assert.ok(!r.results.some(x => x.case.startsWith('cross-')));
});
test('wrong returned ID and altered immutable owner/parent cannot pass positive controls', async () => {
  for (const injection of ['wrong-id','wrong-owner','wrong-parent']) {
    const b = backend(); const u = b.clients[0]; const orig = u.update;
    u.update = async (t, id, patch) => {
      const r = await orig(t, id, patch);
      if (injection === 'wrong-id') return ok([{ id: randomUUID() }]);
      if (injection === 'wrong-owner' && t === 'sections') b.db.sections.get(id).user_id = b.clients[1].id;
      if (injection === 'wrong-parent' && t === 'groups') b.db.groups.get(id).section_id = randomUUID();
      return r;
    };
    const r = await runAcceptance(b.clients);
    assert.equal(r.status, 'FAIL'); assert.ok(!r.results.some(x => x.case.startsWith('cross-')));
  }
});
test('a victim disappearing after owner controls cannot start cross-user mutation attempts', async () => {
  const b = backend(); let p;
  const r = await runAcceptance(b.clients, event => {
    if (event.case === 'owner-1-user-content') b.db.items.delete(p.actors[1].main[2].value.id);
  }, randomUUID, value => { p = value; });
  assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'ROW_INTEGRITY_FAILURE'); assert.ok(!r.results.some(x => x.case.startsWith('cross-')));
});
test('exact completion rejects missing, skipped, duplicated, unknown or failing cases', () => {
  const all = EXPECTED_CASES.map(id => ({ case: id, status: 'PASS' }));
  assert.equal(EXPECTED_CASES.length, 72); assert.doesNotThrow(() => requireComplete(all));
  for (const bad of [[], all.slice(1), [...all, all[0]], [all[0], ...all.slice(0, -1)],
    all.map((r, i) => i ? r : { ...r, status: 'SKIPPED' }),
    all.map((r, i) => i ? r : { ...r, case: 'unknown' }), all.map((r, i) => i ? r : { ...r, status: 'FAIL' })])
    assert.throws(() => requireComplete(bad), /INCOMPLETE_CASE_MATRIX/);
});
test('removing a required fixture from the execution plan cannot silently skip cases', async () => {
  const b = backend(); let p;
  const r = await runAcceptance(b.clients, event => { if (event.case === 'owner-1-user-content') p.actors[1].objects.pop(); }, randomUUID, value => { p = value; });
  assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'INCOMPLETE_CASE_MATRIX');
});
test('an error response containing leaked row or listing data is not a denial', async () => {
  for (const kind of ['read','list']) {
    const b = backend(); const u = b.clients[0]; const orig = u[kind];
    u[kind] = async (...args) => {
      const r = await orig(...args);
      if (kind === 'read' && r.data === null && b.db[args[0]].has(args[1])) return { ...denied(), data: { title: 'synthetic leaked row' } };
      if (kind === 'list' && !args[1].startsWith(u.id + '/')) return { ...denied(), data: [{ name: 'synthetic leaked entry' }] };
      return r;
    };
    const r = await runAcceptance(b.clients); assert.equal(r.status, 'FAIL');
  }
});
test('G2.86 wrong-run recovery validates all live markers before deleting any object', async () => {
  const b = backend(); const p = await seedPlan(b);
  for (const r of p.actors[0].main) b.db[r.table].get(r.value.id).title = 'existing-other-run';
  const manifest = serializePlan(p); const restored = restorePlan(manifest, b.clients); const deletions = watchDeletes(b);
  assert.equal(await cleanupPlan(restored), 'BLOCKED'); assert.deepEqual(deletions, []);
  assert.equal(b.objects.size, 4); assert.equal(b.db.sections.size, 4);
});
test('wrong object ID and unregistered foreign objects stop the entire cleanup before deletion', async () => {
  for (const defect of ['wrong-storage-id','unregistered-object','wrong-owner','unknown-child']) {
    const b = backend(); const p = await seedPlan(b);
    if (defect === 'wrong-storage-id') p.objects[0].snapshot.id = 'not-the-recorded-object';
    if (defect === 'unregistered-object') {
      const o = p.objects[0]; await o.owner.upload(o.bucket, `${o.prefix}/${randomUUID()}.pdf`, pdf('G285-fixture'));
    }
    if (defect === 'wrong-owner') p.objects[0].owner = b.clients[1];
    if (defect === 'unknown-child') {
      const a = p.actors[1]; await a.u.insert('items', { id: randomUUID(), group_id: a.main[1].value.id, title: 'other-run', type: 'note', content: 'unrelated' });
    }
    const beforeObjects = b.objects.size; const deletions = watchDeletes(b);
    assert.equal(await cleanupPlan(p), 'BLOCKED', defect); assert.deepEqual(deletions, [], defect); assert.equal(b.objects.size, beforeObjects, defect);
  }
});
test('malformed, truncated and structurally incomplete registries never reach cleanup writes', async () => {
  const b = backend(); const p = await seedPlan(b); const manifest = serializePlan(p); const deletions = watchDeletes(b);
  for (const bad of [{ ...manifest, rows: [] }, { ...manifest, objects: [] }, { ...manifest, actors: [] },
    { ...manifest, marker: 'wrong-run' }, { ...manifest, version: 1 }]) {
    assert.throws(() => restorePlan(bad, b.clients));
  }
  // Even a newly checksummed payload must retain correct typed actor/hierarchy links.
  const corrupted = plan(b.clients); corrupted.actors[0].main[1].value.section_id = corrupted.actors[1].main[0].value.id;
  assert.throws(() => restorePlan(serializePlan(corrupted), b.clients), /INVALID_TYPED_HIERARCHY/);
  assert.equal(await cleanupPlan({ ...p, rows: [] }), 'BLOCKED'); assert.deepEqual(deletions, []); assert.equal(b.objects.size, 4);
});
test('missing live anchors with remaining objects is unverifiable and cannot trigger deletion', async () => {
  const b = backend(); const p = await seedPlan(b); const g = p.actors[0].main[1];
  b.db.groups.delete(g.value.id); const deletions = watchDeletes(b);
  assert.equal(await cleanupPlan(p), 'BLOCKED'); assert.deepEqual(deletions, []); assert.equal(b.objects.size, 4);
});
test('interrupted object cleanup can resume from the complete journal without touching other runs', async () => {
  const b = backend(); const p = await seedPlan(b); const manifest = serializePlan(p);
  const unrelated = randomUUID(); b.db.sections.set(unrelated, { id: unrelated, user_id: b.clients[0].id, title: 'other-run' });
  const u = b.clients[0]; const orig = u.removeObject; let n = 0;
  u.removeObject = async (...args) => { if (++n === 2) throw new Error('synthetic interruption'); return orig(...args); };
  assert.equal(await cleanupPlan(p), 'BLOCKED'); assert.equal(b.objects.size, 3);
  u.removeObject = orig;
  assert.equal(await cleanupPlan(restorePlan(manifest, b.clients)), 'PASS'); assert.equal(b.objects.size, 0);
  assert.equal(b.db.sections.size, 1); assert.ok(b.db.sections.has(unrelated));
});
test('interrupted row cleanup resumes safely after objects and a child were already removed', async () => {
  const b = backend(); const p = await seedPlan(b); const manifest = serializePlan(p);
  const u = b.clients[0]; const orig = u.remove; let first = true;
  u.remove = async (...args) => { const r = await orig(...args); if (first) { first = false; throw new Error('synthetic interruption after deletion'); } return r; };
  assert.equal(await cleanupPlan(p), 'BLOCKED'); assert.equal(b.objects.size, 0);
  u.remove = orig;
  assert.equal(await cleanupPlan(restorePlan(manifest, b.clients)), 'PASS'); assert.equal(b.db.sections.size, 0);
});
test('durable journal syncs file and directory before returning a mutation checkpoint', () => {
  const operations = []; let fd = 10;
  const io = { openSync: (...args) => { operations.push(['open', ...args]); return fd++; },
    writeFileSync: (id, body) => { operations.push(['write', id]); assert.equal(body.includes('password'), false); },
    fsyncSync: id => operations.push(['sync', id]), closeSync: id => operations.push(['close', id]),
    renameSync: (...args) => operations.push(['rename', ...args]) };
  durableManifest('/private/synthetic/run.json', { fixture: 'synthetic' }, io);
  assert.deepEqual(operations.map(x => x[0]), ['open','write','sync','close','rename','open','sync','close']);
  assert.deepEqual(operations[0], ['open','/private/synthetic/run.json.tmp','wx',0o600]);
  let renamed = false;
  assert.throws(() => durableManifest('/private/synthetic/run.json', {}, { ...io, fsyncSync: () => { throw Error('sync failed'); }, renameSync: () => { renamed = true; } }));
  assert.equal(renamed, false);
});
test('privacy state never claims technical isolation; explicit procedural acceptance is required', () => {
  assert.deepEqual(PRIVACY_ASSURANCE, { technicalIsolationVerified: false, mode: 'procedural' });
  assert.throws(() => requirePrivacyAttestation('TTY'), /PRIVACY_BOUNDARY_NOT_ACCEPTED/);
  assert.doesNotThrow(() => requirePrivacyAttestation('I ACCEPT PROCEDURAL PRIVACY'));
});
test('the full matrix and complete cleanup remain inside their independent request budgets', async () => {
  const b = backend(); let phase = 'assertions'; const calls = { assertions: 8, cleanup: 2 };
  for (const u of b.clients) for (const [name, fn] of Object.entries(u)) if (typeof fn === 'function') {
    u[name] = (...args) => { calls[phase]++; return fn(...args); };
  }
  const r = await runAcceptance(b.clients, () => {}, randomUUID, () => {}, () => { phase = 'cleanup'; });
  assert.equal(r.status, 'PASS'); assert.ok(calls.assertions <= 1400, String(calls.assertions)); assert.ok(calls.cleanup <= 400, String(calls.cleanup));
});

// G2.93: only fake Auth clients and synthetic session claims; no network calls.
function boundAuthMock(id, email) {
  const token = `e30.${Buffer.from(JSON.stringify({ role: 'authenticated', iss: ORIGIN + '/auth/v1', sub: id,
    email: TEST_ACCOUNTS.A })).toString('base64url')}.synthetic`;
  return { auth: {
    signInWithPassword: async () => ok({ session: { access_token: token } }),
    getUser: async () => ok({ user: { id, email } }),
  } };
}
test('designated A/B server identities succeed with two distinct IDs', async () => {
  const ids = [];
  for (const label of ['A', 'B']) {
    const id = randomUUID();
    ids.push(await authenticate(boundAuthMock(id, TEST_ACCOUNTS[label]), 'prompt-is-not-authority', 'synthetic', label, ids));
  }
  assert.equal(new Set(ids).size, 2);
});
test('wrong server email fails despite designated prompt and decoded email claim', async () => {
  const id = randomUUID();
  await assert.rejects(() => authenticate(boundAuthMock(id, 'other-synthetic@example.invalid'), TEST_ACCOUNTS.A,
    'synthetic', 'A'), e => e.code === 'ACCOUNT_EMAIL_MISMATCH' && !e.message.includes('@'));
});
test('swapped A/B server identities are rejected in both directions', async () => {
  for (const [label, other] of [['A','B'], ['B','A']]) {
    await assert.rejects(() => authenticate(boundAuthMock(randomUUID(), TEST_ACCOUNTS[other]), TEST_ACCOUNTS[label],
      'synthetic', label), /ACCOUNT_EMAIL_MISMATCH/);
  }
});
test('missing, null, empty and non-string server emails fail closed', async () => {
  for (const email of [undefined, null, '', 42]) {
    await assert.rejects(() => authenticate(boundAuthMock(randomUUID(), email), TEST_ACCOUNTS.A,
      'synthetic', 'A'), /ACCOUNT_EMAIL_MISMATCH/);
  }
});
test('duplicate server IDs fail even with correctly bound emails', async () => {
  const id = randomUUID();
  const a = await authenticate(boundAuthMock(id, TEST_ACCOUNTS.A), 'synthetic', 'synthetic', 'A');
  await assert.rejects(() => authenticate(boundAuthMock(id, TEST_ACCOUNTS.B), 'synthetic', 'synthetic', 'B', [a]),
    /DISTINCT_USERS_REQUIRED/);
});
test('missing or unexpected account labels stop before password authentication', async () => {
  let calls = 0;
  const client = { auth: { signInWithPassword: async () => { calls++; throw Error('must not authenticate'); } } };
  for (const label of [undefined, 'C', 'toString']) {
    await assert.rejects(() => authenticate(client, 'synthetic', 'synthetic', label), /INVALID_ACCOUNT_BINDING/);
  }
  assert.equal(calls, 0);
});

// G2.96: offline SDK transport and stale-readback regressions.
test('SDK downloads send a fresh supported cacheNonce without changing the object path', async () => {
  const urls = []; const cache = new Map(); let current;
  const client = makeClient('sb_publishable_synthetic', boundedFetch(async (input) => {
    const url = new URL(String(input)); urls.push(url);
    if (!cache.has(url.href)) cache.set(url.href, current);
    return new Response(cache.get(url.href), { status: 200, headers: { 'content-type': 'application/pdf' } });
  }));
  const u = adapter(client, randomUUID());
  for (const label of ['G285-fixture', 'G285-overwrite', 'G285-update']) {
    current = pdf(label);
    assert.deepEqual((await u.download('pdfs', 'synthetic/object.pdf')).data, current);
  }
  assert.equal(urls.length, 3);
  assert.equal(new Set(urls.map(x => x.searchParams.get('cacheNonce'))).size, 3);
  for (const url of urls) {
    assert.equal(url.origin, ORIGIN); assert.equal(url.pathname, '/storage/v1/object/pdfs/synthetic/object.pdf');
    assert.match(url.searchParams.get('cacheNonce'), /^[0-9a-f-]{36}$/);
    assert.deepEqual([...url.searchParams.keys()], ['cacheNonce']);
  }
});
test('stale initial bytes after a successful overwrite cannot produce acceptance PASS', async () => {
  const b = backend(); const u = b.clients[0]; const original = u.download; let stalePath;
  const overwrite = u.overwrite;
  u.overwrite = async (bucket, path, bytes) => { stalePath = path; return overwrite(bucket, path, bytes); };
  u.download = (bucket, path) => path === stalePath ? ok(pdf('G285-fixture')) : original(bucket, path);
  const r = await runAcceptance(b.clients);
  assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'OBJECT_BYTES_MISMATCH');
  assert.equal(r.results.at(-1).case, 'owner-0-pdfs'); assert.equal(r.cleanup, 'PASS');
  assert.ok(!r.results.some(x => x.case.startsWith('cross-')));
});
test('successful overwrite response without a write still fails exact byte verification', async () => {
  const b = backend(); b.clients[0].overwrite = async () => ok({ path: 'synthetic' });
  const r = await runAcceptance(b.clients);
  assert.equal(r.status, 'FAIL'); assert.equal(r.failure, 'OBJECT_BYTES_MISMATCH'); assert.equal(r.cleanup, 'PASS');
});
test('owner readbacks distinguish missing listing, download error and authorization failure', async () => {
  for (const kind of ['missing', 'download', 'authorization']) {
    const b = backend(); const u = b.clients[0]; const overwrite = u.overwrite; const list = u.list; const download = u.download;
    let target; let injected = false;
    u.overwrite = async (bucket, path, bytes) => { const r = await overwrite(bucket, path, bytes); target = path; return r; };
    u.list = async (bucket, prefix) => {
      const r = await list(bucket, prefix);
      if (kind === 'missing' && target && !injected) { injected = true; return ok(r.data.filter(x => x.name !== target.split('/').at(-1))); }
      return r;
    };
    u.download = async (bucket, path) => {
      if (kind !== 'missing' && path === target && !injected) {
        injected = true; return kind === 'authorization' ? denied() : { data: null, error: { status: 503, message: 'PRIVATE_SENTINEL' } };
      }
      return download(bucket, path);
    };
    const events = []; const r = await runAcceptance(b.clients, e => events.push(e));
    assert.equal(r.status, 'FAIL');
    assert.equal(r.failure, { missing: 'OBJECT_LISTING_ENTRY_MISSING', download: 'OBJECT_DOWNLOAD_FAILED', authorization: 'OWNER_STORAGE_AUTHORIZATION_FAILED' }[kind]);
    assert.equal(r.cleanup, 'PASS'); assert.ok(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
  }
});

// G2.98 diagnostics contain only a fixed schema and allowlisted scalar values.
const diagnostic = r => crossDownloadDiagnostic(r, 'cross-0-pdfs-download', 0);
test('download diagnostics recognize existing HTTP 403/404 denial shapes', () => {
  for (const status of [403,404]) for (const statusCode of [undefined,String(status),'AccessDenied','NoSuchKey']) {
    const d = diagnostic({ data: null, error: { name: 'StorageApiError', status, statusCode } });
    assert.equal(d.classification, 'RECOGNIZED_AUTHORIZATION_DENIAL'); assert.equal(d.httpStatus,status);
    assert.equal(d.actor,'A'); assert.equal(d.owner,'B');
  }
});
test('HTTP 400 with body 404 remains an unexplained error, never a recognized denial', () => {
  const d = diagnostic({ data: null, error: { name: 'StorageApiError', status:400, statusCode:'404' } });
  assert.equal(d.classification,'UNRECOGNIZED_SDK_ERROR'); assert.equal(d.httpStatus,400); assert.equal(d.statusCode,'404');
});
test('unexpected errors and missing or contradictory statuses fail closed diagnostically', () => {
  for (const status of [400,401,409,500,503]) assert.equal(diagnostic({data:null,error:{status}}).classification,'UNRECOGNIZED_SDK_ERROR');
  for (const status of [401,409,500,503]) assert.equal(diagnostic({data:null,error:{status,code:'42501'}}).classification,'UNRECOGNIZED_SDK_ERROR');
  for (const error of [{status:200,code:'42501'},{status:403,statusCode:'404'}, {code:'42501'},
    {status:'PRIVATE_SENTINEL'}, {status:403,code:'AccessDenied',statusCode:'InvalidJWT'}]) {
    assert.equal(diagnostic({data:null,error}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  }
});
test('downloaded bytes including empty buffers are always unexpected access', () => {
  for (const data of [Buffer.alloc(0),pdf('G285-fixture'),Buffer.from('incorrect-synthetic')]) for (const error of [null,{status:403}]) {
    const d=diagnostic({data,error}); assert.equal(d.classification,'UNAUTHORIZED_DOWNLOAD_RETURNED_DATA');
    assert.equal(d.dataPresent,true); assert.equal(d.byteLength,data.length);
  }
  assert.equal(diagnostic({data:null,error:null}).classification,'UNEXPECTED_SUCCESS_WITHOUT_DATA');
});
test('malformed SDK responses and accessors produce sanitized ambiguous diagnostics', () => {
  const accessor={data:null}; Object.defineProperty(accessor,'error',{get(){throw Error('PRIVATE_SENTINEL');}});
  for (const r of [null,undefined,[],{}, {data:null},{error:null},{data:false,error:{status:403}},
    {data:{raw:'PRIVATE_SENTINEL'},error:null},{data:null,error:'PRIVATE_SENTINEL'},accessor]) {
    const d=diagnostic(r); assert.equal(d.classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
    assert.ok(!JSON.stringify(d).includes('PRIVATE_SENTINEL'));
  }
});
test('diagnostic schema suppresses arbitrary names, messages, codes and sensitive properties', () => {
  const r={data:null,error:{name:'PRIVATE_SENTINEL',status:403,statusCode:'PRIVATE_SENTINEL',message:'PRIVATE_SENTINEL',
    headers:'PRIVATE_SENTINEL',url:'PRIVATE_SENTINEL',originalError:'PRIVATE_SENTINEL'}};
  const d=diagnostic(r); assert.equal(d.errorClass,'OtherError'); assert.equal(d.statusCode,null);
  assert.equal(d.classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE'); assert.ok(!JSON.stringify(d).includes('PRIVATE_SENTINEL'));
  assert.deepEqual(Object.keys(d).sort(),['case','actor','owner','classification','errorPresent','errorClass','httpStatus','statusCode','dataPresent','byteLength','transportClassification'].sort());
  assert.throws(()=>crossDownloadDiagnostic(r,'PRIVATE_SENTINEL',0),/INVALID_DIAGNOSTIC_CASE/);
  const reverse=crossDownloadDiagnostic({data:null,error:{status:403}},'cross-1-user-content-download',1);
  assert.equal(reverse.actor,'B');assert.equal(reverse.owner,'A');
});
test('ambiguous and successful download responses stop the matrix without converting them to PASS', async () => {
  const responses=[{data:null,error:{name:'StorageApiError',status:400,statusCode:'404'}},
    {data:Buffer.alloc(0),error:null},{data:null,error:null},{data:null,error:{status:200,code:'42501'}},
    {data:null,error:{status:503}},{data:{raw:'PRIVATE_SENTINEL'},error:null}];
  for(const response of responses){
    const b=backend(),u=b.clients[0],original=u.download;
    u.download=(bucket,path)=>path.startsWith(u.id+'/')?original(bucket,path):response;
    const events=[];const r=await runAcceptance(b.clients,e=>events.push(e));
    assert.equal(r.status,'FAIL');assert.equal(r.cases,8);assert.equal(r.cleanup,'PASS');
    assert.equal(r.failure,'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED');
    assert.equal(r.results.at(-1).status,'FAIL');
    assert.equal(events.filter(x=>Object.hasOwn(x,'httpStatus') && x.event !== 'OPERATION_DIAGNOSTIC').length,1);
    assert.ok(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
  }
});

// G2.100 original reproductions: assert classification and full acceptance failure.
for (const [label, statusCode] of [['object',{}],['boolean',false],['fraction',400.5]]) {
  test(`G2.99 ${label} statusCode is ambiguous and fails the full matrix`, async () => {
    const response={data:null,error:{status:403,statusCode}};
    assert.equal(diagnostic(response).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
    const b=backend(),u=b.clients[0],original=u.download;
    u.download=(bucket,path)=>path.startsWith(u.id+'/')?original(bucket,path):response;
    const events=[];const r=await runAcceptance(b.clients,e=>events.push(e));
    assert.equal(r.status,'FAIL');assert.equal(r.cases,8);assert.equal(r.cleanup,'PASS');
    assert.equal(r.failure,'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED');
    assert.equal(r.results.at(-1).case,'cross-0-pdfs-download');assert.equal(r.results.at(-1).status,'FAIL');
    assert.equal(events.find(e=>e.classification)?.classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  });
}
test('all supplied code fields reject malformed types and unsupported formats', () => {
  const bad=[{},false,400.5,[],['403'],null,NaN,Infinity,-403,0,600,42501,403n,()=>403,
    Symbol('synthetic'),'',' 403','403 ','0403','403.0','NaN','unsupported-synthetic'];
  for(const key of ['statusCode','code','error']) for(const value of bad){
    const error={status:403,[key]:value};
    assert.equal(diagnostic({data:null,error}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE',key);
  }
  for(const status of [...bad,undefined]) assert.equal(diagnostic({data:null,error:{status}}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
});
test('absent or undefined optional SDK fields remain valid; explicit null is malformed', () => {
  for(const status of [403,'403',404,'404']){
    for(const optional of [{},{statusCode:undefined},{code:undefined,error:undefined},
      {statusCode:String(status)},{code:'42501'},{statusCode:'AccessDenied'},{statusCode:'NoSuchKey'}]){
      assert.equal(diagnostic({data:null,error:{status,...optional}}).classification,'RECOGNIZED_AUTHORIZATION_DENIAL');
    }
    for(const key of ['statusCode','code','error']) assert.equal(diagnostic({data:null,error:{status,[key]:null}}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  }
});
test('malformed secondary fields cannot hide behind an otherwise recognized denial', () => {
  for(const key of ['statusCode','error']) {
    assert.equal(diagnostic({data:null,error:{status:403,code:'42501',[key]:{}}}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  }
  for(const error of [{status:403,statusCode:404},{status:404,code:'403'},
    {status:403,statusCode:'AccessDenied',code:'InvalidJWT'},Object.assign(Object.create({code:'42501'}),{status:403})]){
    assert.equal(diagnostic({data:null,error}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  }
  const error={status:403};Object.defineProperty(error,'statusCode',{get(){throw Error('PRIVATE_SENTINEL');}});
  assert.equal(diagnostic({data:null,error}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
});

// G2.102: reconcile every semantic code, including digit-only SQLSTATE values.
for (const statusCode of ['InvalidJWT','NoSuchBucket']) {
  test(`G2.101 42501 versus ${statusCode} fails classification and full acceptance`, async () => {
    const response={data:null,error:{status:403,code:'42501',statusCode}};
    assert.equal(diagnostic(response).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
    const b=backend(),u=b.clients[0],original=u.download;
    u.download=(bucket,path)=>path.startsWith(u.id+'/')?original(bucket,path):response;
    const events=[];const r=await runAcceptance(b.clients,e=>events.push(e));
    assert.equal(r.status,'FAIL');assert.equal(r.cases,8);assert.equal(r.cleanup,'PASS');
    assert.equal(r.failure,'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED');
    assert.equal(r.results.at(-1).case,'cross-0-pdfs-download');assert.equal(r.results.at(-1).status,'FAIL');
    assert.equal(events.find(e=>e.classification)?.classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  });
}
test('all distinct semantic code pairs conflict regardless of field or order', () => {
  const symbols=['AccessDenied','NoSuchKey','InvalidJWT','NoSuchBucket','TenantNotFound','InvalidSignature','42501'];
  for(const status of [403,404]) for(const first of symbols) for(const second of symbols) if(first!==second){
    for(const [a,b] of [['code','statusCode'],['error','code'],['statusCode','error']]){
      assert.equal(diagnostic({data:null,error:{status,[a]:first,[b]:second}}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
    }
  }
});
test('consistent duplicate codes and matching HTTP representations preserve valid denials', () => {
  for(const status of [403,404]){
    for(const code of ['AccessDenied','NoSuchKey','42501']){
      assert.equal(diagnostic({data:null,error:{status,code,statusCode:code,error:code}}).classification,'RECOGNIZED_AUTHORIZATION_DENIAL');
    }
    for(const code of ['InvalidJWT','NoSuchBucket','TenantNotFound','InvalidSignature']){
      assert.equal(diagnostic({data:null,error:{status,code,statusCode:code,error:code}}).classification,'UNRECOGNIZED_SDK_ERROR');
    }
    assert.equal(diagnostic({data:null,error:{status,statusCode:String(status),code:status,error:String(status)}}).classification,'RECOGNIZED_AUTHORIZATION_DENIAL');
    assert.equal(diagnostic({data:null,error:{status,statusCode:String(status),code:'42501'}}).classification,'RECOGNIZED_AUTHORIZATION_DENIAL');
  }
});
test('SQLSTATE cannot override malformed, missing or conflicting HTTP evidence', () => {
  for(const error of [{status:403,code:'42501',statusCode:'404'}, {status:404,code:'42501',error:'403'},
    {status:200,code:'42501'}, {code:'42501'}, {status:403,code:42501},
    {status:403,code:'42501',statusCode:null},{status:403,code:'42501',error:false}]){
    assert.equal(diagnostic({data:null,error}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  }
  for(const data of [null,Buffer.alloc(0),pdf('G285-fixture')]){
    assert.equal(diagnostic({data,error:{status:403,code:'42501',statusCode:'InvalidJWT'}}).classification,'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  }
});

// G2.104: post-error owner readbacks are diagnostic-only; every run still FAILs.
for (const mode of ['match','missing','bytes','sdk-error','identity','throw']) {
  test(`post-denial owner readback ${mode} remains FAIL and reaches scoped cleanup`, async () => {
    const b=backend(),attacker=b.clients[0],owner=b.clients[1];
    const originalDownload=attacker.download, ownerDownload=owner.download, ownerList=owner.list;
    let target, pending=false, lists=0, downloads=0;
    attacker.download=async(bucket,path)=>{
      if(path.startsWith(attacker.id+'/')) return originalDownload(bucket,path);
      target={bucket,path};pending=true;
      return {data:null,error:{name:'StorageApiError',status:400,statusCode:'404',message:'PRIVATE_SENTINEL'}};
    };
    owner.list=async(bucket,prefix)=>{
      const r=await ownerList(bucket,prefix);
      if(pending && target.bucket===bucket && target.path.startsWith(prefix+'/')){
        lists++;
        if(mode==='missing'){pending=false;return ok(r.data.filter(x=>x.name!==target.path.split('/').at(-1)));}
        if(mode==='identity')return ok(r.data.map(x=>x.name===target.path.split('/').at(-1)?{...x,id:'different-synthetic-id'}:x));
      }
      return r;
    };
    owner.download=async(bucket,path)=>{
      if(pending && bucket===target.bucket && path===target.path){
        downloads++;pending=false;
        if(mode==='bytes')return ok(Buffer.from('incorrect-synthetic'));
        if(mode==='sdk-error')return {data:null,error:{status:503,message:'PRIVATE_SENTINEL'}};
        if(mode==='throw')throw Error('PRIVATE_SENTINEL');
      }
      return ownerDownload(bucket,path);
    };
    const deletions=watchDeletes(b),events=[]; const r=await runAcceptance(b.clients,e=>events.push(e));
    assert.equal(r.status,'FAIL');assert.equal(r.failure,'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED');
    assert.equal(r.cases,8);assert.equal(r.cleanup,'PASS');assert.ok(deletions.length>0);
    assert.equal(b.objects.size,0);for(const t of ['sections','groups','items'])assert.equal(b.db[t].size,0);
    assert.equal(lists,1);assert.equal(downloads,mode==='missing'?0:1);
    const diagnostics=events.filter(e=>e.classification?.startsWith('OWNER_READBACK_'));assert.equal(diagnostics.length,1);
    const d=diagnostics[0];
    assert.equal(d.classification,{match:'OWNER_READBACK_MATCH',missing:'OWNER_READBACK_MISSING',bytes:'OWNER_READBACK_BYTES_MISMATCH',
      'sdk-error':'OWNER_READBACK_ERROR',identity:'OWNER_READBACK_IDENTITY_MISMATCH',throw:'OWNER_READBACK_ERROR'}[mode]);
    assert.equal(d.ownerAccessible,['match','bytes','identity'].includes(mode));assert.equal(d.pathUnchanged,true);
    assert.equal(d.identityMatches,['match','bytes'].includes(mode));assert.equal(d.bytesMatch,['match','identity'].includes(mode));
    assert.deepEqual(Object.keys(d).sort(),['case','actor','owner','classification','ownerAccessible','pathUnchanged','identityMatches','bytesMatch'].sort());
    const output=JSON.stringify(events);assert.ok(!output.includes('PRIVATE_SENTINEL'));assert.ok(!output.includes(target.path));
    for(const c of b.clients)assert.ok(!output.includes(c.id));
  });
}

// G2.107: the actual installed SDK consumes the unchanged mocked response.
async function transportDownload(body, status=400, bucket='pdfs') {
  let calls=0;
  const client=makeClient('sb_publishable_synthetic',boundedFetch(async()=>{
    calls++;return new Response(typeof body==='string'?body:JSON.stringify(body),
      {status,headers:{'content-type':'application/json'}});
  }));
  const r=await adapter(client,randomUUID()).download(bucket,'synthetic/object.pdf');
  assert.equal(calls,1);return r;
}
test('transport preserves NoSuchKey versus NoSuchBucket despite identical normalized SDK codes', async()=>{
  for(const [code,classification] of [['NoSuchKey','STORAGE_NO_SUCH_KEY'],['NoSuchBucket','STORAGE_NO_SUCH_BUCKET']]){
    const r=await transportDownload({code,statusCode:'404',message:'PRIVATE_SENTINEL'});
    assert.equal(r.error.status,400);assert.equal(r.error.statusCode,'404');assert.equal(r.data,null);
    assert.equal(r.transportClassification,classification);
    const d=diagnostic(r);assert.equal(d.transportClassification,classification);
    assert.equal(d.classification,'UNRECOGNIZED_SDK_ERROR');assert.ok(!JSON.stringify(d).includes('PRIVATE_SENTINEL'));
  }
});
test('transport missing, malformed, contradictory and unknown symbolic evidence remains failure', async()=>{
  for(const [body,expected] of [[{statusCode:'404'},'TRANSPORT_SYMBOLIC_CODE_MISSING'],
    ['not-json','TRANSPORT_UNKNOWN_OR_MALFORMED'],[{code:{},statusCode:'404'},'TRANSPORT_UNKNOWN_OR_MALFORMED'],
    [{code:'UNKNOWN_PRIVATE_SENTINEL',statusCode:'404'},'TRANSPORT_UNKNOWN_OR_MALFORMED'],
    [{code:'NoSuchKey',error:'NoSuchBucket',statusCode:'404'},'TRANSPORT_CONTRADICTORY_ERROR'],
    [{code:'NoSuchKey',statusCode:'403'},'TRANSPORT_CONTRADICTORY_ERROR']]){
    const r=await transportDownload(body);assert.equal(r.transportClassification,expected);
    const d=diagnostic(r);assert.notEqual(d.classification,'RECOGNIZED_AUTHORIZATION_DENIAL');
    assert.ok(!JSON.stringify(d).includes('PRIVATE_SENTINEL'));
  }
});
test('transport distinguishes authentication, authorization and operational errors without accepting them generally', async()=>{
  for(const [code,logical,expected] of [['InvalidJWT','401','STORAGE_AUTHENTICATION_ERROR'],
    ['AccessDenied','403','STORAGE_AUTHORIZATION_ERROR'],['InternalError','500','STORAGE_OPERATIONAL_ERROR'],
    ['TenantNotFound','404','STORAGE_OPERATIONAL_ERROR']]){
    const r=await transportDownload({code,statusCode:logical});assert.equal(r.transportClassification,expected);
    assert.notEqual(diagnostic(r).classification,'RECOGNIZED_AUTHORIZATION_DENIAL');
  }
  const r=await transportDownload({code:'InternalError',statusCode:'500'},500);
  assert.equal(r.transportClassification,'TRANSPORT_FAILURE');assert.notEqual(diagnostic(r).classification,'RECOGNIZED_AUTHORIZATION_DENIAL');
});
test('transport never consumes successful object bytes as JSON, including an empty object',async()=>{
  for(const bytes of ['', 'synthetic-bytes']){
    const r=await transportDownload(bytes,200);assert.equal(r.transportClassification,'TRANSPORT_SUCCESS_RESPONSE');
    assert.equal(r.data.length,Buffer.byteLength(bytes));assert.equal(diagnostic(r).classification,'UNAUTHORIZED_DOWNLOAD_RETURNED_DATA');
  }
});
test('transport capture is per request, bounded, and scoped to the runner Storage download',async()=>{
  const {createDownloadTransport}=await import('./transport.mjs');let clones=0;
  const t=createDownloadTransport(async()=>({ok:false,status:400,clone(){clones++;throw Error('PRIVATE_SENTINEL');}}),ORIGIN);
  for(const [url,method] of [[ORIGIN+'/auth/v1/user?cacheNonce=n','GET'],
    [ORIGIN+'/storage/v1/object/pdfs/synthetic?cacheNonce=n','POST']]){
    const r=await t.observe('n',()=>t.fetch(url,{method}));assert.equal(r.transportClassification,'TRANSPORT_NOT_OBSERVED');
  }
  assert.equal(clones,0);
  const large=await transportDownload({code:'NoSuchKey',statusCode:'404',message:'x'.repeat(17000)});
  assert.equal(large.transportClassification,'TRANSPORT_UNKNOWN_OR_MALFORMED');
  const [a,b]=await Promise.all([transportDownload({code:'NoSuchKey',statusCode:'404'}),transportDownload({code:'NoSuchBucket',statusCode:'404'})]);
  assert.equal(a.transportClassification,'STORAGE_NO_SUCH_KEY');assert.equal(b.transportClassification,'STORAGE_NO_SUCH_BUCKET');
});
for(const mode of ['match','missing','bytes','reverse']){
  test(`transport diagnostic ${mode} preserves owner readback and precise composite outcome`,async()=>{
    const b=backend(),index=mode==='reverse'?1:0,attacker=b.clients[index],owner=b.clients[1-index];
    const original=attacker.download,ownerDownload=owner.download,ownerList=owner.list;
    let pending=false,target;
    const raw=await transportDownload({code:'NoSuchKey',statusCode:'404',message:'PRIVATE_SENTINEL'});
    attacker.download=(bucket,path)=>{if(bucket!=='pdfs'||path.startsWith(attacker.id+'/'))return original(bucket,path);pending=true;target={bucket,path};return raw;};
    owner.list=async(bucket,prefix)=>{const r=await ownerList(bucket,prefix);if(pending&&mode==='missing'&&target.path.startsWith(prefix+'/')){pending=false;return ok(r.data.filter(x=>x.name!==target.path.split('/').at(-1)));}return r;};
    owner.download=(bucket,path)=>{if(pending&&path===target.path){pending=false;if(mode==='bytes')return ok(Buffer.from('incorrect'));}return ownerDownload(bucket,path);};
    const events=[],r=await runAcceptance(b.clients,e=>events.push(e));
    assert.equal(r.status,['match','reverse'].includes(mode)?'PASS':'FAIL');assert.equal(r.cleanup,'PASS');
    assert.equal(r.cases,['match','reverse'].includes(mode)?72:8);
    assert.equal(r.failure,['match','reverse'].includes(mode)?null:'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED');
    const d=events.find(e=>e.classification?.startsWith('OWNER_READBACK_'));
    assert.equal(d.classification,mode==='missing'?'OWNER_READBACK_MISSING':mode==='bytes'?'OWNER_READBACK_BYTES_MISMATCH':'OWNER_READBACK_MATCH');
    assert.equal(d.actor,index===0?'A':'B');assert.equal(d.owner,index===0?'B':'A');
    assert.ok(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));assert.ok(!JSON.stringify(events).includes(target.path));
  });
}

test('transport unknown or contradictory evidence blocks HTTP-403 fallback in the full runner',async()=>{
  for(const body of [{statusCode:'403'},{code:'UNKNOWN_PRIVATE_SENTINEL',statusCode:'403'},
    {code:'NoSuchKey',error:'NoSuchBucket',statusCode:'403'}]){
    const raw=await transportDownload(body,403);const b=backend(),u=b.clients[0],original=u.download;
    u.download=(bucket,path)=>path.startsWith(u.id+'/')?original(bucket,path):raw;
    const r=await runAcceptance(b.clients);assert.equal(r.status,'FAIL');assert.equal(r.cases,8);assert.equal(r.cleanup,'PASS');
  }
  const raw=await transportDownload({code:'NoSuchKey',error:'not_found',statusCode:'404'},404);
  const b=backend(),u=b.clients[0],original=u.download;
  u.download=(bucket,path)=>path.startsWith(u.id+'/')?original(bucket,path):raw;
  const r=await runAcceptance(b.clients);assert.equal(r.status,'PASS');assert.equal(r.cases,72);assert.equal(r.cleanup,'PASS');
});

// G2.109: only the exact PDF conjunction can enter the additional acceptance branch.
const compositeResponse = () => ({data:null,error:{name:'StorageApiError',status:400,statusCode:'404'},transportClassification:'STORAGE_NO_SUCH_KEY'});
const matchingReadback = () => ({classification:'OWNER_READBACK_MATCH',ownerAccessible:true,pathUnchanged:true,identityMatches:true,bytesMatch:true});
test('composite classifier accepts the exact conjunction in both PDF directions only',()=>{
  for(const i of [0,1]) {
    const r=compositeResponse();assert.equal(deniedError(r),false);
    assert.equal(compositePdfIsolation(r,matchingReadback(),`cross-${i}-pdfs-download`,i),true);
    assert.equal(compositePdfIsolation(r,matchingReadback(),`cross-${i}-user-content-download`,i),false);
    assert.equal(compositePdfIsolation(r,matchingReadback(),`cross-${i}-pdfs-download`,1-i),false);
  }
});
test('composite classifier rejects missing, malformed, conflicting or data-bearing response evidence',()=>{
  const responses=[];
  for(const data of [undefined,Buffer.alloc(0),Buffer.from('synthetic'),false]) responses.push({...compositeResponse(),data});
  for(const transportClassification of [undefined,'TRANSPORT_NOT_OBSERVED','STORAGE_NO_SUCH_BUCKET','STORAGE_AUTHENTICATION_ERROR','STORAGE_OPERATIONAL_ERROR','PRIVATE_SENTINEL']) responses.push({...compositeResponse(),transportClassification});
  for(const patch of [{status:'400'},{status:403},{status:401},{statusCode:404},{statusCode:undefined},{statusCode:null},
    {statusCode:{}},{statusCode:false},{code:'42501'},{code:'InvalidJWT'},{code:'NoSuchBucket'},{error:'NoSuchKey'},{name:'Error'}]){
    const r=compositeResponse();r.error={...r.error,...patch};responses.push(r);
  }
  for(const r of responses)assert.equal(compositePdfIsolation(r,matchingReadback(),'cross-0-pdfs-download',0),false);
  const accessor=compositeResponse();Object.defineProperty(accessor.error,'statusCode',{get(){throw Error('PRIVATE_SENTINEL');}});
  assert.equal(compositePdfIsolation(accessor,matchingReadback(),'cross-0-pdfs-download',0),false);
});
test('composite classifier requires every owner readback boolean literally true',()=>{
  for(const key of ['ownerAccessible','pathUnchanged','identityMatches','bytesMatch']) for(const value of [false,undefined,null,1,'true']){
    assert.equal(compositePdfIsolation(compositeResponse(),{...matchingReadback(),[key]:value},'cross-0-pdfs-download',0),false);
  }
  for(const readback of [undefined,null,{}, {...matchingReadback(),classification:'OWNER_READBACK_ERROR'}]){
    assert.equal(compositePdfIsolation(compositeResponse(),readback,'cross-0-pdfs-download',0),false);
  }
});
test('complete symmetric matrix accepts exact composite PDFs with real SDK normalization',async()=>{
  const b=backend(),raw=await transportDownload({code:'NoSuchKey',error:'not_found',statusCode:'404'});
  for(const u of b.clients){const original=u.download;u.download=(bucket,path)=>bucket==='pdfs'&&!path.startsWith(u.id+'/')?raw:original(bucket,path);}
  const events=[],r=await runAcceptance(b.clients,e=>events.push(e));
  assert.equal(r.status,'PASS');assert.equal(r.cases,72);assert.equal(r.cleanup,'PASS');requireComplete(r.results);
  const readbacks=events.filter(e=>e.classification==='OWNER_READBACK_MATCH');assert.equal(readbacks.length,2);
  assert.deepEqual(readbacks.map(e=>e.actor),['A','B']);
});
test('full-run composite failures preserve failure stops and scoped cleanup',async()=>{
  const modes=['missing','wrong-owner','bytes','identity','bucket','authentication','operational','unknown-transport','missing-transport',
    'malformed-status','conflicting-code','empty','nonempty','post-owner-integrity','post-actor-integrity'];
  for(const mode of modes){
    const b=backend(),attacker=b.clients[0],owner=b.clients[1],original=attacker.download,ownerList=owner.list,ownerDownload=owner.download;
    let p,target,pending=false,deletionsBeforeFailure;
    attacker.download=(bucket,path)=>{
      if(bucket!=='pdfs'||path.startsWith(attacker.id+'/'))return original(bucket,path);
      target={bucket,path};pending=true;deletionsBeforeFailure=deletions.length;const r=compositeResponse();
      if(mode==='wrong-owner')p.objects.find(o=>o.path===path).owner=attacker;
      if(mode==='bucket')r.transportClassification='STORAGE_NO_SUCH_BUCKET';
      if(mode==='authentication')r.transportClassification='STORAGE_AUTHENTICATION_ERROR';
      if(mode==='operational')r.transportClassification='STORAGE_OPERATIONAL_ERROR';
      if(mode==='unknown-transport')r.transportClassification='TRANSPORT_UNKNOWN_OR_MALFORMED';
      if(mode==='missing-transport')delete r.transportClassification;
      if(mode==='malformed-status')r.error.statusCode={};
      if(mode==='conflicting-code')r.error.code='42501';
      if(mode==='empty')r.data=Buffer.alloc(0);
      if(mode==='nonempty')r.data=Buffer.from('synthetic');
      return r;
    };
    owner.list=async(bucket,prefix)=>{
      const r=await ownerList(bucket,prefix);
      if(pending&&bucket===target.bucket&&target.path.startsWith(prefix+'/')){
        if(mode==='missing'){pending=false;return ok(r.data.filter(x=>x.name!==target.path.split('/').at(-1)));}
        if(mode==='identity')return ok(r.data.map(x=>x.name===target.path.split('/').at(-1)?{...x,id:'wrong-synthetic-id'}:x));
      }
      return r;
    };
    owner.download=(bucket,path)=>{
      if(pending&&path===target.path){pending=false;if(mode==='bytes')return ok(Buffer.from('incorrect-synthetic'));}
      return ownerDownload(bucket,path);
    };
    const events=[],deletions=watchDeletes(b);
    const r=await runAcceptance(b.clients,e=>{
      events.push(e);
      if(e.classification==='OWNER_READBACK_MATCH'&&mode.startsWith('post-')){
        const o=mode==='post-owner-integrity'?p.actors[1].objects[0]:p.actors[0].objects[0];
        b.objects.get(o.bucket+':'+o.path).bytes=Buffer.from('changed-after-readback');
      }
    },randomUUID,value=>{p=value;});
    assert.equal(r.status,'FAIL',mode);assert.equal(r.cases,8,mode);assert.equal(r.results.at(-1).status,'FAIL',mode);
    if(mode==='wrong-owner'){assert.equal(r.cleanup,'BLOCKED');assert.equal(deletions.length,deletionsBeforeFailure);}
    else assert.equal(r.cleanup,'PASS',mode);
    if(mode.startsWith('post-'))assert.equal(r.failure,'OBJECT_BYTES_MISMATCH',mode);
    else assert.equal(r.failure,'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED',mode);
    assert.ok(!JSON.stringify(events).includes(target.path));
  }
});

test('PDF signing composite accepts only the exact normalized envelope and complete readback', () => {
  for (const i of [0,1]) {
    assert.equal(compositePdfSigningIsolation(compositeResponse(), matchingReadback(), `cross-${i}-pdfs-sign`, i), true);
    for (const label of [`cross-${i}-user-content-sign`, `cross-${i}-pdfs-download`, `cross-${1-i}-pdfs-sign`])
      assert.equal(compositePdfSigningIsolation(compositeResponse(), matchingReadback(), label, i), false);
  }
  for (const key of ['ownerAccessible','pathUnchanged','identityMatches','bytesMatch'])
    for (const value of [false,null,undefined,'true',1])
      assert.equal(compositePdfSigningIsolation(compositeResponse(), {...matchingReadback(), [key]:value}, 'cross-0-pdfs-sign',0),false);
  for (const data of [undefined,{}, {signedUrl:''}, {signedUrl:'PRIVATE_SENTINEL'},Buffer.alloc(0),Buffer.from('synthetic')])
    assert.equal(compositePdfSigningIsolation({...compositeResponse(),data},matchingReadback(),'cross-0-pdfs-sign',0),false);
  for (const patch of [{status:403},{status:'400'},{statusCode:404},{statusCode:{}},{statusCode:false},{code:'42501'},
    {error:'NoSuchBucket'},{name:'OtherError'}])
    assert.equal(compositePdfSigningIsolation({...compositeResponse(),error:{...compositeResponse().error,...patch}},matchingReadback(),'cross-0-pdfs-sign',0),false);
  for (const transportClassification of [undefined,'STORAGE_NO_SUCH_BUCKET','STORAGE_AUTHENTICATION_ERROR',
    'STORAGE_OPERATIONAL_ERROR','TRANSPORT_UNKNOWN_OR_MALFORMED','TRANSPORT_CONTRADICTORY_ERROR'])
    assert.equal(compositePdfSigningIsolation({...compositeResponse(),transportClassification},matchingReadback(),'cross-0-pdfs-sign',0),false);
});

test('full signing exception uses real SDK normalized evidence in both directions without issuing URLs', async () => {
  const mockClient=makeClient('sb_publishable_synthetic',boundedFetch(async()=>new Response(JSON.stringify({code:'NoSuchKey',statusCode:'404'}),{status:400})));
  const response=await adapter(mockClient,randomUUID()).sign('pdfs','synthetic/object.pdf');
  const b=backend();
  for(const user of b.clients){const original=user.sign;user.sign=(bucket,path)=>bucket==='pdfs'&&!path.startsWith(user.id+'/')?response:original(bucket,path);}
  const events=[],r=await runAcceptance(b.clients,e=>events.push(e));
  assert.equal(r.status,'PASS');assert.equal(r.cases,72);assert.equal(r.cleanup,'PASS');requireComplete(r.results);
  assert.equal(events.filter(e=>e.case?.endsWith('-pdfs-sign')&&e.classification==='OWNER_READBACK_MATCH').length,2);
});

test('full signing exception rejects missing owner, wrong identity, changed bytes and failed post-integrity',async()=>{
  for(const mode of ['missing','identity','bytes','wrong-owner','post-owner','post-actor','throw']){
    const b=backend(),attacker=b.clients[0],owner=b.clients[1];
    const original=attacker.sign,ownerList=owner.list,ownerDownload=owner.download;
    let pending=false,target,p;
    attacker.sign=(bucket,path)=>{
      if(bucket!=='pdfs'||path.startsWith(attacker.id+'/'))return original(bucket,path);
      target={bucket,path};pending=true;
      if(mode==='wrong-owner')p.objects.find(o=>o.path===path).owner=attacker;
      return compositeResponse();
    };
    owner.list=async(bucket,prefix)=>{
      const r=await ownerList(bucket,prefix);
      if(pending&&bucket===target.bucket&&target.path.startsWith(prefix+'/')){
        if(mode==='missing'){pending=false;return ok(r.data.filter(x=>x.name!==target.path.split('/').at(-1)));}
        if(mode==='identity')return ok(r.data.map(x=>x.name===target.path.split('/').at(-1)?{...x,id:'wrong-synthetic-id'}:x));
      }
      return r;
    };
    owner.download=(bucket,path)=>{
      if(pending&&path===target.path){pending=false;if(mode==='bytes')return ok(Buffer.from('incorrect'));if(mode==='throw')throw Error('PRIVATE_SENTINEL');}
      return ownerDownload(bucket,path);
    };
    const events=[];
    const r=await runAcceptance(b.clients,e=>{
      events.push(e);
      if(e.case==='cross-0-pdfs-sign'&&e.classification==='OWNER_READBACK_MATCH'&&mode.startsWith('post-')){
        const o=p.actors[mode==='post-owner'?1:0].objects[0];b.objects.get(o.bucket+':'+o.path).bytes=Buffer.from('changed');
      }
    },randomUUID,value=>{p=value});
    assert.equal(r.status,'FAIL',mode);assert.equal(r.cases,9,mode);
    assert.equal(r.cleanup,mode==='wrong-owner'?'BLOCKED':'PASS',mode);
    assert.equal(r.failure,mode.startsWith('post-')?'OBJECT_BYTES_MISMATCH':'CROSS_USER_SIGN_ALLOWED_OR_UNEXPLAINED',mode);
    assert(!JSON.stringify(events).includes(target.path));assert(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
  }
});

test('all operation-family denial checks reject contradictory evidence without expanding accepted errors', () => {
  for(const error of [{status:200,code:'42501'}, {status:403,code:'42501',statusCode:'InvalidJWT'},
    {status:403,statusCode:{}}, {status:403,statusCode:false}, {status:403,statusCode:400.5},
    {status:403,code:'NoSuchKey',error:'NoSuchBucket'}, {status:400,statusCode:'404'}])
    assert.equal(deniedError({data:null,error}),false);
  assert.equal(deniedError({data:null,error:{code:'42501'}}),true);
  assert.equal(deniedError({data:null,error:{status:403,statusCode:'AccessDenied'}}),true);
  assert.equal(deniedError({data:null,error:{status:403},transportClassification:'STORAGE_NO_SUCH_BUCKET'}),false);
});

test('case ten ambiguous upload reports original evidence and proves scoped state without accepting ambiguity', async () => {
  const b=backend(),user=b.clients[0],original=user.upload,events=[];
  user.upload=(bucket,path,bytes,upsert)=>path.startsWith(user.id+'/')?original(bucket,path,bytes,upsert):{
    data:null,error:{name:'StorageApiError',status:400,statusCode:'403'},transportClassification:'STORAGE_AUTHORIZATION_ERROR'};
  const r=await runAcceptance(b.clients,e=>events.push(e));
  assert.equal(r.status,'FAIL');assert.equal(r.cases,10);assert.equal(r.cleanup,'PASS');
  const d=events.find(e=>e.case==='cross-0-pdfs-upload'&&e.event==='OPERATION_DIAGNOSTIC'&&e.operation==='upload');
  assert.equal(d.sdkCode,'403');assert.equal(d.transportClassification,'STORAGE_AUTHORIZATION_ERROR');
  const state=events.find(e=>e.case==='cross-0-pdfs-upload'&&e.event==='MUTATION_STATE_DIAGNOSTIC');
  assert.equal(state.ownerIntact,true);assert.equal(state.attackerIntact,true);
  assert.equal(state.foreignDestinationAbsent,true);assert.equal(state.attackerDestinationAbsent,true);
});

test('unauthorized upload followed by denial or exception is detected independently and cleaned only within scope',async()=>{
  for(const throws of [false,true]){
    const b=backend(),user=b.clients[0],owner=b.clients[1],original=user.upload,events=[];
    user.upload=async(bucket,path,bytes,upsert)=>{
      if(path.startsWith(user.id+'/'))return original(bucket,path,bytes,upsert);
      await owner.upload(bucket,path,bytes);
      if(throws)throw Error('PRIVATE_SENTINEL');return denied();
    };
    const r=await runAcceptance(b.clients,e=>events.push(e));
    assert.equal(r.status,'FAIL');assert.equal(r.cases,10);assert.equal(r.cleanup,'PASS');
    const state=events.find(e=>e.case==='cross-0-pdfs-upload'&&e.event==='MUTATION_STATE_DIAGNOSTIC');
    assert.equal(state.foreignDestinationAbsent,false);
    assert(events.some(e=>e.case==='cross-0-pdfs-upload'&&e.event==='INTEGRITY_DIAGNOSTIC'));
    assert(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
  }
});

test('hierarchy write followed by exception still produces independent integrity and forged-row evidence',async()=>{
  const b=backend(),user=b.clients[0],original=user.insert,events=[];
  user.insert=async(table,row)=>{
    if(!row.title.endsWith('forged'))return original(table,row);
    b.db[table].set(row.id,copy(row));throw Error('PRIVATE_SENTINEL');
  };
  const r=await runAcceptance(b.clients,e=>events.push(e));assert.equal(r.status,'FAIL');
  const state=events.find(e=>e.case==='cross-0-sections-insert'&&e.event==='MUTATION_STATE_DIAGNOSTIC');
  assert(state);assert.equal(state.forgedRowAbsent,false);assert.equal(r.cleanup,'PASS');
  assert(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
});

test('all 72 cases have operation diagnostics and stay within unchanged request budget',async()=>{
  const b=backend(),events=[];let calls=0,assertionCalls;
  for(const u of b.clients)for(const key of Object.keys(u))if(typeof u[key]==='function'){
    const original=u[key];u[key]=(...args)=>{calls++;return original(...args)};
  }
  const r=await runAcceptance(b.clients,e=>events.push(e),randomUUID,()=>{},()=>{assertionCalls=calls});
  assert.equal(r.status,'PASS');requireComplete(r.results);
  for(const id of EXPECTED_CASES)assert(events.some(e=>e.case===id&&e.event==='OPERATION_DIAGNOSTIC'));
  assert(assertionCalls<1390,`assertion requests ${assertionCalls}`);
  assert(calls-assertionCalls<=400,`cleanup requests ${calls-assertionCalls}`);
  assert.equal(events.filter(e=>e.event==='INTEGRITY_DIAGNOSTIC').length,66);
  assert(!/PRIVATE_SENTINEL|signedUrl":|access_token|refresh_token/.test(JSON.stringify(events)));
});

test('real SDK mutation transport diagnostic is per operation without changing denial response',async()=>{
  for(const [method,args,verb,path] of [
    ['upload',['pdfs','synthetic/object.pdf',pdf('test')],'POST','/storage/v1/object/pdfs/synthetic/object.pdf'],
    ['updateObject',['pdfs','synthetic/object.pdf',pdf('test')],'PUT','/storage/v1/object/pdfs/synthetic/object.pdf'],
    ['removeObject',['pdfs','synthetic/object.pdf'],'DELETE','/storage/v1/object/pdfs'],
    ['move',['pdfs','synthetic/a.pdf','synthetic/b.pdf'],'POST','/storage/v1/object/move'],
    ['list',['pdfs','synthetic'],'POST','/storage/v1/object/list/pdfs'],
    ['insert',['sections',{title:'synthetic'}],'POST','/rest/v1/sections'],
  ]){
    let calls=0;
    const c=makeClient('sb_publishable_synthetic',boundedFetch(async(url,init)=>{
      calls++;assert.equal(init.method,verb);assert.equal(new URL(url).pathname,path);
      return new Response(JSON.stringify({code:'42501',statusCode:'403',message:'PRIVATE_SENTINEL'}),{status:403,headers:{'content-type':'application/json'}});
    }));
    const r=await adapter(c,randomUUID())[method](...args);
    assert.equal(calls,1);assert.equal(r.transportClassification,'STORAGE_AUTHORIZATION_ERROR');assert.equal(r.transportHttpStatus,403);
    assert(r.error);assert.equal(deniedError(r),true);
  }
});

test('coverage artifact enumerates precisely the unchanged ordered 72-case registry', async()=>{
  const fs=await import('node:fs/promises');
  const coverage=JSON.parse(await fs.readFile(new URL('./ACCEPTANCE-COVERAGE.json',import.meta.url),'utf8'));
  assert.equal(coverage.mandatoryCases,72);assert.deepEqual(coverage.cases.map(x=>x.case),EXPECTED_CASES);
  assert(coverage.cases.every(x=>x.controls.length>0&&x.cleanup&&x.liveEvidence.startsWith('pending')));
});

test('contradictory denial errors cannot PASS listing, Storage upload or hierarchy insertion in full acceptance',async()=>{
  for(const family of ['list','upload','insert']){
    const b=backend(),user=b.clients[0],original=user[family],events=[];
    user[family]=(...args)=>{
      const cross=family==='insert'?args[1].title.endsWith('forged'):!args[1].startsWith(user.id+'/');
      return cross?{data:null,error:{status:403,code:'42501',statusCode:'InvalidJWT'},transportClassification:'STORAGE_AUTHENTICATION_ERROR'}:original(...args);
    };
    const r=await runAcceptance(b.clients,e=>events.push(e));assert.equal(r.status,'FAIL',family);assert.equal(r.cleanup,'PASS',family);
    assert.equal(r.results.at(-1).status,'FAIL');
    assert(events.some(e=>e.event==='OPERATION_DIAGNOSTIC'&&e.responseClassification==='UNRECOGNIZED_ERROR'));
  }
});


test('DIAGNOSTIC_COLLECT records safe ambiguous failures and continues all 72 without changing ACCEPTANCE',async()=>{
  for(const mode of ['ACCEPTANCE','DIAGNOSTIC_COLLECT']){
    const b=backend(),events=[];
    for(const user of b.clients){const original=user.upload;user.upload=(bucket,path,bytes,upsert)=>bucket==='pdfs'&&!upsert&&!path.startsWith(user.id+'/')?
      {data:null,error:{name:'StorageApiError',status:400,statusCode:'404'},transportClassification:'STORAGE_NO_SUCH_KEY',transportHttpStatus:400}:original(bucket,path,bytes,upsert);}
    const r=await runAcceptance(b.clients,e=>events.push(e),randomUUID,()=>{},()=>{},{mode});
    assert.equal(r.status,'FAIL');assert.equal(r.cleanup,'PASS');
    if(mode==='ACCEPTANCE'){assert.equal(r.cases,10);assert.equal(r.summary,undefined);}
    else{
      assert.equal(r.cases,72);assert.deepEqual(r.summary.counts,{PASS:70,FAIL:2,BLOCKED:0,NOT_RUN:0});
      assert.equal(r.summary.criticalSafetyStop,false);assert.equal(r.summary.releaseAuthorized,false);
      assert.equal(events.filter(e=>e.event==='CONTINUATION_GUARD'&&e.continued===true).length,2);
      for(const failure of r.summary.failures){assert.equal(failure.category,'AMBIGUOUS_DENIAL_STATE_VERIFIED');assert.equal(failure.integrityVerified,true);assert.equal(failure.cleanupScopeVerified,true);}
    }
  }
});

test('collection stops on data disclosure, unauthorized mutation, unknown transport and credential failure',async()=>{
  for(const mode of ['write','success','throw','authentication','unknown','contamination','wrong-owner']){
    const b=backend(),user=b.clients[0],owner=b.clients[1],original=user.upload;let p;
    user.upload=async(bucket,path,bytes,upsert)=>{
      if(bucket!=='pdfs'||path.startsWith(user.id+'/'))return original(bucket,path,bytes,upsert);
      if(mode==='write')await owner.upload(bucket,path,bytes);
      if(mode==='success')return ok({path:'PRIVATE_SENTINEL'});
      if(mode==='throw')throw Error('PRIVATE_SENTINEL');
      if(mode==='contamination'){const o=p.actors[1].objects[0];b.objects.get(o.bucket+':'+o.path).bytes=Buffer.from('changed');}
      if(mode==='wrong-owner')p.objects.find(o=>o.path===path).owner=user;
      return {data:null,error:{name:'StorageApiError',status:400,statusCode:mode==='authentication'?'401':'403'},
        transportClassification:mode==='authentication'?'STORAGE_AUTHENTICATION_ERROR':mode==='unknown'?'TRANSPORT_UNKNOWN_OR_MALFORMED':'STORAGE_AUTHORIZATION_ERROR',transportHttpStatus:400};
    };
    const events=[],r=await runAcceptance(b.clients,e=>events.push(e),randomUUID,value=>{p=value},()=>{},{mode:'DIAGNOSTIC_COLLECT'});
    assert.equal(r.status,'FAIL',mode);assert.equal(r.cases,10,mode);assert.equal(r.summary.criticalSafetyStop,true,mode);
    assert.equal(r.summary.counts.BLOCKED,62);assert.equal(r.summary.counts.PASS,9);assert.equal(r.summary.counts.FAIL,1);
    assert(!events.some(e=>e.case==='cross-0-pdfs-overwrite'&&e.status==='PASS'));
    assert(!JSON.stringify(r.summary).includes('PRIVATE_SENTINEL'));
  }
});

test('collection continuation requires clean reserved scopes and guard failures block all later cases',async()=>{
  for(const mode of ['unregistered-object','guard-interruption','cleanup-failure']){
    const b=backend(),user=b.clients[0],owner=b.clients[1],original=user.upload,ownerList=owner.list;
    let after=false,p;
    user.upload=(bucket,path,bytes,upsert)=>{
      if(bucket!=='pdfs'||path.startsWith(user.id+'/'))return original(bucket,path,bytes,upsert);
      after=true;
      return {data:null,error:{name:'StorageApiError',status:400,statusCode:'403'},transportClassification:'STORAGE_AUTHORIZATION_ERROR',transportHttpStatus:400};
    };
    owner.list=async(bucket,prefix)=>{
      const r=await ownerList(bucket,prefix);
      if(after&&mode==='unregistered-object')return ok([...r.data,{name:'unregistered-synthetic',id:'synthetic'}]);
      if(after&&mode==='guard-interruption')throw Error('PRIVATE_SENTINEL');
      return r;
    };
    if(mode==='cleanup-failure')for(const client of b.clients)client.removeObject=()=>{throw Error('PRIVATE_SENTINEL')};
    const r=await runAcceptance(b.clients,()=>{},randomUUID,value=>{p=value},()=>{},{mode:'DIAGNOSTIC_COLLECT'});
    assert.equal(r.status,'FAIL',mode);assert.equal(r.summary.criticalSafetyStop,true,mode);
    if(mode!=='cleanup-failure')assert.equal(r.cases,10,mode);
    assert.notEqual(r.cleanup,'PASS',mode);
  }
});

test('collection retains dependency barrier on failed owner setup and incomplete completion can never PASS',async()=>{
  const b=backend();b.clients[0].insert=()=>({data:null,error:{status:403,code:'42501'}});
  const r=await runAcceptance(b.clients,()=>{},randomUUID,()=>{},()=>{},{mode:'DIAGNOSTIC_COLLECT'});
  assert.equal(r.status,'FAIL');assert.equal(r.cases,1);assert.equal(r.summary.counts.BLOCKED,71);
  assert.equal(r.summary.criticalSafetyStop,true);
  await assert.rejects(()=>runAcceptance(backend().clients,()=>{},randomUUID,()=>{},()=>{},{mode:'UNKNOWN'}),/INVALID_MODE/);
});

test('healthy collection completes all 72 but is explicitly not release authorization',async()=>{
  const r=await runAcceptance(backend().clients,()=>{},randomUUID,()=>{},()=>{},{mode:'DIAGNOSTIC_COLLECT'});
  assert.equal(r.status,'PASS');assert.equal(r.cases,72);assert.deepEqual(r.summary.counts,{PASS:72,FAIL:0,BLOCKED:0,NOT_RUN:0});
  assert.equal(r.summary.releaseAuthorized,false);assert.equal(r.summary.mode,'DIAGNOSTIC_COLLECT');
});

test('collection does not retry deadline, TLS/network or identity failures',async()=>{
  const {Stop}=await import('./adapter.mjs');
  for(const code of ['REQUEST_OR_TIME_BUDGET','NETWORK_OR_SERVICE_FAILURE','IDENTITY_UNVERIFIED']){
    const b=backend(),user=b.clients[0],original=user.upload;let attackCalls=0;
    user.upload=(bucket,path,bytes,upsert)=>{
      if(path.startsWith(user.id+'/'))return original(bucket,path,bytes,upsert);
      attackCalls++;throw new Stop(code);
    };
    const r=await runAcceptance(b.clients,()=>{},randomUUID,()=>{},()=>{},{mode:'DIAGNOSTIC_COLLECT'});
    assert.equal(r.status,'FAIL');assert.equal(r.cases,10);assert.equal(r.summary.criticalSafetyStop,true);
    assert.equal(attackCalls,1);assert.equal(r.summary.counts.BLOCKED,62);
  }
});

test('collect dependency graph covers each case without hidden sequencing prerequisites',async()=>{
  const {caseDependencies}=await import('./collect-mode.mjs');
  const graph=caseDependencies(EXPECTED_CASES);
  assert.deepEqual(Object.keys(graph),EXPECTED_CASES);
  for(const id of EXPECTED_CASES){
    assert(graph[id].every(parent=>EXPECTED_CASES.includes(parent)&&parent!==id));
    if(id.startsWith('cross-'))assert.equal(graph[id].length,6);
  }
  const walk=(id,trail=new Set())=>{
    assert(!trail.has(id));const next=new Set([...trail,id]);for(const parent of graph[id])walk(parent,next);
  };
  for(const id of EXPECTED_CASES)walk(id);
});

test('aggregate 17 PASS 13 FAIL 42 BLOCKED can arise without unauthorized actions; first failure phase survives cleanup',async()=>{
  const b=backend(),u=b.clients[0];let ready=false;
  const response=(logical)=>({data:null,error:{name:'StorageApiError',status:400,statusCode:logical},transportHttpStatus:400,transportClassification:logical==='404'?'STORAGE_NO_SUCH_KEY':'STORAGE_AUTHORIZATION_ERROR'});
  for(const name of ['upload','move','removeObject']){
    const original=u[name];u[name]=(...args)=>args[1].startsWith(u.id+'/')&&(name!=='move'||args[2].startsWith(u.id+'/'))?original(...args):response(name==='upload'||name==='move'&&args[1].startsWith(u.id+'/')?'404':'403');
  }
  const originalRead=u.read;
  u.read=(table,id)=>ready&&table==='groups'?{data:null,error:{message:'PRIVATE_SENTINEL'},
    transportClassification:'TRANSPORT_FAILURE',transportFailureKind:'HTTP_SERVER_ERROR',transportHttpStatus:503}:originalRead(table,id);
  const events=[],r=await runAcceptance(b.clients,e=>{
    events.push(e);if(e.case==='cross-0-sections-reassign'&&e.status==='PASS')ready=true;
  },randomUUID,()=>{},()=>{ready=false},{mode:'DIAGNOSTIC_COLLECT'});
  assert.equal(r.cases,30);assert.equal(r.status,'FAIL');assert.equal(r.failure,'OWNER_OR_SERVICE_FAILURE');assert.equal(r.cleanup,'PASS');
  assert.deepEqual(r.summary.counts,{PASS:17,FAIL:13,BLOCKED:42,NOT_RUN:0});
  assert.equal(r.summary.failures.filter(f=>f.category==='AMBIGUOUS_DENIAL_STATE_VERIFIED').length,12);
  const last=r.summary.failures.at(-1);
  assert.equal(last.case,'cross-0-groups-read');assert.equal(last.stage,'precheck');assert.equal(last.operation,'read');
  assert.equal(last.transportFailureKind,'HTTP_SERVER_ERROR');assert.equal(last.httpStatus,503);
  assert.equal(last.integrityVerified,false);assert.equal(last.cleanupScopeVerified,false);
  assert(!JSON.stringify(r.summary).includes('PRIVATE_SENTINEL'));
});

test('reviewed recovered final-run responses pass all 72 only with complete independent evidence',async()=>{
  const fs=await import('node:fs/promises');
  const evidence=JSON.parse(await fs.readFile(new URL('./RECOVERED-RUN-RECONCILIATION.json',import.meta.url),'utf8'));
  const responses={};
  for(const logical of ['403','404']){
    const code=logical==='403'?'AccessDenied':'NoSuchKey';
    const c=makeClient('sb_publishable_synthetic',boundedFetch(async()=>new Response(JSON.stringify({code,statusCode:logical,message:'PRIVATE_SENTINEL'}),{status:400})));
    responses[logical]=await adapter(c,randomUUID()).move('pdfs','synthetic/source.pdf','synthetic/destination.pdf');
    assert.equal(deniedError(responses[logical]),false);
  }
  const b=backend();
  for(const u of b.clients){
    for(const name of ['upload','move']){
      const original=u[name];u[name]=(...args)=>{
        if(name==='move'){
          if(!args[1].startsWith(u.id+'/'))return responses['404'];
          if(!args[2].startsWith(u.id+'/'))return responses['403'];
        }else if(!args[1].startsWith(u.id+'/'))return responses['403'];
        return original(...args);
      };
    }
    for(const name of ['download','sign']){
      const original=u[name];u[name]=(bucket,path)=>bucket==='user-content'&&!path.startsWith(u.id+'/')?responses['404']:original(bucket,path);
    }
  }
  const r=await runAcceptance(b.clients,()=>{},randomUUID,()=>{},()=>{},{mode:'DIAGNOSTIC_COLLECT'});
  assert.equal(evidence.failures.length,24);assert.deepEqual(r.summary.counts,{PASS:72,FAIL:0,BLOCKED:0,NOT_RUN:0});assert.equal(r.cleanup,'PASS');assert.equal(r.summary.criticalSafetyStop,false);
  assert.equal(r.status,'PASS');assert.equal(r.summary.releaseAuthorized,false);requireComplete(r.results);
});

test('recovered error families cannot become acceptance by removing data, code or transport checks',async()=>{
  const {canCollectAfter}=await import('./collect-mode.mjs');
  for(const logical of ['403','404']){
    const transport=logical==='403'?'STORAGE_AUTHORIZATION_ERROR':'STORAGE_NO_SUCH_KEY';
    const base={data:null,error:{name:'StorageApiError',status:400,statusCode:logical},transportHttpStatus:400,transportClassification:transport};
    assert.equal(deniedError(base),false);
    for(const patch of [{data:{}},{data:Buffer.alloc(0)},{error:{...base.error,statusCode:false}},
      {error:{...base.error,code:'InvalidJWT'}},{transportClassification:'STORAGE_NO_SUCH_BUCKET'},
      {transportClassification:'TRANSPORT_CONTRADICTORY_ERROR'},{transportHttpStatus:500}]){
      const response={...base,...patch};assert.equal(deniedError(response),false);
      assert.equal(canCollectAfter('CROSS_USER_MUTATION_ALLOWED_OR_UNEXPLAINED',response),false);
    }
  }
});

async function reviewedMockResponse(logical){
  const code=logical==='403'?'AccessDenied':'NoSuchKey';
  const c=makeClient('sb_publishable_synthetic',boundedFetch(async()=>new Response(JSON.stringify({code,statusCode:logical,message:'PRIVATE_SENTINEL'}),{status:400})));
  return adapter(c,randomUUID()).move('pdfs','synthetic/source','synthetic/destination');
}

test('all 24 reviewed cases pass independently in fail-fast mode only with their full state and readback evidence',async()=>{
  const fs=await import('node:fs/promises');
  const evidence=JSON.parse(await fs.readFile(new URL('./RECOVERED-RUN-RECONCILIATION.json',import.meta.url),'utf8'));
  for(const entry of evidence.failures){
    const b=backend(),i=entry.actor==='A'?0:1,user=b.clients[i],original=user[entry.operation],raw=await reviewedMockResponse(entry.sdkCode);
    let injected=0;
    user[entry.operation]=(...args)=>{
      if(args[0]!==entry.bucket)return original(...args);
      const foreign=!args[1].startsWith(user.id+'/');
      const match=entry.case.endsWith('-move-owned-to-foreign')?!foreign&&!args[2].startsWith(user.id+'/')
        :entry.case.endsWith('-move-foreign-source')?foreign
        :entry.operation==='upload'?foreign&&!args[3]:foreign;
      if(!match)return original(...args);injected++;return raw;
    };
    const events=[],r=await runAcceptance(b.clients,e=>events.push(e));
    assert.equal(r.status,'PASS',entry.case);assert.equal(r.cases,72);assert.equal(r.cleanup,'PASS');assert.equal(injected,1,entry.case);
    requireComplete(r.results);
    if(['download','sign'].includes(entry.operation))assert.equal(events.filter(e=>e.case===entry.case&&e.classification==='OWNER_READBACK_MATCH').length,1);
    assert(!JSON.stringify(events).includes('PRIVATE_SENTINEL'));
  }
});

test('all 24 reviewed cases fail on success, contradictions, changed ownership, source integrity and post-case contamination',async()=>{
  const fs=await import('node:fs/promises');
  const evidence=JSON.parse(await fs.readFile(new URL('./RECOVERED-RUN-RECONCILIATION.json',import.meta.url),'utf8'));
  for(const entry of evidence.failures)for(const mode of ['success','contradiction','ownership','source-bytes','post-case']){
    const b=backend(),i=entry.actor==='A'?0:1,user=b.clients[i],original=user[entry.operation],raw=await reviewedMockResponse(entry.sdkCode);
    let p;
    user[entry.operation]=(...args)=>{
      if(args[0]!==entry.bucket)return original(...args);
      const foreign=!args[1].startsWith(user.id+'/');
      const match=entry.case.endsWith('-move-owned-to-foreign')?!foreign&&!args[2].startsWith(user.id+'/')
        :entry.case.endsWith('-move-foreign-source')?foreign:entry.operation==='upload'?foreign&&!args[3]:foreign;
      if(!match)return original(...args);
      const o=p.actors[1-i].objects.find(o=>o.bucket===entry.bucket);
      if(mode==='ownership')o.owner=user;
      if(mode==='source-bytes')b.objects.get(o.bucket+':'+o.path).bytes=Buffer.from('changed');
      if(mode==='success')return ok({signedUrl:'PRIVATE_SENTINEL',path:'PRIVATE_SENTINEL'});
      if(mode==='contradiction')return {...raw,error:{...raw.error,code:'InvalidJWT'}};
      return raw;
    };
    const r=await runAcceptance(b.clients,e=>{
      if(mode==='post-case'&&e.case===entry.case&&(e.event==='MUTATION_STATE_DIAGNOSTIC'||e.classification==='OWNER_READBACK_MATCH')){
        const o=p.actors[1-i].objects.find(o=>o.bucket===entry.bucket);b.objects.get(o.bucket+':'+o.path).bytes=Buffer.from('changed');
      }
    },randomUUID,value=>{p=value});
    assert.equal(r.status,'FAIL',entry.case+':'+mode);assert.equal(r.results.at(-1).case,entry.case);
    assert.notEqual(r.results.at(-1).status,'PASS');
    if(mode==='ownership')assert.equal(r.cleanup,'BLOCKED');
  }
});

test('every reviewed mutation rejects a real unauthorized write or move hidden behind its expected denial',async()=>{
  const fs=await import('node:fs/promises');
  const evidence=JSON.parse(await fs.readFile(new URL('./RECOVERED-RUN-RECONCILIATION.json',import.meta.url),'utf8'));
  for(const entry of evidence.failures.filter(x=>!['download','sign'].includes(x.operation))){
    const b=backend(),i=entry.actor==='A'?0:1,u=b.clients[i],owner=b.clients[1-i],original=u[entry.operation],raw=await reviewedMockResponse(entry.sdkCode);
    u[entry.operation]=async(...args)=>{
      if(args[0]!==entry.bucket)return original(...args);
      const foreign=!args[1].startsWith(u.id+'/');
      const match=entry.case.endsWith('-move-owned-to-foreign')?!foreign&&!args[2].startsWith(u.id+'/')
        :entry.case.endsWith('-move-foreign-source')?foreign:entry.operation==='upload'?foreign&&!args[3]:foreign;
      if(!match)return original(...args);
      if(entry.operation==='upload')await owner.upload(args[0],args[1],args[2]);
      else if(entry.operation==='move'){
        const key=args[0]+':'+args[1],value=b.objects.get(key);b.objects.delete(key);b.objects.set(args[0]+':'+args[2],value);
      }else b.objects.get(args[0]+':'+args[1]).bytes=Buffer.from('changed');
      return raw;
    };
    const r=await runAcceptance(b.clients);assert.equal(r.status,'FAIL',entry.case);assert.equal(r.results.at(-1).case,entry.case);
    assert.equal(r.cleanup,'PASS',entry.case);
  }
});

test('user-content read/sign require one fresh matching owner readback rather than only eventual intact state',async()=>{
  const fs=await import('node:fs/promises');
  const evidence=JSON.parse(await fs.readFile(new URL('./RECOVERED-RUN-RECONCILIATION.json',import.meta.url),'utf8'));
  for(const entry of evidence.failures.filter(x=>['download','sign'].includes(x.operation)))for(const mode of ['missing','identity','sdk-error']){
    const b=backend(),i=entry.actor==='A'?0:1,u=b.clients[i],owner=b.clients[1-i],original=u[entry.operation];
    const originalList=owner.list,originalDownload=owner.download,raw=await reviewedMockResponse('404');let pending=false,target,readbacks=0;
    u[entry.operation]=(...args)=>{
      if(args[0]!=='user-content'||args[1].startsWith(u.id+'/'))return original(...args);
      pending=true;target=args[1];return raw;
    };
    owner.list=async(bucket,prefix)=>{
      const r=await originalList(bucket,prefix);
      if(pending&&bucket==='user-content'&&target.startsWith(prefix+'/')){
        readbacks++;
        if(mode==='missing'){pending=false;return ok([])}
        if(mode==='identity')return ok(r.data.map(x=>({...x,id:'wrong-synthetic-id'})));
      }
      return r;
    };
    owner.download=(bucket,path)=>{
      if(pending&&bucket==='user-content'&&path===target){pending=false;if(mode==='sdk-error')return denied()}
      return originalDownload(bucket,path);
    };
    const events=[],r=await runAcceptance(b.clients,e=>events.push(e));
    assert.equal(r.status,'FAIL',entry.case+mode);assert.equal(r.results.at(-1).case,entry.case);assert.equal(readbacks,1);
    assert.equal(r.cleanup,'PASS');assert(events.some(e=>e.case===entry.case&&e.event==='INTEGRITY_DIAGNOSTIC'&&e.bothActorsIntact===true));
  }
});
