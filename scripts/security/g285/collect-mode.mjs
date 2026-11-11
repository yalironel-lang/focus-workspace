// Collection changes scheduling, never case acceptance. No credentials/network.
export function caseDependencies(ids) {
  const owners = ids.filter(id => id.startsWith('owner-'));
  return Object.fromEntries(ids.map(id => [id, id.startsWith('cross-') ? [...owners]
    : id.endsWith('-hierarchy') ? [] : [`owner-${id.split('-')[1]}-hierarchy`]]));
}
const own = (o, key) => {
  if (!o || typeof o !== 'object' || key in o && !Object.hasOwn(o, key)) throw Error('INVALID');
  const d = Object.getOwnPropertyDescriptor(o, key);
  if (d && !('value' in d)) throw Error('INVALID');
  return d?.value;
};
export function canCollectAfter(errorCode, response) {
  // Only completed, data-free known authorization/concealment envelopes are
  // candidates. All state and cleanup-scope guards must additionally pass.
  if (!['CROSS_USER_MUTATION_ALLOWED_OR_UNEXPLAINED','CROSS_USER_LIST_ALLOWED_OR_UNEXPLAINED',
    'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED','CROSS_USER_SIGN_ALLOWED_OR_UNEXPLAINED'].includes(errorCode)) return false;
  try {
    const e = own(response, 'error');
    const code = own(e, 'statusCode'), transport = own(response, 'transportClassification');
    return own(response, 'data') === null && own(e, 'name') === 'StorageApiError'
      && own(e, 'status') === 400 && own(e, 'code') === undefined && own(e, 'error') === undefined
      && own(response, 'status') === undefined
      && (own(response, 'transportHttpStatus') === undefined || own(response, 'transportHttpStatus') === 400)
      && ((code === '403' && transport === 'STORAGE_AUTHORIZATION_ERROR')
        || (code === '404' && transport === 'STORAGE_NO_SUCH_KEY'));
  } catch { return false; }
}
export function collectSummary(ids, results, failures, cleanup, criticalSafetyStop) {
  const completed = new Map(results.map(r => [r.case, r.status]));
  const cases = ids.map(id => ({ case: id, status: completed.get(id) ?? (criticalSafetyStop ? 'BLOCKED' : 'NOT_RUN') }));
  const counts = Object.fromEntries(['PASS','FAIL','BLOCKED','NOT_RUN'].map(s => [s, cases.filter(c => c.status === s).length]));
  return { mode: 'DIAGNOSTIC_COLLECT', plannedCases: 72, counts, cases,
    failures: failures.map(f => ({ ...f })), criticalSafetyStop, cleanup,
    integrity: criticalSafetyStop ? 'UNKNOWN' : 'PASS',
    status: counts.PASS === 72 && cleanup === 'PASS' && !criticalSafetyStop ? 'PASS' : 'FAIL', releaseAuthorized: false };
}
