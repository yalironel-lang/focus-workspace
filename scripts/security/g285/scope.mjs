// Pure validation of a complete, typed fixture registry. Contains no credentials.
import { createHash } from 'node:crypto';
import { REF, requireCheck } from './adapter.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tables = ['sections', 'groups', 'items'];
const buckets = ['pdfs', 'user-content'];
const canonical = x => JSON.stringify(x && typeof x === 'object'
  ? Array.isArray(x) ? x.map(v => JSON.parse(canonical(v)))
    : Object.fromEntries(Object.keys(x).sort().map(k => [k, JSON.parse(canonical(x[k]))])) : x);
const digest = x => createHash('sha256').update(canonical(x)).digest('hex');
const keys = (o, list) => requireCheck(o && typeof o === 'object' && !Array.isArray(o)
  && Object.keys(o).sort().join(',') === [...list].sort().join(','), 'INVALID_MANIFEST');
export function serializePlan(p) {
  const payload = { version: 2, ref: REF, run: p.run, marker: p.marker,
    users: p.actors.map(a => a.u.id),
    actors: p.actors.map(a => ({ owner: a.u.id, main: a.main.map(r => r.value.id),
      scratch: a.scratch.map(r => r.value.id), objects: a.objects.map(o => `${o.bucket}:${o.path}`) })),
    rows: p.rows.map(r => ({ table: r.table, value: { ...r.value }, owner: r.owner.id, attempted: !!r.attempted })),
    objects: p.objects.map(o => ({ bucket: o.bucket, path: o.path, prefix: o.prefix, leaf: o.leaf,
      owner: o.owner.id, attempted: !!o.attempted, storageId: o.snapshot?.id ?? o.storageId ?? null })) };
  return { ...payload, digest: digest(payload) };
}
export function restorePlan(m, users) {
  keys(m, ['version','ref','run','marker','users','actors','rows','objects','digest']);
  const { digest: recordedDigest, ...payload } = m;
  // Corruption detection, NOT a signature/security boundary against the local OS user.
  requireCheck(recordedDigest === digest(payload), 'MANIFEST_DIGEST_MISMATCH');
  requireCheck(m.version === 2 && m.ref === REF && UUID.test(m.run) && m.marker === `g285-${m.run}:`, 'INVALID_MANIFEST');
  requireCheck(users.length === 2 && users.every(u => UUID.test(u.id)) && users[0].id !== users[1].id
    && m.users?.length === 2 && m.users.every((id, i) => id === users[i].id), 'RECOVERY_IDENTITY_MISMATCH');
  requireCheck(Array.isArray(m.rows) && m.rows.length >= 12 && m.rows.length <= 60
    && Array.isArray(m.objects) && m.objects.length >= 4 && m.objects.length <= 60
    && Array.isArray(m.actors) && m.actors.length === 2, 'INCOMPLETE_MANIFEST');
  const owner = id => { const u = users.find(x => x.id === id); requireCheck(u, 'INVALID_MANIFEST'); return u; };
  const rowMap = new Map();
  for (const r of m.rows) {
    keys(r, ['table','value','owner','attempted']);
    requireCheck(tables.includes(r.table) && typeof r.attempted === 'boolean' && UUID.test(r.value?.id)
      && !rowMap.has(r.value.id) && typeof r.value.title === 'string' && r.value.title.startsWith(m.marker), 'INVALID_MANIFEST');
    owner(r.owner);
    keys(r.value, r.table === 'sections' ? ['id','user_id','title'] : r.table === 'groups'
      ? ['id','section_id','title'] : ['id','group_id','title','type','content']);
    if (r.table === 'sections') owner(r.value.user_id);
    if (r.table === 'items') requireCheck(r.value.type === 'note' && r.value.content === 'synthetic', 'INVALID_MANIFEST');
    rowMap.set(r.value.id, r);
  }
  const row = (id, table) => { const r = rowMap.get(id); requireCheck(r?.table === table, 'INVALID_TYPED_HIERARCHY'); return r; };
  const rootOwner = r => r.table === 'sections' ? r.value.user_id : r.table === 'groups'
    ? row(r.value.section_id, 'sections').value.user_id
    : rootOwner(row(r.value.group_id, 'groups'));
  for (const r of m.rows) {
    rootOwner(r);
    if (r.attempted && r.table !== 'sections') {
      const parent = r.table === 'groups' ? row(r.value.section_id, 'sections') : row(r.value.group_id, 'groups');
      requireCheck(parent.attempted, 'INCOMPLETE_MANIFEST');
    }
  }
  const objectMap = new Map();
  for (const o of m.objects) {
    keys(o, ['bucket','path','prefix','leaf','owner','attempted','storageId']); owner(o.owner);
    const parts = typeof o.path === 'string' ? o.path.split('/') : [];
    requireCheck(buckets.includes(o.bucket) && typeof o.attempted === 'boolean'
      && (o.storageId === null || typeof o.storageId === 'string' && o.storageId.length > 0 && o.storageId.length < 512)
      && parts[0] === o.owner && typeof o.leaf === 'string' && o.leaf.endsWith('.pdf') && UUID.test(o.leaf.slice(0, -4))
      && o.path === `${o.prefix}/${o.leaf}` && !objectMap.has(`${o.bucket}:${o.path}`), 'INVALID_MANIFEST');
    const section = row(parts[1], 'sections');
    requireCheck(section.owner === o.owner && section.value.user_id === o.owner, 'INVALID_TYPED_HIERARCHY');
    if (o.bucket === 'pdfs') {
      requireCheck(parts.length === 4, 'INVALID_MANIFEST');
      const group = row(parts[2], 'groups');
      requireCheck(group.owner === o.owner && group.value.section_id === section.value.id, 'INVALID_TYPED_HIERARCHY');
      if (o.attempted) requireCheck(section.attempted && group.attempted, 'INCOMPLETE_MANIFEST');
    } else {
      requireCheck(parts.length === 5 && parts[3] === 'pdf', 'INVALID_MANIFEST');
      const item = row(parts[2], 'items'); const group = row(item.value.group_id, 'groups');
      requireCheck(item.owner === o.owner && group.owner === o.owner && group.value.section_id === section.value.id, 'INVALID_TYPED_HIERARCHY');
      if (o.attempted) requireCheck(section.attempted && group.attempted && item.attempted, 'INCOMPLETE_MANIFEST');
    }
    objectMap.set(`${o.bucket}:${o.path}`, o);
  }
  const assigned = new Set();
  const actors = m.actors.map((a, i) => {
    keys(a, ['owner','main','scratch','objects']);
    requireCheck(a.owner === users[i].id && Array.isArray(a.main) && a.main.length === 3
      && Array.isArray(a.scratch) && a.scratch.length === 3 && Array.isArray(a.objects) && a.objects.length === 2, 'INVALID_MANIFEST');
    for (const ids of [a.main, a.scratch]) {
      ids.forEach((id, j) => {
        const r = row(id, tables[j]); requireCheck(!assigned.has(id) && r.owner === a.owner && rootOwner(r) === a.owner, 'INVALID_TYPED_HIERARCHY'); assigned.add(id);
      });
      requireCheck(row(ids[1], 'groups').value.section_id === ids[0]
        && row(ids[2], 'items').value.group_id === ids[1], 'INVALID_TYPED_HIERARCHY');
    }
    a.objects.forEach((key, j) => {
      const o = objectMap.get(key);
      requireCheck(o?.bucket === buckets[j] && o.owner === a.owner && o.path.split('/')[1] === a.main[0]
        && o.path.split('/')[2] === a.main[j === 0 ? 1 : 2], 'INVALID_TYPED_HIERARCHY');
    });
    return a;
  });
  const rows = m.rows.map(r => ({ ...r, value: { ...r.value }, owner: owner(r.owner) }));
  const objects = m.objects.map(o => ({ ...o, owner: owner(o.owner) }));
  return { run: m.run, marker: m.marker, rows, objects, actors: actors.map((a, i) => ({ u: users[i],
    main: a.main.map(id => rows.find(r => r.value.id === id)), scratch: a.scratch.map(id => rows.find(r => r.value.id === id)),
    objects: a.objects.map(key => objects.find(o => `${o.bucket}:${o.path}` === key)) })) };
}
