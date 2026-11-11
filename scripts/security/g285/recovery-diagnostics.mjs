// Fixed diagnostics only. Never retain exceptions, identifiers or arbitrary codes.
const stages = new Set(['validation', 'connect', 'transaction_setup', 'visibility', 'counts', 'rollback', 'disconnect', 'unexplained']);
const visibilityKeys = ['read_only', 'stable_snapshot', 'no_hidden_rows', 'bypass_rls', 'can_inspect'];
const tlsCodes = new Map([
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'untrusted_chain'],
  ['SELF_SIGNED_CERT_IN_CHAIN', 'untrusted_chain'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'untrusted_chain'],
  ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'untrusted_chain'],
  ['CERT_HAS_EXPIRED', 'expired_certificate'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'hostname_mismatch'],
  ['CERT_NOT_YET_VALID', 'other_tls'],
  ['CERT_REVOKED', 'other_tls'],
  ['CERT_SIGNATURE_FAILURE', 'other_tls'],
]);
function ownValue(object, key) {
  try { const d = Object.getOwnPropertyDescriptor(object, key); return d && 'value' in d ? d.value : undefined; }
  catch { return undefined; }
}
// Used only once a failure is classified TLS. Unknown codes never disclose text.
export function tlsSubcategory(error) {
  return tlsCodes.get(ownValue(error, 'code')) ?? 'other_tls';
}
export function failureCategory(error, fallback = 'unexplained') {
  const code = ownValue(error, 'code');
  if (typeof code === 'string') {
    if (['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH','EPIPE'].includes(code)) return 'network';
    if (tlsCodes.has(code)) return 'tls';
    if (['28P01','28000'].includes(code)) return 'authentication';
    if (code === '42501') return 'privilege';
    if (['ETIMEDOUT','57014'].includes(code)) return 'deadline';
  }
  const message = ownValue(error, 'message');
  if (['RECOVERY_DEADLINE_EXPIRED','Query read timeout','timeout expired'].includes(message)) return 'deadline';
  return ['invalid_result','privilege','deadline'].includes(fallback) ? fallback : 'unexplained';
}
export function createRecoveryDiagnostics() {
  let stage = 'validation', first = null, shutdownFailed = false, visibility = null;
  return {
    enter(value) { stage = stages.has(value) ? value : 'unexplained'; },
    fail(error, fallback, at = stage) {
      const failedStage = stages.has(at) ? at : 'unexplained';
      if (failedStage === 'rollback' || failedStage === 'disconnect') shutdownFailed = true;
      if (!first) {
        const category = failureCategory(error, fallback);
        first = { firstFailedStage: failedStage, failureCategory: category,
          tlsSubcategory: category === 'tls' ? tlsSubcategory(error) : null };
      }
    },
    visibility(row) {
      const clean = {};
      for (const key of visibilityKeys) {
        const value = ownValue(row, key);
        if (typeof value !== 'boolean') return;
        clean[key] = value;
      }
      visibility = clean;
    },
    summary() { return { type: 'RECOVERY_DIAGNOSTIC', firstFailedStage: first?.firstFailedStage ?? null,
      failureCategory: first?.failureCategory ?? null, tlsSubcategory: first?.tlsSubcategory ?? null,
      shutdownFailed, visibility: visibility && { ...visibility } }; },
  };
}
