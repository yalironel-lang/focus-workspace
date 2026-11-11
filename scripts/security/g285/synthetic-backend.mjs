// In-memory synthetic fixtures only. No networking or private filesystem access.
import { randomUUID, createHash } from 'node:crypto';
export const ok = data => ({ data, error: null });
export const denied = () => ({ data: null, error: { code: '42501', status: 403, message: 'PRIVATE_SENTINEL' } });
export const copy = x => structuredClone(x);
export function backend() {
  const db = { sections: new Map(), groups: new Map(), items: new Map() }; const objects = new Map(); let tick = 0;
  const owner = (t, row) => t === 'sections' ? row?.user_id : t === 'groups'
    ? db.sections.get(row?.section_id)?.user_id : owner('groups', db.groups.get(row?.group_id));
  const key = (b, p) => b + ':' + p;
  const clients = [randomUUID(), randomUUID()].map(id => {
    const u = {
      id,
      async read(t, rid) { const r = db[t].get(rid); return ok(r && owner(t, r) === id ? copy(r) : null); },
      async insert(t, row) { if (owner(t, row) !== id) return denied(); if (db[t].has(row.id)) return { error: { code: '23505' }, data: null }; db[t].set(row.id, copy(row)); return ok([{ id: row.id }]); },
      async update(t, rid, patch) { const r = db[t].get(rid); if (!r || owner(t, r) !== id) return ok([]); const next = { ...r, ...patch }; if (owner(t, next) !== id) return denied(); db[t].set(rid, next); return ok([{ id: rid }]); },
      async remove(t, rid, marker) { const r = db[t].get(rid); if (!r || owner(t, r) !== id || !r.title.startsWith(marker)) return ok([]); db[t].delete(rid); return ok([{ id: rid }]); },
      async children(t, field, rid) { return ok([...db[t].values()].filter(r => r[field] === rid && owner(t, r) === id).map(r => ({ id: r.id }))); },
      async upload(b, p, bytes, upsert = false) {
        if (p.split('/')[0] !== id) return denied(); if (objects.has(key(b, p)) && !upsert) return { data: null, error: { status: 409 } };
        objects.set(key(b, p), { bytes: Buffer.from(bytes), id: key(b, p), created_at: 1, updated_at: ++tick, metadata: { size: bytes.length, etag: createHash('sha256').update(bytes).digest('hex') } }); return ok({ path: p });
      },
      overwrite(b, p, bytes) { return u.upload(b, p, bytes, true); },
      updateObject(b, p, bytes) { return u.upload(b, p, bytes, true); },
      async download(b, p) { const o = objects.get(key(b, p)); if (p.split('/')[0] !== id || !o) return denied(); return ok(Buffer.from(o.bytes)); },
      async list(b, prefix) { return ok([...objects.entries()].filter(([k]) => k.startsWith(key(b, prefix + '/')) && prefix.split('/')[0] === id).map(([k, o]) => ({ name: k.slice(k.lastIndexOf('/') + 1), id: o.id, created_at: o.created_at, updated_at: o.updated_at, metadata: copy(o.metadata) }))); },
      async sign(b, p) { return p.split('/')[0] === id && objects.has(key(b, p)) ? ok({ signedUrl: 'https://private-signed-url.invalid/PRIVATE_SENTINEL' }) : denied(); },
      async move(b, from, to) { if (from.split('/')[0] !== id || to.split('/')[0] !== id) return denied(); const o = objects.get(key(b, from)); if (!o) return denied(); objects.set(key(b, to), { ...o, updated_at: ++tick }); objects.delete(key(b, from)); return ok({}); },
      async removeObject(b, p) { if (p.split('/')[0] !== id || !objects.has(key(b, p))) return ok([]); objects.delete(key(b, p)); return ok([{ name: p }]); },
    }; return u;
  });
  return { db, objects, clients };
}
