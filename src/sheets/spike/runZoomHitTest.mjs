/**
 * PR 3A.1 zoom hit-testing isolation.
 * Usage: node src/sheets/spike/runZoomHitTest.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tmp/sheet-zoom-hit.json');
const MD = path.join(ROOT, 'src/sheets/spike/ZOOM_HITTEST.md');

const ZOOMS = [1, 0.85, 0.7, 0.5, 1.15, 1.3, 1.5];
const CASES = ['none', 'scaleOnly', 'translateScale', 'originCenter', 'hostSize'];

function passRate(list) {
  const ok = list.filter((r) => r.ok).length;
  return `${ok}/${list.length}`;
}

async function waitReady(page) {
  try {
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
      const host = document.querySelector('[data-fw-sheet-host]');
      const loading = [...document.querySelectorAll('div')].some((el) => el.textContent === 'Loading Sheet…');
      return Boolean(canvas) && Boolean(host) && !loading;
    }, undefined, { timeout: 60_000 });
  } catch (err) {
    const dump = await page.evaluate(() => ({
      url: location.href,
      text: (document.body?.innerText || '').slice(0, 1200),
      host: Boolean(document.querySelector('[data-fw-sheet-host]')),
      canvases: [...document.querySelectorAll('canvas')].map((c) => ({
        id: c.id,
        css: [c.clientWidth, c.clientHeight],
        backing: [c.width, c.height],
      })),
    })).catch(() => null);
    console.error('waitReady dump', dump);
    throw err;
  }
  await page.waitForTimeout(400);
}

async function ensureOneSheet(page) {
  const n = await page.evaluate(() => (window.__focusSheetFs?.sheets ?? []).length);
  if (n === 0) {
    await page.getByRole('button', { name: 'Add Sheet' }).click();
    await waitReady(page);
  }
}

async function setCaseZoom(page, transformCase, zoom) {
  await page.locator(`[data-transform-case="${transformCase}"]`).click();
  await page.locator(`[data-zoom="${String(zoom)}"]`).click();
  await page.waitForTimeout(280);
}

function layoutTargets(metrics) {
  const headerW = 46;
  const headerH = 24;
  const colW = metrics?.col0 || 88;
  const rowH = metrics?.row0 || 24;
  return [
    { name: 'A1', c: 0, r: 0, x: headerW + colW * 0.5, y: headerH + rowH * 0.5 },
    { name: 'C1', c: 2, r: 0, x: headerW + colW * 2.5, y: headerH + rowH * 0.5 },
    { name: 'A5', c: 0, r: 4, x: headerW + colW * 0.5, y: headerH + rowH * 4.5 },
    { name: 'C5', c: 2, r: 4, x: headerW + colW * 2.5, y: headerH + rowH * 4.5 },
    { name: 'A12', c: 0, r: 11, x: headerW + colW * 0.5, y: headerH + rowH * 11.5 },
    { name: 'G1', c: 6, r: 0, x: headerW + colW * 6.5, y: headerH + rowH * 0.5 },
  ];
}

async function mouseClickVisual(page, layoutX, layoutY) {
  const pos = await page.evaluate(({ layoutX, layoutY }) => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    if (!canvas) throw new Error('no canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + (layoutX / canvas.offsetWidth) * rect.width,
      clientY: rect.top + (layoutY / canvas.offsetHeight) * rect.height,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      offsetW: canvas.offsetWidth,
      offsetH: canvas.offsetHeight,
    };
  }, { layoutX, layoutY });
  await page.mouse.click(pos.clientX, pos.clientY);
  return pos;
}

async function sample(page, intended, layoutX, layoutY) {
  const clickMeta = await mouseClickVisual(page, layoutX, layoutY);
  await page.waitForTimeout(180);
  const engine = await page.evaluate(() => {
    const e = window.__focusSheetSurfaceEngine;
    const pointer = window.__focusSheetFs?.lastPointer?.() ?? null;
    return {
      a1: e?.getActiveA1?.() ?? null,
      range: e?.getActiveRangeA1?.() ?? null,
      metrics: e?.getGridMetrics?.() ?? null,
      pointer,
      zoom: window.__focusSheetFs?.zoom,
      transformCase: window.__focusSheetFs?.transformCase,
    };
  });
  const p = engine.pointer || {};
  const offsetErr = p.offsetX != null
    ? { dx: p.offsetX - layoutX, dy: p.offsetY - layoutY }
    : null;
  const visual = p.visualFromClient;
  const layoutMapped = p.layoutFromVisual;
  return {
    intended,
    actual: engine.a1,
    range: engine.range,
    ok: engine.a1 === intended,
    layoutX,
    layoutY,
    clickMeta,
    offsetErr,
    visualFromClient: visual,
    layoutFromVisual: layoutMapped,
    offsetVsLayout: p.offsetX != null && layoutMapped
      ? { dx: p.offsetX - layoutMapped.x, dy: p.offsetY - layoutMapped.y }
      : null,
    pointer: {
      clientX: p.clientX,
      clientY: p.clientY,
      pageX: p.pageX,
      pageY: p.pageY,
      offsetX: p.offsetX,
      offsetY: p.offsetY,
      targetId: p.targetId,
      dpr: p.dpr,
      worldTransform: p.worldTransform,
      worldOrigin: p.worldOrigin,
      canvas: p.canvas,
      host: p.host,
    },
    metrics: engine.metrics,
    zoom: engine.zoom,
    transformCase: engine.transformCase,
  };
}

async function dragRange(page, x1, y1, x2, y2) {
  const a = await page.evaluate(({ layoutX, layoutY }) => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + (layoutX / canvas.offsetWidth) * rect.width,
      clientY: rect.top + (layoutY / canvas.offsetHeight) * rect.height,
    };
  }, { layoutX: x1, layoutY: y1 });
  const b = await page.evaluate(({ layoutX, layoutY }) => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + (layoutX / canvas.offsetWidth) * rect.width,
      clientY: rect.top + (layoutY / canvas.offsetHeight) * rect.height,
    };
  }, { layoutX: x2, layoutY: y2 });
  await page.mouse.move(a.clientX, a.clientY);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.move(b.clientX, b.clientY, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(220);
  return page.evaluate(() => ({
    a1: window.__focusSheetSurfaceEngine?.getActiveA1?.() ?? null,
    range: window.__focusSheetSurfaceEngine?.getActiveRangeA1?.() ?? null,
  }));
}

function summarize(rows) {
  return rows.map((r) => {
    const dx = r.offsetErr?.dx;
    const dy = r.offsetErr?.dy;
    return `${r.transformCase || ''} z=${r.zoom} ${r.intended}→${r.actual} ${r.ok ? 'PASS' : 'FAIL'} offsetΔ=(${dx != null ? dx.toFixed(1) : '?'},${dy != null ? dy.toFixed(1) : '?'})`;
  }).join('\n');
}

async function openHarness(browser, { dpr = 1, port }) {
  const context = await browser.newContext({ deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 240)));
  await page.goto(`http://127.0.0.1:${port}/debug/sheet-fs`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.includes('debug-sheet-pr3a')) localStorage.removeItem(k);
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });
  await ensureOneSheet(page);
  return { context, page, errors };
}

async function resolvePort() {
  const envUrl = process.env.FOCUS_DEV_URL;
  if (envUrl) return { port: Number(new URL(envUrl).port || 5173), ownServer: null };
  for (const port of [5173, 5182]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/debug/sheet-fs`, { redirect: 'manual' });
      if (res.status > 0 && res.status < 500) return { port, ownServer: null };
    } catch {
      /* try next */
    }
  }
  const server = await createServer({
    root: ROOT,
    server: { port: 5183, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  return { port: 5183, ownServer: server };
}

async function main() {
  const { port, ownServer } = await resolvePort();
  console.log(`harness url http://127.0.0.1:${port}/debug/sheet-fs`);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const { context, page, errors } = await openHarness(browser, { dpr: 1, port });

  const metrics = await page.evaluate(() => window.__focusSheetSurfaceEngine?.getGridMetrics?.() ?? { row0: 24, col0: 88 });
  const targets = layoutTargets(metrics);
  const rows = [];

  for (const zoom of ZOOMS) {
    await setCaseZoom(page, 'translateScale', zoom);
    await page.waitForTimeout(200);
    for (const t of targets) {
      rows.push(await sample(page, t.name, t.x, t.y));
    }
  }

  const caseRows = [];
  for (const c of CASES) {
    for (const zoom of [1, 0.7]) {
      await setCaseZoom(page, c, zoom);
      await page.waitForTimeout(250);
      for (const t of [targets[0], targets[3], targets[4], targets[5]]) {
        caseRows.push({ ...(await sample(page, t.name, t.x, t.y)), case: c });
      }
    }
  }

  await setCaseZoom(page, 'translateScale', 0.7);
  const tA1 = targets[0];
  await page.locator('[id^="univer-sheet-main-canvas"]').last().click({
    position: { x: tA1.x, y: tA1.y },
    force: true,
  });
  await page.waitForTimeout(200);
  const bboxMethod = await page.evaluate(() => ({
    a1: window.__focusSheetSurfaceEngine?.getActiveA1?.() ?? null,
    pointer: window.__focusSheetFs?.lastPointer?.(),
  }));

  await setCaseZoom(page, 'translateScale', 0.7);
  const beforeResize = await sample(page, 'A1', tA1.x, tA1.y);
  await page.getByRole('button', { name: 'engine.resize()' }).click();
  await page.waitForTimeout(200);
  const afterResize = await sample(page, 'A1', tA1.x, tA1.y);

  await setCaseZoom(page, 'scaleOnly', 0.7);
  const scaleNoResize = await sample(page, 'A1', tA1.x, tA1.y);
  await page.getByRole('button', { name: 'engine.resize()' }).click();
  await page.waitForTimeout(200);
  const scaleAfterResize = await sample(page, 'A1', tA1.x, tA1.y);

  await setCaseZoom(page, 'hostSize', 0.7);
  const hostSizeHit = await sample(page, 'A1', tA1.x, tA1.y);

  await setCaseZoom(page, 'translateScale', 0.7);
  await page.getByRole('button', { name: 'Delete last' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await waitReady(page);
  const remount = await sample(page, 'A1', tA1.x, tA1.y);

  await setCaseZoom(page, 'translateScale', 1);
  const dragAt1 = await dragRange(page, tA1.x, tA1.y, targets[3].x, targets[3].y);
  await setCaseZoom(page, 'translateScale', 0.7);
  const drag = await dragRange(page, tA1.x, tA1.y, targets[3].x, targets[3].y);

  await setCaseZoom(page, 'translateScale', 0.7);
  await mouseClickVisual(page, tA1.x, tA1.y);
  await page.waitForTimeout(120);
  await page.keyboard.type('zoom07');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const typed07 = await page.evaluate(() => window.__focusSheetSurfaceEngine?.probeCells?.(['A1']) ?? null);

  await setCaseZoom(page, 'translateScale', 0.7);
  const scrollbar = await page.evaluate(() => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    return { x: canvas.offsetWidth - 6, y: Math.round(canvas.offsetHeight * 0.42) };
  });
  await mouseClickVisual(page, scrollbar.x, scrollbar.y);
  await page.waitForTimeout(150);
  const scrollbarHit = await page.evaluate(() => {
    const p = window.__focusSheetFs?.lastPointer?.();
    return {
      offsetX: p?.offsetX,
      offsetY: p?.offsetY,
      targetId: p?.targetId,
      canvasW: p?.canvas?.offsetW,
      nearRightEdge: p?.offsetX != null && p?.canvas?.offsetW != null && p.offsetX > p.canvas.offsetW - 18,
    };
  });

  const headerClicks = {};
  for (const zoom of [1, 0.7, 1.3]) {
    await setCaseZoom(page, 'translateScale', zoom);
    const colHeader = await sample(page, 'colA', 46 + (metrics.col0 || 88) * 0.5, 12);
    const rowHeader = await sample(page, 'row1', 23, 24 + (metrics.row0 || 24) * 0.5);
    headerClicks[String(zoom)] = {
      colHeaderActual: colHeader.actual,
      colHeaderRange: colHeader.range,
      colPointerTarget: colHeader.pointer?.targetId,
      rowHeaderActual: rowHeader.actual,
      rowHeaderRange: rowHeader.range,
      rowPointerTarget: rowHeader.pointer?.targetId,
    };
  }

  await page.locator('[data-canvas-host="freeform"]').click();
  await page.waitForTimeout(700);
  await waitReady(page);
  await page.locator('[data-zoom="1"]').click();
  await page.waitForTimeout(450);
  const freeformZ1 = await sample(page, 'A1', tA1.x, tA1.y);
  await page.locator('[data-zoom="0.7"]').click();
  await page.waitForTimeout(500);
  const freeformZ07 = await sample(page, 'A1', tA1.x, tA1.y);
  const freeformZ07c5 = await sample(page, 'C5', targets[3].x, targets[3].y);
  await page.locator('[data-zoom="1.3"]').click();
  await page.waitForTimeout(500);
  const freeformZ13 = await sample(page, 'A1', tA1.x, tA1.y);

  const moveBefore = await page.evaluate(() => {
    const el = document.querySelector('[data-freeform-block]');
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  if (moveBefore) {
    await page.mouse.move(moveBefore.x + 48, moveBefore.y + 10);
    await page.mouse.down();
    await page.mouse.move(moveBefore.x + 140, moveBefore.y + 70, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  const moveAfter = await page.evaluate(() => {
    const el = document.querySelector('[data-freeform-block]');
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  if (moveAfter && moveAfter.w > 40 && moveAfter.h > 40) {
    await page.mouse.move(moveAfter.x + moveAfter.w - 6, moveAfter.y + moveAfter.h - 6);
    await page.mouse.down();
    await page.mouse.move(moveAfter.x + moveAfter.w + 40, moveAfter.y + moveAfter.h + 30, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  const resizeAfter = await page.evaluate(() => {
    const el = document.querySelector('[data-freeform-block]');
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  const afterGeomHit = await sample(page, 'A1', tA1.x, tA1.y);

  const dpr = await page.evaluate(() => window.devicePixelRatio);
  await context.close();

  const dpr2 = await openHarness(browser, { dpr: 2, port });
  await setCaseZoom(dpr2.page, 'translateScale', 1);
  const dpr2z1 = await sample(dpr2.page, 'A1', tA1.x, tA1.y);
  await setCaseZoom(dpr2.page, 'translateScale', 0.7);
  const dpr2z07 = await sample(dpr2.page, 'A1', tA1.x, tA1.y);
  const dpr2z07c5 = await sample(dpr2.page, 'C5', targets[3].x, targets[3].y);
  const dpr2value = await dpr2.page.evaluate(() => window.devicePixelRatio);
  await dpr2.context.close();

  const evidence = {
    generatedAt: new Date().toISOString(),
    dpr,
    dpr2value,
    metrics,
    pageErrors: errors,
    matrix: rows,
    cases: caseRows,
    bboxMethodAt07: {
      a1: bboxMethod.a1,
      offsetX: bboxMethod.pointer?.offsetX,
      offsetY: bboxMethod.pointer?.offsetY,
      visualFromClient: bboxMethod.pointer?.visualFromClient,
      layoutFromVisual: bboxMethod.pointer?.layoutFromVisual,
      canvas: bboxMethod.pointer?.canvas,
    },
    beforeResize,
    afterResize,
    scaleNoResize,
    scaleAfterResize,
    hostSizeHit,
    remountAt07: remount,
    dragAt1,
    drag,
    typed07,
    scrollbarHit,
    headerClicks,
    dpr2: { z1: dpr2z1, z07: dpr2z07, z07c5: dpr2z07c5 },
    freeform: { z1: freeformZ1, z07: freeformZ07, z07c5: freeformZ07c5, z13: freeformZ13 },
    moveBefore,
    moveAfter,
    resizeAfter,
    afterGeomHit,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));

  const byZoom = {};
  for (const z of ZOOMS) {
    const slice = rows.filter((r) => r.zoom === z);
    byZoom[z] = passRate(slice);
  }
  const md = `# Zoom hit-test isolation (PR 3A.1)

## Diagnosis

Root cause of the original A1→A2 at zoom 0.7: Playwright \`locator.click({ position })\` treats \`position\` as pixels in the **visual** bounding box. At \`scale(0.7)\` that is equivalent to layoutY ≈ 36/0.7 ≈ 51.4, which is row 2. Native mouse events (and visual-mapped clicks) produce \`offsetX/Y\` in untransformed canvas CSS pixels (\`offsetΔ = 0\`). Univer \`InputManager\` uses \`evt.offsetX/Y\` as canvas-local CSS pixels and does not need a scale conversion.

A12 misses at zoom > 1 are overflow-clip (click lands outside the clipped canvas), not a scale mapping error.

DPR=${dpr} DPR2=${dpr2value} row0=${metrics.row0} col0=${metrics.col0}

## Visual-mapped mouse clicks (C translate+scale, origin 0 0)

${Object.entries(byZoom).map(([z, v]) => `- zoom ${z}: ${v}`).join('\n')}

${summarize(rows)}

## Playwright bbox-relative click at 0.7 A1

actual \`${bboxMethod.a1}\` offset=(${bboxMethod.pointer?.offsetX}, ${bboxMethod.pointer?.offsetY}) layoutFromVisual=${JSON.stringify(bboxMethod.pointer?.layoutFromVisual)}

## Resize / remount / hostSize

- translateScale 0.7 before resize: ${beforeResize.actual} (${beforeResize.ok ? 'PASS' : 'FAIL'})
- after engine.resize(): ${afterResize.actual} (${afterResize.ok ? 'PASS' : 'FAIL'})
- scaleOnly 0.7 no extra resize: ${scaleNoResize.actual} (${scaleNoResize.ok ? 'PASS' : 'FAIL'})
- scaleOnly after resize: ${scaleAfterResize.actual} (${scaleAfterResize.ok ? 'PASS' : 'FAIL'})
- hostSize 0.7 A1: ${hostSizeHit.actual} (${hostSizeHit.ok ? 'PASS' : 'FAIL'})
- remount at 0.7 A1: ${remount.actual} (${remount.ok ? 'PASS' : 'FAIL'})

## Cases A–E (A1, C5, A12, G1) at 1.0 and 0.7

${summarize(caseRows)}

## Drag A1→C5

- zoom 1.0 range=\`${dragAt1.range}\` a1=\`${dragAt1.a1}\`
- zoom 0.7 range=\`${drag.range}\` a1=\`${drag.a1}\`

## Type at 0.7 A1

${JSON.stringify(typed07)}

## Scrollbar (right-edge click at 0.7)

${JSON.stringify(scrollbarHit)}

## Headers

${JSON.stringify(headerClicks, null, 2)}

## Real FreeformCanvas

- z1 A1: ${freeformZ1.actual} (${freeformZ1.ok ? 'PASS' : 'FAIL'}) offsetΔ=(${freeformZ1.offsetErr?.dx?.toFixed?.(1)},${freeformZ1.offsetErr?.dy?.toFixed?.(1)})
- z0.7 A1: ${freeformZ07.actual} (${freeformZ07.ok ? 'PASS' : 'FAIL'}) offsetΔ=(${freeformZ07.offsetErr?.dx?.toFixed?.(1)},${freeformZ07.offsetErr?.dy?.toFixed?.(1)})
- z0.7 C5: ${freeformZ07c5.actual} (${freeformZ07c5.ok ? 'PASS' : 'FAIL'})
- z1.3 A1: ${freeformZ13.actual} (${freeformZ13.ok ? 'PASS' : 'FAIL'})
- move before=${JSON.stringify(moveBefore)} after=${JSON.stringify(moveAfter)}
- resize after=${JSON.stringify(resizeAfter)}
- A1 after move/resize: ${afterGeomHit.actual} (${afterGeomHit.ok ? 'PASS' : 'FAIL'})

## DPR 2

- z1 A1: ${dpr2z1.actual} (${dpr2z1.ok ? 'PASS' : 'FAIL'})
- z0.7 A1: ${dpr2z07.actual} (${dpr2z07.ok ? 'PASS' : 'FAIL'})
- z0.7 C5: ${dpr2z07c5.actual} (${dpr2z07c5.ok ? 'PASS' : 'FAIL'})
`;
  fs.writeFileSync(MD, md);
  console.log(md);
  await browser.close();
  if (ownServer) await ownServer.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
