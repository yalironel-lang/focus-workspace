import { randomUUID } from 'node:crypto';
import { Stop, requireCheck } from './adapter.mjs';
import { serializePlan, restorePlan } from './scope.mjs';
import { TRANSPORT_CLASSES } from './transport.mjs';
import { operationDiagnostic, OBSERVED_METHODS, strictDenial } from './operation-diagnostics.mjs';
import { canCollectAfter, collectSummary } from './collect-mode.mjs';
import { requestFailureFacts } from './request-failure.mjs';
import { reviewedStorageMutation, reviewedUserContentRead } from './reviewed-storage-denials.mjs';

export const BUCKETS = ['pdfs', 'user-content'];
const TABLES = ['sections', 'groups', 'items'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const good = r => requireCheck(r && !r.error, 'OWNER_OR_SERVICE_FAILURE');
const changed = (r, id) => { good(r); requireCheck(r.data?.length === 1 && r.data[0]?.id === id, 'OWNER_MUTATION_FAILED'); };
export const EXPECTED_CASES = Object.freeze([0, 1].flatMap(i => [
  `owner-${i}-hierarchy`, ...BUCKETS.map(b => `owner-${i}-${b}`),
  ...BUCKETS.flatMap(b => ['list','download','sign','upload','overwrite','update','move-foreign-source','move-owned-to-foreign','delete'].map(op => `cross-${i}-${b}-${op}`)),
  ...TABLES.flatMap(t => ['read','insert','update','delete','reassign'].map(op => `cross-${i}-${t}-${op}`)),
]));
export function requireComplete(results) {
  const ids = results.map(r => r.case);
  requireCheck(results.length === EXPECTED_CASES.length && new Set(ids).size === EXPECTED_CASES.length
    && EXPECTED_CASES.every(id => results.some(r => r.case === id && r.status === 'PASS')), 'INCOMPLETE_CASE_MATRIX');
}
// A valid one-page synthetic PDF; no files or real document bytes are loaded.
export function pdf(label) {
  requireCheck(/^[A-Za-z0-9-]+$/.test(label), 'INVALID_PDF_LABEL');
  const stream = `BT /F1 12 Tf 20 80 Td (${label}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let out = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const start = Buffer.byteLength(out);
  out += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  return Buffer.from(out + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
export function plan(users, uuid = randomUUID) {
  requireCheck(users.length === 2 && users.every(u => /^[0-9a-f-]{36}$/.test(u.id)) && users[0].id !== users[1].id, 'DISTINCT_USERS_REQUIRED');
  const run = uuid(); const marker = `g285-${run}:`;
  const rows = []; const objects = [];
  const reserveHierarchy = (u, suffix) => {
    const ids = TABLES.map(() => uuid());
    const values = [{ id: ids[0], user_id: u.id, title: marker + suffix },
      { id: ids[1], section_id: ids[0], title: marker + suffix },
      { id: ids[2], group_id: ids[1], title: marker + suffix, type: 'note', content: 'synthetic' }];
    const hierarchy = values.map((value, i) => ({ table: TABLES[i], value, owner: u, active: false, snapshot: null }));
    rows.push(...hierarchy); return hierarchy;
  };
  const reserveObject = (u, h, bucket) => {
    const leaf = uuid();
    const prefix = bucket === 'pdfs' ? `${u.id}/${h[0].value.id}/${h[1].value.id}` : `${u.id}/${h[0].value.id}/${h[2].value.id}/pdf`;
    const o = { owner: u, bucket, path: `${prefix}/${leaf}.pdf`, prefix, leaf: `${leaf}.pdf`, active: false, snapshot: null, bytes: pdf('G285-fixture') };
    objects.push(o); return o;
  };
  const actors = users.map((u, i) => {
    const main = reserveHierarchy(u, `main-${i}`); const scratch = reserveHierarchy(u, `scratch-${i}`);
    return { u, main, scratch, objects: BUCKETS.map(b => reserveObject(u, main, b)) };
  });
  return { run, marker, rows, objects, actors, reserveHierarchy, reserveObject };
}
async function readRow(u, r) { const v = await u.read(r.table, r.value.id); good(v); return v.data; }
function requireRow(r, row, title = r.value.title) {
  requireCheck(row && typeof row === 'object' && Object.entries(r.value).every(([key, value]) => row[key] === (key === 'title' ? title : value)), 'ROW_INTEGRITY_FAILURE');
  return row;
}
async function objectState(u, o, allowed = null) {
  const listing = await u.list(o.bucket, o.prefix); storageGood(listing, 'OBJECT_LIST_FAILED');
  requireCheck(Array.isArray(listing.data) && listing.data.length < 100, 'LISTING_INCOMPLETE');
  if (allowed) requireCheck(new Set(listing.data.map(x=>x.name)).size === listing.data.length
    && listing.data.every(entry=>allowed.some(x=>x.bucket===o.bucket&&x.prefix===o.prefix&&x.leaf===entry.name&&x.attempted)),
    'UNREGISTERED_OBJECTS');
  const hit = listing.data.find(x => x.name === o.leaf);
  if (!hit) return null;
  const bytes = await u.download(o.bucket, o.path); storageGood(bytes, 'OBJECT_DOWNLOAD_FAILED');
  requireCheck(Buffer.isBuffer(bytes.data), 'OBJECT_DOWNLOAD_FAILED');
  return { bytes: bytes.data.toString('base64'), id: hit.id, created_at: hit.created_at, updated_at: hit.updated_at, metadata: hit.metadata };
}
function storageGood(r, fallback = 'OWNER_STORAGE_OPERATION_FAILED') {
  requireCheck(r && !r.error, deniedError(r) ? 'OWNER_STORAGE_AUTHORIZATION_FAILED' : fallback);
}
async function requiredObjectState(u, o, allowed = null) {
  const state = await objectState(u, o, allowed);
  requireCheck(state, 'OBJECT_LISTING_ENTRY_MISSING');
  return state;
}
function requireBytes(state, bytes) {
  requireCheck(state.bytes === bytes.toString('base64'), 'OBJECT_BYTES_MISMATCH');
}
async function createHierarchy(p, h) {
  for (const r of h) {
    requireCheck(await readRow(r.owner, r) === null, 'FIXTURE_COLLISION');
    r.attempted = true; p.checkpoint(p);
    changed(await r.owner.insert(r.table, r.value), r.value.id); r.active = true;
    r.snapshot = requireRow(r, await readRow(r.owner, r));
  }
}
async function checkHierarchy(h) {
  for (const r of h) {
    requireCheck(r.snapshot, 'ROW_INTEGRITY_FAILURE');
    const current = requireRow(r, await readRow(r.owner, r), r.snapshot.title);
    requireCheck(same(current, r.snapshot), 'ROW_INTEGRITY_FAILURE');
  }
}
async function createObject(p, o) {
  requireCheck(await objectState(o.owner, o) === null, 'FIXTURE_COLLISION'); o.attempted = true; p.checkpoint(p);
  storageGood(await o.owner.upload(o.bucket, o.path, o.bytes)); o.active = true;
  o.snapshot = await requiredObjectState(o.owner, o);
  requireBytes(o.snapshot, o.bytes);
  requireCheck(o.snapshot.id, 'OWNER_OBJECT_IDENTIFIER_MISSING');
  p.checkpoint(p);
}
async function checkObject(o, allowed = null) {
  requireCheck(o.snapshot, 'OBJECT_INTEGRITY_FAILURE');
  const state = await requiredObjectState(o.owner, o, allowed);
  requireCheck(state.bytes === o.snapshot.bytes, 'OBJECT_BYTES_MISMATCH');
  requireCheck(same(state, o.snapshot), 'OBJECT_INTEGRITY_FAILURE');
}
async function checkMain(p) {
  requireCheck(p.actors.length === 2, 'INCOMPLETE_CASE_MATRIX');
  for (const a of p.actors) {
    requireCheck(a.main.length === 3 && a.objects.length === 2, 'INCOMPLETE_CASE_MATRIX');
    await checkHierarchy(a.main);
    for (const o of a.objects) await checkObject(o);
  }
}
async function checkVictims(p, id) {
  const [, index, resource] = id.split('-');
  const a = p.actors[Number(index)], b = p.actors[1 - Number(index)];
  requireCheck(a && b, 'INCOMPLETE_CASE_MATRIX');
  if (BUCKETS.includes(resource) || resource === 'user') {
    // user-content contains a hyphen; choose by the complete case prefix.
    const bucket = BUCKETS.find(name => id.startsWith(`cross-${index}-${name}-`));
    requireCheck(bucket, 'UNEXPECTED_OR_DUPLICATE_CASE');
    for (const actor of [a, b]) {
      const o = actor.objects.find(x => x.bucket === bucket); requireCheck(o, 'INCOMPLETE_CASE_MATRIX'); await checkObject(o);
    }
  } else { await checkHierarchy(a.main); await checkHierarchy(b.main); }
}
// Authorization failures only; syntax, missing-schema and network errors cannot masquerade as denials.
export function deniedError(r) {
  return strictDenial(r);
}
function deniedRows(r) { requireCheck((deniedError(r) && r.data == null) || (!r.error && Array.isArray(r.data) && r.data.length === 0), 'CROSS_USER_MUTATION_ALLOWED_OR_UNEXPLAINED'); }

// No raw objects, messages, constructors, URLs or arbitrary strings leave this boundary.
export function crossDownloadDiagnostic(response, caseLabel, actorIndex) {
  requireCheck([0, 1].includes(actorIndex) && BUCKETS.some(b => caseLabel === `cross-${actorIndex}-${b}-download`), 'INVALID_DIAGNOSTIC_CASE');
  const out = { case: caseLabel, actor: actorIndex === 0 ? 'A' : 'B', owner: actorIndex === 0 ? 'B' : 'A',
    classification: 'MALFORMED_OR_AMBIGUOUS_RESPONSE', errorPresent: null, errorClass: null,
    httpStatus: null, statusCode: null, dataPresent: null, byteLength: null,
    transportClassification: 'TRANSPORT_NOT_OBSERVED' };
  const field = (object, key) => {
    const d = Object.getOwnPropertyDescriptor(object, key);
    requireCheck(!d || Object.hasOwn(d, 'value'), 'MALFORMED_DIAGNOSTIC_RESPONSE');
    return d?.value;
  };
  const numeric = value => (typeof value === 'number' || typeof value === 'string' && /^[1-5][0-9]{2}$/.test(value))
    && Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : null;
  try {
    if (!response || typeof response !== 'object' || Array.isArray(response)
      || !Object.hasOwn(response, 'data') || !Object.hasOwn(response, 'error')) return out;
    const data = field(response, 'data'), error = field(response, 'error');
    const transport = field(response, 'transportClassification');
    if (transport !== undefined) {
      if (!TRANSPORT_CLASSES.includes(transport)) return out;
      out.transportClassification = transport;
    }
    out.dataPresent = data != null; out.byteLength = Buffer.isBuffer(data) ? data.length : null;
    out.errorPresent = error != null;
    if (error != null) {
      if (typeof error !== 'object' || Array.isArray(error)) return out;
      const name = field(error, 'name');
      out.errorClass = ['StorageApiError','StorageUnknownError','StorageError','Error'].includes(name) ? name : 'OtherError';
      const status = field(error, 'status'); out.httpStatus = numeric(status);
      const codeKeys = ['statusCode','code','error'];
      const codeValues = codeKeys.map(k => field(error, k));
      const codes = codeValues.filter(v => v !== undefined);
      const symbols = ['AccessDenied','NoSuchKey','InvalidJWT','NoSuchBucket','TenantNotFound','InvalidSignature','42501'];
      const safe = value => typeof value === 'string' && symbols.includes(value) ? value
        : numeric(value) !== null ? String(numeric(value)) : null;
      out.statusCode = codes.map(safe).find(v => v !== null) ?? null;
      if (out.httpStatus === null || out.httpStatus < 400) return out;
      // SDK optional properties may be absent or undefined. Explicit null and every
      // other unsupported value are malformed, not absent evidence. Never coerce them.
      if (['status', ...codeKeys].some(k => k in error && !Object.hasOwn(error, k))
        || codes.some(v => safe(v) === null)) return out;
      // Only three-digit HTTP codes are status evidence. Every other allowlisted
      // code, including SQLSTATE "42501", is substantive semantic evidence.
      // Identical duplicates agree; distinct semantic codes fail closed.
      const semanticCodes = new Set(codes.filter(v => numeric(v) === null).map(safe));
      if (codes.some(v => numeric(v) !== null && numeric(v) !== out.httpStatus)
        || semanticCodes.size > 1) {
        out.classification = out.httpStatus === 400 && codes.length === 1 && numeric(codes[0]) === 404
          ? 'UNRECOGNIZED_SDK_ERROR' : 'MALFORMED_OR_AMBIGUOUS_RESPONSE'; return out;
      }
      if (Buffer.isBuffer(data)) { out.classification = 'UNAUTHORIZED_DOWNLOAD_RETURNED_DATA'; return out; }
      if (data !== null) return out;
      const validatedError = { status: out.httpStatus, ...Object.fromEntries(codeKeys.map((k, i) => [k, codeValues[i]])) };
      const transportConsistent = transport === undefined
        || ['STORAGE_NO_SUCH_KEY','STORAGE_AUTHORIZATION_ERROR'].includes(transport);
      out.classification = transportConsistent && [400,403,404].includes(out.httpStatus) && deniedError({ error: validatedError })
        ? 'RECOGNIZED_AUTHORIZATION_DENIAL' : 'UNRECOGNIZED_SDK_ERROR';
    } else if (Buffer.isBuffer(data)) out.classification = 'UNAUTHORIZED_DOWNLOAD_RETURNED_DATA';
    else if (data === null && error === null) out.classification = 'UNEXPECTED_SUCCESS_WITHOUT_DATA';
    return out;
  } catch { return { ...out, classification: 'MALFORMED_OR_AMBIGUOUS_RESPONSE' }; }
}

async function postDenialOwnerReadback(owner, o, target, expectedBucket = 'pdfs') {
  const out = { classification: 'OWNER_READBACK_ERROR', ownerAccessible: false,
    pathUnchanged: false, identityMatches: false, bytesMatch: false };
  try {
    // Bound to the same registered object used by the immediately preceding request.
    out.pathUnchanged = BUCKETS.includes(expectedBucket) && target.bucket === expectedBucket && target.path === `${target.prefix}/${target.leaf}`
      && target.path.split('/')[0] === owner.id && o.owner === owner;
    if (!out.pathUnchanged) { out.classification = 'OWNER_READBACK_PATH_MISMATCH'; return out; }
    const state = await objectState(owner, target);
    out.pathUnchanged = o.bucket === target.bucket && o.path === target.path
      && o.prefix === target.prefix && o.leaf === target.leaf && o.owner === owner;
    if (!out.pathUnchanged) { out.classification = 'OWNER_READBACK_PATH_MISMATCH'; return out; }
    if (!state) { out.classification = 'OWNER_READBACK_MISSING'; return out; }
    out.ownerAccessible = true;
    out.identityMatches = !!target.id && state.id === target.id;
    out.bytesMatch = state.bytes === target.bytes && state.bytes === target.fixtureBytes;
    out.classification = !out.identityMatches ? 'OWNER_READBACK_IDENTITY_MISMATCH'
      : !out.bytesMatch ? 'OWNER_READBACK_BYTES_MISMATCH' : 'OWNER_READBACK_MATCH';
    return out;
  } catch { return { ...out, classification: 'OWNER_READBACK_ERROR' }; }
}

// Signing diagnostics expose presence only; no signed URL is parsed or followed.
export function crossSignDiagnostic(response, caseLabel, actorIndex) {
  requireCheck([0, 1].includes(actorIndex) && BUCKETS.some(b => caseLabel === `cross-${actorIndex}-${b}-sign`), 'INVALID_DIAGNOSTIC_CASE');
  const out = { case: caseLabel, actor: actorIndex === 0 ? 'A' : 'B', owner: actorIndex === 0 ? 'B' : 'A',
    classification: 'MALFORMED_OR_AMBIGUOUS_RESPONSE', dataPresent: null, signedUrlPresent: null,
    errorPresent: null, errorClass: null, httpStatus: null, statusCode: null,
    transportClassification: 'TRANSPORT_NOT_OBSERVED' };
  const own = (obj, key) => {
    const d = Object.getOwnPropertyDescriptor(obj, key);
    requireCheck(!d || Object.hasOwn(d, 'value'), 'MALFORMED_DIAGNOSTIC_RESPONSE');
    return d?.value;
  };
  try {
    if (!response || typeof response !== 'object' || Array.isArray(response)
      || !Object.hasOwn(response, 'data') || !Object.hasOwn(response, 'error')) return out;
    const data = own(response, 'data'), error = own(response, 'error');
    out.dataPresent = data != null;
    if (data === null) out.signedUrlPresent = false;
    else if (data && typeof data === 'object' && !Array.isArray(data)) {
      if ('signedUrl' in data && !Object.hasOwn(data, 'signedUrl')) return out;
      const value = own(data, 'signedUrl');
      out.signedUrlPresent = typeof value === 'string' && value.length > 0;
      if (value !== undefined && typeof value !== 'string') return out;
    } else return out;
    const d = crossDownloadDiagnostic({ data: null, error,
      transportClassification: own(response, 'transportClassification') }, caseLabel.replace(/-sign$/, '-download'), actorIndex);
    for (const key of ['errorPresent','errorClass','httpStatus','statusCode','transportClassification']) out[key] = d[key];
    out.classification = data !== null ? 'UNEXPECTED_SIGNING_DATA'
      : error === null ? 'UNEXPECTED_SUCCESS_WITHOUT_DATA' : d.classification;
    return out;
  } catch { return out; }
}

// This exception is evidence about a known-present PDF, not a general HTTP-400 denial.
// Case PASS is still recorded only after test() runs both actors' integrity checks.
export function compositePdfIsolation(response, readback, caseLabel, actorIndex) {
  const own = (object, key) => {
    const d = object && Object.getOwnPropertyDescriptor(object, key);
    return d && Object.hasOwn(d, 'value') ? d.value : undefined;
  };
  try {
    if (![0,1].includes(actorIndex) || caseLabel !== `cross-${actorIndex}-pdfs-download`) return false;
    const diagnostic = crossDownloadDiagnostic(response, caseLabel, actorIndex);
    const error = own(response, 'error');
    return diagnostic.classification === 'UNRECOGNIZED_SDK_ERROR'
      && own(response, 'data') === null
      && own(response, 'transportClassification') === 'STORAGE_NO_SUCH_KEY'
      && own(error, 'name') === 'StorageApiError'
      && own(error, 'status') === 400 && own(error, 'statusCode') === '404'
      && own(error, 'code') === undefined && own(error, 'error') === undefined
      && own(readback, 'classification') === 'OWNER_READBACK_MATCH'
      && ['ownerAccessible','pathUnchanged','identityMatches','bytesMatch'].every(k => own(readback, k) === true);
  } catch { return false; }
}

// Same exact concealment envelope as downloads, with a fresh signing-specific
// owner readback. The shared test wrapper still requires both post-case checks.
export function compositePdfSigningIsolation(response, readback, caseLabel, actorIndex) {
  try {
    if (![0, 1].includes(actorIndex) || caseLabel !== `cross-${actorIndex}-pdfs-sign`) return false;
    const d = crossSignDiagnostic(response, caseLabel, actorIndex);
    return d.classification === 'UNRECOGNIZED_SDK_ERROR' && d.dataPresent === false
      && d.signedUrlPresent === false && compositePdfIsolation(response, readback,
        `cross-${actorIndex}-pdfs-download`, actorIndex);
  } catch { return false; }
}

// Caller supplies only ordinary authenticated adapters. Nothing here can obtain an admin client.
export async function runAcceptance(users, emit = () => {}, uuid = randomUUID, checkpoint = () => {}, beginCleanup = () => {}, options = {}) {
  requireCheck(options.mode === undefined || ['ACCEPTANCE','DIAGNOSTIC_COLLECT'].includes(options.mode), 'INVALID_MODE');
  const collect = options.mode === 'DIAGNOSTIC_COLLECT';
  let primaryResponse, caseFailureDetails, criticalSafetyStop = false;
  const failures = [];
  let currentCase = null, phase = 'setup';
  users = users.map((user, i) => new Proxy(user, { get(target, key) {
    const method = target[key];
    if (!OBSERVED_METHODS.includes(key) || typeof method !== 'function') return method;
    return async (...args) => {
      try {
        const response = await method.apply(target, args);
        if (phase === 'action' && currentCase?.startsWith('cross-')) {
          const [, actor, ...parts] = currentCase.split('-');
          const operation = parts.at(-1);
          const storage = parts[0] === 'pdfs' || parts[0] === 'user';
          const expected = operation === 'delete' ? storage ? 'removeObject' : 'remove'
            : operation === 'update' ? storage ? 'updateObject' : 'update'
            : currentCase.includes('-move-') ? 'move' : operation === 'reassign' ? 'update' : operation;
          if (Number(actor) === i && key === expected) primaryResponse = response;
        }
        if (currentCase) {
          const { classification, ...diagnostic } = operationDiagnostic(response);
          if (diagnostic.transportClassification === 'TRANSPORT_FAILURE') caseFailureDetails ??= {
            stage: phase, operation: key, actor: i === 0 ? 'A' : 'B',
            transportFailureKind: diagnostic.transportFailureKind, httpStatus: diagnostic.httpStatus };
          if (phase === 'action' || !classification.startsWith('SUCCESS_')) emit({ case: currentCase, event: 'OPERATION_DIAGNOSTIC', phase,
            actor: i === 0 ? 'A' : 'B', operation: key, responseClassification: classification, ...diagnostic });
        }
        return response;
      } catch (error) {
        const detail = requestFailureFacts(error);
        caseFailureDetails ??= { stage: phase, operation: key, actor: i === 0 ? 'A' : 'B',
          transportFailureKind: detail.kind, httpStatus: detail.httpStatus };
        if (currentCase) emit({ case: currentCase, event: 'OPERATION_DIAGNOSTIC', phase,
          actor: i === 0 ? 'A' : 'B', operation: key, responseClassification: 'OPERATION_EXCEPTION',
          transportFailureKind: detail.kind, httpStatus: detail.httpStatus });
        throw error;
      }
    };
  } }));
  const p = plan(users, uuid); p.checkpoint = checkpoint; checkpoint(p);
  const results = []; let failure = null; let cleanup = 'UNKNOWN';
  const seen = new Set();
  const record = (id, status) => { const row = Object.freeze({ case: id, status }); results.push(row); emit(row); };
  const test = async (id, action) => {
    requireCheck(EXPECTED_CASES.includes(id) && !seen.has(id), 'UNEXPECTED_OR_DUPLICATE_CASE'); seen.add(id);
    currentCase = id; phase = 'precheck';
    primaryResponse = undefined;
    caseFailureDetails = undefined;
    let failure, failureStage = 'precheck', caseIntegrity = false;
    try {
      if (id.startsWith('cross-')) await checkVictims(p, id);
      phase = 'action';
      try { await action(); } catch (error) { failure = error; failureStage = 'action'; }
      phase = 'postcheck';
      if (id.startsWith('cross-')) {
        let integrity = false;
        try { await checkVictims(p, id); integrity = true; caseIntegrity = true; }
        catch (error) { if (!failure) { failure = error; failureStage = 'postcheck'; } }
        finally { emit({ case: id, event: 'INTEGRITY_DIAGNOSTIC', bothActorsIntact: integrity }); }
      }
      if (failure) throw failure;
      record(id, 'PASS');
    } catch (e) {
      record(id, 'FAIL');
      if (!collect) throw e;
      let safe = false;
      if (caseIntegrity && canCollectAfter(e instanceof Stop ? e.code : '', primaryResponse)) {
        phase = 'continuation_guard';
        try {
          restorePlan(serializePlan(p), p.actors.map(a => a.u));
          await checkMain(p);
          const scope = await validateLiveScope(p);
          const mainRows = new Set(p.actors.flatMap(a => a.main.map(r => r.value.id)));
          const mainObjects = new Set(p.actors.flatMap(a => a.objects.map(o => `${o.bucket}:${o.path}`)));
          requireCheck([...scope.rows].every(([key,value]) => mainRows.has(key) || value === null)
            && [...scope.states].every(([key,value]) => mainObjects.has(key) || value === null), 'CONTINUATION_SCOPE_UNSAFE');
          safe = true;
        } catch { safe = false; }
      }
      failures.push({ case: id, category: safe ? 'AMBIGUOUS_DENIAL_STATE_VERIFIED' : 'CRITICAL_SAFETY_STOP',
        integrityVerified: safe, cleanupScopeVerified: safe, stage: failureStage,
        ...(caseFailureDetails ?? {}) });
      emit({ case: id, event: 'CONTINUATION_GUARD', integrityVerified: safe, cleanupScopeVerified: safe, continued: safe });
      if (!safe) { criticalSafetyStop = true; throw e; }
    }
    finally { currentCase = null; }
  };
  try {
    for (const [i, a] of p.actors.entries()) {
      await test(`owner-${i}-hierarchy`, async () => {
        await createHierarchy(p, a.main); await createHierarchy(p, a.scratch);
        for (const r of a.main) {
          await checkHierarchy(a.main);
          const title = p.marker + 'owner-updated';
          changed(await a.u.update(r.table, r.value.id, { title }), r.value.id);
          r.snapshot = requireRow(r, await readRow(a.u, r), title);
        }
        for (const r of [...a.scratch].reverse()) {
          requireRow(r, await readRow(a.u, r));
          changed(await a.u.remove(r.table, r.value.id, p.marker), r.value.id); r.active = false;
          requireCheck(await readRow(a.u, r) === null, 'OWNER_DELETE_FAILED');
        }
      });
      for (const o of a.objects) await test(`owner-${i}-${o.bucket}`, async () => {
        await createObject(p, o);
        const signed = await a.u.sign(o.bucket, o.path); good(signed); requireCheck(signed.data?.signedUrl, 'OWNER_SIGN_FAILED');
        const scratch = p.reserveObject(a.u, a.main, o.bucket); await createObject(p, scratch);
        storageGood(await a.u.overwrite(scratch.bucket, scratch.path, pdf('G285-overwrite')));
        requireBytes(await requiredObjectState(a.u, scratch), pdf('G285-overwrite'));
        storageGood(await a.u.updateObject(scratch.bucket, scratch.path, pdf('G285-update')));
        requireBytes(await requiredObjectState(a.u, scratch), pdf('G285-update'));
        const destination = p.reserveObject(a.u, a.main, o.bucket); destination.attempted = true; checkpoint(p);
        storageGood(await a.u.move(o.bucket, scratch.path, destination.path)); scratch.active = false; destination.active = true;
        destination.snapshot = await requiredObjectState(a.u, destination);
        requireBytes(destination.snapshot, pdf('G285-update'));
        requireCheck(await objectState(a.u, scratch) === null && destination.snapshot.id, 'OWNER_MOVE_FAILED'); checkpoint(p);
        good(await a.u.removeObject(o.bucket, destination.path)); destination.active = false;
        requireCheck(await objectState(a.u, destination) === null, 'OWNER_OBJECT_DELETE_FAILED');
      });
    }
    await checkMain(p);
    for (const [i, a] of p.actors.entries()) {
      const b = p.actors[1 - i];
      for (const o of b.objects) {
        await test(`cross-${i}-${o.bucket}-list`, async () => {
          const r = await a.u.list(o.bucket, o.prefix);
          requireCheck((deniedError(r) && r.data == null) || (!r.error && Array.isArray(r.data) && r.data.length === 0), 'CROSS_USER_LIST_ALLOWED_OR_UNEXPLAINED');
        });
        await test(`cross-${i}-${o.bucket}-download`, async () => {
          const target = Object.freeze({ bucket: o.bucket, path: o.path, prefix: o.prefix, leaf: o.leaf,
            id: o.snapshot?.id, bytes: o.snapshot?.bytes, fixtureBytes: o.bytes.toString('base64') });
          const r = await a.u.download(o.bucket, o.path);
          const diagnostic = crossDownloadDiagnostic(r, `cross-${i}-${o.bucket}-download`, i);
          emit(diagnostic);
          let readback;
          if (diagnostic.classification === 'UNRECOGNIZED_SDK_ERROR') {
            readback = await postDenialOwnerReadback(b.u, o, target, o.bucket);
            emit({ case: `cross-${i}-${o.bucket}-download`, actor: i === 0 ? 'A' : 'B', owner: i === 0 ? 'B' : 'A', ...readback });
          }
          requireCheck((diagnostic.classification === 'RECOGNIZED_AUTHORIZATION_DENIAL'
            && deniedError(r) && !r.data)
            || compositePdfIsolation(r, readback, `cross-${i}-${o.bucket}-download`, i)
            || reviewedUserContentRead(r,readback,`cross-${i}-${o.bucket}-download`,i), 'CROSS_USER_DOWNLOAD_ALLOWED_OR_UNEXPLAINED');
        });
        await test(`cross-${i}-${o.bucket}-sign`, async () => {
          const target = Object.freeze({ bucket: o.bucket, path: o.path, prefix: o.prefix, leaf: o.leaf,
            id: o.snapshot?.id, bytes: o.snapshot?.bytes, fixtureBytes: o.bytes.toString('base64') });
          const r = await a.u.sign(o.bucket, o.path);
          const diagnostic = crossSignDiagnostic(r, `cross-${i}-${o.bucket}-sign`, i);
          emit(diagnostic);
          let readback;
          if (diagnostic.classification === 'UNRECOGNIZED_SDK_ERROR') {
            readback = await postDenialOwnerReadback(b.u, o, target, o.bucket);
            emit({ case: `cross-${i}-${o.bucket}-sign`, actor: i === 0 ? 'A' : 'B', owner: i === 0 ? 'B' : 'A', ...readback });
          }
          requireCheck((deniedError(r) && r.data == null)
            || compositePdfSigningIsolation(r, readback, `cross-${i}-${o.bucket}-sign`, i)
            || reviewedUserContentRead(r,readback,`cross-${i}-${o.bucket}-sign`,i), 'CROSS_USER_SIGN_ALLOWED_OR_UNEXPLAINED');
        });
        const foreignNew = p.reserveObject(b.u, b.main, o.bucket);
        const ownSource = a.objects.find(x => x.bucket === o.bucket);
        const ownDestination = p.reserveObject(a.u, a.main, o.bucket);
        requireCheck(await objectState(b.u, foreignNew) === null && await objectState(a.u, ownDestination) === null, 'FIXTURE_COLLISION');
        const attempts = [
          ['upload', () => a.u.upload(o.bucket, foreignNew.path, pdf('G285-attack'))],
          ['overwrite', () => a.u.overwrite(o.bucket, o.path, pdf('G285-attack'))],
          ['update', () => a.u.updateObject(o.bucket, o.path, pdf('G285-attack'))],
          ['move-foreign-source', () => a.u.move(o.bucket, o.path, ownDestination.path)],
          ['move-owned-to-foreign', () => a.u.move(o.bucket, ownSource.path, foreignNew.path)],
          ['delete', () => a.u.removeObject(o.bucket, o.path)],
        ];
        for (const [operation, action] of attempts) await test(`cross-${i}-${o.bucket}-${operation}`, async () => {
          foreignNew.attempted = ownDestination.attempted = true; checkpoint(p);
          const binding = { owner:b.u.id, attacker:a.u.id, source:o.path, attackerSource:ownSource.path,
            foreign:foreignNew.path, destination:ownDestination.path,
            sourceState:JSON.stringify(o.snapshot),attackerState:JSON.stringify(ownSource.snapshot) };
          let r, operationError, integrityError;
          try { r = await action(); } catch (error) { operationError = error; }
          phase = 'statecheck';
          const state = {};
          for (const [name, check] of [
            ['bindingVerified', async () => {
              requireCheck(binding.owner !== binding.attacker && b.u.id === binding.owner && a.u.id === binding.attacker
                && o.owner === b.u && ownSource.owner === a.u && foreignNew.owner === b.u && ownDestination.owner === a.u
                && o.path === binding.source && ownSource.path === binding.attackerSource
                && foreignNew.path === binding.foreign && ownDestination.path === binding.destination
                && o.path.split('/')[0] === binding.owner && ownSource.path.split('/')[0] === binding.attacker
                && foreignNew.path.split('/')[0] === binding.owner && ownDestination.path.split('/')[0] === binding.attacker
                && o.snapshot?.id && ownSource.snapshot?.id
                && JSON.stringify(o.snapshot) === binding.sourceState && JSON.stringify(ownSource.snapshot) === binding.attackerState,
                'MUTATION_BINDING_CHANGED');
            }],
            ['ownerIntact', () => checkObject(o,p.objects)], ['attackerIntact', () => checkObject(ownSource,p.objects)],
            ['foreignDestinationAbsent', async () => {
              requireCheck(await objectState(b.u, foreignNew) === null, 'UNAUTHORIZED_DESTINATION');
              requireCheck(await objectState(a.u, foreignNew) === null, 'UNAUTHORIZED_DESTINATION');
            }],
            ['attackerDestinationAbsent', async () => {
              requireCheck(await objectState(a.u, ownDestination) === null, 'UNAUTHORIZED_DESTINATION');
              requireCheck(await objectState(b.u, ownDestination) === null, 'UNAUTHORIZED_DESTINATION');
            }],
          ]) {
            try { await check(); state[name] = true; }
            catch (error) { state[name] = false; integrityError ??= error; }
          }
          emit({ case: `cross-${i}-${o.bucket}-${operation}`, event: 'MUTATION_STATE_DIAGNOSTIC', ...state });
          if (operationError || integrityError) throw operationError ?? integrityError;
          // Storage remove may intentionally return success with an empty removed-object array.
          if (operation === 'delete') deniedRows(r); else requireCheck(deniedError(r)
            || reviewedStorageMutation(r,state,`cross-${i}-${o.bucket}-${operation}`,i), 'CROSS_USER_MUTATION_ALLOWED_OR_UNEXPLAINED');
        });
      }
      for (const [j, victim] of b.main.entries()) {
        await test(`cross-${i}-${victim.table}-read`, async () => {
          const r = await a.u.read(victim.table, victim.value.id);
          requireCheck((deniedError(r) && r.data == null) || (!r.error && r.data === null), 'CROSS_USER_ROW_READ_ALLOWED');
        });
        const forged = p.reserveHierarchy(a.u, `forged-${i}-${j}`)[j];
        forged.value = { ...victim.value, id: forged.value.id, title: p.marker + 'forged' };
        const own = a.main[j];
        const field = ['user_id', 'section_id', 'group_id'][j];
        const destination = j === 0 ? b.u.id : b.main[j - 1].value.id;
        for (const [operation, action] of [
          ['insert', () => { forged.attempted = true; checkpoint(p); return a.u.insert(victim.table, forged.value); }],
          ['update', () => a.u.update(victim.table, victim.value.id, { title: p.marker + 'attack' })],
          ['delete', () => a.u.remove(victim.table, victim.value.id, p.marker)],
          ['reassign', () => a.u.update(own.table, own.value.id, { [field]: destination })],
        ]) await test(`cross-${i}-${victim.table}-${operation}`, async () => {
          let r, operationError, integrityError;
          try { r = await action(); } catch (error) { operationError = error; }
          phase = 'statecheck';
          const state = {};
          for (const [name, check] of [
            ['ownerIntact', () => checkHierarchy(b.main)], ['attackerIntact', () => checkHierarchy(a.main)],
            ['forgedRowAbsent', async () => {
              requireCheck(await readRow(a.u, forged) === null, 'FORGED_ROW_CREATED');
              requireCheck(await readRow(b.u, forged) === null, 'FORGED_ROW_CREATED');
            }],
          ]) {
            try { await check(); state[name] = true; }
            catch (error) { state[name] = false; integrityError ??= error; }
          }
          emit({ case: `cross-${i}-${victim.table}-${operation}`, event: 'MUTATION_STATE_DIAGNOSTIC', ...state });
          if (operationError || integrityError) throw operationError ?? integrityError;
          deniedRows(r);
        });
      }
    }
    if (!collect || failures.length === 0) requireComplete(results);
    await checkMain(p);
  } catch (e) {
    failure = e instanceof Stop ? e.code : 'UNEXPECTED_FAILURE';
    if (collect) {
      criticalSafetyStop = true;
      if (!failures.some(f => f.category === 'CRITICAL_SAFETY_STOP')) failures.push({ case: 'FINAL',
        category: 'CRITICAL_SAFETY_STOP', integrityVerified: false, cleanupScopeVerified: false });
    }
  }
  finally {
    phase = 'cleanup'; currentCase = null;
    beginCleanup();
    cleanup = await cleanupPlan(p);
  }
  const report = { status: !failure && cleanup === 'PASS' ? 'PASS' : 'FAIL', failure, cleanup, cases: results.length, results };
  if (collect) {
    if (cleanup !== 'PASS') criticalSafetyStop = true;
    report.summary = collectSummary(EXPECTED_CASES, results, failures, cleanup, criticalSafetyStop);
    report.status = report.summary.status;
    if (!report.failure && failures.length) report.failure = 'DIAGNOSTIC_CASE_FAILURES';
  }
  emit({ case: 'FINAL', status: report.status, failure, cleanup, cases: results.length });
  return report;
}

async function validateLiveScope(p) {
  const rows = new Map(); const states = new Map();
  const byId = new Map(p.rows.map(r => [r.value.id, r]));
  const rootOwner = r => r.table === 'sections' ? r.value.user_id : r.table === 'groups'
    ? rootOwner(byId.get(r.value.section_id)) : rootOwner(byId.get(r.value.group_id));
  const client = r => p.actors.find(a => a.u.id === rootOwner(r)).u;
  for (const r of p.rows) {
    const visible = [];
    for (const a of p.actors) { const v = await readRow(a.u, r); if (v) visible.push(v); }
    requireCheck(r.attempted || visible.length === 0, 'UNATTEMPTED_FIXTURE_EXISTS');
    if (!visible.length) { rows.set(r.value.id, null); continue; }
    for (const v of visible) {
      requireCheck(typeof v.title === 'string' && v.title.startsWith(p.marker), 'CLEANUP_SCOPE_MISMATCH');
      requireRow(r, v, v.title);
      requireCheck(same(v, visible[0]), 'CLEANUP_SCOPE_MISMATCH');
    }
    const owned = await readRow(client(r), r); requireCheck(owned && same(owned, visible[0]), 'CLEANUP_OWNER_UNVERIFIED');
    rows.set(r.value.id, owned);
  }
  for (const r of p.rows) if (rows.get(r.value.id)) {
    if (r.table !== 'sections') requireCheck(rows.get(r.table === 'groups' ? r.value.section_id : r.value.group_id), 'CLEANUP_PARENT_UNVERIFIED');
    if (r.table !== 'items') {
      const [t, fk] = r.table === 'sections' ? ['groups','section_id'] : ['items','group_id'];
      const children = await client(r).children(t, fk, r.value.id); good(children);
      requireCheck(Array.isArray(children.data) && children.data.length < 100 && children.data.every(c => {
        const child = byId.get(c.id); return child?.table === t && child.attempted && child.value[fk] === r.value.id && rows.get(c.id);
      }), 'UNREGISTERED_CHILDREN');
    }
  }
  const requireAnchors = o => {
    const parts = o.path.split('/'); const s = byId.get(parts[1]);
    const child = byId.get(parts[2]); const g = o.bucket === 'pdfs' ? child : byId.get(child.value.group_id);
    requireCheck(rows.get(s.value.id) && rows.get(g.value.id) && (o.bucket === 'pdfs' || rows.get(child.value.id)), 'OBJECT_SCOPE_UNVERIFIED');
  };
  const knownBytes = new Set(['G285-fixture','G285-overwrite','G285-update','G285-attack'].map(label => pdf(label).toString('base64')));
  for (const o of p.objects) {
    const state = await objectState(o.owner, o); states.set(`${o.bucket}:${o.path}`, state);
    if (!state) continue;
    requireCheck(o.attempted, 'UNATTEMPTED_FIXTURE_EXISTS'); requireAnchors(o);
    requireCheck(o.storageId ? state.id === o.storageId : !!state.id && knownBytes.has(state.bytes), 'OBJECT_IDENTIFIER_UNVERIFIED');
  }
  // Reject unregistered objects in every reserved prefix before any deletion.
  const prefixes = new Map(p.objects.map(o => [`${o.bucket}:${o.prefix}`, o]));
  for (const o of prefixes.values()) {
    const list = await o.owner.list(o.bucket, o.prefix); good(list);
    requireCheck(Array.isArray(list.data) && list.data.length < 100 && list.data.every(entry => p.objects.some(x =>
      x.bucket === o.bucket && x.prefix === o.prefix && x.leaf === entry.name && x.attempted)), 'UNREGISTERED_OBJECTS');
  }
  return { rows, states, client };
}
export async function cleanupPlan(input) {
  try {
    // All static and ALL live scope checks precede the first destructive request.
    // Invalid/incomplete v1 manifests are never upgraded or trusted implicitly.
    const p = restorePlan(serializePlan(input), input.actors.map(a => a.u));
    const verified = await validateLiveScope(p);
    for (const o of p.objects.filter(x => x.attempted)) {
      const before = verified.states.get(`${o.bucket}:${o.path}`); if (!before) continue;
      // Recheck the exact hierarchy and object immediately before deleting it.
      const parts = o.path.split('/'); const anchors = p.rows.filter(r => r.value.id === parts[1] || r.value.id === parts[2]
        || o.bucket === 'user-content' && r.value.id === p.rows.find(x => x.value.id === parts[2]).value.group_id);
      for (const r of anchors) {
        const v = await readRow(verified.client(r), r);
        requireCheck(v && v.title?.startsWith(p.marker), 'OBJECT_SCOPE_UNVERIFIED'); requireRow(r, v, v.title);
      }
      requireCheck(same(await objectState(o.owner, o), before), 'OBJECT_CHANGED_DURING_CLEANUP');
      good(await o.owner.removeObject(o.bucket, o.path));
      requireCheck(await objectState(o.owner, o) === null, 'OBJECT_CLEANUP_FAILED');
    }
    for (const table of [...TABLES].reverse()) for (const r of p.rows.filter(x => x.table === table && x.attempted)) {
      const u = verified.client(r); const row = await readRow(u, r); if (!row) continue;
      requireCheck(row.title?.startsWith(p.marker), 'CLEANUP_SCOPE_MISMATCH'); requireRow(r, row, row.title);
      if (table !== 'items') {
        const child = table === 'sections' ? ['groups','section_id'] : ['items','group_id'];
        const children = await u.children(...child, r.value.id); good(children);
        requireCheck(children.data?.length === 0, 'UNEXPECTED_CHILDREN_STOP_CASCADE');
      }
      changed(await u.remove(table, r.value.id, p.marker), r.value.id);
      for (const a of p.actors) requireCheck(await readRow(a.u, r) === null, 'ROW_CLEANUP_FAILED');
    }
    // A second read-only audit prevents a cleanup PASS with known leftovers.
    const after = await validateLiveScope(p);
    requireCheck([...after.rows.values()].every(v => v === null) && [...after.states.values()].every(v => v === null), 'CLEANUP_INCOMPLETE');
    return 'PASS';
  } catch { return 'BLOCKED'; }
}
