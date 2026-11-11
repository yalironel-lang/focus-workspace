// Operation-specific composite evidence, not a generic HTTP-400 denial rule.
const own = (o, k) => {
  if (!o || typeof o !== 'object' || Array.isArray(o) || k in o && !Object.hasOwn(o,k)) throw Error('INVALID');
  const d = Object.getOwnPropertyDescriptor(o,k);
  if (d && !('value' in d)) throw Error('INVALID');
  return d?.value;
};
function envelope(r, logical, transport) {
  const e = own(r,'error');
  return own(r,'data') === null && own(r,'transportHttpStatus') === 400
    && own(r,'transportClassification') === transport
    && [undefined,null].includes(own(r,'transportFailureKind'))
    && ['status','statusCode','code'].every(k => own(r,k) === undefined)
    && own(e,'name') === 'StorageApiError' && own(e,'status') === 400
    && own(e,'statusCode') === logical && own(e,'code') === undefined && own(e,'error') === undefined;
}
export function reviewedStorageMutation(r, state, label, actorIndex) {
  try {
    if (![0,1].includes(actorIndex)) return false;
    for (const bucket of ['pdfs','user-content']) for (const op of ['upload','overwrite','update','move-owned-to-foreign','move-foreign-source']) {
      if (label !== `cross-${actorIndex}-${bucket}-${op}`) continue;
      const foreignSource = op === 'move-foreign-source';
      return envelope(r,foreignSource?'404':'403',foreignSource?'STORAGE_NO_SUCH_KEY':'STORAGE_AUTHORIZATION_ERROR')
        && ['ownerIntact','attackerIntact','foreignDestinationAbsent','attackerDestinationAbsent','bindingVerified']
          .every(k=>own(state,k)===true);
    }
    return false;
  } catch { return false; }
}
export function reviewedUserContentRead(r, readback, label, actorIndex) {
  try {
    return [0,1].includes(actorIndex)
      && ['download','sign'].some(op=>label===`cross-${actorIndex}-user-content-${op}`)
      && envelope(r,'404','STORAGE_NO_SUCH_KEY')
      && own(readback,'classification')==='OWNER_READBACK_MATCH'
      && ['ownerAccessible','pathUnchanged','identityMatches','bytesMatch'].every(k=>own(readback,k)===true);
  } catch { return false; }
}
