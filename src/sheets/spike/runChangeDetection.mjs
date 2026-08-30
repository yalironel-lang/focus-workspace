/**
 * PR2 change-detection + remount + clipboard/structure evidence.
 * Usage: node src/sheets/spike/runChangeDetection.mjs
 */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'tmp/sheet-change-detection.json');
const OUT_MD = path.join(ROOT, 'src/sheets/spike/CHANGE_DETECTION.md');
const TSV = 'CP1\tCP2\nCP3\tCP4';
const HTML_TABLE =
  '<table><tr><td>CP1</td><td>CP2</td></tr><tr><td>CP3</td><td>CP4</td></tr></table>';

function passFail(ok, note) {
  return { ok, note };
}

function cellsHavePaste(cells) {
  const vals = ['A20', 'B20', 'A21', 'B21'].map((ref) => String(cells?.[ref]?.value ?? ''));
  return vals.includes('CP1') && vals.includes('CP2') && vals.includes('CP3') && vals.includes('CP4');
}

async function runClipboardPaste(page, origin) {
  const result = {
    pathUsed: 'none',
    clipboardWriteOk: false,
    keyboardPasteAttempted: false,
    nativeCmdVLimitation: null,
    cells: null,
    mutations: [],
    observed: [],
    onDocumentChangedFired: false,
    changeFires: 0,
  };

  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  } catch (err) {
    result.nativeCmdVLimitation = `grantPermissions failed: ${String(err)}`;
  }

  await page.evaluate(() => {
    window.__focusSheetChangeFires = 0;
    const engine = window.__focusSheetEngine;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    engine.selectRange('A20');
  });
  await page.waitForTimeout(250);

  const host = page.locator('div.w-full.h-full').first();
  await host.click({ position: { x: 90, y: 220 } });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__focusSheetEngine.selectRange('A20'));
  await page.waitForTimeout(150);

  try {
    result.clipboardWriteOk = await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
      return (await navigator.clipboard.readText()) === text;
    }, TSV);
  } catch (err) {
    result.clipboardWriteOk = false;
    result.nativeCmdVLimitation = [
      result.nativeCmdVLimitation,
      `navigator.clipboard.writeText failed: ${String(err)}`,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  if (result.clipboardWriteOk) {
    result.keyboardPasteAttempted = true;
    await page.keyboard.press('ControlOrMeta+v');
    await page.waitForTimeout(700);
    const afterKb = await page.evaluate(() => ({
      cells: window.__focusSheetEngine.probeCells(['A20', 'B20', 'A21', 'B21']),
      mutations: window.__focusSheetEngine.lastMutationCommands.slice(),
      observed: window.__focusSheetEngine.lastObservedCommands.slice(),
      fires: window.__focusSheetChangeFires ?? 0,
    }));
    result.cells = afterKb.cells;
    result.mutations = afterKb.mutations;
    result.observed = afterKb.observed;
    result.changeFires = afterKb.fires;
    result.onDocumentChangedFired = afterKb.fires > 0;
    if (cellsHavePaste(afterKb.cells) && afterKb.mutations.some((c) => c.type === 2)) {
      result.pathUsed = 'navigator.clipboard.writeText + ControlOrMeta+v';
      return result;
    }
    result.nativeCmdVLimitation = [
      result.nativeCmdVLimitation,
      'ControlOrMeta+v did not land a 2x2 grid (headless Chrome often cannot inject OS clipboard into Univer paste). Falling back to a bubbling ClipboardEvent with text/plain TSV + text/html table — not adapter.setValues.',
    ]
      .filter(Boolean)
      .join(' | ');
  } else {
    result.nativeCmdVLimitation = [
      result.nativeCmdVLimitation,
      'Could not write the system clipboard. Falling back to a bubbling ClipboardEvent with DataTransfer — not adapter.setValues.',
    ]
      .filter(Boolean)
      .join(' | ');
  }

  await page.evaluate(() => {
    window.__focusSheetChangeFires = 0;
    const engine = window.__focusSheetEngine;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    engine.selectRange('A20');
  });
  await page.waitForTimeout(200);
  await host.click({ position: { x: 90, y: 220 } });
  await page.evaluate(() => window.__focusSheetEngine.selectRange('A20'));
  await page.waitForTimeout(150);

  const afterDom = await page.evaluate(
    ({ text, html }) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      dt.setData('text/html', html);
      const ev = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      const targets = [
        document.activeElement,
        document.querySelector('.univer-workbench-container'),
        document.querySelector('[data-u-comp="sheet"]'),
        document.body,
      ].filter(Boolean);
      for (const t of targets) t.dispatchEvent(ev);
      window.dispatchEvent(ev);
    },
    { text: TSV, html: HTML_TABLE },
  );
  void afterDom;
  await page.waitForTimeout(700);

  const afterEvent = await page.evaluate(() => ({
    cells: window.__focusSheetEngine.probeCells(['A20', 'B20', 'A21', 'B21']),
    mutations: window.__focusSheetEngine.lastMutationCommands.slice(),
    observed: window.__focusSheetEngine.lastObservedCommands.slice(),
    fires: window.__focusSheetChangeFires ?? 0,
  }));
  result.cells = afterEvent.cells;
  result.mutations = afterEvent.mutations;
  result.observed = afterEvent.observed;
  result.changeFires = afterEvent.fires;
  result.onDocumentChangedFired = afterEvent.fires > 0;
  if (cellsHavePaste(afterEvent.cells) && afterEvent.mutations.some((c) => c.type === 2)) {
    result.pathUsed = 'ClipboardEvent paste (text/plain TSV + text/html table) on focused sheet';
  } else {
    result.pathUsed = 'failed';
  }
  return result;
}

async function main() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5180, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  const origin = 'http://127.0.0.1:5180';
  const url = `${origin}/debug/sheet-spike`;
  console.log('Dev server', url);

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const consoleMsgs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleMsgs.push(msg.text().slice(0, 240));
  });
  page.on('pageerror', (err) => consoleMsgs.push(err.message.slice(0, 240)));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForSelector('text=Focus Sheets — PR2 engine harness', { timeout: 60_000 });

  await page.getByRole('button', { name: 'Mount empty' }).click();
  await page.waitForTimeout(2000);

  const idRoundTrip = await page.evaluate(async () => {
    const engine = window.__focusSheetEngine;
    if (!engine) throw new Error('engine missing');
    const before = engine.exportDocument();
    const json = JSON.parse(JSON.stringify(before));
    const host = document.querySelector('[style*="min-height"]');
    engine.dispose();
    await engine.mount(host, json);
    await new Promise((r) => setTimeout(r, 400));
    const after = engine.exportDocument();
    const readIds = (doc) => {
      const wb = doc.workbook || {};
      const ws = Array.isArray(wb.sheetOrder) ? wb.sheetOrder[0] : null;
      return { workbookId: wb.id ?? null, worksheetId: ws };
    };
    return { before: readIds(before), after: readIds(after) };
  });

  await page.getByRole('button', { name: 'Run change-detection gate' }).click();
  await page.waitForSelector('text=Change-detection gate done', { timeout: 60_000 });
  const gate = await page.evaluate(() => window.__focusSheetChangeGate);

  const typing = await page.evaluate(async () => {
    const engine = window.__focusSheetEngine;
    if (!engine) throw new Error('engine missing');
    engine.lastMutationCommands = [];
    const host = document.querySelector('[style*="min-height"]');
    host?.click();
    await new Promise((r) => setTimeout(r, 200));
    return { mutationsBeforeType: engine.lastMutationCommands.length };
  });
  const host = page.locator('div.w-full.h-full').first();
  await host.click({ position: { x: 140, y: 140 } });
  await page.keyboard.type('99');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const typingAfter = await page.evaluate(() => ({
    mutations: window.__focusSheetEngine?.lastMutationCommands?.length ?? 0,
    last: window.__focusSheetEngine?.lastMutationCommands?.slice(-6) ?? [],
    observed: window.__focusSheetEngine?.lastObservedCommands?.slice(-10) ?? [],
  }));

  const formulaRoundTrip = await page.evaluate(async () => {
    const engine = window.__focusSheetEngine;
    if (!engine) throw new Error('engine missing');
    engine.setCellValue('A1', 10);
    engine.setCellValue('B1', 20);
    engine.setCellFormula('C1', '=A1+B1');
    await new Promise((r) => setTimeout(r, 500));
    const exported = JSON.parse(JSON.stringify(engine.exportDocument()));
    const host = document.querySelector('[style*="min-height"]');
    engine.dispose();
    await engine.mount(host, exported);
    await new Promise((r) => setTimeout(r, 600));
    const c1 = engine.probeCells(['C1']).C1;
    return { formula: c1.formula, value: c1.value };
  });

  const clipboardPaste = await runClipboardPaste(page, origin);

  await page.evaluate(() => {
    window.__focusSheetChangeFires = 0;
    const engine = window.__focusSheetEngine;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    engine.setCellValue('A5', 'keep-row');
    engine.setCellValue('E1', 'keep-col');
  });
  await page.waitForTimeout(300);

  const format = await page.evaluate(async () => {
    const engine = window.__focusSheetEngine;
    window.__focusSheetChangeFires = 0;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    engine.setCellValue('D10', 'fmt');
    await new Promise((r) => setTimeout(r, 200));
    window.__focusSheetChangeFires = 0;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    engine.setCellFontWeight('D10', 'bold');
    await new Promise((r) => setTimeout(r, 400));
    return {
      succeeded: true,
      onDocumentChangedFired: (window.__focusSheetChangeFires ?? 0) > 0,
      changeFires: window.__focusSheetChangeFires ?? 0,
      mutations: engine.lastMutationCommands.slice(),
      observed: engine.lastObservedCommands.slice(),
    };
  });

  const insertRowsReal = await page.evaluate(async () => {
    const engine = window.__focusSheetEngine;
    window.__focusSheetChangeFires = 0;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    const before = engine.probeCells(['A5', 'A6']);
    engine.insertRows(0, 1);
    await new Promise((r) => setTimeout(r, 400));
    const after = engine.probeCells(['A5', 'A6']);
    return {
      succeeded: true,
      shifted: String(after.A6?.value) === 'keep-row' || String(after.A5?.value) !== 'keep-row',
      before,
      after,
      onDocumentChangedFired: (window.__focusSheetChangeFires ?? 0) > 0,
      changeFires: window.__focusSheetChangeFires ?? 0,
      mutations: engine.lastMutationCommands.slice(),
      observed: engine.lastObservedCommands.slice(),
    };
  });

  const deleteRowsReal = await page.evaluate(async () => {
    const engine = window.__focusSheetEngine;
    window.__focusSheetChangeFires = 0;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    engine.deleteRows(0, 1);
    await new Promise((r) => setTimeout(r, 400));
    return {
      succeeded: true,
      onDocumentChangedFired: (window.__focusSheetChangeFires ?? 0) > 0,
      changeFires: window.__focusSheetChangeFires ?? 0,
      mutations: engine.lastMutationCommands.slice(),
      observed: engine.lastObservedCommands.slice(),
    };
  });

  const insertColumnsReal = await page.evaluate(async () => {
    const engine = window.__focusSheetEngine;
    window.__focusSheetChangeFires = 0;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    const before = engine.probeCells(['E1', 'F1']);
    engine.insertColumns(0, 1);
    await new Promise((r) => setTimeout(r, 400));
    const after = engine.probeCells(['E1', 'F1']);
    return {
      succeeded: true,
      before,
      after,
      onDocumentChangedFired: (window.__focusSheetChangeFires ?? 0) > 0,
      changeFires: window.__focusSheetChangeFires ?? 0,
      mutations: engine.lastMutationCommands.slice(),
      observed: engine.lastObservedCommands.slice(),
    };
  });

  const deleteColumnsReal = await page.evaluate(async () => {
    const engine = window.__focusSheetEngine;
    window.__focusSheetChangeFires = 0;
    engine.lastObservedCommands = [];
    engine.lastMutationCommands = [];
    engine.deleteColumns(0, 1);
    await new Promise((r) => setTimeout(r, 400));
    return {
      succeeded: true,
      onDocumentChangedFired: (window.__focusSheetChangeFires ?? 0) > 0,
      changeFires: window.__focusSheetChangeFires ?? 0,
      mutations: engine.lastMutationCommands.slice(),
      observed: engine.lastObservedCommands.slice(),
    };
  });

  const rows = gate?.rows ?? {};
  const pasteOk =
    clipboardPaste.pathUsed !== 'failed' &&
    cellsHavePaste(clipboardPaste.cells) &&
    clipboardPaste.mutations.some((c) => c.type === 2) &&
    clipboardPaste.onDocumentChangedFired;

  const mutOk = (op) =>
    op.succeeded &&
    op.onDocumentChangedFired &&
    (op.mutations ?? []).some((c) => c.type === 2);

  const table = {
    setCellValue: passFail(rows.setCellValue > 0, `mutationEvents=${rows.setCellValue}`),
    formulaEdit: passFail(rows.formula > 0, `mutationEvents=${rows.formula}`),
    adapterSetValues: passFail(
      (rows.adapterSetValues ?? rows.paste) > 0,
      `mutationEvents=${rows.adapterSetValues ?? rows.paste} (not GATE 1)`,
    ),
    clipboardPaste: passFail(
      pasteOk,
      `path=${clipboardPaste.pathUsed}; cells=${JSON.stringify(clipboardPaste.cells)}; mutations=${JSON.stringify(clipboardPaste.mutations)}; limitation=${clipboardPaste.nativeCmdVLimitation ?? 'none'}`,
    ),
    clear: passFail(rows.clear > 0, `mutationEvents=${rows.clear}`),
    undo: passFail(rows.undo > 0, `mutationEvents=${rows.undo}`),
    redo: passFail(rows.redo > 0, `mutationEvents=${rows.redo}`),
    selectionOnly: passFail(rows.selection === 0, `mutationEvents=${rows.selection} (expect 0)`),
    typing: passFail(
      typingAfter.mutations > typing.mutationsBeforeType,
      `mutations ${typing.mutationsBeforeType} → ${typingAfter.mutations}`,
    ),
    formatBold: passFail(
      mutOk(format),
      `mutations=${JSON.stringify(format.mutations)} fires=${format.changeFires}`,
    ),
    insertRows: passFail(
      mutOk(insertRowsReal),
      `mutations=${JSON.stringify(insertRowsReal.mutations)} fires=${insertRowsReal.changeFires} shifted=${insertRowsReal.shifted}`,
    ),
    deleteRows: passFail(
      mutOk(deleteRowsReal),
      `mutations=${JSON.stringify(deleteRowsReal.mutations)} fires=${deleteRowsReal.changeFires}`,
    ),
    insertColumns: passFail(
      mutOk(insertColumnsReal),
      `mutations=${JSON.stringify(insertColumnsReal.mutations)} fires=${insertColumnsReal.changeFires}`,
    ),
    deleteColumns: passFail(
      mutOk(deleteColumnsReal),
      `mutations=${JSON.stringify(deleteColumnsReal.mutations)} fires=${deleteColumnsReal.changeFires}`,
    ),
    remountIds: passFail(
      idRoundTrip.before.workbookId === idRoundTrip.after.workbookId &&
        idRoundTrip.before.worksheetId === idRoundTrip.after.worksheetId &&
        Boolean(idRoundTrip.before.workbookId),
      JSON.stringify(idRoundTrip),
    ),
    formulaRemount: passFail(
      formulaRoundTrip.formula === '=A1+B1' && Number(formulaRoundTrip.value) === 30,
      JSON.stringify(formulaRoundTrip),
    ),
  };

  const allOk = Object.values(table).every((r) => r.ok);
  const evidence = {
    generatedAt: new Date().toISOString(),
    mechanism:
      'FWorkbook.onCommandExecuted filtered to CommandType.MUTATION (type===2). OPERATION (type===1) ignored.',
    gate,
    typingAfter,
    idRoundTrip,
    formulaRoundTrip,
    clipboardPaste,
    structure: { format, insertRowsReal, deleteRowsReal, insertColumnsReal, deleteColumnsReal },
    table,
    verdict: allOk ? 'GO' : 'NO-GO',
    consoleMsgs: consoleMsgs.slice(0, 15),
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(evidence, null, 2));

  const md = `# Change-detection evidence (PR 2)

**Question:** Can Focus reliably know that persistent spreadsheet content changed?

**Mechanism:** subscribe to Univer \`FWorkbook.onCommandExecuted\` and emit \`onDocumentChanged\` only when \`command.type === CommandType.MUTATION\` (2). Univer documents MUTATION as snapshot-persisted change and OPERATION as non-snapshot (selection, scroll).

**Verdict:** **${evidence.verdict}**

## GATE 1 — real clipboard paste

- Path used: \`${clipboardPaste.pathUsed}\`
- Limitation: ${clipboardPaste.nativeCmdVLimitation ?? 'none'}
- Multi-cell values: ${cellsHavePaste(clipboardPaste.cells) ? 'PASS' : 'FAIL'} \`${JSON.stringify(clipboardPaste.cells)}\`
- onDocumentChanged: ${clipboardPaste.onDocumentChangedFired ? 'PASS' : 'FAIL'} (fires=${clipboardPaste.changeFires})
- Mutations: \`${JSON.stringify(clipboardPaste.mutations)}\`
- Observed (incl. non-mutations): \`${JSON.stringify(clipboardPaste.observed?.slice(-16) ?? [])}\`

This gate does **not** use \`setValues\` / \`pasteValues\`.

## GATE 2 — non-cell persistent mutations

| Operation | Result | Command ids/types | onDocumentChanged |
|-----------|--------|-------------------|-------------------|
| cell formatting (bold) | ${table.formatBold.ok ? 'PASS' : 'FAIL'} | \`${JSON.stringify(format.mutations)}\` | ${format.onDocumentChangedFired} |
| row insert | ${table.insertRows.ok ? 'PASS' : 'FAIL'} | \`${JSON.stringify(insertRowsReal.mutations)}\` | ${insertRowsReal.onDocumentChangedFired} |
| row delete | ${table.deleteRows.ok ? 'PASS' : 'FAIL'} | \`${JSON.stringify(deleteRowsReal.mutations)}\` | ${deleteRowsReal.onDocumentChangedFired} |
| column insert | ${table.insertColumns.ok ? 'PASS' : 'FAIL'} | \`${JSON.stringify(insertColumnsReal.mutations)}\` | ${insertColumnsReal.onDocumentChangedFired} |
| column delete | ${table.deleteColumns.ok ? 'PASS' : 'FAIL'} | \`${JSON.stringify(deleteColumnsReal.mutations)}\` | ${deleteColumnsReal.onDocumentChangedFired} |

## Prior cell-value gates

| Mutation | Result | Notes |
|----------|--------|-------|
| setCellValue | ${table.setCellValue.ok ? 'PASS' : 'FAIL'} | ${table.setCellValue.note} |
| formula edit | ${table.formulaEdit.ok ? 'PASS' : 'FAIL'} | ${table.formulaEdit.note} |
| adapter setValues (not clipboard) | ${table.adapterSetValues.ok ? 'PASS' : 'FAIL'} | ${table.adapterSetValues.note} |
| clipboard paste | ${table.clipboardPaste.ok ? 'PASS' : 'FAIL'} | see GATE 1 |
| clear/delete | ${table.clear.ok ? 'PASS' : 'FAIL'} | ${table.clear.note} |
| undo | ${table.undo.ok ? 'PASS' : 'FAIL'} | ${table.undo.note} |
| redo | ${table.redo.ok ? 'PASS' : 'FAIL'} | ${table.redo.note} |
| typing/edit | ${table.typing.ok ? 'PASS' : 'FAIL'} | ${table.typing.note} |
| selection-only | ${table.selectionOnly.ok ? 'PASS' : 'FAIL'} | ${table.selectionOnly.note} |

Remount ID preserve: ${table.remountIds.ok ? 'PASS' : 'FAIL'} ${table.remountIds.note}

Formula remount: ${table.formulaRemount.ok ? 'PASS' : 'FAIL'} ${table.formulaRemount.note}

Observed commands (in-page gate): \`${JSON.stringify(gate?.observed?.slice(-16) ?? [])}\`

This is **not** continuous full-workbook export.
`;
  fs.writeFileSync(OUT_MD, md);
  console.log(md);
  console.log('Wrote', OUT_JSON, OUT_MD);

  await browser.close();
  await server.close();
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
