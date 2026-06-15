/**
 * Proves iPad file.size=0 breaks load effect when fileSize<=0 guard is present.
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium, devices } from 'playwright';

const LOG_PATH = new URL('../.cursor/debug-bffaef.log', import.meta.url).pathname;

function log(entry) {
  appendFileSync(LOG_PATH, JSON.stringify({ sessionId: 'bffaef', timestamp: Date.now(), ...entry }) + '\n');
  console.log(entry.message, entry.data ?? '');
}

writeFileSync(LOG_PATH, '');

const HELPERS = `
function storeKey(s,o){return s+'::'+o}
async function openDb(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('fw_zero_size_test',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('blobs');
    r.onsuccess=()=>res(r.result);
    r.onerror=()=>rej(r.error);
  });
}
async function save(key, blob){
  const db=await openDb();
  return new Promise((res,rej)=>{
    const tx=db.transaction('blobs','readwrite');
    tx.oncomplete=()=>{db.close();res();};
    tx.onerror=()=>{db.close();rej(tx.error);};
    tx.objectStore('blobs').put(blob,key);
  });
}
async function load(key){
  const db=await openDb();
  return new Promise((res,rej)=>{
    const tx=db.transaction('blobs','readonly');
    const req=tx.objectStore('blobs').get(key);
    req.onsuccess=()=>{db.close();res(req.result);};
    req.onerror=()=>{db.close();rej(req.error);};
  });
}
`;

async function main() {
  const server = createServer((_q, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body></body></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ ...devices['iPad Pro 11'] });
  await page.goto(origin);

  const pdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2];
  const result = await page.evaluate(
    async ({ helpers, pdfBytes, sectionId, objectId }) => {
      eval(helpers);
      const key = storeKey(sectionId, objectId);
      const buf = new Uint8Array(pdfBytes);
      const file = new File([buf], 'exam.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: 0 });
      const ab = await file.arrayBuffer();
      const blob = new Blob([ab], { type: 'application/pdf' });
      await save(key, blob);
      const loaded = await load(key);
      const metaFileSize = file.size;
      const oldGuardBlocksLoad = !!file.name && metaFileSize <= 0;
      const newGuardBlocksLoad = !file.name;
      return {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        byteLength: ab.byteLength,
        blobSavedSize: blob.size,
        idbLoadedSize: loaded?.size ?? 0,
        key,
        oldGuardBlocksLoad,
        newGuardBlocksLoad,
        symptom: oldGuardBlocksLoad && loaded?.size > 0 ? 'idle_no_iframe_study_disabled' : 'other',
      };
    },
    { helpers: HELPERS, pdfBytes, sectionId: 'sec-ipad', objectId: 'ps-pdf-test' },
  );

  log({
    runId: 'zero-size',
    hypothesisId: 'H-ZERO-SIZE',
    location: 'pdf-zero-size-evidence.mjs',
    message: 'iPad file.size=0 with valid bytes',
    data: result,
  });

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
