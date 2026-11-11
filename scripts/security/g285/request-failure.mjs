// Fixed facts only; never keep causes, messages, headers, URLs or native errors.
export const REQUEST_FAILURE_KINDS = Object.freeze(['HTTP_RATE_LIMIT','HTTP_SERVER_ERROR','DNS_FAILURE',
  'CONNECTIVITY_FAILURE','TLS_FAILURE','REQUEST_TIMEOUT','ABORTED','REQUEST_BUDGET',
  'RUN_TIME_BUDGET','INSTRUMENTATION_FAILURE','UNKNOWN_TRANSPORT_FAILURE']);
const facts = new WeakMap();
const own = (o, key) => {
  try { const d = o && Object.getOwnPropertyDescriptor(o,key); return d && 'value' in d ? d.value : undefined; }
  catch { return undefined; }
};
export function markRequestFailure(error, kind, httpStatus = null) {
  facts.set(error, Object.freeze({ kind: REQUEST_FAILURE_KINDS.includes(kind) ? kind : 'UNKNOWN_TRANSPORT_FAILURE',
    httpStatus: Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null }));
  return error;
}
export function requestFailureFacts(error) {
  if (error && typeof error === 'object' && facts.has(error)) return facts.get(error);
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const code = own(current,'code'), name = own(current,'name');
    let kind;
    if (['ENOTFOUND','EAI_AGAIN'].includes(code)) kind = 'DNS_FAILURE';
    else if (['ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH','EPIPE'].includes(code)) kind = 'CONNECTIVITY_FAILURE';
    else if (['CERT_HAS_EXPIRED','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) kind = 'TLS_FAILURE';
    else if (['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(code)
      || name === 'TimeoutError') kind = 'REQUEST_TIMEOUT';
    else if (name === 'AbortError') kind = 'ABORTED';
    else if (code === 'REQUEST_OR_TIME_BUDGET') kind = 'REQUEST_BUDGET';
    if (kind) return { kind, httpStatus: null };
    current = own(current,'cause');
  }
  return { kind: 'UNKNOWN_TRANSPORT_FAILURE', httpStatus: null };
}
