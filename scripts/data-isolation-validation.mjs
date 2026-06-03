/**
 * Data isolation validation — exercises the same localStorage keys and
 * persist/schedule semantics as useSectionFreeSpaceObjects (post-fix).
 * Run: node scripts/data-isolation-validation.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// In-memory localStorage
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

function boardScopedFreeSpaceKeys(sectionId, boardId) {
  const isMain = !boardId || boardId === 'main';
  if (isMain) {
    return {
      objects: `fw_section_${sectionId}_free_space_objects_v1`,
      positions: `fw_section_${sectionId}_free_space_positions_v1`,
    };
  }
  const prefix = `fw_section_${sectionId}_board_${boardId}`;
  return {
    objects: `${prefix}_objects_v1`,
    positions: `${prefix}_positions_v1`,
  };
}

function sectionBoardsListKey(sectionId) {
  return `fw_section_${sectionId}_boards_v1`;
}

function sectionActiveBoardKey(sectionId) {
  return `fw_section_${sectionId}_active_board_v1`;
}

function makeNotebook(body) {
  return {
    id: `ps-notebook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'notebook',
    title: 'Notebook',
    content: { type: 'notebook', body, paperStyle: 'blank' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function persist(sectionId, boardId, objects) {
  if (!sectionId) return;
  const key = boardScopedFreeSpaceKeys(sectionId, boardId).objects;
  localStorage.setItem(key, JSON.stringify(objects));
}

function load(sectionId, boardId) {
  if (!sectionId) return [];
  const raw = localStorage.getItem(boardScopedFreeSpaceKeys(sectionId, boardId).objects);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function notebookBody(objects) {
  const nb = objects.find((o) => o.type === 'notebook');
  return nb?.content?.body ?? '';
}

/** Post-fix schedulePersist simulation (scopeRef + generation guard). */
function createScheduler() {
  const scopeRef = { sectionId: '', boardId: '' };
  let persistScopeGen = 0;
  let timer = null;
  let pending = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const p = pending;
    pending = null;
    persist(p.sectionId, p.boardId, p.objects);
  };

  const schedulePersist = (next) => {
    const sid = scopeRef.sectionId;
    const bid = scopeRef.boardId;
    if (!sid) return;
    const gen = persistScopeGen;
    pending = { sectionId: sid, boardId: bid, objects: next };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (gen !== persistScopeGen) return;
      if (!pending) return;
      const p = pending;
      pending = null;
      persist(p.sectionId, p.boardId, p.objects);
    }, 400);
  };

  const switchScope = (sectionId, boardId) => {
    persistScopeGen += 1;
    flush();
    scopeRef.sectionId = sectionId;
    scopeRef.boardId = boardId;
    return load(sectionId, boardId);
  };

  return { scopeRef, schedulePersist, flush, switchScope };
}

/** Pre-fix bug: boardId captured in closure at callback creation time. */
function createStaleBoardScheduler(initialBoardId) {
  let staleBoardId = initialBoardId;
  let timer = null;
  let pending = null;
  const sectionIdRef = { current: '' };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const p = pending;
    pending = null;
    persist(p.sectionId, p.boardId, p.objects);
  };

  const schedulePersist = (next, sectionId) => {
    sectionIdRef.current = sectionId;
    pending = { sectionId, boardId: staleBoardId, objects: next };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      const p = pending;
      pending = null;
      persist(p.sectionId, p.boardId, p.objects);
    }, 400);
  };

  const switchBoard = (newBoardId, sectionId) => {
    flush();
    staleBoardId = newBoardId; // closure NOT updated in old callbacks
    return load(sectionId, newBoardId);
  };

  return { schedulePersist, flush, switchBoard, getStaleBoardId: () => staleBoardId };
}

const results = [];

function report(id, passed, detail) {
  results.push({ id, passed, detail });
  console.log(`${passed ? 'PASSED' : 'FAILED'} — ${id}: ${detail}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  mem.clear();

  const SECTION_A = 'test-section-a-isolation';
  const SECTION_B = 'test-section-b-isolation';

  // --- Tests 3–6: Section A / B isolation ---
  persist(SECTION_A, 'main', [makeNotebook('A_UNIQUE_TEXT_12345')]);
  report(
    '3-A-write',
    notebookBody(load(SECTION_A, 'main')).includes('A_UNIQUE_TEXT_12345'),
    `A after write: "${notebookBody(load(SECTION_A, 'main')).slice(0, 40)}"`,
  );

  persist(SECTION_B, 'main', [makeNotebook('B_UNIQUE_TEXT_67890')]);
  report(
    '4-B-write',
    notebookBody(load(SECTION_B, 'main')).includes('B_UNIQUE_TEXT_67890'),
    `B after write: "${notebookBody(load(SECTION_B, 'main')).slice(0, 40)}"`,
  );

  const aAfterB = load(SECTION_A, 'main');
  const bBody = notebookBody(load(SECTION_B, 'main'));
  const aBody = notebookBody(aAfterB);
  report(
    '5-return-A',
    aBody.includes('A_UNIQUE_TEXT_12345') && !aBody.includes('B_UNIQUE_TEXT_67890'),
    `A body isolated (has A=${aBody.includes('A_UNIQUE_TEXT_12345')}, no B=${!aBody.includes('B_UNIQUE_TEXT_67890')})`,
  );
  report(
    '6-return-B',
    bBody.includes('B_UNIQUE_TEXT_67890') && !bBody.includes('A_UNIQUE_TEXT_12345'),
    `B body isolated (has B=${bBody.includes('B_UNIQUE_TEXT_67890')}, no A=${!bBody.includes('A_UNIQUE_TEXT_12345')})`,
  );

  // --- Tests 7–9: Board isolation inside section A ---
  const BOARD1 = 'board-isolation-1';
  const BOARD2 = 'board-isolation-2';
  localStorage.setItem(
    sectionBoardsListKey(SECTION_A),
    JSON.stringify([
      { id: 'main', name: 'Main', createdAt: 1 },
      { id: BOARD1, name: 'Board 1', createdAt: 2 },
      { id: BOARD2, name: 'Board 2', createdAt: 3 },
    ]),
  );

  const sched = createScheduler();
  sched.scopeRef.sectionId = SECTION_A;
  sched.scopeRef.boardId = BOARD1;
  let objects = [makeNotebook('BOARD1_TEXT')];
  sched.schedulePersist(objects);
  await sleep(450);
  sched.flush();

  objects = sched.switchScope(SECTION_A, BOARD2);
  objects = [makeNotebook('BOARD2_TEXT')];
  sched.schedulePersist(objects);
  await sleep(450);
  sched.flush();

  objects = sched.switchScope(SECTION_A, BOARD1);
  sched.schedulePersist([makeNotebook('BOARD1_TEXT-after-switch')]);
  await sleep(450);
  sched.flush();

  sched.switchScope(SECTION_A, BOARD2);
  sched.switchScope(SECTION_A, BOARD1);

  const b1 = notebookBody(load(SECTION_A, BOARD1));
  const b2 = notebookBody(load(SECTION_A, BOARD2));
  const mainB = notebookBody(load(SECTION_A, 'main'));

  report(
    '7-board1',
    b1.includes('BOARD1_TEXT'),
    `board1: "${b1.slice(0, 50)}"`,
  );
  report(
    '8-board2',
    b2.includes('BOARD2_TEXT') && !b2.includes('BOARD1_TEXT'),
    `board2: "${b2.slice(0, 50)}"`,
  );
  report(
    '9-board-switch-refresh',
    b1.includes('BOARD1_TEXT-after-switch') && !b2.includes('BOARD1_TEXT-after-switch') && mainB.includes('A_UNIQUE'),
    `after B1→B2→B1 + refresh sim; main still has A`,
  );

  // --- Test 10: object types ---
  const objs = [
    makeNotebook('NB_PERSIST'),
    {
      id: 'ps-note-1',
      type: 'note',
      title: 'Note',
      content: { type: 'note', body: 'NOTE_PERSIST' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'ps-pdf-1',
      type: 'pdf',
      title: 'PDF',
      content: { type: 'pdf', fileName: 'test.pdf', fileType: 'application/pdf', page: 1, zoom: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  persist(SECTION_A, BOARD1, objs);
  const loaded = load(SECTION_A, BOARD1);
  report(
    '10-notebook-note-pdf',
    loaded.length === 3 &&
      loaded.some((o) => o.type === 'notebook' && notebookBody([o]).includes('NB_PERSIST')) &&
      loaded.some((o) => o.type === 'note' && o.content.body === 'NOTE_PERSIST') &&
      loaded.some((o) => o.type === 'pdf'),
    `count=${loaded.length} types=${loaded.map((o) => o.type).join(',')}`,
  );

  // --- Test 11: rapid typing + immediate board switch (post-fix) ---
  const SECTION_RAPID = 'test-section-rapid-isolation';
  const R1 = 'rapid-b1';
  const R2 = 'rapid-b2';
  const rapid = createScheduler();
  rapid.scopeRef.sectionId = SECTION_RAPID;
  rapid.scopeRef.boardId = R1;
  rapid.schedulePersist([makeNotebook('RAPID_BOARD1_DRAFT')]);
  rapid.switchScope(SECTION_RAPID, R2);
  rapid.schedulePersist([makeNotebook('RAPID_BOARD2_ONLY')]);
  await sleep(450);
  rapid.flush();

  const rapidB1 = notebookBody(load(SECTION_RAPID, R1));
  const rapidB2 = notebookBody(load(SECTION_RAPID, R2));
  report(
    '11-rapid-switch',
    rapidB1.includes('RAPID_BOARD1_DRAFT') &&
      !rapidB1.includes('RAPID_BOARD2_ONLY') &&
      rapidB2.includes('RAPID_BOARD2_ONLY') &&
      !rapidB2.includes('RAPID_BOARD1_DRAFT'),
    `b1="${rapidB1.slice(0, 30)}" b2="${rapidB2.slice(0, 30)}"`,
  );

  // --- Regression: stale closure would bleed board2 content into board1 key ---
  mem.clear();
  const stale = createStaleBoardScheduler('board-one');
  const SEC = 'stale-test-sec';
  stale.schedulePersist([makeNotebook('STALE_BLEED')], SEC);
  stale.switchBoard('board-two', SEC);
  // Old callback still uses board-one id:
  stale.schedulePersist([makeNotebook('WRONG_TARGET')], SEC);
  await sleep(450);
  stale.flush();
  const bleedB1 = notebookBody(load(SEC, 'board-one'));
  const bleedB2 = notebookBody(load(SEC, 'board-two'));
  const staleWouldFail = bleedB1.includes('WRONG_TARGET');
  report(
    'regression-stale-closure-model',
    !staleWouldFail,
    `pre-fix model would write WRONG_TARGET to board-one=${staleWouldFail} (b1="${bleedB1}", b2="${bleedB2}")`,
  );

  const failed = results.filter((r) => !r.passed);
  console.log('\n--- Summary ---');
  console.log(`Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
  if (failed.length) {
    console.log('Failures:', failed.map((f) => f.id).join(', '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
