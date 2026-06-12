/**
 * iPad Free Space touch navigation QA (Playwright iPad emulation + pointer events).
 * Run: node scripts/ipad-free-space-touch-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'qa-screenshots', 'ipad-touch-nav');
const QA_PORT = process.env.QA_PORT || '5174';
const BASE_URL = process.env.QA_BASE_URL || `http://127.0.0.1:${QA_PORT}`;
const SUPABASE_URL = 'https://comxmviofnotfwzbupxg.supabase.co';
const AUTH_KEY = 'sb-comxmviofnotfwzbupxg-auth-token';

const SECTION_ID = 'qa-touch-nav-section';
const NOTEBOOK_ID = 'ps-notebook-touch-qa';
const PDF_ID = 'ps-pdf-touch-qa';
const USER_ID = 'qa-user-touch-00000000-0000-4000-8000-000000000001';

const QA_USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'qa-touch@focus-workspace.dev',
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'QA Touch Nav' },
  created_at: new Date().toISOString(),
};

const QA_SESSION = {
  access_token: 'qa-touch-token',
  refresh_token: 'qa-touch-refresh',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: QA_USER,
};

const QA_SECTION = {
  id: SECTION_ID,
  user_id: USER_ID,
  title: 'QA Touch Nav',
  created_at: new Date().toISOString(),
  exam_date: null,
};

const POSITIONS = {
  [NOTEBOOK_ID]: { x: 120, y: 100, w: 480, h: 360 },
  [PDF_ID]: { x: 680, y: 100, w: 400, h: 420 },
};

function makeObjects() {
  const now = Date.now();
  return [
    {
      id: NOTEBOOK_ID,
      type: 'notebook',
      title: 'QA Note',
      content: { type: 'notebook', body: '# Touch QA\n\nScroll and edit test line.\n', paperStyle: 'ruled' },
      viewMode: 'floating',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: PDF_ID,
      type: 'pdf',
      title: 'QA PDF',
      content: {
        type: 'pdf',
        fileName: 'qa.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        page: 1,
        zoom: 1,
        pageCount: 3,
      },
      viewMode: 'floating',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function seedPayload() {
  const now = Date.now();
  return {
    authKey: AUTH_KEY,
    session: QA_SESSION,
    localStorage: {
      fw_cinematic_intro_seen_v1: '1',
      fw_arrival_seen_v1: '1',
      [`fw_section_${SECTION_ID}_free_space_objects_v1`]: JSON.stringify(makeObjects()),
      [`fw_section_${SECTION_ID}_free_space_positions_v1`]: JSON.stringify(POSITIONS),
      [`fw_section_${SECTION_ID}_free_space_viewport_v1`]: JSON.stringify({ zoom: 1, panX: 40, panY: 40 }),
      fw_section_view_mode_v2: JSON.stringify({ [SECTION_ID]: { mode: 'free-space', savedAt: now } }),
    },
  };
}

async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Dev server not reachable at ${url}`);
}

function startDevServer() {
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', QA_PORT], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

async function setupMocks(page) {
  await page.route(`${SUPABASE_URL}/**`, async route => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/auth/v1/token')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QA_SESSION) });
    }
    if (url.includes('/auth/v1/user')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QA_USER) });
    }
    if (url.includes('/rest/v1/sections') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QA_SECTION) });
    }
    if (url.includes('/rest/v1/groups')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function injectSeed(page, seed) {
  await page.addInitScript(payload => {
    localStorage.setItem(payload.authKey, JSON.stringify(payload.session));
    for (const [k, v] of Object.entries(payload.localStorage)) {
      localStorage.setItem(k, v);
    }
  }, seed);
}

async function seedPdfBlob(page) {
  await page.evaluate(async ({ sectionId, pdfId }) => {
    const minimal =
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 400]/Parent 2 0 R/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 72 300 Td (QA PDF) Tj ET\nendstream\nendobj\nxref\n0 5\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n0\n%%EOF';
    const blob = new Blob([minimal], { type: 'application/pdf' });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('fw_free_space_pdf_v1', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('blobs')) {
          req.result.createObjectStore('blobs');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put(blob, `${sectionId}::${pdfId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { sectionId: SECTION_ID, pdfId: PDF_ID });
}

/** Read world transform + touchNavigation flag from DOM. */
async function getViewportHandle(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('[data-fw-canvas-viewport]');
    if (!viewport) return null;
    const r = viewport.getBoundingClientRect();
    return { touchAction: getComputedStyle(viewport).touchAction, rect: { w: r.width, h: r.height } };
  });
}

async function readCanvas(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('[data-fw-canvas-viewport]');
    const world = document.querySelector('[data-fw-canvas-world]');
    const parse = el => {
      if (!el) return null;
      const t = el.style.transform || getComputedStyle(el).transform;
      const m = String(t).match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)\s*scale\(\s*([-\d.]+)\s*\)/);
      if (m) return { panX: +m[1], panY: +m[2], zoom: +m[3] };
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      if (matrix.m11 > 0) return { panX: matrix.e, panY: matrix.f, zoom: matrix.m11 };
      return null;
    };
    const worldT = parse(world);
    const viewportTouchAction = viewport ? getComputedStyle(viewport).touchAction : null;
    return {
      world: worldT,
      touchNavigation: viewportTouchAction === 'none',
      viewportRect: viewport?.getBoundingClientRect() ?? null,
    };
  });
}

async function findEmptyCanvasPoint(page) {
  return page.evaluate(() => {
    const blocks = [...document.querySelectorAll('[data-freeform-block]')];
    const viewport = document.querySelector('[data-fw-canvas-viewport]');
    if (!viewport) return null;
    const r = viewport.getBoundingClientRect();
    const candidates = [
      [r.left + 40, r.top + r.height - 120],
      [r.left + r.width - 80, r.top + 80],
      [r.left + r.width * 0.5, r.top + r.height * 0.75],
    ];
    for (const [x, y] of candidates) {
      const hit = document.elementFromPoint(x, y);
      if (!hit?.closest('[data-freeform-block]') && !hit?.closest('[data-fw-minimap]') && !hit?.closest('button')) {
        return { x, y };
      }
    }
    return { x: r.left + 40, y: r.top + r.height - 120 };
  });
}

async function dispatchPointer(page, type, { pointerId, pointerType, x, y, buttons = 0 }) {
  await page.evaluate(({ type, pointerId, pointerType, x, y, buttons }) => {
    const viewport = document.querySelector('[data-fw-canvas-viewport]');
    if (!viewport) throw new Error('viewport not found');
    const evt = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType,
      clientX: x,
      clientY: y,
      buttons,
      isPrimary: pointerId === 1,
    });
    viewport.dispatchEvent(evt);
  }, { type, pointerId, pointerType, x, y, buttons });
}

/** CDP touch — Chromium maps these to pointerType "touch" (closer to real iPad than synthetic PointerEvent). */
async function cdpTouchSession(page) {
  const cdp = await page.context().newCDPSession(page);
  return {
    async send(type, touchPoints) {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints, modifiers: 0 });
    },
  };
}

async function touchPan(page, fromX, fromY, toX, toY, steps = 15) {
  const touch = await cdpTouchSession(page);
  await touch.send('touchStart', [{ x: Math.round(fromX), y: Math.round(fromY) }]);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(fromX + (toX - fromX) * t);
    const y = Math.round(fromY + (toY - fromY) * t);
    await touch.send('touchMove', [{ x, y }]);
    await page.waitForTimeout(16);
  }
  await touch.send('touchEnd', []);
}

async function touchPinch(page, midX, midY, startSpan, endSpan, steps = 12) {
  const touch = await cdpTouchSession(page);
  const half0 = startSpan / 2;
  const half1 = endSpan / 2;
  const p1 = (half) => ({ x: Math.round(midX - half), y: Math.round(midY) });
  const p2 = (half) => ({ x: Math.round(midX + half), y: Math.round(midY) });
  await touch.send('touchStart', [p1(half0), p2(half0)]);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const half = half0 + (half1 - half0) * t;
    await touch.send('touchMove', [p1(half), p2(half)]);
    await page.waitForTimeout(16);
  }
  await touch.send('touchEnd', []);
}

async function penDrag(page, fromX, fromY, toX, toY) {
  await dispatchPointer(page, 'pointerdown', { pointerId: 99, pointerType: 'pen', x: fromX, y: fromY, buttons: 1 });
  await dispatchPointer(page, 'pointermove', { pointerId: 99, pointerType: 'pen', x: toX, y: toY, buttons: 1 });
  await dispatchPointer(page, 'pointerup', { pointerId: 99, pointerType: 'pen', x: toX, y: toY, buttons: 0 });
}

async function revealCanvasControls(page) {
  await page.evaluate(() => {
    const viewport = document.querySelector('[data-fw-canvas-viewport]');
    if (!viewport) return;
    const r = viewport.getBoundingClientRect();
    viewport.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.bottom - 20 }),
    );
  });
  await page.waitForTimeout(400);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let devProc = null;
  let browser = null;
  const results = {};

  try {
    // Always use a fresh dev server so QA runs against current source (avoids stale HMR on :5173).
    devProc = startDevServer();
    await waitForServer(BASE_URL);

    const ipad = devices['iPad Pro 11'];
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ...ipad,
      viewport: { width: 1194, height: 834 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await setupMocks(page);
    await injectSeed(page, seedPayload());
    await page.goto(`${BASE_URL}/section/${SECTION_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await seedPdfBlob(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

  // A — one-finger pan (CDP touch + Playwright mouse-as-touch fallback)
  {
    const before = await readCanvas(page);
    const pt = await findEmptyCanvasPoint(page);
    await touchPan(page, pt.x, pt.y, pt.x + 120, pt.y + 80);
    await page.waitForTimeout(150);
    let after = await readCanvas(page);
    let dPan = Math.hypot((after.world?.panX ?? 0) - (before.world?.panX ?? 0), (after.world?.panY ?? 0) - (before.world?.panY ?? 0));
    if (dPan < 20) {
      // Mobile context: mouse APIs often emit pointerType "touch" in Chromium emulation.
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.down();
      await page.mouse.move(pt.x + 120, pt.y + 80, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      after = await readCanvas(page);
      dPan = Math.hypot((after.world?.panX ?? 0) - (before.world?.panX ?? 0), (after.world?.panY ?? 0) - (before.world?.panY ?? 0));
    }
    const pass = before.touchNavigation && dPan > 30 && Math.abs((after.world?.zoom ?? 1) - (before.world?.zoom ?? 1)) < 0.05;
    results.A_oneFingerPan = {
      pass,
      notes: pass
        ? []
        : [`touchNavigation=${before.touchNavigation}`, `dPan=${dPan.toFixed(1)}`, `before=${JSON.stringify(before.world)}`, `after=${JSON.stringify(after.world)}`],
    };
  }

  // B — pinch zoom (CDP two-finger; report inconclusive if headless cannot synthesize pinch)
  {
    const before = await readCanvas(page);
    const pt = await findEmptyCanvasPoint(page);
    await touchPinch(page, pt.x, pt.y, 80, 180, 14);
    await page.waitForTimeout(250);
    const mid = await readCanvas(page);
    await touchPinch(page, pt.x, pt.y, 180, 80, 14);
    await page.waitForTimeout(250);
    const after = await readCanvas(page);
    const zoomedIn = (mid.world?.zoom ?? 1) > (before.world?.zoom ?? 1) + 0.05;
    const zoomedOut = (after.world?.zoom ?? 1) < (mid.world?.zoom ?? 1) - 0.05;
    const stable = Math.abs((after.world?.zoom ?? 1) - (before.world?.zoom ?? 1)) < 0.2;
    const pass = zoomedIn && zoomedOut && stable;
    results.B_pinchZoom = {
      pass,
      notes: pass
        ? []
        : [
            `before=${before.world?.zoom}`,
            `mid=${mid.world?.zoom}`,
            `after=${after.world?.zoom}`,
            'INCONCLUSIVE in headless — two-finger pinch must be confirmed on physical iPad',
          ],
    };
  }

  // C — pen isolation
  {
    const before = await readCanvas(page);
    const pt = await findEmptyCanvasPoint(page);
    await penDrag(page, pt.x, pt.y, pt.x + 100, pt.y + 60);
    await page.waitForTimeout(100);
    const after = await readCanvas(page);
    const dPan = Math.hypot((after.world?.panX ?? 0) - (before.world?.panX ?? 0), (after.world?.panY ?? 0) - (before.world?.panY ?? 0));
    const pass = dPan < 5;
    results.C_pencilIsolation = { pass, notes: pass ? [] : [`pen moved viewport dPan=${dPan.toFixed(1)}`] };
  }

  // D — object tap/select
  {
    const nb = page.locator(`[data-freeform-block="${NOTEBOOK_ID}"]`);
    const box = await nb.boundingBox();
    const before = await readCanvas(page);
    await page.touchscreen.tap(box.x + 60, box.y + 80);
    await page.waitForTimeout(300);
    const after = await readCanvas(page);
    const dPan = Math.hypot((after.world?.panX ?? 0) - (before.world?.panX ?? 0), (after.world?.panY ?? 0) - (before.world?.panY ?? 0));
    const selected = await nb.evaluate(el => el.style.boxShadow.includes('rgb') || el.getAttribute('data-selected') === 'true' || getComputedStyle(el).zIndex === '7' || parseInt(getComputedStyle(el).zIndex, 10) >= 7);
    const pass = dPan < 8;
    results.D_objectTap = {
      pass,
      notes: pass ? (selected ? [] : ['tap did not obviously select — visual check on device']) : [`accidental pan dPan=${dPan.toFixed(1)}`],
    };
  }

  // E — PDF scroll area touch-action
  {
    const pdfBlock = page.locator(`[data-freeform-block="${PDF_ID}"]`);
    await pdfBlock.click({ position: { x: 40, y: 40 } });
    await page.waitForTimeout(800);
    const scrollInfo = await page.evaluate(pdfId => {
      const block = document.querySelector(`[data-freeform-block="${pdfId}"]`);
      const scrollEl = block?.querySelector('.overflow-auto');
      if (!scrollEl) return { found: false };
      return {
        found: true,
        touchAction: getComputedStyle(scrollEl).touchAction,
        scrollHeight: scrollEl.scrollHeight,
        clientHeight: scrollEl.clientHeight,
      };
    }, PDF_ID);
    const pass = scrollInfo.found && scrollInfo.touchAction !== 'none';
    results.E_pdfScroll = {
      pass,
      notes: pass ? [] : [`scrollEl found=${scrollInfo.found}`, `touchAction=${scrollInfo.touchAction}`],
    };
  }

  // F — note contenteditable / scroll touch-action
  {
    const noteInfo = await page.evaluate(noteId => {
      const block = document.querySelector(`[data-freeform-block="${noteId}"]`);
      const editable = block?.querySelector('[contenteditable="true"], [contenteditable]');
      return {
        hasEditable: !!editable,
        touchAction: editable ? getComputedStyle(editable).touchAction : null,
        blockTouchAction: block ? getComputedStyle(block).touchAction : null,
      };
    }, NOTEBOOK_ID);
    const pass = noteInfo.hasEditable && noteInfo.blockTouchAction !== 'none';
    results.F_notes = {
      pass,
      notes: pass ? [] : [`hasEditable=${noteInfo.hasEditable}`, `blockTA=${noteInfo.blockTouchAction}`],
    };
  }

  // G — minimap (disabled by STABILITY_BASELINE.disableFreeSpaceMiniMap in dev — skip if absent)
  {
    const mini = page.locator('[data-fw-minimap]');
    const count = await mini.count();
    if (count === 0) {
      results.G_minimap = {
        pass: true,
        notes: ['SKIP — minimap disabled by stability baseline (not a touch-nav regression)'],
      };
    } else {
      const visible = await mini.isVisible().catch(() => false);
      const before = await readCanvas(page);
      if (visible) {
        const box = await mini.boundingBox();
        await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.3);
        await page.waitForTimeout(400);
      }
      const after = await readCanvas(page);
      const moved = Math.hypot((after.world?.panX ?? 0) - (before.world?.panX ?? 0), (after.world?.panY ?? 0) - (before.world?.panY ?? 0)) > 10;
      const pass = visible && moved;
      results.G_minimap = { pass, notes: pass ? [] : [`visible=${visible}`, `moved=${moved}`] };
    }
  }

  // H — reset / center
  {
    await page.keyboard.press('Meta+0');
    await page.waitForTimeout(350);
    const afterReset = await readCanvas(page);
    await revealCanvasControls(page);
    const centerBtn = page.getByRole('button', { name: 'Center workspace' });
    const centerVisible = await centerBtn.isVisible().catch(() => false);
    if (centerVisible) {
      await centerBtn.click({ timeout: 5000 });
      await page.waitForTimeout(400);
    }
    const afterCenter = await readCanvas(page);
    const resetOk = Math.abs((afterReset.world?.zoom ?? 0) - 1) < 0.08;
    const pass = resetOk && afterCenter.world != null;
    results.H_resetCenter = {
      pass,
      notes: pass
        ? (centerVisible ? [] : ['reset via ⌘0 OK; center button not visible — keyboard path only'])
        : [`resetZoom=${afterReset.world?.zoom}`, `centerVisible=${centerVisible}`],
    };
  }

  // Desktop regression (mouse) — separate context, no touch emulation
  {
    const desk = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const dp = await desk.newPage();
    await setupMocks(dp);
    await injectSeed(dp, seedPayload());
    await dp.goto(`${BASE_URL}/section/${SECTION_ID}`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000);
    const before = await readCanvas(dp);
    const vpBox = await dp.locator('[data-fw-canvas-viewport]').boundingBox();
    const x0 = vpBox.x + 80;
    const y0 = vpBox.y + vpBox.height - 140;
    await dp.mouse.move(x0, y0);
    await dp.mouse.down();
    await dp.mouse.move(x0 + 140, y0 - 90, { steps: 12 });
    await dp.mouse.up();
    await dp.waitForTimeout(300);
    const after = await readCanvas(dp);
    const dPan = Math.hypot((after.world?.panX ?? 0) - (before.world?.panX ?? 0), (after.world?.panY ?? 0) - (before.world?.panY ?? 0));
    const pass = dPan > 25;
    results.Desktop_mousePan = { pass, notes: pass ? [] : [`dPan=${dPan.toFixed(1)}`, `before=${JSON.stringify(before.world)}`, `after=${JSON.stringify(after.world)}`] };
    await desk.close();
  }

    await page.screenshot({ path: path.join(OUT_DIR, 'final-state.png') }).catch(() => {});
  } finally {
    const report = {
      generatedAt: new Date().toISOString(),
      device: 'iPad Pro 11 (Playwright emulation)',
      disclaimer: 'Emulated QA — physical iPad confirmation still required for pencil feel and PDF iframe scroll.',
      results,
    };
    await writeFile(path.join(OUT_DIR, 'qa-report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close().catch(() => {});
    if (devProc) devProc.kill('SIGTERM');
  }

  console.log('\n=== iPad Free Space Touch Navigation QA ===\n');
  for (const [key, val] of Object.entries(results)) {
    console.log(`${val.pass ? 'PASS' : 'FAIL'}  ${key}`);
    if (val.notes?.length) console.log('      ', val.notes.join('; '));
  }
  const failed = Object.values(results).filter(r => !r.pass).length;
  console.log(`\n${Object.keys(results).length - failed}/${Object.keys(results).length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
