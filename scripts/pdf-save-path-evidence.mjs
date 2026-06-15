/**
 * Reproduces PDF save/load failure modes from deployed 0d9126e vs fixed path.
 * Run: npx --yes playwright@1.49.1 install chromium && node scripts/pdf-save-path-evidence.mjs
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium, devices } from 'playwright';

const LOG_PATH = new URL('../.cursor/debug-bffaef.log', import.meta.url).pathname;

function log(entry) {
  const line = JSON.stringify({ sessionId: 'bffaef', timestamp: Date.now(), ...entry }) + '\n';
  appendFileSync(LOG_PATH, line);
  console.log(entry.message, entry.data ?? '');
}

const IDB_HELPERS = `
async function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('fw_pdf_evidence_test', 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => req.result.createObjectStore('blobs');
    req.onsuccess = () => resolve(req.result);
  });
}
function storeKey(sectionId, objectId) { return sectionId + '::' + objectId; }
async function savePdfBlob(sectionId, objectId, blob) {
  const db = await openDb();
  const key = storeKey(sectionId, objectId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.oncomplete = () => { db.close(); resolve({ key, blobSize: blob.size }); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.objectStore('blobs').put(blob, key);
  });
}
async function loadPdfBlob(sectionId, objectId) {
  const db = await openDb();
  const key = storeKey(sectionId, objectId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').get(key);
    req.onsuccess = () => {
      db.close();
      const r = req.result;
      resolve({ key, found: r instanceof Blob, size: r instanceof Blob ? r.size : 0 });
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
`;

async function withLocalhostPage(run) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><body>pdf-evidence</body></html>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    await run(browser, `http://127.0.0.1:${port}/`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

async function runBrowserTests(deviceName, contextOptions) {
  await withLocalhostPage(async (browser, origin) => {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  await page.goto(origin);
  await page.evaluate(() => indexedDB.deleteDatabase('fw_pdf_evidence_test'));

  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
  const sectionId = 'sec-test-abc';
  const objectId = 'ps-pdf-1700000000-xy123';

  // Test 1: deployed 0d9126e applyFile order — metadata/load before save completes
  const raceResult = await page.evaluate(
    async ({ helpers, pdfBytes, sectionId, objectId }) => {
      eval(helpers);
      const file = new File([new Uint8Array(pdfBytes)], 'exam.pdf', { type: 'application/pdf' });
      const loadBeforeSave = await loadPdfBlob(sectionId, objectId);
      await new Promise(r => setTimeout(r, 0));
      const saveStarted = Date.now();
      const saveInfo = await savePdfBlob(sectionId, objectId, file);
      const loadAfterSave = await loadPdfBlob(sectionId, objectId);
      return {
        filePicker: { name: file.name, size: file.size, type: file.type },
        loadBeforeSave,
        saveInfo,
        saveMs: Date.now() - saveStarted,
        loadAfterSave,
        keysMatch: loadBeforeSave.key === loadAfterSave.key,
        deployedWouldShowRecover: !loadBeforeSave.found,
        blobPersistedAfterSave: loadAfterSave.found && loadAfterSave.size > 0,
      };
    },
    { helpers: IDB_HELPERS, pdfBytes: [...pdfBytes], sectionId, objectId },
  );

  log({
    runId: 'evidence',
    hypothesisId: 'H-RACE',
    location: 'pdf-save-path-evidence.mjs',
    message: `Deployed race pattern (${deviceName})`,
    data: raceResult,
  });

  // Test 2: key mismatch — save under objectA, load under objectB
  const keyMismatch = await page.evaluate(
    async ({ helpers, pdfBytes, sectionId }) => {
      eval(helpers);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      await savePdfBlob(sectionId, 'ps-pdf-save-id', blob);
      const wrongLoad = await loadPdfBlob(sectionId, 'ps-pdf-load-id');
      const rightLoad = await loadPdfBlob(sectionId, 'ps-pdf-save-id');
      return {
        saveKey: storeKey(sectionId, 'ps-pdf-save-id'),
        wrongLoadKey: wrongLoad.key,
        wrongLoadFound: wrongLoad.found,
        rightLoadFound: rightLoad.found,
        keyMismatchCausesRecover: !wrongLoad.found && rightLoad.found,
      };
    },
    { helpers: IDB_HELPERS, pdfBytes: [...pdfBytes], sectionId },
  );

  log({
    runId: 'evidence',
    hypothesisId: 'H-KEY',
    location: 'pdf-save-path-evidence.mjs',
    message: `Key mismatch control (${deviceName})`,
    data: keyMismatch,
  });

  // Test 3: fixed order — save+verify before simulated metadata/load
  const fixedResult = await page.evaluate(
    async ({ helpers, pdfBytes, sectionId, objectId }) => {
      eval(helpers);
      const file = new File([new Uint8Array(pdfBytes)], 'exam.pdf', { type: 'application/pdf' });
      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type });
      await savePdfBlob(sectionId, objectId + '-fixed', blob);
      const verify = await loadPdfBlob(sectionId, objectId + '-fixed');
      const loadAfterMetadata = await loadPdfBlob(sectionId, objectId + '-fixed');
      return {
        materializedSize: blob.size,
        verifyAfterSave: verify,
        loadAfterMetadata,
        fixedPathReady: verify.found && loadAfterMetadata.found,
      };
    },
    { helpers: IDB_HELPERS, pdfBytes: [...pdfBytes], sectionId, objectId },
  );

  log({
    runId: 'evidence',
    hypothesisId: 'H-FIX',
    location: 'pdf-save-path-evidence.mjs',
    message: `Fixed save-then-load path (${deviceName})`,
    data: fixedResult,
  });

  await context.close();
  });
}

writeFileSync(LOG_PATH, '');
log({
  runId: 'evidence',
  hypothesisId: 'H0',
  location: 'pdf-save-path-evidence.mjs',
  message: 'Starting PDF save path evidence run',
  data: { deployedCommit: '0d9126e', note: 'applyFile in 0d9126e calls onChange before savePdfBlob' },
});

await runBrowserTests('desktop-chromium', {});
await runBrowserTests('ipad-safari-ua', {
  ...devices['iPad Pro 11'],
  isMobile: true,
  hasTouch: true,
});

log({
  runId: 'evidence',
  hypothesisId: 'H-SUMMARY',
  location: 'pdf-save-path-evidence.mjs',
  message: 'Evidence complete',
  data: {
    deployedRootCause:
      '0d9126e applyFile writes metadata (onChange) before savePdfBlob; load effect runs immediately and finds no blob → recover. Save may still succeed afterward but UI stays recover. savePdfBlob catch also shows storage toast on IDB failure.',
    keyMismatchRuledOutForSameIds: 'save and load use identical storeKey(sectionId, objectId) when objectId stable',
    fix: 'savePdfBlobFromFile (materialize bytes, save, verify) then onChange',
  },
});
