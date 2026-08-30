/**
 * PR 3D2 acceptance harness (post Phase 0).
 * Usage: node src/sheets/spike/runPr3d2Filter.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'tmp/sheet-pr3d2-filter.json');
const MD = path.join(process.cwd(), 'src/sheets/spike/PR3D2_FILTER.md');

async function resolvePort() {
  for (const port of [5173, 5174, 5182, 5183]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/debug/sheet-fs`, { redirect: 'manual' });
      if (res.status > 0 && res.status < 500) return port;
    } catch { /* */ }
  }
  throw new Error('No Vite');
}

async function boot(page) {
  await page.goto(`http://127.0.0.1:${await resolvePort()}/debug/sheet-fs`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.includes('debug-sheet-pr3a')) localStorage.removeItem(k);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A/3B');
  await page.locator('[data-canvas-host="freeform"]').click();
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await page.waitForFunction(
    () => window.__focusSheetSurfaceEngine && document.querySelector('[id^="univer-sheet-main-canvas"]'),
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(700);
}

async function seed(page) {
  await page.evaluate(() => {
    const e = window.__focusSheetSurfaceEngine;
    e.setCellValue('A1', 'Name');
    e.setCellValue('B1', 'Qty');
    e.setCellValue('C1', 'Total');
    e.setCellValue('A2', 'A');
    e.setCellValue('B2', 2);
    e.setCellFormula('C2', '=B2*10');
    e.setCellValue('A3', 'B');
    e.setCellValue('B3', 5);
    e.setCellFormula('C3', '=B3*10');
    e.setCellValue('A4', 'C');
    e.setCellValue('B4', 1);
    e.setCellFormula('C4', '=B4*10');
  });
  await page.waitForTimeout(100);
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), checks: {} };
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await boot(page);
  await seed(page);

  // Data menu exists; no Sort
  await page.getByRole('button', { name: 'Data' }).click();
  await page.waitForTimeout(200);
  const menuUi = await page.evaluate(() => {
    const pop = document.querySelector('[data-fw-sheet-popover="1"]');
    const text = pop?.textContent ?? '';
    return {
      hasData: true,
      menuText: text,
      hasSort: /sort/i.test(text),
      hasAdd: /Add filter/i.test(text),
      hasClear: /Clear filter/i.test(text),
      hasRemove: /Remove filter/i.test(text),
    };
  });
  await page.keyboard.press('Escape');
  report.checks.menu = { ...menuUi, pass: menuUi.hasAdd && menuUi.hasClear && menuUi.hasRemove && !menuUi.hasSort };

  // Adapter add → criteria → clear → remove + undo
  const flow = await page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    e.selectRange('A1:C4');
    const state0 = e.getDataToolState();
    const add = e.addFilter();
    await new Promise((r) => setTimeout(r, 120));
    const state1 = e.getDataToolState();
    const sheet = e.univerAPI.getActiveWorkbook().getActiveSheet();
    sheet.getFilter()?.setColumnFilterCriteria?.(0, { colId: 0, filters: { filters: ['B', 'C'] } });
    await new Promise((r) => setTimeout(r, 150));
    const state2 = e.getDataToolState();
    const filteredOut = sheet.getFilter()?.getFilteredOutRows?.() ?? [];
    const formulas = e.probeCells(['C2', 'C3', 'C4']);
    const clear = e.clearFilter();
    await new Promise((r) => setTimeout(r, 100));
    const state3 = e.getDataToolState();
    const remove = e.removeFilter();
    await new Promise((r) => setTimeout(r, 100));
    const state4 = e.getDataToolState();

    // Undo stack: re-add then undo
    e.selectRange('A1:C4');
    e.addFilter();
    await new Promise((r) => setTimeout(r, 80));
    await e.univerAPI.undo();
    await new Promise((r) => setTimeout(r, 120));
    const afterUndoAdd = Boolean(sheet.getFilter?.());

    return {
      state0, add, state1, state2, filteredOut, formulas, clear, state3, remove, state4, afterUndoAdd,
    };
  });
  report.checks.adapterFlow = {
    pass:
      flow.add?.ok
      && flow.state1?.hasFilter
      && flow.state2?.hasCriteria
      && flow.filteredOut?.includes?.(1)
      && flow.formulas?.C2?.formula === '=B2*10'
      && flow.clear?.ok
      && flow.remove?.ok
      && flow.state4?.hasFilter === false
      && flow.afterUndoAdd === false,
    flow,
  };

  // Persistence: add+criteria → flush → reload
  await seed(page);
  await page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    e.selectRange('A1:C4');
    e.addFilter();
    await new Promise((r) => setTimeout(r, 80));
    e.univerAPI.getActiveWorkbook().getActiveSheet().getFilter()
      ?.setColumnFilterCriteria?.(0, { colId: 0, filters: { filters: ['B', 'C'] } });
    await new Promise((r) => setTimeout(r, 200));
    const id = window.__focusSheetFs?.selectedId || window.__focusSheetFs?.sheets?.[0]?.focusId;
    window.__focusSheetFs.flushSheet(id);
  });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A/3B');
  await page.locator('[data-canvas-host="freeform"]').click();
  await page.waitForFunction(
    () => window.__focusSheetSurfaceEngine && document.querySelector('[id^="univer-sheet-main-canvas"]'),
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(600);
  const afterReload = await page.evaluate(() => {
    const e = window.__focusSheetSurfaceEngine;
    const sheet = e.univerAPI.getActiveWorkbook().getActiveSheet();
    const f = sheet.getFilter?.();
    return {
      hasFilter: Boolean(f),
      filteredOut: f?.getFilteredOutRows?.() ?? [],
      formulas: e.probeCells(['C2', 'C3', 'C4']),
      resource: (e.exportDocument().workbook?.resources ?? []).some((r) => r.name === 'SHEET_FILTER_PLUGIN'),
    };
  });
  report.checks.refresh = {
    pass: afterReload.hasFilter && afterReload.filteredOut.includes(1) && afterReload.formulas.C2?.formula === '=B2*10',
    afterReload,
  };

  // UOV transitions
  const uov = await page.evaluate(async () => {
    const id = window.__focusSheetFs?.selectedId || window.__focusSheetFs?.sheets?.[0]?.focusId;
    const snap = () => {
      const e = window.__focusSheetSurfaceEngine;
      const f = e.univerAPI.getActiveWorkbook().getActiveSheet().getFilter?.();
      return { has: Boolean(f), out: f?.getFilteredOutRows?.() ?? [] };
    };
    window.__focusSheetFs.flushSheet(id);
    window.__focusSheetFs.setPresentation(id, 'fullscreen');
    await new Promise((r) => setTimeout(r, 700));
    const full = snap();
    window.__focusSheetFs.flushSheet(id);
    window.__focusSheetFs.setPresentation(id, 'split', 'right');
    await new Promise((r) => setTimeout(r, 700));
    const split = snap();
    window.__focusSheetFs.flushSheet(id);
    window.__focusSheetFs.setPresentation(id, 'floating');
    await new Promise((r) => setTimeout(r, 700));
    const floating = snap();
    return { full, split, floating };
  });
  report.checks.uov = {
    pass: uov.full.has && uov.split.has && uov.floating.has
      && uov.full.out.includes(1) && uov.split.out.includes(1) && uov.floating.out.includes(1),
    uov,
  };

  // Structural: insert row with filter
  const structural = await page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    try {
      e.insertRows?.(1, 1);
      await new Promise((r) => setTimeout(r, 150));
      const f = e.univerAPI.getActiveWorkbook().getActiveSheet().getFilter?.();
      const docOk = Boolean(e.exportDocument()?.workbook);
      return { ok: true, hasFilter: Boolean(f), docOk, formulas: e.probeCells(['C3']) };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  report.checks.structural = { pass: structural.ok && structural.docOk, structural };

  // Multi sheet isolation
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await page.waitForTimeout(800);
  const multi = await page.evaluate(() => {
    const objs = (window.__focusSheetFs?.objects ?? []).filter((o) => o.type === 'sheet');
    return objs.map((o) => {
      const res = o.content?.document?.workbook?.resources ?? [];
      const filter = res.find((r) => r.name === 'SHEET_FILTER_PLUGIN');
      let keys = [];
      try { keys = filter ? Object.keys(JSON.parse(filter.data)) : []; } catch { /* */ }
      return { id: o.id, filterKeys: keys };
    });
  });
  report.checks.multiSheet = {
    pass: multi.length >= 2 && multi.some((m) => m.filterKeys.length > 0),
    multi,
  };

  // No Sort in toolbar text
  const noSort = await page.evaluate(() => {
    const bar = document.querySelector('[data-fw-sheet-toolbar], [class*="toolbar"]') || document.body;
    const dataBtn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Data');
    dataBtn?.click();
    const pop = document.querySelector('[data-fw-sheet-popover="1"]');
    const t = (pop?.textContent || '') + (bar?.textContent || '');
    return { hasSortAsc: /Sort ascending/i.test(t), text: (pop?.textContent || '').slice(0, 200) };
  });
  report.checks.noSort = { pass: !noSort.hasSortAsc, noSort };

  const allPass = Object.values(report.checks).every((c) => c.pass);
  report.verdict = allPass ? 'GO' : 'NO-GO';

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  fs.writeFileSync(MD, [
    '# PR 3D2 Filter — Acceptance',
    '',
    `Verdict: **${report.verdict}**`,
    '',
    ...Object.entries(report.checks).map(([k, v]) => `- **${k}**: ${v.pass ? 'PASS' : 'FAIL'}`),
    '',
    'Phase 0: see `PR3D2_PHASE0.md` / `tmp/sheet-pr3d2-phase0.json`.',
    '',
    '## Manual SectionPage QA',
    '1. Add Sheet',
    '2. Build table with header',
    '3. Data ▾ → Add Filter',
    '4. Open header dropdown',
    '5. Hide one value',
    '6. Verify formulas',
    '7. Clear Filter',
    '8. Apply again',
    '9. Fullscreen',
    '10. Split',
    '11. Floating',
    '12. Zoom 0.7',
    '13. Refresh',
    '14. Duplicate',
    '15. Verify duplicate independence',
    '16. Insert/delete row',
    '17. Insert/delete column',
    '18. Clipboard',
    '19. Undo/Redo',
    '20. Confirm Sort does not appear',
    '',
  ].join('\n'));
  console.log(JSON.stringify({ verdict: report.verdict, checks: Object.fromEntries(Object.entries(report.checks).map(([k, v]) => [k, v.pass])), out: OUT }, null, 2));
  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
