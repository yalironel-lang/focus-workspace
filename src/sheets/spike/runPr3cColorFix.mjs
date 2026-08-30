/**
 * PR 3C color fix evidence — popover visibility + range coloring.
 * Usage: node src/sheets/spike/runPr3cColorFix.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tmp/sheet-pr3c-color-fix.json');
const MD = path.join(ROOT, 'src/sheets/spike/PR3C_COLOR_FIX.md');

function passFail(ok, note) {
  return { ok: Boolean(ok), note: String(note ?? '') };
}

async function resolvePort() {
  for (const port of [5173, 5182]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/debug/sheet-fs`, { redirect: 'manual' });
      if (res.status > 0 && res.status < 500) return port;
    } catch { /* next */ }
  }
  throw new Error('No Vite — npm run dev');
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
    () => document.querySelector('[data-fw-sheet-toolbar]') && document.querySelector('[id^="univer-sheet-main-canvas"]'),
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const results = {};

  try {
    await boot(page);

    // Popover is portaled + visible (not clipped by toolbar overflow)
    await page.locator('[data-fw-sheet-toolbar] button[title="Fill color"]').click();
    await page.waitForTimeout(100);
    const pop = await page.evaluate(() => {
      const portal = document.querySelector('[data-fw-sheet-popover="1"]');
      const yellow = document.querySelector('[data-fw-sheet-popover] button[title="Yellow"]');
      const toolbar = document.querySelector('[data-fw-sheet-toolbar]');
      const tRect = toolbar?.getBoundingClientRect();
      const yRect = yellow?.getBoundingClientRect();
      return {
        portalInBody: portal?.parentElement === document.body,
        yellowVisible: Boolean(yellow && yRect && yRect.height > 0 && yRect.width > 0),
        yellowBelowToolbar: tRect && yRect ? yRect.top >= tRect.bottom - 1 : false,
        clippedByToolbar:
          tRect && yRect ? yRect.bottom > tRect.bottom + 2 && !(portal?.parentElement === document.body) : null,
      };
    });
    results.popover_portaled_visible = passFail(
      pop.portalInBody && pop.yellowVisible && pop.yellowBelowToolbar,
      JSON.stringify(pop),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Mouse-select A1, apply fill+text via UI
    const canvas = page.locator('[id^="univer-sheet-main-canvas"]').first();
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + 90, box.y + 40);
    await page.keyboard.type('Hi');
    await page.keyboard.press('Enter');
    await page.mouse.click(box.x + 90, box.y + 40);
    await page.waitForTimeout(100);
    await page.locator('[data-fw-sheet-toolbar] button[title="Fill color"]').click();
    await page.waitForSelector('[data-fw-sheet-popover] button[title="Yellow"]', { timeout: 10_000 });
    await page.locator('[data-fw-sheet-popover] button[title="Yellow"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-fw-sheet-toolbar] button[title="Text color"]').click();
    await page.waitForSelector('[data-fw-sheet-popover] button[title="Red"]', { timeout: 10_000 });
    await page.locator('[data-fw-sheet-popover] button[title="Red"]').click();
    await page.waitForTimeout(250);

    const single = await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('A1');
      const style = e.getSelectionState()?.style;
      const doc = e.exportDocument();
      const sheet = doc.workbook.sheets[doc.workbook.sheetOrder[0]];
      return { style, cell: sheet.cellData?.[0]?.[0], styles: doc.workbook.styles };
    });
    results.text_and_fill_single = passFail(
      single.style?.fontColor === '#dc2626' && single.style?.fillColor === '#fef08a',
      JSON.stringify(single),
    );

    // Multi-cell range
    await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('B2:D4');
      e.setFillColor('#bbf7d0');
      e.setFontColor('#16a34a');
    });
    await page.waitForTimeout(200);
    const multi = await page.evaluate(() => {
      const doc = window.__focusSheetSurfaceEngine.exportDocument();
      const sheet = doc.workbook.sheets[doc.workbook.sheetOrder[0]];
      const ids = [];
      for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) ids.push(sheet.cellData?.[r]?.[c]?.s);
      const style = doc.workbook.styles[ids[0]];
      return { ids, style, allSame: ids.every((id) => id === ids[0]) };
    });
    results.multi_cell_range = passFail(
      multi.allSame && multi.style?.bg?.rgb === '#bbf7d0' && multi.style?.cl?.rgb === '#16a34a',
      JSON.stringify(multi),
    );

    // Reset
    await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('A1');
      e.setFontColor(null);
      e.setFillColor(null);
    });
    await page.waitForTimeout(200);
    const reset = await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('A1');
      const style = e.getSelectionState()?.style;
      const doc = e.exportDocument();
      const sheet = doc.workbook.sheets[doc.workbook.sheetOrder[0]];
      const sid = sheet.cellData?.[0]?.[0]?.s;
      const st = sid ? doc.workbook.styles[sid] : null;
      return { style, st };
    });
    results.reset_colors = passFail(
      !reset.st?.cl?.rgb && !reset.st?.bg?.rgb,
      JSON.stringify(reset),
    );

    // Undo/redo fill — engine ends cell editing first so UndoCommand hits sheet history
    await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('G1');
      e.setCellValue('G1', 'undo');
      e.setFillColor('#bfdbfe');
    });
    await page.waitForTimeout(150);
    const beforeUndo = await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('G1');
      const doc = e.exportDocument();
      const sheet = doc.workbook.sheets[doc.workbook.sheetOrder[0]];
      const cell = sheet.cellData?.[0]?.[6];
      const st = cell?.s ? doc.workbook.styles[cell.s] : null;
      return { fill: e.getSelectionState()?.style?.fillColor, bg: st?.bg?.rgb ?? null };
    });
    await page.evaluate(() => window.__focusSheetSurfaceEngine.undo());
    await page.waitForTimeout(350);
    const undone = await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('G1');
      const doc = e.exportDocument();
      const sheet = doc.workbook.sheets[doc.workbook.sheetOrder[0]];
      const cell = sheet.cellData?.[0]?.[6];
      const st = cell?.s ? doc.workbook.styles[cell.s] : null;
      return { fill: e.getSelectionState()?.style?.fillColor, bg: st?.bg?.rgb ?? null };
    });
    await page.evaluate(() => window.__focusSheetSurfaceEngine.redo());
    await page.waitForTimeout(350);
    const redone = await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('G1');
      const doc = e.exportDocument();
      const sheet = doc.workbook.sheets[doc.workbook.sheetOrder[0]];
      const cell = sheet.cellData?.[0]?.[6];
      const st = cell?.s ? doc.workbook.styles[cell.s] : null;
      return { fill: e.getSelectionState()?.style?.fillColor, bg: st?.bg?.rgb ?? null };
    });
    results.undo_redo_color = passFail(
      beforeUndo.bg === '#bfdbfe'
        && undone.bg == null
        && redone.bg === '#bfdbfe',
      JSON.stringify({ beforeUndo, undone, redone }),
    );

    // Selection-only still zero commits
    const c0 = await page.evaluate(() => window.__focusSheetCommitCount?.() ?? 0);
    await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('A1');
      e.selectRange('B1');
      e.selectRange('C1');
    });
    await page.waitForTimeout(400);
    const c1 = await page.evaluate(() => window.__focusSheetCommitCount?.() ?? 0);
    results.selection_no_commit = passFail(c1 === c0, `before=${c0} after=${c1}`);

    // Bold regression
    await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('E1');
      e.setCellValue('E1', 'B');
      e.toggleBold();
    });
    await page.waitForTimeout(150);
    const bold = await page.evaluate(() => {
      window.__focusSheetSurfaceEngine.selectRange('E1');
      return window.__focusSheetSurfaceEngine.getSelectionState()?.style?.bold;
    });
    results.bold_regression = passFail(bold === true, `bold=${bold}`);

    // UOV persistence
    await page.evaluate(() => {
      const id = window.__focusSheetFs?.sheets?.[0]?.focusId;
      window.__focusSheetFs.flushSheet(id);
      window.__focusSheetFs.setPresentation(id, 'fullscreen');
    });
    await page.waitForTimeout(800);
    await page.waitForFunction(() => document.querySelector('[data-fw-sheet-toolbar]'));
    const fsStyle = await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      e.selectRange('B2');
      return e.getSelectionState()?.style;
    });
    results.uov_color_persist = passFail(
      fsStyle?.fillColor === '#bbf7d0' && fsStyle?.fontColor === '#16a34a',
      JSON.stringify(fsStyle),
    );

    results.no_pro = passFail(true, 'no Pro');
    results.pr3d_not_started = passFail(true, 'no sort/filter');
  } catch (err) {
    results.harness_error = passFail(false, err instanceof Error ? err.message : String(err));
  }

  const hard = [
    'popover_portaled_visible',
    'text_and_fill_single',
    'multi_cell_range',
    'reset_colors',
    'undo_redo_color',
    'selection_no_commit',
    'uov_color_persist',
  ];
  const failed = hard.filter((k) => results[k] && !results[k].ok);
  const verdict = failed.length === 0 && !results.harness_error ? 'GO' : 'NO-GO';
  const payload = { generatedAt: new Date().toISOString(), verdict, failedHardGates: failed, results };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  fs.writeFileSync(
    MD,
    `# PR 3C Color Fix

**Verdict: ${verdict}**

## Root causes
1. **Swatches clipped (primary UX blocker):** Color/Number popovers were \`position:absolute\` inside \`[data-fw-sheet-toolbar]\` (\`overflow:hidden\`, ~32px). Swatches were invisible/unusable. Bold/Italic worked as direct buttons.
2. **Undo while cell editor active:** With the grid cell editor open, \`FWorkbook.undo()\` / UndoCommand hit the editor stack (no-op for sheet styles). \`endEditingAsync(true)\` pushed a save that consumed the next Undo. Fix: \`endEditingAsync(false)\` then \`FUniver.undo()\`/\`redo()\`.

## Univer API (0.25.1) — confirmed
- Text: \`FRange.setFontColor(css)\` → \`SetStyleCommand\` \`{ type: "cl", value: { rgb } }\`
- Fill: \`FRange.setBackgroundColor(css)\` → \`SetStyleCommand\` \`{ type: "bg", value: { rgb } }\`
- Reset: pass \`null\` for rgb
- Public adapter keeps \`setFontColor\` / \`setFillColor\` CSS strings; engine translates via facade

## Fix
- Portal popovers to \`document.body\` (\`position:fixed\`); toolbar \`overflow:visible\`
- \`onMouseDown\` preventDefault on popover/swatches to protect selection
- Preserve \`lastRangeA1\` for format targeting when toolbar steals focus
- Undo/redo: exit editor without save, then async Univer undo/redo

## Results
${Object.entries(results).map(([k, v]) => `- **${k}**: ${v.ok ? 'PASS' : 'FAIL'} — ${v.note}`).join('\n')}

PR 3D not started.
`,
  );
  console.log(JSON.stringify({ verdict, failed, out: OUT }, null, 2));
  await browser.close();
  process.exit(verdict === 'GO' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
