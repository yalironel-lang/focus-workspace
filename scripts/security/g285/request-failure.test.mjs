import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requestFailureFacts } from './request-failure.mjs';
import { adapter, makeClient, boundedFetch } from './adapter.mjs';
import { operationDiagnostic, strictDenial } from './operation-diagnostics.mjs';

async function observed(fetcher) {
  let calls = 0;
  const client = makeClient('sb_publishable_synthetic', boundedFetch(async (...args) => { calls++; return fetcher(...args); }));
  const r = await adapter(client, randomUUID()).read('groups', randomUUID());
  assert.equal(calls, 1);
  assert.equal(r.transportClassification, 'TRANSPORT_FAILURE'); assert.equal(strictDenial(r), false);
  const d = operationDiagnostic(r); assert(!JSON.stringify(d).includes('PRIVATE_SENTINEL')); return d;
}
test('HTTP 429 and 5xx remain failed requests with distinct sanitized status evidence', async () => {
  for (const status of [429,500,502,503,504]) {
    const d = await observed(async () => new Response('PRIVATE_SENTINEL', { status }));
    assert.equal(d.transportFailureKind, status === 429 ? 'HTTP_RATE_LIMIT' : 'HTTP_SERVER_ERROR');
    assert.equal(d.httpStatus, status);
  }
});
test('actual SDK fetch rejection preserves DNS, TLS, connectivity and timeout classes without causes', async () => {
  for (const [code, expected] of [['ENOTFOUND','DNS_FAILURE'],['ECONNRESET','CONNECTIVITY_FAILURE'],
    ['ERR_TLS_CERT_ALTNAME_INVALID','TLS_FAILURE'],['UND_ERR_CONNECT_TIMEOUT','REQUEST_TIMEOUT']]) {
    const d = await observed(async () => { throw Object.assign(Error('PRIVATE_SENTINEL'), { cause: { code, hostname: 'PRIVATE_SENTINEL' } }); });
    assert.equal(d.transportFailureKind, expected); assert.equal(d.httpStatus, null);
  }
});
test('instrumentation failures after response delivery remain distinct and cannot become denial', async () => {
  const d = await observed(async () => Object.defineProperty({}, 'ok', { get() { throw Error('PRIVATE_SENTINEL'); } }));
  assert.equal(d.transportFailureKind, 'INSTRUMENTATION_FAILURE');
});
test('unknown, inherited, accessor and cyclic error causes never expose details or hang', () => {
  let reads = 0;
  for (const error of [null, {}, Object.create({ code: 'ENOTFOUND' }),
    Object.defineProperty({}, 'code', { get() { reads++; throw Error('PRIVATE_SENTINEL'); } }),
    Object.defineProperty({}, 'cause', { get() { reads++; throw Error('PRIVATE_SENTINEL'); } })])
    assert.equal(requestFailureFacts(error).kind, 'UNKNOWN_TRANSPORT_FAILURE');
  const e = { message: 'PRIVATE_SENTINEL' }; e.cause = e;
  assert.equal(requestFailureFacts(e).kind, 'UNKNOWN_TRANSPORT_FAILURE'); assert.equal(reads, 0);
});
test('aborts and request budgets have fixed labels and no raw error output', () => {
  for (const [error, kind] of [[{ name: 'TimeoutError' },'REQUEST_TIMEOUT'],[{ name: 'AbortError' },'ABORTED'],
    [{ code: 'REQUEST_OR_TIME_BUDGET' },'REQUEST_BUDGET']]) assert.equal(requestFailureFacts(error).kind,kind);
});
