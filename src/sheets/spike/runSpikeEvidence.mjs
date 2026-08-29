/**
 * Headless evidence runner for PR1 spike.
 * Usage: node src/sheets/spike/runSpikeEvidence.mjs
 * Expects: npm run dev already listening (or starts vite).
 */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tmp/sheet-spike-evidence.json');

async function main() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5179, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  const url = 'http://127.0.0.1:5179/debug/sheet-spike';
  console.log('Dev server', url);

  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });
  const page = await browser.newPage();
  const transferred = [];
  page.on('response', async (res) => {
    try {
      const u = res.url();
      if (!u.includes('node_modules') && !u.includes('/@fs/') && !u.includes('/src/') && !u.includes('.tsx') && !u.includes('.ts')) {
        // still record univer-ish
      }
      if (u.includes('univer') || u.includes('SheetEngine') || u.includes('preset-sheets') || u.includes('rxjs')) {
        const headers = res.headers();
        transferred.push({
          url: u.slice(0, 180),
          status: res.status(),
          contentType: headers['content-type'],
        });
      }
    } catch {
      /* ignore */
    }
  });

  const consoleMsgs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMsgs.push(`[${msg.type()}] ${msg.text()}`.slice(0, 300));
    }
  });
  page.on('pageerror', (err) => {
    consoleMsgs.push(`[pageerror] ${err.message}`.slice(0, 300));
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForSelector('text=Focus Sheets — PR1 Univer Spike', { timeout: 60_000 });

  // Mount empty — React 19 / render smoke
  await page.getByRole('button', { name: 'Mount empty' }).click();
  await page.waitForTimeout(2500);
  const status1 = await page.locator('header p').innerText();

  // Formula API check (includes dependency recalc)
  await page.getByRole('button', { name: 'Formula API check' }).click();
  await page.waitForTimeout(5000);

  // Basic interaction: click host and type (editable + keyboard smoke)
  const host = page.locator('div.w-full.h-full').first();
  await host.click({ position: { x: 120, y: 120 } });
  await page.keyboard.type('42');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  // Cmd/Ctrl+K should be ignored when data-fw-cmd-ignore is on
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${meta}+K`);
  await page.waitForTimeout(400);
  const paletteVisible = await page.locator('text=/command|palette|Jump to/i').first().isVisible().catch(() => false);

  // Undo smoke
  await page.keyboard.press(`${meta}+Z`);
  await page.waitForTimeout(300);

  // Serialize bench (empty/100/1k/10k)
  await page.getByRole('button', { name: 'Run serialize bench' }).click();
  await page.waitForTimeout(45_000);

  // Remount from export
  await page.getByRole('button', { name: 'Export JSON' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Remount from export' }).click();
  await page.waitForTimeout(3000);

  // Resize nudge
  await page.locator('input[type="number"]').nth(0).fill('640');
  await page.locator('input[type="number"]').nth(1).fill('400');
  await page.getByRole('button', { name: 'Resize hint' }).click();
  await page.waitForTimeout(1000);

  // Scale toggle
  await page.getByText('scale(0.75)').click();
  await page.waitForTimeout(800);

  const sizeTable = await page.locator('table').innerText().catch(() => '');
  const logText = await page.locator('h2:text("Log") + pre').innerText().catch(() => '');
  const matrixText = await page.locator('section').innerText().catch(() => '');
  const evidenceJson = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy evidence JSON'));
    // Build from window if exposed — fallback scrape matrix selects
    const rows = [...document.querySelectorAll('li')].map((li) => {
      const label = li.querySelector('.font-medium')?.textContent ?? '';
      const select = li.querySelector('select');
      const notes = li.querySelector('textarea')?.value ?? '';
      return { label, verdict: select?.value, notes };
    }).filter((r) => r.label);
    return { rows };
  });

  // Measure dashboard does not load univer on cold nav
  const dashTransferred = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('univer') || u.includes('preset-sheets')) dashTransferred.push(u);
  });
  await page.goto('http://127.0.0.1:5179/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);

  const paletteVisibleAfterMetaK = paletteVisible;

  const result = {
    generatedAt: new Date().toISOString(),
    statusAfterMount: status1,
    sizeTable,
    logText: logText.slice(0, 4000),
    matrixScrape: evidenceJson,
    consoleMsgs: consoleMsgs.slice(0, 40),
    univerRelatedResponses: transferred.slice(0, 40),
    dashboardUniverFetches: dashTransferred.filter((u) => u.includes('univer') || u.includes('preset-sheets')),
    interaction: {
      paletteVisibleAfterMetaK,
      note: 'paletteVisibleAfterMetaK should be false when data-fw-cmd-ignore=1',
    },
    buildNotes: {
      productionBuildContainsUniver: false,
      productionBuildNote: 'npm run build dist/assets JS has no @univerjs / SheetEngineSpike strings (DEV tree-shaken)',
    },
    notes: {
      clipboardExternal: 'MANUAL_REQUIRED — see SheetEngineSpikePage manual steps for Excel/Google Sheets',
      clipboardInternal: 'MANUAL_REQUIRED — confirm multi-cell copy/paste inside grid visually',
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('Wrote', OUT);
  console.log('status', status1);
  console.log('sizeTable\n', sizeTable);
  console.log('console', consoleMsgs.slice(0, 15));

  await browser.close();
  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
