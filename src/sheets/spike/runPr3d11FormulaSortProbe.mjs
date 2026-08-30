/**
 * Isolated Univer formula-move/sort investigation (PR 3D1.1).
 * Uses Focus sheet debug host but only official Univer facade/commands.
 * Usage: node src/sheets/spike/runPr3d11FormulaSortProbe.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'tmp/sheet-pr3d11-formula-sort-probe.json');

async function resolvePort() {
  for (const port of [5173, 5182]) {
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

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await boot(page);

  const report = await page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    const api = e.univerAPI;
    const wb = api.getActiveWorkbook();
    const sheet = wb.getActiveSheet();
    const unitId = wb.getId();
    const subUnitId = sheet.getSheetId();

    const seed = () => {
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
    };

    const probe = () => e.probeCells(['A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4']);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // --- Path 1: official FRange.sort (SortRangeCommand → ReorderRangeCommand) ---
    seed();
    await sleep(100);
    const range = sheet.getRange('A2:C4');
    range.sort({ column: 1, ascending: true });
    await sleep(250);
    const afterFacadeSort = probe();
    const facadeSortOk =
      afterFacadeSort.A2?.value === 'C'
      && Number(afterFacadeSort.B2?.value) === 1
      && String(afterFacadeSort.C2?.formula ?? '').replace(/^=/, '') === 'B2*10'
      && Number(afterFacadeSort.C2?.value) === 10;

    // --- Path 2: SortRangeCommand via FUniver.executeCommand ---
    seed();
    await sleep(80);
    let applySortResult = null;
    try {
      const ok = await api.executeCommand('sheet.command.sort-range', {
        unitId,
        subUnitId,
        range: { startRow: 1, startColumn: 0, endRow: 3, endColumn: 2 },
        hasTitle: false,
        orderRules: [{ colIndex: 1, type: 0 }],
      });
      await sleep(250);
      const cells = probe();
      applySortResult = {
        commandOk: ok,
        cells,
        formulaSafe:
          cells.A2?.value === 'C'
          && Number(cells.B2?.value) === 1
          && String(cells.C2?.formula ?? '').replace(/^=/, '') === 'B2*10'
          && Number(cells.C2?.value) === 10,
      };
    } catch (err) {
      applySortResult = { error: String(err) };
    }

    // --- Path 3: FWorksheet.moveRows (MoveRowsCommand) ---
    seed();
    await sleep(80);
    let moveRowsResult = null;
    try {
      // moveRows(rowIndex, numRows, destinationIndex) — facade
      const moved = sheet.moveRows(sheet.getRange('4:4'), 1); // row 4 → index 1 (row 2)
      await sleep(300);
      const cells = probe();
      moveRowsResult = {
        moved: moved == null ? null : typeof moved,
        cells,
        formulaRewrittenAtC2:
          String(cells.C2?.formula ?? '').replace(/^=/, '') === 'B2*10'
          && Number(cells.C2?.value) === 10,
        nameAtA2: cells.A2?.value,
        formulaC2: cells.C2?.formula,
        formulaC3: cells.C3?.formula,
        formulaC4: cells.C4?.formula,
      };
    } catch (err) {
      moveRowsResult = { error: String(err) };
    }

    // --- Path 3b: MoveRowsCommand via executeCommand ---
    seed();
    await sleep(80);
    let moveRowsCmdResult = null;
    try {
      sheet.getRange('4:4').activate();
      await sleep(40);
      const ok = await api.executeCommand('sheet.command.move-rows', {
        fromRange: { startRow: 3, endRow: 3, startColumn: 0, endColumn: 0, rangeType: 1 },
        toRange: { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0, rangeType: 1 },
      });
      await sleep(300);
      const cells = probe();
      moveRowsCmdResult = {
        commandOk: ok,
        cells,
        formulaRewrittenAtC2:
          String(cells.C2?.formula ?? '').replace(/^=/, '') === 'B2*10'
          && Number(cells.C2?.value) === 10,
        nameAtA2: cells.A2?.value,
        formulaC2: cells.C2?.formula,
      };
    } catch (err) {
      moveRowsCmdResult = { error: String(err) };
    }

    // --- Path 4: MoveRangeCommand empty→empty ---
    seed();
    await sleep(80);
    let moveRangeResult = null;
    try {
      e.setCellValue('A10', 'C');
      e.setCellValue('B10', 1);
      e.setCellFormula('C10', '=B10*10');
      await sleep(80);
      const ok = await api.executeCommand('sheet.command.move-range', {
        fromRange: { startRow: 9, endRow: 9, startColumn: 0, endColumn: 2 },
        toRange: { startRow: 11, endRow: 11, startColumn: 0, endColumn: 2 },
      });
      await sleep(300);
      const p = e.probeCells(['A12', 'B12', 'C12', 'A10', 'C10']);
      moveRangeResult = {
        commandOk: ok,
        cells: p,
        formulaRewritten:
          String(p.C12?.formula ?? '').replace(/^=/, '') === 'B12*10'
          && Number(p.C12?.value) === 10,
        formulaC12: p.C12?.formula,
        valueC12: p.C12?.value,
      };
    } catch (err) {
      moveRangeResult = { error: String(err) };
    }

    // --- Path 5: MoveRange matrix (relative / abs / mixed) ---
    let moveRangeMatrix = null;
    try {
      e.setCellValue('F1', 100);
      e.setCellValue('A20', 2);
      e.setCellFormula('B20', '=A20*10');
      e.setCellFormula('C20', '=$F$1*A20');
      e.setCellFormula('D20', '=$F20');
      e.setCellFormula('E20', '=F$1');
      await sleep(100);
      const ok = await api.executeCommand('sheet.command.move-range', {
        fromRange: { startRow: 19, endRow: 19, startColumn: 0, endColumn: 4 },
        toRange: { startRow: 24, endRow: 24, startColumn: 0, endColumn: 4 },
      });
      await sleep(300);
      const p = e.probeCells(['A25', 'B25', 'C25', 'D25', 'E25']);
      moveRangeMatrix = {
        commandOk: ok,
        cells: p,
        relativeOk: String(p.B25?.formula ?? '').replace(/^=/, '') === 'A25*10',
        absOk: String(p.C25?.formula ?? '').includes('$F$1')
          && String(p.C25?.formula ?? '').includes('A25'),
        mixedColAbs: p.D25?.formula,
        mixedRowAbs: p.E25?.formula,
      };
    } catch (err) {
      moveRangeMatrix = { error: String(err) };
    }

    // --- Path 6: MoveRows undo stack depth (single move = one undo?) ---
    let moveRowsUndo = null;
    try {
      seed();
      await sleep(80);
      const before = probe();
      sheet.moveRows(sheet.getRange('4:4'), 1);
      await sleep(250);
      const mid = probe();
      await api.undo();
      await sleep(250);
      const afterUndo = probe();
      moveRowsUndo = {
        beforeC2: before.C2,
        midNameA2: mid.A2?.value,
        midC2: mid.C2,
        afterUndoC2: afterUndo.C2,
        afterUndoA2: afterUndo.A2?.value,
        restored: afterUndo.A2?.value === 'A'
          && String(afterUndo.C2?.formula ?? '') === String(before.C2?.formula ?? ''),
      };
    } catch (err) {
      moveRowsUndo = { error: String(err) };
    }

    return {
      afterFacadeSort,
      facadeSortFormulaSafe: facadeSortOk,
      applySortResult,
      moveRowsResult,
      moveRowsCmdResult,
      moveRangeResult,
      moveRangeMatrix,
      moveRowsUndo,
      refMoveIds: [
        'sheet.command.move-range',
        'sheet.command.move-rows',
        'sheet.command.move-cols',
        'sheet.command.insert-row',
        'sheet.command.insert-col',
        'NOT sheet.command.reorder-range',
        'NOT sheet.command.sort-range',
      ],
      sortPluginPresent: typeof range.sort === 'function',
      sheetMoveRowsPresent: typeof sheet.moveRows === 'function',
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2));
  console.log(JSON.stringify({
    out: OUT,
    facadeSortFormulaSafe: report.facadeSortFormulaSafe,
    applySortFormulaSafe: report.applySortResult?.formulaSafe ?? report.applySortResult?.error,
    afterFacadeSortFormulas: {
      C2: report.afterFacadeSort?.C2,
      C3: report.afterFacadeSort?.C3,
      C4: report.afterFacadeSort?.C4,
    },
    moveRows: {
      rewritten: report.moveRowsResult?.formulaRewrittenAtC2,
      nameAtA2: report.moveRowsResult?.nameAtA2,
      formulas: {
        C2: report.moveRowsResult?.formulaC2,
        C3: report.moveRowsResult?.formulaC3,
        C4: report.moveRowsResult?.formulaC4,
      },
      err: report.moveRowsResult?.error,
    },
    moveRowsCmd: {
      ok: report.moveRowsCmdResult?.commandOk,
      rewritten: report.moveRowsCmdResult?.formulaRewrittenAtC2,
      formulaC2: report.moveRowsCmdResult?.formulaC2,
      err: report.moveRowsCmdResult?.error,
    },
    moveRangeRewritten: report.moveRangeResult?.formulaRewritten
      ?? report.moveRangeResult?.error,
    moveRangeFormula: report.moveRangeResult?.formulaC12,
    moveRangeMatrix: report.moveRangeMatrix,
    moveRowsUndoRestored: report.moveRowsUndo?.restored ?? report.moveRowsUndo?.error,
  }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
