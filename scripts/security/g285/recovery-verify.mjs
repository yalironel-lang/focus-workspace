// Counts-only recovery inspection, never cleanup or isolation acceptance.
import { REF } from './adapter.mjs';
import { restorePlan } from './scope.mjs';
import { RecoveryDeadlines } from './recovery-deadlines.mjs';

export const unknownRecoveryResults = () => Array.from({ length: 5 }, (_, i) => ({
  run: `Run ${i + 1}`, rowsRemaining: null, storageRemaining: null, totalRemaining: null, status: 'UNKNOWN',
}));
const check = value => { if (!value) throw Error('RECOVERY_VERIFICATION_UNAVAILABLE'); };

export const RECOVERY_SESSION_SETUP_SQL = 'SET SESSION default_transaction_read_only = on';
export const RECOVERY_SESSION_GUARD_SQL = `SELECT
  current_setting('default_transaction_read_only') = 'on' AS default_read_only,
  current_setting('transaction_read_only') = 'on' AS read_only`;

export function validateRecoveryScopes(manifests, accountIds, projectRef = REF) {
  check(projectRef === REF && Array.isArray(manifests) && manifests.length === 5
    && Array.isArray(accountIds) && accountIds.length === 2);
  const users = accountIds.map(id => ({ id }));
  const seenRuns = new Set(), seenRows = new Set(), seenObjects = new Set();
  return manifests.map(m => {
    const p = restorePlan(m, users);
    check(!seenRuns.has(p.run)); seenRuns.add(p.run);
    for (const r of p.rows) { check(!seenRows.has(r.value.id)); seenRows.add(r.value.id); }
    for (const o of p.objects) {
      const key = `${o.bucket}:${o.path}`; check(!seenObjects.has(key)); seenObjects.add(key);
    }
    // Include all reservations, not only attempted fixtures. An unknown outcome
    // must not cause omission. Include synthetic section namespaces in both buckets.
    const prefixes = new Map();
    const add = (bucket, prefix) => prefixes.set(`${bucket}:${prefix}`, { bucket, prefix });
    for (const o of p.objects) add(o.bucket, o.prefix);
    for (const r of p.rows.filter(r => r.table === 'sections')) {
      for (const bucket of ['pdfs', 'user-content']) add(bucket, `${r.value.user_id}/${r.value.id}`);
    }
    return {
      marker: p.marker,
      sections: p.rows.filter(r => r.table === 'sections').map(r => r.value.id),
      groups: p.rows.filter(r => r.table === 'groups').map(r => r.value.id),
      items: p.rows.filter(r => r.table === 'items').map(r => r.value.id),
      objects: p.objects.map(o => ({ bucket: o.bucket, path: o.path, id: o.storageId })),
      prefixes: [...prefixes.values()],
    };
  });
}

export const RECOVERY_GUARD_SQL = `SELECT
  current_setting('transaction_read_only') = 'on' AS read_only,
  current_setting('transaction_isolation') = 'repeatable read' AS stable_snapshot,
  current_setting('row_security') = 'off' AS no_hidden_rows,
  coalesce((SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user), false) AS bypass_rls,
  (SELECT count(*) = 4 AND bool_and(pg_catalog.has_table_privilege(current_user, c.oid, 'SELECT'))
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r' AND (n.nspname, c.relname) IN
     (('public','sections'),('public','groups'),('public','items'),('storage','objects'))) AS can_inspect`;

export const RECOVERY_COUNTS_SQL = `WITH scope AS (SELECT $1::jsonb AS v),
section_ids AS (SELECT jsonb_array_elements_text(v->'sections')::uuid AS id FROM scope),
group_ids AS (SELECT jsonb_array_elements_text(v->'groups')::uuid AS id FROM scope),
item_ids AS (SELECT jsonb_array_elements_text(v->'items')::uuid AS id FROM scope),
scoped_sections AS (
  SELECT id FROM public.sections WHERE id IN (SELECT id FROM section_ids)
    OR starts_with(title, (SELECT v->>'marker' FROM scope))
), scoped_groups AS (
  SELECT id FROM public.groups WHERE id IN (SELECT id FROM group_ids)
    OR section_id IN (SELECT id FROM section_ids) OR section_id IN (SELECT id FROM scoped_sections)
    OR starts_with(title, (SELECT v->>'marker' FROM scope))
), scoped_items AS (
  SELECT id FROM public.items WHERE id IN (SELECT id FROM item_ids)
    OR group_id IN (SELECT id FROM group_ids) OR group_id IN (SELECT id FROM scoped_groups)
    OR starts_with(title, (SELECT v->>'marker' FROM scope))
), scoped_storage AS (
  SELECT 1 FROM storage.objects o WHERE EXISTS (
    SELECT 1 FROM scope, jsonb_array_elements(v->'objects') x
    WHERE o.bucket_id = x->>'bucket' AND
      (o.name = x->>'path' OR (x->>'id' IS NOT NULL AND o.id::text = x->>'id'))
  ) OR EXISTS (
    SELECT 1 FROM scope, jsonb_array_elements(v->'prefixes') x
    WHERE o.bucket_id = x->>'bucket' AND
      (o.name = x->>'prefix' OR starts_with(o.name, (x->>'prefix') || '/'))
  )
), counts AS (
  SELECT ((SELECT count(*) FROM scoped_sections) + (SELECT count(*) FROM scoped_groups)
    + (SELECT count(*) FROM scoped_items)) AS rows_count,
    (SELECT count(*) FROM scoped_storage) AS storage_count
)
SELECT rows_count::text, storage_count::text, (rows_count + storage_count)::text AS total_count FROM counts`;

function oneRow(result, names) {
  check(Array.isArray(result?.rows) && result.rows.length === 1);
  const row = result.rows[0];
  check(row && Object.keys(row).sort().join(',') === [...names].sort().join(','));
  return row;
}
function count(value) {
  check(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value));
  const n = Number(value); check(Number.isSafeInteger(n)); return n;
}

export async function verifyRecoveryScopes(manifests, accountIds, connection, projectRef = REF, options = {}) {
  const diagnostic = options.diagnostic;
  let fallback = 'unexplained';
  let transaction = false, reports = unknownRecoveryResults(), complete = false;
  let deadlines = options.deadlines;
  const ownsDeadlines = !deadlines;
  try {
    // Validate the complete batch before sending any request.
    diagnostic?.enter('validation');
    const scopes = validateRecoveryScopes(manifests, accountIds, projectRef);
    deadlines ??= new RecoveryDeadlines(connection, options.limits);
    const query = (sql, parameters) => deadlines.run(() => connection.query(sql, parameters), deadlines.limits.queryMs);
    diagnostic?.enter('transaction_setup');
    transaction = true;
    await query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await query("SET LOCAL statement_timeout = '5000ms'");
    await query("SET LOCAL lock_timeout = '1000ms'");
    await query('SET LOCAL row_security = off');
    await query('SET LOCAL search_path = pg_catalog');
    diagnostic?.enter('visibility');
    const guardResult = await query(RECOVERY_GUARD_SQL);
    fallback = 'invalid_result';
    const guard = oneRow(guardResult,
      ['read_only','stable_snapshot','no_hidden_rows','bypass_rls','can_inspect']);
    diagnostic?.visibility(guard);
    fallback = Object.values(guard).every(v => typeof v === 'boolean') ? 'privilege' : 'invalid_result';
    check(Object.values(guard).every(v => v === true));
    fallback = 'unexplained';
    const results = [];
    for (const [i, scope] of scopes.entries()) {
      diagnostic?.enter('counts');
      fallback = 'unexplained';
      const countResult = await query(RECOVERY_COUNTS_SQL, [JSON.stringify(scope)]);
      fallback = 'invalid_result';
      const row = oneRow(countResult,
        ['rows_count','storage_count','total_count']);
      const rowsRemaining = count(row.rows_count), storageRemaining = count(row.storage_count), totalRemaining = count(row.total_count);
      check(Number.isSafeInteger(rowsRemaining + storageRemaining) && totalRemaining === rowsRemaining + storageRemaining);
      results.push({ run: `Run ${i + 1}`, rowsRemaining, storageRemaining, totalRemaining,
        status: totalRemaining === 0 ? 'CLEAR' : 'LEFTOVERS' });
    }
    reports = results; complete = true;
  } catch (error) { diagnostic?.fail(error, deadlines?.expired ? 'deadline' : fallback); complete = false; }
  finally {
    if (transaction && !deadlines.expired) try {
      diagnostic?.enter('rollback');
      await deadlines.run(() => connection.query('ROLLBACK'), deadlines.limits.rollbackMs);
    } catch (error) { diagnostic?.fail(error, deadlines.expired ? 'deadline' : 'unexplained'); complete = false; }
    if (ownsDeadlines) deadlines?.close();
  }
  return complete && !deadlines?.expired ? reports : unknownRecoveryResults();
}

export async function verifyRecoverySession(manifests, accountIds, connection, projectRef = REF, options = {}) {
  const diagnostic = options.diagnostic;
  let deadlines, reports = unknownRecoveryResults();
  let fallback = 'unexplained';
  try {
    diagnostic?.enter('validation');
    validateRecoveryScopes(manifests, accountIds, projectRef);
    deadlines = new RecoveryDeadlines(connection, options.limits);
    diagnostic?.enter('connect');
    await deadlines.run(() => connection.connect(), deadlines.limits.connectMs);
    // Session pooler pins a backend for this client. Establish the default via
    // SQL, independently of startup-option forwarding, before scope inspection.
    diagnostic?.enter('transaction_setup');
    await deadlines.run(() => connection.query(RECOVERY_SESSION_SETUP_SQL), deadlines.limits.queryMs);
    const sessionResult = await deadlines.run(() => connection.query(RECOVERY_SESSION_GUARD_SQL), deadlines.limits.queryMs);
    fallback = 'invalid_result';
    const session = oneRow(sessionResult, ['default_read_only', 'read_only']);
    check(session.default_read_only === true && session.read_only === true);
    fallback = 'unexplained';
    reports = await verifyRecoveryScopes(manifests, accountIds, connection, projectRef, { deadlines, diagnostic });
  } catch (error) { diagnostic?.fail(error, deadlines?.expired ? 'deadline' : fallback); reports = unknownRecoveryResults(); }
  finally {
    if (deadlines) {
      if (deadlines.expired) deadlines.requestEnd()?.catch(error => diagnostic?.fail(error, 'unexplained', 'disconnect'));
      else try { diagnostic?.enter('disconnect'); await deadlines.run(() => deadlines.requestEnd(), deadlines.limits.endMs); }
      catch (error) { diagnostic?.fail(error, deadlines.expired ? 'deadline' : 'unexplained'); reports = unknownRecoveryResults(); }
      if (deadlines.expired) reports = unknownRecoveryResults();
      deadlines.close();
    }
  }
  return reports;
}
