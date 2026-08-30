/**
 * PR2 change-detection + remount evidence.
 * Usage: node src/sheets/spike/runChangeDetection.mjs
 */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'tmp/sheet-change-detection.json');
const OUT_MD = path.join(ROOT, 'src/sheets/spike/CHANGE_DETECTION.md');

function passFail(ok, note) {
  return { ok, note };
}

async function main() {
  const server = await createServer({
    root: ROOT,
    server: { port: 5180, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  const url = 'http://127.0.0.1:5180/debug/sheet-spike';
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

  // Typing: count mutations around keyboard input
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

  const rows = gate?.rows ?? {};
  const table = {
    setCellValue: passFail(rows.setCellValue > 0, `mutationEvents=${rows.setCellValue}`),
    formulaEdit: passFail(rows.formula > 0, `mutationEvents=${rows.formula}`),
    paste: passFail(rows.paste > 0, `mutationEvents=${rows.paste}`),
    clear: passFail(rows.clear > 0, `mutationEvents=${rows.clear}`),
    undo: passFail(rows.undo > 0, `mutationEvents=${rows.undo}`),
    redo: passFail(rows.redo > 0, `mutationEvents=${rows.redo}`),
    selectionOnly: passFail(rows.selection === 0, `mutationEvents=${rows.selection} (expect 0)`),
    typing: passFail(typingAfter.mutations > typing.mutationsBeforeType, `mutations ${typing.mutationsBeforeType} → ${typingAfter.mutations}`),
    remountIds: passFail(
      idRoundTrip.before.workbookId === idRoundTrip.after.workbookId
        && idRoundTrip.before.worksheetId === idRoundTrip.after.worksheetId
        && Boolean(idRoundTrip.before.workbookId),
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
    mechanism: 'FWorkbook.onCommandExecuted filtered to CommandType.MUTATION (type===2). OPERATION (type===1) ignored.',
    gate,
    typingAfter,
    idRoundTrip,
    formulaRoundTrip,
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

| Mutation | Result | Notes |
|----------|--------|-------|
| setCellValue | ${table.setCellValue.ok ? 'PASS' : 'FAIL'} | ${table.setCellValue.note} |
| formula edit | ${table.formulaEdit.ok ? 'PASS' : 'FAIL'} | ${table.formulaEdit.note} |
| multi-cell paste (setValues) | ${table.paste.ok ? 'PASS' : 'FAIL'} | ${table.paste.note} |
| clear/delete | ${table.clear.ok ? 'PASS' : 'FAIL'} | ${table.clear.note} |
| undo | ${table.undo.ok ? 'PASS' : 'FAIL'} | ${table.undo.note} |
| redo | ${table.redo.ok ? 'PASS' : 'FAIL'} | ${table.redo.note} |
| typing/edit | ${table.typing.ok ? 'PASS' : 'FAIL'} | ${table.typing.note} |
| selection-only | ${table.selectionOnly.ok ? 'PASS' : 'FAIL'} | ${table.selectionOnly.note} |

Remount ID preserve: ${table.remountIds.ok ? 'PASS' : 'FAIL'} ${table.remountIds.note}

Formula remount: ${table.formulaRemount.ok ? 'PASS' : 'FAIL'} ${table.formulaRemount.note}

Observed commands (gate): \`${JSON.stringify(gate?.observed?.slice(-16) ?? [])}\`

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
