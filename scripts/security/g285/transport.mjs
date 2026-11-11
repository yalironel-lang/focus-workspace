// Runner-only, per-request diagnostics. Never emit response bodies or request metadata.
import { requestFailureFacts } from './request-failure.mjs';
const GROUPS = Object.freeze({
  NoSuchKey: ['STORAGE_NO_SUCH_KEY', [404], ['not_found']],
  NoSuchBucket: ['STORAGE_NO_SUCH_BUCKET', [404], ['Bucket not found']],
  AccessDenied: ['STORAGE_AUTHORIZATION_ERROR', [403], ['Unauthorized']],
  '42501': ['STORAGE_AUTHORIZATION_ERROR', [403], ['Unauthorized']],
  InvalidJWT: ['STORAGE_AUTHENTICATION_ERROR', [400, 401], []],
  InvalidSignature: ['STORAGE_AUTHENTICATION_ERROR', [403], []],
  SignatureDoesNotMatch: ['STORAGE_AUTHENTICATION_ERROR', [403], []],
  ExpiredToken: ['STORAGE_AUTHENTICATION_ERROR', [400, 401, 403], []],
  InternalError: ['STORAGE_OPERATIONAL_ERROR', [500], ['Internal']],
  DatabaseError: ['STORAGE_OPERATIONAL_ERROR', [500], []],
  DatabaseTimeout: ['STORAGE_OPERATIONAL_ERROR', [504], []],
  SlowDown: ['STORAGE_OPERATIONAL_ERROR', [429, 503], ['too_many_connections']],
  TenantNotFound: ['STORAGE_OPERATIONAL_ERROR', [400, 404], []],
  S3Error: ['STORAGE_OPERATIONAL_ERROR', [400, 404, 500, 503], []],
});
export const TRANSPORT_CLASSES = Object.freeze(['TRANSPORT_NOT_OBSERVED', 'TRANSPORT_FAILURE',
  'TRANSPORT_SUCCESS_RESPONSE', 'TRANSPORT_SYMBOLIC_CODE_MISSING', 'TRANSPORT_UNKNOWN_OR_MALFORMED',
  'TRANSPORT_CONTRADICTORY_ERROR', ...new Set(Object.values(GROUPS).map(x => x[0]))]);

function classify(body, httpStatus) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'TRANSPORT_UNKNOWN_OR_MALFORMED';
  if (!Object.hasOwn(body, 'code')) return 'TRANSPORT_SYMBOLIC_CODE_MISSING';
  if (typeof body.code !== 'string' || !Object.hasOwn(GROUPS, body.code)) return 'TRANSPORT_UNKNOWN_OR_MALFORMED';
  const [classification, logicalStatuses, aliases] = GROUPS[body.code];
  if (Object.hasOwn(body, 'error')) {
    if (typeof body.error !== 'string') return 'TRANSPORT_UNKNOWN_OR_MALFORMED';
    if (body.error !== body.code && !aliases.includes(body.error)) return 'TRANSPORT_CONTRADICTORY_ERROR';
  }
  if (Object.hasOwn(body, 'statusCode')) {
    const s = body.statusCode;
    if (!(typeof s === 'number' && Number.isInteger(s) || typeof s === 'string' && /^[1-5][0-9]{2}$/.test(s))
      || Number(s) < 100 || Number(s) > 599) return 'TRANSPORT_UNKNOWN_OR_MALFORMED';
    if (!logicalStatuses.includes(Number(s))) return 'TRANSPORT_CONTRADICTORY_ERROR';
  }
  // Legacy HTTP 400 envelopes are supported diagnostically, never as acceptance proof.
  if (httpStatus !== 400 && !logicalStatuses.includes(httpStatus)) return 'TRANSPORT_CONTRADICTORY_ERROR';
  return classification;
}

async function inspect(response) {
  if (response.ok) return 'TRANSPORT_SUCCESS_RESPONSE';
  let reader, timer;
  try {
    reader = response.clone().body?.getReader();
    if (!reader) return 'TRANSPORT_UNKNOWN_OR_MALFORMED';
    // Bound clone consumption by size and time; leave the original response for the SDK.
    const parse = async () => {
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) return 'TRANSPORT_UNKNOWN_OR_MALFORMED';
        chunks.push(Buffer.from(value));
      }
      return classify(JSON.parse(Buffer.concat(chunks).toString('utf8')), response.status);
    };
    return await Promise.race([parse(), new Promise(resolve => {
      timer = setTimeout(() => resolve('TRANSPORT_UNKNOWN_OR_MALFORMED'), 1000);
    })]);
  } catch { return 'TRANSPORT_UNKNOWN_OR_MALFORMED'; }
  finally { clearTimeout(timer); if (reader) reader.cancel().catch(() => {}); }
}

export function createDownloadTransport(fetcher, origin) {
  const pending = new Map();
  const signing = new Map();
  const operations = new Map();
  return {
    fetch: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const method = init.method ?? (typeof input === 'object' ? input.method : undefined) ?? 'GET';
      let slot = url.origin === origin && method === 'GET'
        && /^\/storage\/v1\/object\/(pdfs|user-content)\//.test(url.pathname)
        ? pending.get(url.searchParams.get('cacheNonce')) : undefined;
      if (url.origin === origin && method === 'POST' && !url.search
        && /^\/storage\/v1\/object\/sign\/(pdfs|user-content)\//.test(url.pathname)) {
        const slots = signing.get(url.pathname);
        if (slots?.size === 1) slot = [...slots][0];
      }
      if (!slot && url.origin === origin) {
        const slots = operations.get(`${method} ${url.pathname}`);
        if (slots?.size === 1) slot = [...slots][0];
      }
      let fetched = false;
      try {
        const response = await fetcher(input, init);
        fetched = true;
        if (slot && !slot.ambiguous) {
          const classification = await inspect(response);
          if (!slot.ambiguous) { slot.classification = classification; slot.httpStatus = response.status; }
        }
        return response;
      } catch (error) {
        if (slot && !slot.ambiguous) {
          const detail = fetched ? { kind: 'INSTRUMENTATION_FAILURE', httpStatus: null } : requestFailureFacts(error);
          slot.classification = 'TRANSPORT_FAILURE'; slot.failureKind = detail.kind; slot.httpStatus = detail.httpStatus;
        }
        throw error;
      }
    },
    observe: async (nonce, action) => {
      const slot = { classification: 'TRANSPORT_NOT_OBSERVED' }; pending.set(nonce, slot);
      try { return { response: await action(), transportClassification: slot.classification,
        transportFailureKind: slot.failureKind ?? null, transportHttpStatus: slot.httpStatus }; }
      finally { pending.delete(nonce); }
    },
    observeSign: async (pathname, action) => {
      const slot = { classification: 'TRANSPORT_NOT_OBSERVED', ambiguous: false };
      const slots = signing.get(pathname) ?? new Set();
      slots.add(slot); signing.set(pathname, slots);
      if (slots.size > 1) for (const s of slots) { s.ambiguous = true; s.classification = 'TRANSPORT_CONTRADICTORY_ERROR'; }
      try { return { response: await action(), transportClassification: slot.classification,
        transportFailureKind: slot.failureKind ?? null, transportHttpStatus: slot.httpStatus }; }
      finally { slots.delete(slot); if (!slots.size) signing.delete(pathname); }
    },
    observeRequest: async (method, pathname, action) => {
      const key = `${method} ${pathname}`;
      const slot = { classification: 'TRANSPORT_NOT_OBSERVED', httpStatus: null, ambiguous: false };
      const slots = operations.get(key) ?? new Set(); slots.add(slot); operations.set(key, slots);
      if (slots.size > 1) for (const s of slots) { s.ambiguous = true; s.classification = 'TRANSPORT_CONTRADICTORY_ERROR'; }
      try { return { response: await action(), transportClassification: slot.classification,
        transportHttpStatus: slot.ambiguous ? null : slot.httpStatus, transportFailureKind: slot.failureKind ?? null }; }
      finally { slots.delete(slot); if (!slots.size) operations.delete(key); }
    },
  };
}
