import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createDownloadTransport } from './transport.mjs';
import { markRequestFailure, requestFailureFacts } from './request-failure.mjs';
import { REQUEST_LIMITS } from './request-budget.mjs';
const clientTransports = new WeakMap();

export const REF = 'lmgrhmyurhjlwwdedojk';
export const ORIGIN = `https://${REF}.supabase.co`;
// Operator-designated identities; this does not establish account age/disposability.
export const TEST_ACCOUNTS = Object.freeze({
  A: 'lisbon.car.search2026@gmail.com',
  B: 'yalironell@gmail.com',
});
export class Stop extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function requireCheck(value, code) { if (!value) throw new Stop(code); }
export function claims(jwt) {
  try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()); }
  catch { throw new Stop('INVALID_KEY_OR_SESSION'); }
}
export function checkKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  const c = claims(key);
  requireCheck(c.role === 'anon' && c.ref === REF, 'NON_STAGING_OR_ADMIN_KEY');
}
export function boundedFetch(fetcher = globalThis.fetch, budget = REQUEST_LIMITS.acceptance) {
  requireCheck(Number.isInteger(budget) && budget > 0 && budget <= REQUEST_LIMITS.diagnosticCollect, 'INVALID_REQUEST_BUDGET');
  let requests = 0, blocked = 0; let cleanup = false; let deadline = Date.now() + REQUEST_LIMITS.assertionMs;
  let assertionStats;
  const guarded = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    requireCheck(url.origin === ORIGIN && !url.username && !url.password, 'ENDPOINT_MISMATCH');
    requireCheck(/^\/auth\/v1\/(token|user|logout)$/.test(url.pathname)
      || /^\/rest\/v1\/(sections|groups|items)$/.test(url.pathname)
      || /^\/storage\/v1\/object\//.test(url.pathname), 'UNEXPECTED_API');
    if (Date.now() >= deadline) {
      blocked++;
      throw markRequestFailure(new Stop('REQUEST_OR_TIME_BUDGET'), 'RUN_TIME_BUDGET');
    }
    if (requests >= (cleanup ? REQUEST_LIMITS.cleanup : budget)) {
      blocked++;
      throw markRequestFailure(new Stop('REQUEST_OR_TIME_BUDGET'), 'REQUEST_BUDGET');
    }
    requests++; // Exactly one debit per dispatched fetch, including failed fetches.
    try {
      const response = await fetcher(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(REQUEST_LIMITS.requestMs) });
      if (response.status >= 500 || response.status === 429) throw markRequestFailure(
        new Stop('NETWORK_OR_SERVICE_FAILURE'), response.status === 429 ? 'HTTP_RATE_LIMIT' : 'HTTP_SERVER_ERROR', response.status);
      return response;
    } catch (error) {
      const detail = requestFailureFacts(error);
      throw markRequestFailure(new Stop('NETWORK_OR_SERVICE_FAILURE'), detail.kind, detail.httpStatus);
    }
  };
  // A separate, non-renewable budget lets scoped cleanup proceed after assertion failure.
  guarded.beginCleanup = () => {
    if (!cleanup) {
      assertionStats = { dispatched: requests, blocked, limit: budget };
      cleanup = true; requests = 0; blocked = 0; deadline = Date.now() + REQUEST_LIMITS.cleanupMs;
    }
  };
  guarded.stats = () => ({ assertion: assertionStats ? { ...assertionStats } : { dispatched: requests, blocked, limit: budget },
    cleanup: cleanup ? { dispatched: requests, blocked, limit: REQUEST_LIMITS.cleanup } : null });
  return guarded;
}
export function makeClient(key, fetcher) {
  checkKey(key);
  const transport = createDownloadTransport(fetcher, ORIGIN);
  const client = createClient(ORIGIN, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false },
    global: { fetch: transport.fetch },
  });
  clientTransports.set(client, transport);
  return client;
}
export async function authenticate(client, email, password, label, previousIds = []) {
  requireCheck(Object.hasOwn(TEST_ACCOUNTS, label) && Array.isArray(previousIds), 'INVALID_ACCOUNT_BINDING');
  const login = await client.auth.signInWithPassword({ email, password });
  requireCheck(!login.error && login.data?.session, 'LOGIN_FAILED');
  const c = claims(login.data.session.access_token);
  requireCheck(c.role === 'authenticated' && c.iss === `${ORIGIN}/auth/v1`, 'SESSION_SCOPE');
  const verified = await client.auth.getUser();
  requireCheck(!verified.error && verified.data.user?.id === c.sub, 'IDENTITY_UNVERIFIED');
  // Use the server-verified identity, never just the prompt or decoded email claim.
  requireCheck(typeof verified.data.user.email === 'string'
    && verified.data.user.email === TEST_ACCOUNTS[label], 'ACCOUNT_EMAIL_MISMATCH');
  requireCheck(!previousIds.includes(verified.data.user.id), 'DISTINCT_USERS_REQUIRED');
  requireCheck(!verified.data.user.is_anonymous, 'ANONYMOUS_SESSION_REJECTED');
  requireCheck(!verified.data.user.factors?.some(f => f.status === 'verified'), 'MFA_OPERATOR_FLOW_REQUIRED');
  return verified.data.user.id;
}
// Only exact synthetic identifiers supplied by core.mjs enter these methods.
export function adapter(client, id) {
  const result = {
    id,
    read: (table, rowId) => client.from(table).select('*').eq('id', rowId).maybeSingle().retry(false),
    insert: (table, row) => client.from(table).insert(row).select('id').retry(false),
    update: (table, rowId, patch) => client.from(table).update(patch).eq('id', rowId).select('id').retry(false),
    remove: (table, rowId, marker) => client.from(table).delete().eq('id', rowId).like('title', `${marker}%`).select('id').retry(false),
    children: (table, field, rowId) => client.from(table).select('id').eq(field, rowId).limit(100).retry(false),
    upload: (bucket, path, bytes, upsert = false) => client.storage.from(bucket).upload(path, bytes, { contentType: 'application/pdf', upsert }),
    overwrite: (bucket, path, bytes) => client.storage.from(bucket).upload(path, bytes, { contentType: 'application/pdf', upsert: true }),
    updateObject: (bucket, path, bytes) => client.storage.from(bucket).update(path, bytes, { contentType: 'application/pdf' }),
    download: async (bucket, path) => {
      // A fresh URL for every observation, including owner and isolation checks.
      const nonce = randomUUID();
      const action = () => client.storage.from(bucket).download(path, { cacheNonce: nonce });
      const transport = clientTransports.get(client);
      const observed = transport ? await transport.observe(nonce, action)
        : { response: await action(), transportClassification: 'TRANSPORT_NOT_OBSERVED' };
      const r = observed.response;
      return { error: r.error, data: r.data ? Buffer.from(await r.data.arrayBuffer()) : null,
        transportClassification: observed.transportClassification, transportFailureKind: observed.transportFailureKind,
        transportHttpStatus: observed.transportHttpStatus };
    },
    list: (bucket, prefix) => client.storage.from(bucket).list(prefix, { limit: 100 }),
    sign: async (bucket, path) => {
      const action = () => client.storage.from(bucket).createSignedUrl(path, 30);
      const transport = clientTransports.get(client);
      const observed = transport ? await transport.observeSign(
        new URL(`${ORIGIN}/storage/v1/object/sign/${bucket}/${path}`).pathname, action)
        : { response: await action(), transportClassification: 'TRANSPORT_NOT_OBSERVED' };
      return { ...observed.response, transportClassification: observed.transportClassification,
        transportFailureKind: observed.transportFailureKind, transportHttpStatus: observed.transportHttpStatus };
    },
    move: (bucket, from, to) => client.storage.from(bucket).move(from, to),
    removeObject: (bucket, path) => client.storage.from(bucket).remove([path]),
  };
  // Observe exactly the SDK request for each remaining operation. No payload,
  // query parameter, response data or request identity is retained in diagnostics.
  for (const [name, method, route] of [
    ['read','GET', table => `/rest/v1/${table}`], ['insert','POST', table => `/rest/v1/${table}`],
    ['update','PATCH', table => `/rest/v1/${table}`], ['remove','DELETE', table => `/rest/v1/${table}`],
    ['children','GET', table => `/rest/v1/${table}`],
    ['upload','POST',(bucket,path) => `/storage/v1/object/${bucket}/${path}`],
    ['overwrite','POST',(bucket,path) => `/storage/v1/object/${bucket}/${path}`],
    ['updateObject','PUT',(bucket,path) => `/storage/v1/object/${bucket}/${path}`],
    ['list','POST', bucket => `/storage/v1/object/list/${bucket}`],
    ['move','POST', () => '/storage/v1/object/move'],
    ['removeObject','DELETE', bucket => `/storage/v1/object/${bucket}`],
  ]) {
    const action = result[name];
    result[name] = async (...args) => {
      const transport = clientTransports.get(client);
      if (!transport) return action(...args);
      const observed = await transport.observeRequest(method, new URL(route(...args), ORIGIN).pathname, () => action(...args));
      return { ...observed.response, transportClassification: observed.transportClassification,
        transportHttpStatus: observed.transportHttpStatus, transportFailureKind: observed.transportFailureKind };
    };
  }
  return result;
}
