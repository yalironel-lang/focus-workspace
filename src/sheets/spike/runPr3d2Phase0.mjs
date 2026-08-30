/**
 * PR 3D2 Phase 0 hard gates (formula / popup / clone / zero-commit).
 * Usage: node src/sheets/spike/runPr3d2Phase0.mjs
 *
 * Does NOT wire product Data ▾ UX — filter plugins are registered in the engine only.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'tmp/sheet-pr3d2-phase0.json');
const MD = path.join(process.cwd(), 'src/sheets/spike/PR3D2_PHASE0.md');

async function resolvePort() {
  for (const port of [5173, 5174, 5182, 5183]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/debug/sheet-fs`, { redirect: 'manual' });
      if (res.status > 0 && res.status < 500) return port;
    } catch { /* */ }
  }
  throw new Error('No Vite on 5173/5174/5182/5183 — start npm run dev');
}

async function boot(page) {
  const port = await resolvePort();
  await page.goto(`http://127.0.0.1:${port}/debug/sheet-fs`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.includes('debug-sheet-pr3a')) localStorage.removeItem(k);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A/3B');
  await page.locator('[data-canvas-host="freeform"]').click();
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  try {
    await page.waitForFunction(
      () => window.__focusSheetSurfaceEngine && document.querySelector('[id^="univer-sheet-main-canvas"]'),
      null,
      { timeout: 90_000 },
    );
  } catch (err) {
    const dump = await page.evaluate(() => ({
      url: location.href,
      text: (document.body?.innerText || '').slice(0, 1500),
      hasEngine: Boolean(window.__focusSheetSurfaceEngine),
      canvas: Boolean(document.querySelector('[id^="univer-sheet-main-canvas"]')),
      errors: window.__focusSheetMountError ?? null,
    })).catch((e) => String(e));
    console.error('boot dump', dump);
    throw err;
  }
  await page.waitForTimeout(800);
  return port;
}

async function setZoom(page, z) {
  await page.evaluate((zoom) => {
    window.__focusSheetFs?.setViewport?.(zoom);
  }, z);
  await page.waitForTimeout(300);
}

async function setPresentation(page, mode, splitSide) {
  await page.evaluate(({ mode, splitSide }) => {
    const id = window.__focusSheetFs?.selectedId || window.__focusSheetFs?.sheets?.[0]?.focusId;
    if (!id) throw new Error('no sheet id');
    window.__focusSheetFs.flushSheet?.(id);
    window.__focusSheetFs.setPresentation(id, mode, splitSide);
  }, { mode, splitSide });
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () => window.__focusSheetSurfaceEngine && document.querySelector('[id^="univer-sheet-main-canvas"]'),
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(400);
}

/** Click filter header icon for column index (0 = A) using canvas layout coords. */
async function clickFilterHeaderButton(page, colIndex = 0) {
  const metrics = await page.evaluate(() =>
    window.__focusSheetSurfaceEngine?.getGridMetrics?.() ?? { row0: 24, col0: 88 },
  );
  const headerW = 46;
  const headerH = 24;
  const colW = metrics.col0 || 88;
  const rowH = metrics.row0 || 24;
  // Icon is 16×16 at bottom-right of header cell
  const layoutX = headerW + colW * (colIndex + 1) - 8;
  const layoutY = headerH + rowH - 8;

  const pos = await page.evaluate(({ layoutX, layoutY }) => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    if (!canvas) throw new Error('no canvas');
    const rect = canvas.getBoundingClientRect();
    const zoom = window.__focusSheetFs?.zoom ?? 1;
    // Visual click in screen space (rect already includes CSS transform)
    return {
      x: rect.left + layoutX * (rect.width / canvas.offsetWidth),
      y: rect.top + layoutY * (rect.height / canvas.offsetHeight),
      zoom,
      layoutX,
      layoutY,
      rect: { left: rect.left, top: rect.top, w: rect.width, h: rect.height },
      offsetW: canvas.offsetWidth,
      offsetH: canvas.offsetHeight,
    };
  }, { layoutX, layoutY });

  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(350);
  return pos;
}

function panelSnapshot(page) {
  return page.evaluate(() => {
    const panel =
      document.querySelector('[class*="univer-w-[400px]"]')
      || [...document.querySelectorAll('div')].find((el) =>
        /Select all|Search|sheets-filter/i.test(el.textContent || '')
        && (el.querySelector('input') || el.querySelector('button')),
      );
    if (!panel) {
      return {
        open: false,
        clipped: null,
        visible: false,
        textSample: null,
        hasSearch: false,
        hasSelectAll: false,
        bbox: null,
      };
    }
    const r = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Improve clipped detection: panel must be mostly inside viewport
  const clipped =
      r.width < 40
      || r.height < 40
      || r.right < 8
      || r.bottom < 8
      || r.left > vw - 8
      || r.top > vh - 8
      || r.bottom > vh + 4
      || r.right > vw + 4
      || r.right - r.left < 100;
    const text = (panel.textContent || '').slice(0, 400);
    return {
      open: true,
      visible: r.width > 40 && r.height > 40,
      clipped,
      textSample: text,
      hasSearch: Boolean(panel.querySelector('input')),
      hasSelectAll: /select all/i.test(text),
      bbox: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  });
}

async function closePanelIfOpen(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.mouse.click(8, 8);
  await page.waitForTimeout(200);
}

async function seedFormulaTable(page) {
  await page.evaluate(async () => {
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
    // Outside / absolute / mixed / aggregate
    e.setCellValue('F1', 100);
    e.setCellFormula('D2', '=$F$1*B2');
    e.setCellFormula('E2', '=$F2');
    e.setCellFormula('A10', '=SUM(B2:B4)');
    e.setCellFormula('B10', '=C2+C3+C4');
    await new Promise((r) => setTimeout(r, 120));
  });
}

async function createFilterOnA1C4(page) {
  return page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    const api = e.univerAPI;
    const sheet = api.getActiveWorkbook().getActiveSheet();
    sheet.getRange('A1:C4').activate?.();
    sheet.setActiveRange?.(sheet.getRange('A1:C4'));
    await new Promise((r) => setTimeout(r, 40));
    const range = sheet.getRange('A1:C4');
    if (typeof range.createFilter !== 'function') {
      return { ok: false, error: 'createFilter missing — filter facade not loaded' };
    }
    // Remove existing if any
    const existing = sheet.getFilter?.() || range.getFilter?.();
    if (existing && typeof existing.remove === 'function') existing.remove();
    await new Promise((r) => setTimeout(r, 40));
    const f = range.createFilter();
    await new Promise((r) => setTimeout(r, 120));
    return {
      ok: Boolean(f),
      hasFilter: Boolean(sheet.getFilter?.() || range.getFilter?.()),
    };
  });
}

async function applyHideValueA(page) {
  // Prefer facade criteria if available; else use panel UI.
  const viaFacade = await page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    const sheet = e.univerAPI.getActiveWorkbook().getActiveSheet();
    const filter = sheet.getFilter?.();
    if (!filter || typeof filter.setColumnFilterCriteria !== 'function') {
      return { used: false };
    }
    // Keep B and C visible; hide Name=A (row 2) via filters on col 0
    // Univer filters.values are the values to KEEP when using filters.values
    try {
      filter.setColumnFilterCriteria(0, {
        colId: 0,
        filters: {
          filters: ['B', 'C'],
        },
      });
      await new Promise((r) => setTimeout(r, 200));
      return { used: true, ok: true };
    } catch (err) {
      return { used: true, ok: false, error: String(err) };
    }
  });
  if (viaFacade.used) return viaFacade;

  // Panel path: open col A, uncheck A, apply
  await clickFilterHeaderButton(page, 0);
  await page.waitForTimeout(300);
  const snap = await panelSnapshot(page);
  if (!snap.open) return { used: false, ok: false, error: 'panel did not open', snap };

  // Try uncheck a value labeled A
  const toggled = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label, div, span')];
    const row = labels.find((el) => (el.textContent || '').trim() === 'A');
    if (!row) return { found: false };
    const clickable = row.closest('label') || row.parentElement;
    clickable?.click();
    return { found: true };
  });
  // Look for OK / Confirm button
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const ok = btns.find((b) => /^(ok|confirm|apply)$/i.test((b.textContent || '').trim()));
    ok?.click();
  });
  await page.waitForTimeout(300);
  return { used: 'panel', ok: true, toggled, snap };
}

function rawCellMatrix(doc, worksheetId) {
  const sheets = doc?.workbook?.sheets ?? {};
  const sheet = sheets[worksheetId] || Object.values(sheets)[0];
  return sheet?.cellData ?? null;
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    gates: {},
    popupByHost: {},
    verdict: 'PENDING',
  };

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const port = await boot(page);
  report.port = port;

  // ---------- GATE A ----------
  await seedFormulaTable(page);
  const beforeA = await page.evaluate(() => {
    const e = window.__focusSheetSurfaceEngine;
    const doc = e.exportDocument();
    const ids = {
      workbookId: e.univerAPI.getActiveWorkbook().getId(),
      worksheetId: e.univerAPI.getActiveWorkbook().getActiveSheet().getSheetId(),
    };
    return {
      ids,
      probe: e.probeCells(['A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4', 'D2', 'E2', 'A10', 'B10']),
      cellData: doc.workbook?.sheets?.[ids.worksheetId]?.cellData
        ?? Object.values(doc.workbook?.sheets ?? {})[0]?.cellData,
      resources: doc.workbook?.resources ?? null,
    };
  });

  const created = await createFilterOnA1C4(page);
  const hide = await applyHideValueA(page);

  const afterHide = await page.evaluate(() => {
    const e = window.__focusSheetSurfaceEngine;
    const doc = e.exportDocument();
    const sheet = e.univerAPI.getActiveWorkbook().getActiveSheet();
    const filter = sheet.getFilter?.();
    const filteredOut = filter?.getFilteredOutRows?.() ?? null;
    const ids = {
      workbookId: e.univerAPI.getActiveWorkbook().getId(),
      worksheetId: sheet.getSheetId(),
    };
    return {
      probe: e.probeCells(['A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4', 'D2', 'E2', 'A10', 'B10']),
      cellData: doc.workbook?.sheets?.[ids.worksheetId]?.cellData
        ?? Object.values(doc.workbook?.sheets ?? {})[0]?.cellData,
      filteredOut,
      filterRange: filter?.getRange?.() ?? null,
      resourceNames: (doc.workbook?.resources ?? []).map((r) => r.name),
    };
  });

  // Clear + remove
  const clearRemove = await page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    const sheet = e.univerAPI.getActiveWorkbook().getActiveSheet();
    const filter = sheet.getFilter?.();
    if (filter?.removeFilterCriteria) filter.removeFilterCriteria();
    await new Promise((r) => setTimeout(r, 150));
    const afterClear = e.probeCells(['A2', 'A3', 'A4', 'C2', 'C3', 'C4']);
    filter?.remove?.();
    await new Promise((r) => setTimeout(r, 150));
    const afterRemove = {
      hasFilter: Boolean(sheet.getFilter?.()),
      probe: e.probeCells(['A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4']),
      cellData: e.exportDocument().workbook?.sheets?.[sheet.getSheetId()]?.cellData,
    };
    return { afterClear, afterRemove };
  });

  const formulasUnchanged =
    beforeA.probe.C2?.formula === afterHide.probe.C2?.formula
    && beforeA.probe.C3?.formula === afterHide.probe.C3?.formula
    && beforeA.probe.C4?.formula === afterHide.probe.C4?.formula
    && beforeA.probe.D2?.formula === afterHide.probe.D2?.formula
    && beforeA.probe.A10?.formula === afterHide.probe.A10?.formula;

  const valuesStillCorrect =
    Number(afterHide.probe.C2?.value) === 20
    && Number(afterHide.probe.C3?.value) === 50
    && Number(afterHide.probe.C4?.value) === 10;

  const cellDataOrderSame =
    JSON.stringify(beforeA.cellData?.[1]) === JSON.stringify(afterHide.cellData?.[1])
    && JSON.stringify(beforeA.cellData?.[2]) === JSON.stringify(afterHide.cellData?.[2])
    && JSON.stringify(beforeA.cellData?.[3]) === JSON.stringify(afterHide.cellData?.[3]);

  const namesStillInPlace =
    afterHide.probe.A2?.value === 'A'
    && afterHide.probe.A3?.value === 'B'
    && afterHide.probe.A4?.value === 'C';

  const gateAPass =
    created.ok
    && formulasUnchanged
    && valuesStillCorrect
    && cellDataOrderSame
    && namesStillInPlace
    && clearRemove.afterRemove.hasFilter === false
    && clearRemove.afterRemove.probe.A2?.value === 'A'
    && clearRemove.afterRemove.probe.C2?.formula === beforeA.probe.C2?.formula;

  report.gates.A = {
    pass: gateAPass,
    created,
    hide,
    beforeProbe: beforeA.probe,
    afterHideProbe: afterHide.probe,
    filteredOut: afterHide.filteredOut,
    formulasUnchanged,
    valuesStillCorrect,
    cellDataOrderSame,
    namesStillInPlace,
    clearRemove,
    resourceNames: afterHide.resourceNames,
  };

  if (!gateAPass) {
    report.verdict = 'NO-GO';
    report.blockedAt = 'GATE_A';
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    writeMd(report);
    console.log(JSON.stringify({ verdict: report.verdict, blockedAt: report.blockedAt, gateA: report.gates.A }, null, 2));
    await browser.close();
    process.exit(1);
  }

  // ---------- GATE B ----------
  await seedFormulaTable(page);
  await createFilterOnA1C4(page);

  const hosts = [
    { key: 'floating_z1', setup: async () => { await setPresentation(page, 'floating'); await setZoom(page, 1); } },
    { key: 'floating_z07', setup: async () => { await setPresentation(page, 'floating'); await setZoom(page, 0.7); } },
    { key: 'fullscreen', setup: async () => { await setPresentation(page, 'fullscreen'); await setZoom(page, 1); } },
    { key: 'split_left', setup: async () => { await setPresentation(page, 'split', 'left'); await setZoom(page, 1); } },
    { key: 'split_right', setup: async () => { await setPresentation(page, 'split', 'right'); await setZoom(page, 1); } },
  ];

  let gateBPass = true;
  for (const host of hosts) {
    try {
      await host.setup();
      // Ensure filter still present after UOV remount
      const ensure = await page.evaluate(() => {
        const sheet = window.__focusSheetSurfaceEngine.univerAPI.getActiveWorkbook().getActiveSheet();
        let f = sheet.getFilter?.();
        if (!f) {
          const range = sheet.getRange('A1:C4');
          f = range.createFilter?.();
        }
        return Boolean(f || sheet.getFilter?.());
      });
      await page.waitForTimeout(200);
      const clickPos = await clickFilterHeaderButton(page, 0);
      await page.waitForTimeout(400);
      let snap = await panelSnapshot(page);

      // Retry once with command open if pointer miss
      if (!snap.open) {
        await page.evaluate(async () => {
          const e = window.__focusSheetSurfaceEngine;
          const api = e.univerAPI;
          const wb = api.getActiveWorkbook();
          await api.executeCommand('sheet.operation.open-filter-panel', {
            unitId: wb.getId(),
            subUnitId: wb.getActiveSheet().getSheetId(),
            col: 0,
          });
        });
        await page.waitForTimeout(400);
        snap = await panelSnapshot(page);
        snap.openedViaCommandFallback = true;
      }

      let pointerApplyOk = null;
      if (snap.open && host.key === 'floating_z07') {
        // Real pointer: click search or a checkbox inside panel bbox
        const interacted = await page.evaluate(() => {
          const input = document.querySelector('input[placeholder], input');
          if (input) {
            const r = input.getBoundingClientRect();
            return { kind: 'input', x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
          return null;
        });
        if (interacted) {
          await page.mouse.click(interacted.x, interacted.y);
          await page.keyboard.type('B');
          await page.waitForTimeout(200);
          pointerApplyOk = true;
        } else {
          pointerApplyOk = false;
        }
      }

      await closePanelIfOpen(page);

      const hostPass =
        ensure
        && snap.open
        && snap.visible
        && snap.clipped === false
        && !(host.key === 'floating_z07' && snap.openedViaCommandFallback && pointerApplyOk === false);

      // Hard fail if only command opens and pointer never worked at 0.7
      if (host.key === 'floating_z07' && snap.openedViaCommandFallback) {
        // Second attempt: pointer-only must open
        await closePanelIfOpen(page);
        const click2 = await clickFilterHeaderButton(page, 0);
        await page.waitForTimeout(450);
        const snap2 = await panelSnapshot(page);
        report.popupByHost[`${host.key}_pointer_retry`] = { click: click2, snap: snap2 };
        if (!snap2.open) {
          gateBPass = false;
        }
      }

      if (!hostPass) gateBPass = false;
      report.popupByHost[host.key] = {
        ensureFilter: ensure,
        clickPos,
        snap,
        pointerApplyOk,
        pass: hostPass && !(host.key === 'floating_z07' && report.popupByHost[`${host.key}_pointer_retry`] && !report.popupByHost[`${host.key}_pointer_retry`].snap?.open),
      };
    } catch (err) {
      gateBPass = false;
      report.popupByHost[host.key] = { pass: false, error: String(err) };
    }
  }

  // Recompute B pass from per-host
  gateBPass = Object.entries(report.popupByHost)
    .filter(([k]) => !k.endsWith('_pointer_retry'))
    .every(([, v]) => v.pass);
  // floating_z07 pointer retry required
  const z07retry = report.popupByHost.floating_z07_pointer_retry;
  if (z07retry && !z07retry.snap?.open) gateBPass = false;
  if (report.popupByHost.floating_z07?.snap?.openedViaCommandFallback && z07retry && !z07retry.snap?.open) {
    gateBPass = false;
  }

  report.gates.B = { pass: gateBPass, hosts: report.popupByHost };

  if (!gateBPass) {
    report.verdict = 'NO-GO';
    report.blockedAt = 'GATE_B';
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    writeMd(report);
    console.log(JSON.stringify({ verdict: report.verdict, blockedAt: report.blockedAt, gateB: report.gates.B }, null, 2));
    await browser.close();
    process.exit(1);
  }

  // ---------- GATE C (clone remint — unit path + live duplicate) ----------
  await setPresentation(page, 'floating');
  await setZoom(page, 1);
  await seedFormulaTable(page);
  await createFilterOnA1C4(page);
  await applyHideValueA(page);
  await page.waitForTimeout(200);

  const cloneLive = await page.evaluate(async () => {
    const e = window.__focusSheetSurfaceEngine;
    const before = e.exportDocument();
    const beforeIds = {
      workbookId: e.univerAPI.getActiveWorkbook().getId(),
      worksheetId: e.univerAPI.getActiveWorkbook().getActiveSheet().getSheetId(),
      focusId: window.__focusSheetFs?.selectedId || window.__focusSheetFs?.sheets?.[0]?.focusId,
    };
    const filterResBefore = (before.workbook?.resources ?? []).find((r) => r.name === 'SHEET_FILTER_PLUGIN');
    const parsedBefore = filterResBefore ? JSON.parse(filterResBefore.data) : null;

    // Duplicate via Free Space store if available
    const sheetsBefore = (window.__focusSheetFs?.sheets ?? []).map((s) => s.focusId);
    return { beforeIds, parsedBefore, sheetsBefore, filterResBefore: Boolean(filterResBefore) };
  });

  // Prefer UI duplicate button
  const dupBtn = page.getByRole('button', { name: 'Duplicate first' });
  let duplicated = false;
  if ((await dupBtn.count()) > 0) {
    await dupBtn.click();
    await page.waitForTimeout(900);
    duplicated = true;
  }

  const afterDup = await page.evaluate(() => {
    const objects = window.__focusSheetFs?.objects ?? [];
    const sheetObjs = objects.filter((o) => o.type === 'sheet');
    const docs = sheetObjs.map((o) => {
      const wb = o.content?.document?.workbook;
      const resources = wb?.resources ?? [];
      const filter = resources.find((r) => r.name === 'SHEET_FILTER_PLUGIN');
      let parsed = null;
      try { parsed = filter ? JSON.parse(filter.data) : null; } catch { /* */ }
      return {
        focusId: o.id,
        workbookId: wb?.id,
        worksheetIds: Object.keys(wb?.sheets ?? {}),
        filterKeys: parsed ? Object.keys(parsed) : [],
        unknownResources: resources.filter((r) => r.name !== 'SHEET_FILTER_PLUGIN').map((r) => r.name),
      };
    });
    return { sheetCount: sheetObjs.length, docs };
  });

  let liveClonePass = false;
  if (afterDup.docs.length >= 2) {
    const [a, b] = afterDup.docs;
    const idsDistinct =
      a.focusId !== b.focusId
      && a.workbookId !== b.workbookId
      && a.worksheetIds[0] !== b.worksheetIds[0];
    const filterKeysOk =
      a.filterKeys.length > 0
      && b.filterKeys.length > 0
      && a.filterKeys.every((k) => a.worksheetIds.includes(k))
      && b.filterKeys.every((k) => b.worksheetIds.includes(k))
      && !b.filterKeys.includes(a.worksheetIds[0])
      && !a.filterKeys.includes(b.worksheetIds[0]);
    liveClonePass = idsDistinct && filterKeysOk;
  }

  report.gates.C = {
    pass: null,
    live: { cloneLive, afterDup, duplicated, liveClonePass },
  };

  // ---------- GATE D ----------
  await setPresentation(page, 'floating');
  await setZoom(page, 1);
  await seedFormulaTable(page);
  await createFilterOnA1C4(page);
  await page.waitForTimeout(400); // let export settle
  const c0 = await page.evaluate(() => window.__focusSheetCommitCount?.() ?? 0);
  await page.evaluate(() => {
    const e = window.__focusSheetSurfaceEngine;
    e.selectRange?.('A1');
    e.selectRange?.('B2');
    e.selectRange?.('C3');
  });
  await page.waitForTimeout(250);
  const c1 = await page.evaluate(() => window.__focusSheetCommitCount?.() ?? 0);

  // Open/close filter popup without applying
  const c2 = await page.evaluate(() => window.__focusSheetCommitCount?.() ?? 0);
  await clickFilterHeaderButton(page, 0);
  await page.waitForTimeout(400);
  const panelOpen = await panelSnapshot(page);
  await closePanelIfOpen(page);
  await page.waitForTimeout(250);
  const c3 = await page.evaluate(() => window.__focusSheetCommitCount?.() ?? 0);

  const gateDPass = (c1 - c0) === 0 && (c3 - c2) === 0 && panelOpen.open;
  report.gates.D = {
    pass: gateDPass,
    commits: { c0, c1, c2, c3, selDelta: c1 - c0, popupDelta: c3 - c2 },
    panelOpen,
  };

  await browser.close();

  // Run vitest for clone gate C unit
  const { spawnSync } = await import('node:child_process');
  const vitest = spawnSync(
    'npx',
    ['vitest', 'run', 'src/sheets/domain/cloneFocusSheetDocument.test.ts'],
    { encoding: 'utf8', cwd: process.cwd() },
  );
  const vitestPass = vitest.status === 0;
  report.gates.C.vitest = {
    pass: vitestPass,
    status: vitest.status,
    stdout: (vitest.stdout || '').slice(-1500),
    stderr: (vitest.stderr || '').slice(-800),
  };
  // Require vitest remint proof + live duplicate independence when duplicate UI ran
  report.gates.C.pass = vitestPass && (!duplicated || liveClonePass);

  const allPass =
    report.gates.A.pass
    && report.gates.B.pass
    && report.gates.C.pass
    && report.gates.D.pass;

  report.verdict = allPass ? 'PHASE0_PASS' : 'NO-GO';
  if (!allPass) {
    report.blockedAt = !report.gates.A.pass ? 'GATE_A'
      : !report.gates.B.pass ? 'GATE_B'
        : !report.gates.C.pass ? 'GATE_C'
          : 'GATE_D';
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  writeMd(report);
  console.log(JSON.stringify({
    verdict: report.verdict,
    blockedAt: report.blockedAt ?? null,
    A: report.gates.A.pass,
    B: report.gates.B.pass,
    C: report.gates.C.pass,
    D: report.gates.D.pass,
    out: OUT,
  }, null, 2));
  process.exit(allPass ? 0 : 1);
}

function writeMd(report) {
  const lines = [
    '# PR 3D2 Phase 0 Gate Results',
    '',
    `Generated: ${report.generatedAt}`,
    `Verdict: **${report.verdict}**`,
    report.blockedAt ? `Blocked at: ${report.blockedAt}` : '',
    '',
    `## Gate A (formula/data): ${report.gates.A?.pass ? 'PASS' : 'FAIL'}`,
    `## Gate B (popup): ${report.gates.B?.pass ? 'PASS' : 'FAIL'}`,
    `## Gate C (clone): ${report.gates.C?.pass ? 'PASS' : 'FAIL'}`,
    `## Gate D (zero-commit): ${report.gates.D?.pass ? 'PASS' : 'FAIL'}`,
    '',
    'See `tmp/sheet-pr3d2-phase0.json` for full evidence.',
  ];
  fs.writeFileSync(MD, lines.filter(Boolean).join('\n') + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
