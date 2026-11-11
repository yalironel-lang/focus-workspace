import { TRANSPORT_CLASSES } from './transport.mjs';
import { REQUEST_FAILURE_KINDS } from './request-failure.mjs';
const codes = new Set(['42501','AccessDenied','NoSuchKey','NoSuchBucket','InvalidJWT','InvalidSignature',
  'SignatureDoesNotMatch','ExpiredToken','TenantNotFound','InternalError','DatabaseError','DatabaseTimeout','SlowDown','S3Error']);
const own = (o, k) => {
  if (!o || typeof o !== 'object' || k in o && !Object.hasOwn(o, k)) throw Error('MALFORMED');
  const d = Object.getOwnPropertyDescriptor(o, k);
  if (d && !Object.hasOwn(d, 'value')) throw Error('MALFORMED');
  return d?.value;
};
const status = v => typeof v === 'number' && Number.isInteger(v) && v >= 100 && v <= 599 ? v
  : typeof v === 'string' && /^[1-5][0-9]{2}$/.test(v) ? Number(v) : null;

// Denial validation only: no new accepted status or semantic code is introduced.
export function strictDenial(response) {
  try {
    if (own(response, 'data') != null) return false;
    const error = own(response, 'error');
    if (!error || Array.isArray(error)) return false;
    const values = ['status','statusCode','code','error'].map(k => own(error, k));
    if (values[0] !== undefined && status(values[0]) === null) return false;
    const present = values.filter(v => v !== undefined);
    if (!present.length || present.some(v => status(v) === null && !(typeof v === 'string' && codes.has(v)))) return false;
    const semantic = [...new Set(present.filter(v => status(v) === null))];
    const numeric = [...new Set(present.map(status).filter(v => v !== null))];
    for (const key of ['status','transportHttpStatus']) {
      const value = own(response, key);
      if (value !== undefined && (status(value) === null || ![400,403,404].includes(status(value))
        || numeric.length && status(value) !== numeric[0])) return false;
    }
    if (semantic.length > 1 || numeric.length > 1) return false;
    if (numeric.length && ![400,403,404].includes(numeric[0])) return false;
    const denied = semantic.length ? ['42501','AccessDenied','NoSuchKey'].includes(semantic[0])
      && (semantic[0] === '42501' || numeric.length === 1) : numeric.length === 1 && [403,404].includes(numeric[0]);
    const transport = own(response, 'transportClassification');
    if (transport !== undefined && !['STORAGE_AUTHORIZATION_ERROR','STORAGE_NO_SUCH_KEY'].includes(transport)) return false;
    return denied;
  } catch { return false; }
}

export function operationDiagnostic(response) {
  const out = { classification: 'MALFORMED_OR_AMBIGUOUS_RESPONSE', dataPresent: null, emptyArray: null,
    errorPresent: null, httpStatus: null, sdkCode: null, transportClassification: 'TRANSPORT_NOT_OBSERVED', transportFailureKind: null };
  try {
    if (!response || Array.isArray(response) || !Object.hasOwn(response, 'data') || !Object.hasOwn(response, 'error')) return out;
    const data = own(response, 'data'), error = own(response, 'error'), transport = own(response, 'transportClassification');
    const failureKind = own(response, 'transportFailureKind');
    if (REQUEST_FAILURE_KINDS.includes(failureKind)) out.transportFailureKind = failureKind;
    if (transport !== undefined) {
      if (!TRANSPORT_CLASSES.includes(transport)) return out;
      out.transportClassification = transport;
    }
    out.dataPresent = data != null; out.emptyArray = Array.isArray(data) ? data.length === 0 : null;
    out.errorPresent = error != null;
    const wire = own(response, 'transportHttpStatus'), sdk = own(response, 'status');
    out.httpStatus = status(wire) ?? status(sdk);
    if (!error) { out.classification = data == null ? 'SUCCESS_WITHOUT_DATA' : 'SUCCESS_WITH_DATA'; return out; }
    if (typeof error !== 'object' || Array.isArray(error)) return out;
    const errorStatus = own(error, 'status');
    out.httpStatus ??= status(errorStatus);
    for (const key of ['statusCode','code','error']) {
      const value = own(error, key);
      if (typeof value === 'string' && codes.has(value)) { out.sdkCode = value; break; }
      if (status(value) !== null) { out.sdkCode = String(status(value)); break; }
    }
    out.classification = strictDenial(response) ? 'RECOGNIZED_DENIAL' : 'UNRECOGNIZED_ERROR';
    if (data != null || transport === 'TRANSPORT_SUCCESS_RESPONSE') out.classification = 'CONTRADICTORY_RESPONSE';
    return out;
  } catch { return out; }
}

export const OBSERVED_METHODS = Object.freeze(['read','insert','update','remove','children','upload','overwrite',
  'updateObject','download','list','sign','move','removeObject']);

