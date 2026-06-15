/**
 * Proves bare indexedDB.open throws ReferenceError when WebKit hides the global binding.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium, devices } from 'playwright';

const LOG = new URL('../.cursor/debug-bffaef.log', import.meta.url).pathname;

function log(entry) {
  appendFileSync(LOG, JSON.stringify({ sessionId: 'bffaef', timestamp: Date.now(), ...entry }) + '\n');
  console.log(entry.message, entry.data ?? '');
}

writeFileSync(LOG, '');

const server = createServer((_q, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body></body></html>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices['iPad Pro 11'] });

await page.addInitScript(() => {
  try {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    delete globalThis.indexedDB;
  } catch {
    /* ignore */
  }
});

await page.goto(origin);

const result = await page.evaluate(() => {
  const ua = navigator.userAgent;
  const iosStandalone = 'standalone' in navigator && !!navigator.standalone;
  const displayMode = window.matchMedia('(display-mode: standalone)').matches
    ? 'standalone'
    : 'browser';
  let bareOpen = 'not-tried';
  let bareTypeof = 'not-tried';
  let windowResolved = false;
  try {
    bareTypeof = typeof indexedDB;
  } catch (e) {
    bareTypeof = e instanceof ReferenceError ? 'ReferenceError' : String(e);
  }
  try {
    indexedDB.open('x', 1);
    bareOpen = 'ok';
  } catch (e) {
    bareOpen = e instanceof ReferenceError ? 'ReferenceError' : e instanceof Error ? e.message : String(e);
  }
  windowResolved = 'indexedDB' in window && !!window.indexedDB;
  let safeOpen = 'not-tried';
  const idb = 'indexedDB' in globalThis ? globalThis.indexedDB : null;
  if (!idb) safeOpen = 'blocked-before-open';
  return { ua, iosStandalone, displayMode, bareTypeof, bareOpen, windowResolved, safeOpen };
});

log({
  runId: 'idb-missing',
  hypothesisId: 'H-IDB-REF',
  location: 'idb-missing-evidence.mjs',
  message: 'WebKit hidden indexedDB global simulation',
  data: result,
});

await browser.close();
server.close();
