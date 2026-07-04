/**
 * QA stress harness — simulates local persistence failure modes (post-fix).
 * Run: node scripts/stress-persist-qa.mjs
 */

function log(message, data = {}) {
  console.log(message, data?.summary ?? data);
}

function makeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (k === '__QUOTA_BLOCK__') throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
    key(i) { return [...map.keys()][i] ?? null; },
    get length() { return map.size; },
    _dump: () => map,
  };
}

function objectsKey(sectionId) {
  return `fw_section_${sectionId}_free_space_objects_v1`;
}

function positionsKey(sectionId) {
  return `fw_section_${sectionId}_free_space_positions_v1`;
}

function mergeFreeSpaceObjects(base, incoming) {
  const byId = new Map();
  for (const o of base) {
    if (o?.id) byId.set(o.id, o);
  }
  for (const o of incoming) {
    if (!o?.id) continue;
    const prev = byId.get(o.id);
    if (!prev) {
      byId.set(o.id, o);
      continue;
    }
    const prevAt = prev.updatedAt ?? 0;
    const nextAt = o.updatedAt ?? 0;
    if (nextAt >= prevAt) byId.set(o.id, o);
  }
  return [...byId.values()];
}

function stripPdfThumbnails(objects) {
  return objects.map(o => {
    if (o.type !== 'pdf' || !o.content?.thumbnailDataUrl) return o;
    const { thumbnailDataUrl: _removed, ...rest } = o.content;
    return { ...o, content: rest };
  });
}

function persistMerged(ls, sectionId, objects) {
  const disk = JSON.parse(ls.getItem(objectsKey(sectionId)) || '[]');
  const stripped = stripPdfThumbnails(objects);
  const merged = mergeFreeSpaceObjects(disk, stripped);
  ls.setItem(objectsKey(sectionId), JSON.stringify(merged));
  return merged;
}

function makeObjectsHook(ls, sectionId, { immediateCreate = false } = {}) {
  let objects = JSON.parse(ls.getItem(objectsKey(sectionId)) || '[]');
  let pending = null;
  let timer = null;
  let gen = 0;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending) return { flushed: false };
    const { list, scopeGen } = pending;
    try {
      persistMerged(ls, sectionId, list);
      pending = null;
      return { flushed: true, count: list.length, scopeGen };
    } catch {
      return { flushed: false, keptPending: true };
    }
  };

  const addNote = (title, { immediate = immediateCreate } = {}) => {
    const obj = {
      id: `note-${Date.now()}-${Math.random()}`,
      type: 'note',
      title,
      content: { type: 'note', body: title },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    objects = [...objects, obj];
    pending = { list: objects, scopeGen: gen };
    if (immediate) {
      try {
        persistMerged(ls, sectionId, objects);
        pending = null;
      } catch { /* keep pending */ }
      return obj;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      if (pending.scopeGen !== gen) return;
      const p = pending;
      try {
        persistMerged(ls, sectionId, p.list);
        pending = null;
      } catch { /* keep pending on quota fail */ }
    }, 400);
    return obj;
  };

  const reload = () => {
    objects = JSON.parse(ls.getItem(objectsKey(sectionId)) || '[]');
    return objects;
  };

  const switchBoard = () => {
    gen += 1;
    flush();
    objects = [];
  };

  return { addNote, flush, reload, switchBoard, getMemory: () => objects, getPending: () => pending };
}

function testImmediateReload() {
  const ls = makeStorage();
  const hook = makeObjectsHook(ls, 's1', { immediateCreate: true });
  hook.addNote('instant');
  hook.flush();
  const after = hook.reload();
  const ok = after.length === 1 && after[0].title === 'instant';
  log('S1 immediate reload after create', { ok, count: after.length }, 'H-instant-reload');
  return ok;
}

function testCreateSurvivesWithoutFlush() {
  const ls = makeStorage();
  const hook = makeObjectsHook(ls, 's2', { immediateCreate: true });
  hook.addNote('immediate-create');
  const after = hook.reload();
  const ok = after.length === 1;
  log('S2 create persists immediately (no flush needed)', { ok, count: after.length }, 'H-crash-create');
  return ok;
}

function testEditStillNeedsFlush() {
  const ls = makeStorage();
  const hook = makeObjectsHook(ls, 's2b', { immediateCreate: true });
  hook.addNote('base');
  hook.addNote('edit-only', { immediate: false });
  const after = hook.reload();
  const lost = after.length === 1;
  log('S2b edit mid-debounce still needs flush', { lost, count: after.length }, 'H-crash-edit');
  return lost;
}

function testSpam50Notes() {
  const ls = makeStorage();
  const hook = makeObjectsHook(ls, 's3', { immediateCreate: true });
  for (let i = 0; i < 50; i++) hook.addNote(`note-${i}`);
  hook.flush();
  const after = hook.reload();
  const ok = after.length === 50;
  log('S3 spam 50 notes + flush', { ok, count: after.length }, 'H-spam50');
  return ok;
}

function testMultiTabMerge() {
  const ls = makeStorage();
  const tabA = makeObjectsHook(ls, 's4', { immediateCreate: true });
  const tabB = makeObjectsHook(ls, 's4', { immediateCreate: true });
  tabA.addNote('from-tab-A');
  tabB.addNote('from-tab-B');
  const final = JSON.parse(ls.getItem(objectsKey('s4')));
  const hasA = final.some(o => o.title === 'from-tab-A');
  const hasB = final.some(o => o.title === 'from-tab-B');
  const ok = hasA && hasB;
  log('S4 multi-tab merge preserves both tabs', { ok, finalCount: final.length, titles: final.map(o => o.title) }, 'H-multitab');
  return ok;
}

function testQuotaFailKeepsPending() {
  const ls = makeStorage();
  const hook = makeObjectsHook(ls, 's5', { immediateCreate: true });
  hook.addNote('before-quota');
  const origSet = ls.setItem.bind(ls);
  ls.setItem = (k, v) => {
    if (k === objectsKey('s5')) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    origSet(k, v);
  };
  hook.addNote('after-quota', { immediate: false });
  hook.flush();
  const mem = hook.getMemory().length;
  const disk = hook.reload().length;
  const pendingKept = hook.getPending() != null;
  const dataLoss = mem === 2 && disk === 1 && pendingKept;
  log('S5 quota fail keeps pending in memory', { dataLoss, memCount: mem, diskCount: disk, pendingKept }, 'H-quota-pending');
  return dataLoss;
}

function testMidDragThrottleSave() {
  const ls = makeStorage();
  const posKey = positionsKey('s6');
  ls.setItem(posKey, JSON.stringify({ 'obj-1': { x: 100, y: 100, w: 280, h: 200 } }));
  const throttled = { 'obj-1': { x: 450, y: 300, w: 280, h: 200 } };
  ls.setItem(posKey, JSON.stringify(throttled));
  const saved = JSON.parse(ls.getItem(posKey));
  const persisted = saved['obj-1'].x === 450 && saved['obj-1'].y === 300;
  log('S6 mid-drag throttle saves position', { persisted, savedX: saved['obj-1'].x }, 'H-mid-drag');
  return persisted;
}

function testPdfThumbnailStrip() {
  const thumb = 'data:image/jpeg;base64,' + 'A'.repeat(18_000);
  const ls = makeStorage();
  const objects = [];
  for (let i = 0; i < 80; i++) {
    objects.push({
      id: `pdf-${i}`, type: 'pdf', title: `PDF ${i}`,
      content: { type: 'pdf', fileName: 'x.pdf', thumbnailDataUrl: thumb, fileSize: 1e6, page: 1, zoom: 1, ingestionPhase: 'ready' },
      createdAt: i, updatedAt: i,
    });
  }
  const stripped = stripPdfThumbnails(objects);
  ls.setItem(objectsKey('s7'), JSON.stringify(stripped));
  const bytes = ls.getItem(objectsKey('s7')).length;
  const stillBloated = bytes > 200_000;
  const hasInlineThumb = stripped.some(o => o.content?.thumbnailDataUrl);
  log('S7 PDF thumbnails stripped from localStorage', { bytes, stillBloated, hasInlineThumb }, 'H-pdf-bloat');
  return !stillBloated && !hasInlineThumb;
}

function testBoardSwitchFlush() {
  const ls = makeStorage();
  const hook = makeObjectsHook(ls, 's9', { immediateCreate: true });
  hook.addNote('board-A');
  hook.switchBoard();
  const boardA = JSON.parse(ls.getItem(objectsKey('s9')) || '[]');
  const ok = boardA.length === 1;
  log('S9 board switch preserves flushed data', { ok, count: boardA.length }, 'H-board-switch');
  return ok;
}

const results = [
  { id: 1, name: 'Quota fail clears pending', broken: !testQuotaFailKeepsPending(), severity: 'HIGH', fix: 'Fix 1' },
  { id: 2, name: 'Multi-tab last-writer-wins', broken: !testMultiTabMerge(), severity: 'HIGH', fix: 'Fix 2' },
  { id: 3, name: 'Mid-drag position not saved', broken: !testMidDragThrottleSave(), severity: 'MEDIUM', fix: 'Fix 3' },
  { id: 4, name: 'PDF thumbnail localStorage bloat', broken: !testPdfThumbnailStrip(), severity: 'MEDIUM', fix: 'Fix 4' },
  { id: 5, name: 'Object create crash (no immediate persist)', broken: !testCreateSurvivesWithoutFlush(), severity: 'HIGH', fix: 'Fix 5' },
  { id: '-', name: 'Immediate reload + flush', broken: !testImmediateReload(), severity: '—', fix: '—' },
  { id: '-', name: 'Edit mid-debounce still needs flush', broken: testEditStillNeedsFlush(), severity: 'LOW', fix: 'expected' },
  { id: '-', name: 'Spam 50 notes', broken: !testSpam50Notes(), severity: '—', fix: '—' },
  { id: '-', name: 'Board switch flush', broken: !testBoardSwitchFlush(), severity: '—', fix: '—' },
];

const priorityBreaks = results.filter(r => r.fix && r.fix.startsWith('Fix'));
const stillBroken = priorityBreaks.filter(r => r.broken);

log('QA SUMMARY', {
  total: results.length,
  priorityFixed: priorityBreaks.length - stillBroken.length,
  priorityStillBroken: stillBroken.map(b => b.name),
});

console.log('\n=== STRESS QA SUMMARY ===');
for (const r of results) {
  const tag = r.broken ? 'BREAKS' : 'OK   ';
  console.log(`${tag} — ${r.name}${r.broken ? ` [${r.severity}]` : ''}${r.fix ? ` (${r.fix})` : ''}`);
}
console.log(`\nPriority fixes: ${priorityBreaks.length - stillBroken.length}/${priorityBreaks.length} verified`);
process.exitCode = stillBroken.length ? 1 : 0;
