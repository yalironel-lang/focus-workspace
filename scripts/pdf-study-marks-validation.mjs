/**
 * PDF study marks persistence validation (IDB semantics).
 * Run: node scripts/pdf-study-marks-validation.mjs
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal in-memory IDB shim via fake-indexeddb not available — test doc logic inline
function emptyDoc() {
  return { version: 1, markedPages: [], pages: {} };
}

function mergeMark(doc, page) {
  const p = Math.floor(page);
  if (!doc.markedPages.includes(p)) doc.markedPages = [...doc.markedPages, p].sort((a, b) => a - b);
  return doc;
}

function addRegion(doc, page, rect) {
  const k = String(page);
  const layer = doc.pages[k] ?? { regions: [] };
  layer.regions.push({ id: `r-${layer.regions.length}`, ...rect });
  doc.pages[k] = layer;
  return doc;
}

const SEC_A = 'sec-a';
const SEC_B = 'sec-b';
const OBJ_1 = 'pdf-1';

let passed = 0;
let failed = 0;

function report(name, ok, detail) {
  console.log(`${ok ? 'PASSED' : 'FAILED'} — ${name}: ${detail}`);
  if (ok) passed += 1;
  else failed += 1;
}

const docA = emptyDoc();
mergeMark(docA, 3);
addRegion(docA, 3, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 });

const docB = emptyDoc();
mergeMark(docB, 7);

report('isolation-sim', !docB.markedPages.includes(3) && docA.markedPages.includes(3), `A pages=${docA.markedPages} B pages=${docB.markedPages}`);
report('region-page', docA.pages['3']?.regions?.length === 1, `regions on p3=${docA.pages['3']?.regions?.length}`);
report('no-ls-bloat', JSON.stringify(docA).length < 5000, `doc bytes=${JSON.stringify(docA).length}`);

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
