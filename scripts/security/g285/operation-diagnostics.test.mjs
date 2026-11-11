import test from 'node:test';
import assert from 'node:assert/strict';
import { operationDiagnostic, strictDenial } from './operation-diagnostics.mjs';
import { createDownloadTransport } from './transport.mjs';
const origin = 'https://lmgrhmyurhjlwwdedojk.supabase.co';

test('standardized diagnostics emit only fixed values and do not inspect payload contents', () => {
  const response = { data: { secret: 'PRIVATE_SENTINEL' }, error: { status: 403, code: '42501', message: 'PRIVATE_SENTINEL' },
    transportClassification: 'STORAGE_AUTHORIZATION_ERROR', transportHttpStatus: 403 };
  const d = operationDiagnostic(response);
  assert.equal(d.classification, 'CONTRADICTORY_RESPONSE'); assert.equal(strictDenial(response), false);
  assert(!JSON.stringify(d).includes('PRIVATE_SENTINEL'));
  assert.equal(operationDiagnostic({ data: [], error: null }).emptyArray, true);
  assert.equal(operationDiagnostic({ data: null, error: null }).classification, 'SUCCESS_WITHOUT_DATA');
});
test('malformed, inherited and accessor status evidence cannot prove denial', () => {
  let reads = 0;
  for (const value of [null, false, {}, [], NaN, -1, 400.5, '42501-secret'])
    assert.equal(strictDenial({ data: null, error: { status: 403, statusCode: value } }), false);
  const error = Object.defineProperty({ status: 403 }, 'code', { get() { reads++; throw Error('PRIVATE_SENTINEL'); } });
  assert.equal(strictDenial({ data: null, error }), false);
  assert.equal(operationDiagnostic({ data: null, error }).classification, 'MALFORMED_OR_AMBIGUOUS_RESPONSE');
  assert.equal(reads, 0);
  assert.equal(strictDenial({ data: null, error: Object.assign(Object.create({ code: '42501' }), { status: 403 }) }), false);
});
test('every legacy fast-path counterexample fails and valid internally consistent denial survives', () => {
  for (const error of [{ status: 403, code: '42501', statusCode: 'InvalidJWT' },
    { status: 403, code: '42501', statusCode: 'NoSuchBucket' }, { status: 500, code: '42501' },
    { status: 403, code: 'UNKNOWN' }, { status: 400, statusCode: '403' }, { status: '42501' }])
    assert.equal(strictDenial({ data: null, error }), false);
  for (const error of [{ code: '42501' }, { status: 403, code: '42501', statusCode: '403' },
    { status: 400, statusCode: 'AccessDenied' }, { status: 403 }])
    assert.equal(strictDenial({ data: null, error }), true);
  for (const status of [200, 500, null, {}, false])
    assert.equal(strictDenial({ data: null, error: { status: 403 }, transportHttpStatus: status }), false);
});
test('all generic request slots preserve method, headers, body and original response unchanged', async () => {
  const response = new Response(JSON.stringify({ code: 'AccessDenied', statusCode: '403' }), { status: 403 });
  const init = { method: 'POST', headers: { 'x-synthetic': 'test' }, body: 'synthetic' };
  const t = createDownloadTransport(async (input, options) => {
    assert.equal(input, origin + '/storage/v1/object/pdfs/synthetic'); assert.equal(options, init); return response;
  }, origin);
  const r = await t.observeRequest('POST', '/storage/v1/object/pdfs/synthetic', () => t.fetch(origin + '/storage/v1/object/pdfs/synthetic', init));
  assert.equal(r.response, response); assert.equal(r.transportClassification, 'STORAGE_AUTHORIZATION_ERROR');
  assert.equal(r.transportHttpStatus, 403);
});
test('simultaneous generic requests do not exchange evidence; overlapping same targets are ambiguous', async () => {
  const t = createDownloadTransport(async input => new Response(JSON.stringify({ code: input.endsWith('/one') ? 'NoSuchKey' : 'NoSuchBucket', statusCode: '404' }), { status: 400 }), origin);
  const paths = ['/storage/v1/object/pdfs/one', '/storage/v1/object/pdfs/two'];
  const results = await Promise.all(paths.map(path => t.observeRequest('POST', path, () => t.fetch(origin + path, { method: 'POST' }))));
  assert.equal(results[0].transportClassification, 'STORAGE_NO_SUCH_KEY'); assert.equal(results[1].transportClassification, 'STORAGE_NO_SUCH_BUCKET');
  let release; const gate = new Promise(resolve => { release = resolve; });
  const requests = [0, 1].map(() => t.observeRequest('POST', paths[0], () => gate.then(() => t.fetch(origin + paths[0], { method: 'POST' }))));
  release(); const ambiguous = await Promise.all(requests);
  assert(ambiguous.every(r => r.transportClassification === 'TRANSPORT_CONTRADICTORY_ERROR' && r.transportHttpStatus === null));
});

