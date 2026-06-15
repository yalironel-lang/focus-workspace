/**
 * Notebook V1 Phase 2 — run: npx tsx src/lib/notebookPages/operations.test.ts
 */
import {
  addNotebookPage,
  addNotebookSection,
  migrateLegacyNotebook,
  renameNotebookPage,
  renameNotebookSection,
  switchNotebookPage,
  type NotebookContentWithPages,
} from './index';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function sampleNotebook(body = ''): NotebookContentWithPages {
  return {
    type: 'notebook',
    body,
  };
}

// Add page + rename helpers
const base = migrateLegacyNotebook(sampleNotebook('# Start'));
const sectionId = base.activeSectionId!;
const pageAId = base.activePageId!;
const withPageB = addNotebookPage(base, sectionId, '# Start', 'Page 2');
const pageBId = withPageB.activePageId!;
assert(pageBId !== pageAId, 'page B is new');
assert((withPageB.pages ?? []).length === 2, 'two pages');

const renamedSec = renameNotebookSection(withPageB, sectionId, 'Lecture Notes');
assert(renamedSec.sections?.[0]?.title === 'Lecture Notes', 'section renamed');
const renamedPage = renameNotebookPage(renamedSec, pageBId, 'Problem Set');
const pageBRecord = (renamedPage.pages ?? []).find(p => p.id === pageBId);
assert(pageBRecord?.title === 'Problem Set', 'page renamed');

// Explicit: edit Page A → switch B → edit B → switch A → both preserve content
let nb = migrateLegacyNotebook(sampleNotebook(''));
const secId = nb.activeSectionId!;
const pgA = nb.activePageId!;

const pageABody = '# Page A\n\nAlpha content.';
nb = switchNotebookPage(nb, pgA, pageABody);
nb = addNotebookPage(nb, secId, pageABody);
const pgB = nb.activePageId!;
assert(pgB !== pgA, 'page B id differs');

const pageBBody = '# Page B\n\nBeta content.';
nb = switchNotebookPage(
  { ...nb, body: pageBBody },
  pgA,
  pageBBody,
);
assert(nb.body === pageABody, 'switch back to A restores A body');
assert(
  (nb.pages ?? []).find(p => p.id === pgA)?.documentBody === pageABody,
  'page A documentBody stored',
);
assert(
  (nb.pages ?? []).find(p => p.id === pgB)?.documentBody === pageBBody,
  'page B documentBody stored after leaving B',
);

nb = switchNotebookPage(nb, pgB, pageABody);
assert(nb.body === pageBBody, 'switch to B restores B body');

const pageABodyV2 = '# Page A\n\nAlpha v2.';
nb = switchNotebookPage(nb, pgA, pageBBody);
nb = { ...nb, body: pageABodyV2 };
nb = switchNotebookPage(nb, pgB, pageABodyV2);
assert(
  (nb.pages ?? []).find(p => p.id === pgA)?.documentBody === pageABodyV2,
  'page A updated on round-trip',
);
assert(nb.body === pageBBody, 'B body intact on active page');

// Ink pages get unique per-page storage keys
const withInkA = addNotebookPage(nb, secId, pageBBody, 'PS Work', 'write');
const inkAId = withInkA.activePageId!;
const inkAKey = (withInkA.pages ?? []).find(p => p.id === inkAId)?.inkPageKey;
assert(inkAKey === inkAId, 'write page inkPageKey equals page id');
const withInkB = addNotebookPage(withInkA, secId, '', 'Past Exam Practice', 'write');
const inkBId = withInkB.activePageId!;
const inkBKey = (withInkB.pages ?? []).find(p => p.id === inkBId)?.inkPageKey;
assert(inkBKey === inkBId && inkBKey !== inkAKey, 'second ink page has distinct key');

const withSec2 = addNotebookSection(withInkB, '', 'Unit 2');
assert((withSec2.sections ?? []).length >= 2, 'second section');
assert(withSec2.body === '', 'new section starts empty');
assert(withSec2.activeSectionId !== secId, 'active section changed');

console.log('notebookPages.operations.test.ts: all passed');
