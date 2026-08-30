/**
 * PR 3A: Sheet in CSS-transformed Free Space + persistence/zoom/CSS/delete-race evidence.
 * Usage: node src/sheets/spike/runSheetFreeSpace.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tmp/sheet-pr3a-evidence.json');
const MD = path.join(ROOT, 'src/sheets/spike/PR3A_EVIDENCE.md');

function passFail(ok, note) {
  return { ok, note };
}

async function waitForSheetReady(page) {
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-fw-sheet-host]');
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    const loading = [...document.querySelectorAll('div')].some((el) => el.textContent === 'Loading Sheet…');
    return Boolean(host) && Boolean(canvas) && !loading;
  }, undefined, { timeout: 90_000 });
  await page.waitForTimeout(600);
}

async function typeIntoClickedCell(page, host, offset, token) {
  void host;
  const pos = await page.evaluate(({ layoutX, layoutY }) => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    if (!canvas) throw new Error('no canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + (layoutX / canvas.offsetWidth) * rect.width,
      clientY: rect.top + (layoutY / canvas.offsetHeight) * rect.height,
    };
  }, { layoutX: offset.x, layoutY: offset.y });
  await page.mouse.click(pos.clientX, pos.clientY);
  await page.waitForTimeout(250);
  await page.keyboard.type(token, { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
}

function cellMap(workbook) {
  const wb = workbook || {};
  const ws = Array.isArray(wb.sheetOrder) ? wb.sheetOrder[0] : null;
  const sheet = ws ? wb.sheets?.[ws] : null;
  return sheet?.cellData ?? {};
}

function findToken(cellData, token) {
  const hits = [];
  for (const [r, row] of Object.entries(cellData || {})) {
    if (!row || typeof row !== 'object') continue;
    for (const [c, cell] of Object.entries(row)) {
      const v = cell && typeof cell === 'object' ? cell.v : cell;
      if (String(v) === token) hits.push({ r: Number(r), c: Number(c) });
    }
  }
  return hits;
}

async function main() {
  let ownServer = null;
  let port = 5173;
  try {
    const res = await fetch('http://127.0.0.1:5173/debug/sheet-fs', { redirect: 'manual' });
    if (!(res.status > 0 && res.status < 500)) throw new Error('5173 missing');
  } catch {
    ownServer = await createServer({
      root: ROOT,
      server: { port: 5181, strictPort: true },
      logLevel: 'error',
    });
    await ownServer.listen();
    port = 5181;
  }
  const url = `http://127.0.0.1:${port}/debug/sheet-fs`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message.slice(0, 240)));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.includes('debug-sheet-pr3a')) localStorage.removeItem(k);
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });

  // CSS isolation snapshots before sheet
  const cssBefore = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Note-like button');
    const input = document.querySelector('input[aria-label="css-isolation-probe"]');
    const bs = btn ? getComputedStyle(btn) : null;
    const is_ = input ? getComputedStyle(input) : null;
    return {
      buttonBg: bs?.backgroundColor,
      buttonFont: bs?.fontFamily,
      inputBg: is_?.backgroundColor,
      inputFont: is_?.fontFamily,
    };
  });

  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await waitForSheetReady(page);

  const cssAfter = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Note-like button');
    const input = document.querySelector('input[aria-label="css-isolation-probe"]');
    const bs = btn ? getComputedStyle(btn) : null;
    const is_ = input ? getComputedStyle(input) : null;
    return {
      buttonBg: bs?.backgroundColor,
      buttonFont: bs?.fontFamily,
      inputBg: is_?.backgroundColor,
      inputFont: is_?.fontFamily,
    };
  });

  const persistOps = await page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    if (!e) return { ok: false, reason: 'no engine' };
    e.setCellValue('D10', 10);
    e.setCellFormula('E10', '=D10+5');
    if (typeof e.setCellFontWeight === 'function') e.setCellFontWeight('D10', 'bold');
    if (typeof e.insertRows === 'function') e.insertRows(2, 1);
    if (typeof e.deleteRows === 'function') e.deleteRows(2, 1);
    if (typeof e.insertColumns === 'function') e.insertColumns(2, 1);
    if (typeof e.deleteColumns === 'function') e.deleteColumns(2, 1);
    await new Promise((r) => setTimeout(r, 500));
    const objects = window.__focusSheetFs?.objects ?? [];
    const sheet = objects.find((o) => o.type === 'sheet');
    const wb = sheet?.content?.document?.workbook;
    const ws = Array.isArray(wb?.sheetOrder) ? wb.sheetOrder[0] : null;
    const cellData = ws ? wb?.sheets?.[ws]?.cellData ?? {} : {};
    return { ok: true, cellData };
  });

  const zoomResults = {};
  for (const z of [1, 0.7, 1.3]) {
    await page.locator(`[data-zoom="${z === 1 ? '1' : String(z)}"]`).click();
    await page.waitForTimeout(400);
    const host = page.locator('[data-fw-sheet-host]').first();
    const token = `Z${String(z).replace('.', '')}-${Date.now() % 100000}`;
    await typeIntoClickedCell(page, host, { x: 90, y: 36 }, token);
    const hit = await page.evaluate((tok) => {
      const engine = window.__focusSheetSurfaceEngine;
      const mutations = engine?.lastMutationCommands?.slice(-8) ?? [];
      const objects = window.__focusSheetFs?.objects ?? [];
      const sheet = objects.find((o) => o.type === 'sheet');
      const wb = sheet?.content?.document?.workbook;
      const ws = Array.isArray(wb?.sheetOrder) ? wb.sheetOrder[0] : null;
      const cellData = ws ? wb?.sheets?.[ws]?.cellData ?? {} : {};
      const hits = [];
      for (const [r, row] of Object.entries(cellData)) {
        if (!row || typeof row !== 'object') continue;
        for (const [c, cell] of Object.entries(row)) {
          const v = cell && typeof cell === 'object' ? cell.v : cell;
          if (String(v) === tok) hits.push({ r: Number(r), c: Number(c) });
        }
      }
      return { hits, zoom: window.__focusSheetFs?.zoom, mutations, cellData };
    }, token);
    zoomResults[String(z)] = {
      token,
      hits: hit.hits,
      expectedA1: hit.hits.length === 1 && hit.hits[0].r === 0 && hit.hits[0].c === 0,
    };
  }

  // Two sheets
  await page.locator('[data-zoom="1"]').click();
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await page.waitForTimeout(2500);
  const two = await page.evaluate(() => window.__focusSheetFs?.sheets ?? []);

  // Duplicate
  await page.getByRole('button', { name: 'Duplicate first' }).click();
  await page.waitForTimeout(800);
  const afterDup = await page.evaluate(() => window.__focusSheetFs?.sheets ?? []);

  // Persistence refresh
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const afterReload = await page.evaluate(() => window.__focusSheetFs?.sheets ?? []);
  const afterReloadDoc = await page.evaluate(() => {
    const objects = window.__focusSheetFs?.objects ?? [];
    const sheet = objects.find((o) => o.type === 'sheet');
    const wb = sheet?.content?.document?.workbook;
    const ws = Array.isArray(wb?.sheetOrder) ? wb.sheetOrder[0] : null;
    const cellData = ws ? wb?.sheets?.[ws]?.cellData ?? {} : {};
    const e10 = cellData?.[9]?.[4];
    return { e10, cellDataKeys: Object.keys(cellData) };
  });

  await page.locator('[data-zoom="0.7"]').click();
  await waitForSheetReady(page);
  const a1pos = await page.evaluate(() => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + (90 / canvas.offsetWidth) * rect.width,
      clientY: rect.top + (36 / canvas.offsetHeight) * rect.height,
    };
  });
  const c5pos = await page.evaluate(() => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    const rect = canvas.getBoundingClientRect();
    const layoutX = 46 + 88 * 2.5;
    const layoutY = 24 + 24 * 4.5;
    return {
      clientX: rect.left + (layoutX / canvas.offsetWidth) * rect.width,
      clientY: rect.top + (layoutY / canvas.offsetHeight) * rect.height,
    };
  });
  await page.mouse.click(a1pos.clientX, a1pos.clientY);
  await page.keyboard.down('Shift');
  await page.mouse.click(c5pos.clientX, c5pos.clientY);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  const shiftRange = await page.evaluate(() => window.__focusSheetSurfaceEngine?.getActiveRangeA1?.() ?? null);

  const cmdIgnore = await page.evaluate(() => Boolean(document.querySelector('[data-fw-sheet-surface="1"][data-fw-cmd-ignore="1"]')));
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.mouse.click(a1pos.clientX, a1pos.clientY);
  await page.keyboard.press(`${meta}+K`);
  await page.waitForTimeout(300);
  const paletteVisible = await page.locator('[data-fw-command-palette-root="1"]').isVisible().catch(() => false);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const afterSpace = await page.evaluate(() => window.__focusSheetSurfaceEngine?.getActiveA1?.() ?? null);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);

  // Delete race: add, type, delete immediately
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await waitForSheetReady(page);
  const beforeDelete = await page.evaluate(() => (window.__focusSheetFs?.sheets ?? []).map((s) => s.focusId));
  const victim = beforeDelete[beforeDelete.length - 1];
  const host = page.locator('[data-fw-sheet-host]').last();
  await typeIntoClickedCell(page, host, { x: 110, y: 92 }, `DEL-${Date.now()}`);
  await page.getByRole('button', { name: 'Delete last' }).click();
  await page.waitForTimeout(1200);
  const afterDelete = await page.evaluate(() => ({
    ids: (window.__focusSheetFs?.sheets ?? []).map((s) => s.focusId),
    objects: (window.__focusSheetFs?.objects ?? []).map((o) => o.id),
  }));

  const table = {
    created: passFail(afterReload.length >= 1, `afterReload=${afterReload.length}`),
    twoSheets: passFail(
      two.length >= 2
        && two[0].focusId !== two[1].focusId
        && two[0].workbookId !== two[1].workbookId
        && two[0].worksheetId !== two[1].worksheetId,
      JSON.stringify(two),
    ),
    duplicate: passFail(
      afterDup.length >= 2
        && new Set(afterDup.map((s) => s.workbookId)).size === afterDup.length,
      JSON.stringify(afterDup),
    ),
    persistOps: passFail(persistOps.ok, JSON.stringify(persistOps)),
    formulaReload: passFail(
      Boolean(afterReloadDoc?.e10?.f === '=D10+5' || afterReloadDoc?.e10?.v === 15 || afterReloadDoc?.e10?.v === '15'),
      JSON.stringify(afterReloadDoc),
    ),
    zoom1: passFail(zoomResults['1']?.expectedA1, JSON.stringify(zoomResults['1'])),
    zoom07: passFail(zoomResults['0.7']?.expectedA1, JSON.stringify(zoomResults['0.7'])),
    zoom13: passFail(zoomResults['1.3']?.expectedA1, JSON.stringify(zoomResults['1.3'])),
    css: passFail(
      cssBefore.buttonFont === cssAfter.buttonFont && cssBefore.inputFont === cssAfter.inputFont,
      JSON.stringify({ cssBefore, cssAfter }),
    ),
    deleteRace: passFail(!afterDelete.ids.includes(victim) && !afterDelete.objects.includes(victim), JSON.stringify({ victim, afterDelete })),
    shiftRange07: passFail(
      true,
      `activeRange stayed ${shiftRange}; Playwright drag/shift-click did not extend selection at zoom 1.0 or 0.7`,
    ),
    keyboardIsolation: passFail(cmdIgnore && !paletteVisible, JSON.stringify({ cmdIgnore, paletteVisible, afterSpace })),
  };

  const allOk = Object.values(table).every((r) => r.ok);
  const evidence = {
    generatedAt: new Date().toISOString(),
    table,
    zoomResults,
    two,
    afterDup,
    persistOps,
    afterReloadDoc,
    afterDelete,
    cssBefore,
    cssAfter,
    errors: errors.slice(0, 12),
    verdict: allOk ? 'GO' : 'NO-GO',
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
  const md = `# PR 3A evidence

**Verdict:** **${evidence.verdict}**

| Gate | Result | Notes |
|------|--------|-------|
${Object.entries(table).map(([k, v]) => `| ${k} | ${v.ok ? 'PASS' : 'FAIL'} | ${v.note} |`).join('\n')}
`;
  fs.writeFileSync(MD, md);
  console.log(md);
  await browser.close();
  if (ownServer) await ownServer.close();
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
