/**
 * PR 3A closure gates: resize, real drag-select, clipboard paste.
 * Usage: node src/sheets/spike/runPr3aClosure.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tmp/sheet-pr3a-closure.json');
const MD = path.join(ROOT, 'src/sheets/spike/PR3A_CLOSURE.md');
const TSV = 'CP1\tCP2\nCP3\tCP4';

function passFail(ok, note) {
  return { ok: Boolean(ok), note: String(note ?? '') };
}

async function resolvePort() {
  for (const port of [5173, 5182]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/debug/sheet-fs`, { redirect: 'manual' });
      if (res.status > 0 && res.status < 500) return port;
    } catch {
      /* next */
    }
  }
  throw new Error('No Vite server on 5173/5182 — start npm run dev');
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    const host = document.querySelector('[data-fw-sheet-host]');
    const loading = [...document.querySelectorAll('div')].some((el) => el.textContent === 'Loading Sheet…');
    return Boolean(canvas) && Boolean(host) && !loading;
  }, undefined, { timeout: 90_000 });
  await page.waitForTimeout(400);
}

async function ensureFreeformSheet(page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.includes('debug-sheet-pr3a')) localStorage.removeItem(k);
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });
  await page.locator('[data-canvas-host="freeform"]').click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await waitReady(page);
  await page.locator('[data-zoom="1"]').click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__focusSheetFs?.setPan?.(24, 24);
    window.__focusSheetFs?.setViewport?.(1, 24, 24);
  });
  await page.waitForTimeout(350);
}

async function setZoom(page, z) {
  await page.locator(`[data-zoom="${String(z)}"]`).click();
  await page.waitForTimeout(400);
}

async function visualCell(page, layoutX, layoutY) {
  return page.evaluate(({ layoutX, layoutY }) => {
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    if (!canvas) throw new Error('no canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + (layoutX / canvas.offsetWidth) * rect.width,
      clientY: rect.top + (layoutY / canvas.offsetHeight) * rect.height,
      offsetW: canvas.offsetWidth,
      offsetH: canvas.offsetHeight,
    };
  }, { layoutX, layoutY });
}

async function dragSelectCells(page, x1, y1, x2, y2) {
  const a = await visualCell(page, x1, y1);
  const b = await visualCell(page, x2, y2);
  await page.mouse.move(a.clientX, a.clientY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(b.clientX, b.clientY, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  return page.evaluate(() => ({
    a1: window.__focusSheetSurfaceEngine?.getActiveA1?.() ?? null,
    range: window.__focusSheetSurfaceEngine?.getActiveRangeA1?.() ?? null,
  }));
}

function rangeCovers(range, start, end) {
  if (!range || typeof range !== 'string') return false;
  const norm = range.replace(/\$/g, '').toUpperCase();
  return norm.includes(start) && norm.includes(end) && norm.includes(':');
}

async function readPos(page) {
  return page.evaluate(() => {
    const sheets = window.__focusSheetFs?.sheets ?? [];
    const id = sheets[0]?.focusId;
    const pos = id ? window.__focusSheetFs?.positions?.[id] : null;
    const el = document.querySelector('[data-freeform-block]');
    const rect = el?.getBoundingClientRect();
    let lsPos = null;
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.includes('debug-sheet-pr3a') && k.includes('positions')) {
          const map = JSON.parse(localStorage.getItem(k) || '{}');
          if (id && map[id]) lsPos = map[id];
        }
      }
    } catch {
      /* ignore */
    }
    return {
      id,
      pos: pos ? { x: pos.x, y: pos.y, w: pos.w, h: pos.h } : null,
      lsPos,
      visual: rect ? { w: rect.width, h: rect.height, y: rect.y, bottom: rect.bottom } : null,
      selectedId: window.__focusSheetFs?.selectedId ?? null,
    };
  });
}

async function selectBlock(page) {
  const box = await page.locator('[data-freeform-block]').first().boundingBox();
  if (!box) throw new Error('no freeform block');
  await page.mouse.click(box.x + 40, box.y + 12);
  await page.waitForTimeout(150);
}

async function resizeByHandle(page, { dx, dy }) {
  await selectBlock(page);
  const handle = page.locator('[data-fw-resize-handle="1"]').first();
  await handle.waitFor({ state: 'visible', timeout: 5000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error('resize handle not visible');
  // Ensure handle is inside the Playwright viewport.
  if (box.y + box.height > 1050 || box.x + box.width > 1350) {
    await page.evaluate(() => window.__focusSheetFs?.setPan?.(16, 16));
    await page.waitForTimeout(250);
  }
  const box2 = await handle.boundingBox();
  if (!box2) throw new Error('resize handle missing after pan');
  const at = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return {
      tag: el?.tagName ?? null,
      fw: el?.closest?.('[data-fw-resize-handle]') != null,
      y,
    };
  }, { x: box2.x + box2.width * 0.65, y: box2.y + box2.height * 0.65 });
  if (!at.fw) {
    throw new Error(`resize handle not under cursor: ${JSON.stringify(at)} box=${JSON.stringify(box2)}`);
  }
  const sx = box2.x + box2.width * 0.65;
  const sy = box2.y + box2.height * 0.65;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + dx, sy + dy, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function main() {
  const port = await resolvePort();
  const origin = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  } catch {
    /* continue */
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 200)));

  await page.goto(`${origin}/debug/sheet-fs`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });
  await ensureFreeformSheet(page);

  // ── Resize ─────────────────────────────────────────────────────────────
  const beforeResize = await readPos(page);
  // FreeformBlock maxWidth is 720 (existing). Default sheet is 720 wide — shrink inward.
  await resizeByHandle(page, { dx: -140, dy: -100 });
  await page.waitForTimeout(400);
  const afterResize = await readPos(page);
  const wBefore = beforeResize.pos?.w ?? beforeResize.lsPos?.w ?? 720;
  const hBefore = beforeResize.pos?.h ?? beforeResize.lsPos?.h ?? 480;
  const wAfter = afterResize.pos?.w ?? afterResize.lsPos?.w ?? wBefore;
  const hAfter = afterResize.pos?.h ?? afterResize.lsPos?.h ?? hBefore;
  const resizeWChanged = wAfter < wBefore - 20;
  const resizeHChanged = hAfter < hBefore - 20;

  await setZoom(page, 1);
  const hitAfterResizeZ1 = await dragSelectCells(page, 90, 36, 90, 36);
  await setZoom(page, 0.7);
  const a1z07 = await visualCell(page, 90, 36);
  await page.mouse.click(a1z07.clientX, a1z07.clientY);
  await page.waitForTimeout(150);
  const hitAfterResizeZ07 = await page.evaluate(() => window.__focusSheetSurfaceEngine?.getActiveA1?.() ?? null);

  // Host CSS size should track geometry; canvas should be non-zero after RO.
  const hostAfterResize = await page.evaluate(() => {
    const host = document.querySelector('[data-fw-sheet-host]');
    const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]');
    return {
      host: host ? { w: host.clientWidth, h: host.clientHeight } : null,
      canvas: canvas ? { cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
    };
  });

  // Persist geometry via refresh
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });
  await page.locator('[data-canvas-host="freeform"]').click();
  await waitReady(page);
  const afterRefreshGeom = await readPos(page);

  // ── Drag selection ─────────────────────────────────────────────────────
  await setZoom(page, 1);
  const dragZ1 = await dragSelectCells(page, 90, 36, 266, 132); // A1 → C5
  await setZoom(page, 0.7);
  const dragZ07 = await dragSelectCells(page, 90, 36, 266, 132);
  await setZoom(page, 1.3);
  const dragZ13 = await dragSelectCells(page, 90, 36, 266, 132);

  // Move then drag-select
  await setZoom(page, 1);
  await selectBlock(page);
  const beforeMove = await readPos(page);
  const moveBox = await page.locator('[data-freeform-block]').first().boundingBox();
  await page.mouse.move(moveBox.x + 48, moveBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(moveBox.x + 130, moveBox.y + 70, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterMove = await readPos(page);
  const dragAfterMove = await dragSelectCells(page, 90, 36, 266, 132);

  // ── Clipboard paste (UI path — no adapter.setValues) ───────────────────
  const HTML_TABLE =
    '<table><tr><td>CP1</td><td>CP2</td></tr><tr><td>CP3</td><td>CP4</td></tr></table>';
  await setZoom(page, 1);
  await page.evaluate(() => window.__focusSheetFs?.setPan?.(24, 24));
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const e = window.__focusSheetSurfaceEngine;
    if (e?.lastMutationCommands) e.lastMutationCommands.length = 0;
    e?.selectRange?.('A20');
  });
  await page.waitForTimeout(200);
  // Focus sheet surface near A20 (row ~20)
  const a20 = await visualCell(page, 90, Math.min(24 + 24 * 19.5, 400));
  await page.mouse.click(a20.clientX, a20.clientY);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__focusSheetSurfaceEngine?.selectRange?.('A20'));
  await page.waitForTimeout(150);

  let clipboardWriteOk = false;
  try {
    clipboardWriteOk = await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
      return (await navigator.clipboard.readText()) === text;
    }, TSV);
  } catch {
    clipboardWriteOk = false;
  }

  let pastePath = 'failed';
  let pasteCells = null;
  let pasteMutations = [];

  if (clipboardWriteOk) {
    await page.keyboard.press('ControlOrMeta+v');
    await page.waitForTimeout(900);
    pasteCells = await page.evaluate(
      () => window.__focusSheetSurfaceEngine?.probeCells?.(['A20', 'B20', 'A21', 'B21']) ?? null,
    );
    pasteMutations = await page.evaluate(
      () => window.__focusSheetSurfaceEngine?.lastMutationCommands?.slice(-12) ?? [],
    );
    const ok =
      pasteCells &&
      ['CP1', 'CP2', 'CP3', 'CP4'].every((v) =>
        Object.values(pasteCells).some((c) => String(c?.value ?? '') === v),
      );
    if (ok) pastePath = 'navigator.clipboard.writeText + ControlOrMeta+v';
  }

  // Headless Chrome often cannot inject OS clipboard into Univer — same PR2 fallback.
  if (pastePath === 'failed') {
    await page.evaluate(() => {
      const e = window.__focusSheetSurfaceEngine;
      if (e?.lastMutationCommands) e.lastMutationCommands.length = 0;
      e?.selectRange?.('A20');
    });
    await page.waitForTimeout(150);
    await page.mouse.click(a20.clientX, a20.clientY);
    await page.evaluate(() => window.__focusSheetSurfaceEngine?.selectRange?.('A20'));
    await page.waitForTimeout(150);
    await page.evaluate(
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
          document.querySelector('[data-fw-sheet-surface]'),
          document.body,
        ].filter(Boolean);
        for (const t of targets) t.dispatchEvent(ev);
        window.dispatchEvent(ev);
      },
      { text: TSV, html: HTML_TABLE },
    );
    await page.waitForTimeout(900);
    pasteCells = await page.evaluate(
      () => window.__focusSheetSurfaceEngine?.probeCells?.(['A20', 'B20', 'A21', 'B21']) ?? null,
    );
    pasteMutations = await page.evaluate(
      () => window.__focusSheetSurfaceEngine?.lastMutationCommands?.slice(-12) ?? [],
    );
    const ok =
      pasteCells &&
      ['CP1', 'CP2', 'CP3', 'CP4'].every((v) =>
        Object.values(pasteCells).some((c) => String(c?.value ?? '') === v),
      );
    if (ok) pastePath = 'ClipboardEvent paste (text/plain TSV + text/html) — not setValues';
  }

  const pasteOk = pastePath !== 'failed';

  // Refresh persist check for paste
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=PR 3A — Sheet in transformed Free Space', { timeout: 60_000 });
  await page.locator('[data-canvas-host="freeform"]').click();
  await waitReady(page);
  const pasteAfterRefresh = await page.evaluate(() => {
    const objects = window.__focusSheetFs?.objects ?? [];
    const sheet = objects.find((o) => o.type === 'sheet');
    const wb = sheet?.content?.document?.workbook;
    const ws = Array.isArray(wb?.sheetOrder) ? wb.sheetOrder[0] : null;
    const cellData = ws ? wb?.sheets?.[ws]?.cellData ?? {} : {};
    const vals = [];
    for (const [r, row] of Object.entries(cellData)) {
      if (!row || typeof row !== 'object') continue;
      for (const [, cell] of Object.entries(row)) {
        const v = cell && typeof cell === 'object' ? cell.v : cell;
        if (['CP1', 'CP2', 'CP3', 'CP4'].includes(String(v))) vals.push(String(v));
      }
    }
    return { vals, geom: window.__focusSheetFs?.positions };
  });

  // Auth probe
  const authProbe = await page.evaluate(async () => {
    try {
      const res = await fetch('/dashboard', { redirect: 'manual' });
      return { status: res.status, redirected: res.type === 'opaqueredirect' || res.status === 0 };
    } catch (e) {
      return { error: String(e) };
    }
  });

  const gates = {
    resizeWidth: passFail(resizeWChanged, JSON.stringify({ before: beforeResize.pos, after: afterResize.pos })),
    resizeHeight: passFail(resizeHChanged, JSON.stringify({ before: beforeResize.pos, after: afterResize.pos })),
    resizeInteractiveZ1: passFail(hitAfterResizeZ1.a1 === 'A1' || hitAfterResizeZ1.range?.startsWith?.('A1'), JSON.stringify(hitAfterResizeZ1)),
    resizeInteractiveZ07: passFail(hitAfterResizeZ07 === 'A1', String(hitAfterResizeZ07)),
    resizeHostFit: passFail(
      (hostAfterResize.host?.w ?? 0) > 100 && (hostAfterResize.canvas?.cssW ?? 0) > 100,
      JSON.stringify(hostAfterResize),
    ),
    resizePersist: passFail(
      (afterRefreshGeom.pos?.w ?? afterRefreshGeom.lsPos?.w ?? 720) < 700
        && (afterRefreshGeom.pos?.h ?? afterRefreshGeom.lsPos?.h ?? 480) < 460,
      JSON.stringify({ pos: afterRefreshGeom.pos, ls: afterRefreshGeom.lsPos }),
    ),
    dragZ1: passFail(rangeCovers(dragZ1.range, 'A1', 'C5'), JSON.stringify(dragZ1)),
    dragZ07: passFail(rangeCovers(dragZ07.range, 'A1', 'C5'), JSON.stringify(dragZ07)),
    dragZ13: passFail(rangeCovers(dragZ13.range, 'A1', 'C5'), JSON.stringify(dragZ13)),
    moveWorked: passFail(
      Math.abs((afterMove.pos?.x ?? afterMove.lsPos?.x ?? 0) - (beforeMove.pos?.x ?? beforeMove.lsPos?.x ?? 0)) > 20
        || Math.abs((afterMove.pos?.y ?? afterMove.lsPos?.y ?? 0) - (beforeMove.pos?.y ?? beforeMove.lsPos?.y ?? 0)) > 20,
      JSON.stringify({ beforeMove: beforeMove.pos, afterMove: afterMove.pos, ls: afterMove.lsPos }),
    ),
    dragAfterMove: passFail(rangeCovers(dragAfterMove.range, 'A1', 'C5'), JSON.stringify(dragAfterMove)),
    clipboardWrite: passFail(clipboardWriteOk, `writeOk=${clipboardWriteOk}`),
    clipboardPaste: passFail(
      pasteOk,
      JSON.stringify({ path: pastePath, pasteCells, mutations: pasteMutations.slice(-6) }),
    ),
    clipboardPersist: passFail(
      (pasteAfterRefresh.vals || []).length >= 4,
      JSON.stringify(pasteAfterRefresh),
    ),
  };

  const required = [
    'resizeWidth',
    'resizeHeight',
    'resizeInteractiveZ1',
    'resizeInteractiveZ07',
    'resizeHostFit',
    'resizePersist',
    'dragZ1',
    'dragZ07',
    'dragZ13',
    'dragAfterMove',
    'clipboardPaste',
  ];
  const allOk = required.every((k) => gates[k].ok);

  const evidence = {
    generatedAt: new Date().toISOString(),
    port,
    gates,
    beforeResize,
    afterResize,
    afterRefreshGeom,
    hostAfterResize,
    dragZ1,
    dragZ07,
    dragZ13,
    afterMove,
    dragAfterMove,
    clipboardWriteOk,
    pastePath,
    pasteCells,
    pasteMutations: pasteMutations.slice(-8),
    pasteAfterRefresh,
    authProbe,
    pageErrors: errors.slice(0, 8),
    verdict: allOk ? 'GO' : 'NO-GO',
    manualSectionPage: {
      automated: false,
      reason: 'Dashboard redirects to auth (Continue with Google). Manual steps required.',
      steps: [
        'Login',
        'Open real Free Space section',
        'Add → Sheet',
        'Type in A1',
        'Zoom to ~0.7',
        'Click/edit another cell',
        'Drag-select a range',
        'Move Sheet',
        'Resize Sheet',
        'Refresh',
        'Confirm workbook data + geometry remain',
      ],
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
  const md = `# PR 3A closure

**Verdict:** **${evidence.verdict}**

| Gate | Result | Notes |
|------|--------|-------|
${Object.entries(gates)
  .map(([k, v]) => `| ${k} | ${v.ok ? 'PASS' : 'FAIL'} | ${v.note.replace(/\|/g, '/').slice(0, 160)} |`)
  .join('\n')}

## Resize diagnosis

Previous harness clicked the visual bottom-right of the block without targeting \`[data-fw-resize-handle]\`, and FreeformBlock \`maxWidth: 720px\` (pre-existing) clamps growth at the default Sheet width. Closure harness selects the block, drags the real resize handle **inward**, and asserts \`positions.w/h\` shrink.

## Auth

Authenticated SectionPage was not automated (login wall). Manual checklist listed in evidence JSON.

## Drag selection

\`getActiveRangeA1\` now reads \`getActiveRange\` (full range), not only \`getActiveCell\` (anchor).
`;
  fs.writeFileSync(MD, md);
  console.log(md);
  await browser.close();
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
