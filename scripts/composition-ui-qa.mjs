/**
 * Study Composition System — authenticated UI QA (local dev).
 * Mocks Supabase auth + section API; seeds math notebook + PDF in localStorage.
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'qa-screenshots', 'composition');
const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:5173';
const SUPABASE_URL = 'https://comxmviofnotfwzbupxg.supabase.co';
const AUTH_KEY = 'sb-comxmviofnotfwzbupxg-auth-token';

const SECTION_ID = 'qa-composition-section';
const NOTEBOOK_ID = 'ps-notebook-qa-001';
const PDF_ID = 'ps-pdf-qa-001';
const USER_ID = 'qa-user-00000000-0000-4000-8000-000000000001';

const QA_USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'qa-composition@focus-workspace.dev',
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'QA Composition' },
  created_at: new Date().toISOString(),
};

const QA_SESSION = {
  access_token: 'qa-access-token',
  refresh_token: 'qa-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: QA_USER,
};

const DEFAULT_GROUPS = ['Slides', 'Exercises', 'Exams', 'Notes', 'Links'].map((title, i) => ({
  id: `qa-grp-${i}`,
  section_id: SECTION_ID,
  title,
  order_index: i,
}));

const QA_SECTION = {
  id: SECTION_ID,
  user_id: USER_ID,
  title: 'QA Composition',
  created_at: new Date().toISOString(),
  exam_date: null,
};

const NOTEBOOK_BODY = `# Calculus QA

lim x->0 (sin x)/x = 1

int 0 to 1 x^2 dx

d/dx x^3 = 3x^2

::hw::hw-qa-001::
`;

function seedPayload(objects, positions, extra = {}) {
  const now = Date.now();
  return {
    authKey: AUTH_KEY,
    session: QA_SESSION,
    localStorage: {
      fw_cinematic_intro_seen_v1: '1',
      fw_arrival_seen_v1: '1',
      fw_composition_coach_v1: JSON.stringify({
        version: 1,
        coachDismissed: true,
        successfulInsert: false,
        firstSeenAt: now,
      }),
      [`fw_section_${SECTION_ID}_free_space_objects_v1`]: JSON.stringify(objects),
      [`fw_section_${SECTION_ID}_free_space_positions_v1`]: JSON.stringify(positions),
      [`fw_section_${SECTION_ID}_free_space_viewport_v1`]: JSON.stringify({ zoom: 1, panX: 0, panY: 0 }),
      fw_section_view_mode_v2: JSON.stringify({
        [SECTION_ID]: { mode: 'free-space', savedAt: now },
      }),
      ...extra,
    },
  };
}

function makeObjects(overrides = {}) {
  const now = Date.now();
  const notebook = {
    id: NOTEBOOK_ID,
    type: 'notebook',
    title: 'Math QA Notebook',
    content: {
      type: 'notebook',
      body: NOTEBOOK_BODY,
      paperStyle: 'ruled',
      notebookSurface: 'spatial',
      notebookMode: 'math',
    },
    connections: [PDF_ID],
    viewMode: 'floating',
    splitSide: 'right',
    createdAt: now,
    updatedAt: now,
    ...overrides.notebook,
  };
  const pdf = {
    id: PDF_ID,
    type: 'pdf',
    title: 'QA Exam PDF',
    content: {
      type: 'pdf',
      fileName: 'qa-exam.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      lastOpenedAt: null,
      page: 1,
      zoom: 1.2,
      pageCount: 3,
    },
    connections: [NOTEBOOK_ID],
    viewMode: 'floating',
    splitSide: 'left',
    createdAt: now,
    updatedAt: now,
    ...overrides.pdf,
  };
  return [notebook, pdf];
}

const POSITIONS = {
  [NOTEBOOK_ID]: { x: 180, y: 120, w: 580, h: 0 },
  [PDF_ID]: { x: 820, y: 120, w: 420, h: 0 },
};

async function ensureOutDir() {
  await mkdir(OUT_DIR, { recursive: true });
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Dev server not reachable at ${url}`);
}

function startDevServer() {
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
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
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(QA_SESSION),
      });
    }
    if (url.includes('/auth/v1/user')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(QA_USER),
      });
    }
    if (url.includes('/rest/v1/sections') && method === 'GET') {
      const accept = route.request().headers()['accept'] || '';
      const single = accept.includes('vnd.pgrst.object') || url.includes(`id=eq.${SECTION_ID}`);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? QA_SECTION : [QA_SECTION]),
      });
    }
    if (url.includes('/rest/v1/groups')) {
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(DEFAULT_GROUPS),
        });
      }
      if (method === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
    }
    if (url.includes('/rest/v1/items')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
    if (url.includes('/rest/v1/sections') && method === 'GET') {
      const single = url.includes('maybeSingle') || url.includes(`eq.${SECTION_ID}`);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? QA_SECTION : [QA_SECTION]),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
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

async function gotoSection(page) {
  await page.goto(`${BASE_URL}/section/${SECTION_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  if (page.url().includes('/') && !page.url().includes('/section/')) {
    throw new Error(`Auth redirect — landed on ${page.url()}`);
  }
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function dismissCoach(page) {
  const coach = page.locator('[data-composition-coach="1"]');
  if (await coach.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.waitForTimeout(200);
  }
}

async function openNotebookOnCanvas(page) {
  const block = page.locator(`[data-freeform-block="${NOTEBOOK_ID}"]`);
  if (await block.isVisible().catch(() => false)) {
    await block.click({ position: { x: 40, y: 200 } });
    await page.waitForTimeout(300);
  }
  await page
    .locator('.math-nb-interactive, [data-editable-id], [data-nb-surface-block]')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });
}

async function focusMathLine(page, mathLineIndex = 0) {
  const preview = page.locator('.math-nb-interactive').nth(mathLineIndex);
  if (await preview.count() > 0) {
    await preview.click();
    await page.waitForTimeout(350);
  }
  const line = page.locator('[data-editable-id]').nth(mathLineIndex + 2);
  await line.waitFor({ state: 'visible', timeout: 10000 });
  await line.click();
  await page.waitForTimeout(400);
  return line;
}

async function seedPdfBlob(page) {
  await page.evaluate(async ({ sectionId, pdfId }) => {
    const minimal =
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 300]/Parent 2 0 R>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF';
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

async function countVisible(locator) {
  return locator.evaluateAll(els => els.filter(el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
  }).length).catch(() => 0);
}

async function runInteractionChecks(page, results, scenarioId) {
  const checks = { scenarioId, pass: true, notes: [] };

  const chip = page.locator('[data-composition-chip="1"]');
  const bubble = page.locator('[data-composition-bubble="1"]');
  const sheet = page.locator('[data-composition-sheet="1"]');
  const gutter = page.locator('[data-composition-gutter="1"]').first();

  const chipCount = await countVisible(chip);
  const bubbleCount = await countVisible(bubble);
  const sheetCount = await countVisible(sheet);
  const gutterCount = await countVisible(gutter);

  checks.chipCount = chipCount;
  checks.bubbleCount = bubbleCount;
  checks.sheetCount = sheetCount;
  checks.gutterCount = gutterCount;

  const suppressed = ['08-preview', '09-exam-focus', '07-handwriting-focus'].includes(scenarioId);

  if (suppressed) {
    if (chipCount > 0 || bubbleCount > 0 || sheetCount > 0 || gutterCount > 0) {
      checks.pass = false;
      checks.notes.push('Composition chrome should be hidden');
    }
    results.interactions.push(checks);
    return checks;
  }

  if (chipCount !== 1) {
    checks.pass = false;
    checks.notes.push(`Expected 1 math chip, saw ${chipCount}`);
  }

  if (scenarioId === '01-normal') {
    const line = await focusMathLine(page, 0);
    await page.waitForTimeout(500);
    const bubbleAfter = await countVisible(bubble);
    if (bubbleAfter < 1) {
      checks.pass = false;
      checks.notes.push('Caret bubble did not appear on focused math line');
    } else {
      const before = await line.innerText();
      await page.locator('[data-composition-bubble="1"] button', { hasText: 'a/b' }).click();
      await page.waitForTimeout(400);
      const after = await line.innerText();
      if (!after.includes('/') || after === before) {
        checks.pass = false;
        checks.notes.push('Fraction did not insert into focused line');
      }
    }

    await page.locator('[data-composition-chip="1"]').click();
    await page.waitForTimeout(400);
    if ((await countVisible(sheet)) < 1) {
      checks.pass = false;
      checks.notes.push('Math structure sheet did not open');
    } else {
      const beforeInt = await line.innerText();
      const integralBtn = page
        .locator('[data-composition-sheet="1"] button')
        .filter({ has: page.getByText('Integral', { exact: true }) })
        .first();
      await integralBtn.click();
      await page.waitForTimeout(500);
      const afterInt = await line.innerText();
      if (!afterInt.includes('int ') || afterInt === beforeInt) {
        checks.pass = false;
        checks.notes.push('Integral did not insert into correct line');
      }

      await page.locator('[data-composition-chip="1"]').click();
      await page.waitForTimeout(300);
      const integralPin = page
        .locator('[data-composition-sheet="1"] button')
        .filter({ has: page.getByText('Integral', { exact: true }) })
        .locator('[title="Pin as favorite"]');
      await integralPin.click();
      await page.waitForTimeout(200);
      const favStored = await page.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem('fw_composition_favorite_v1') || '{}').pinned;
        } catch {
          return null;
        }
      });
      if (favStored !== 'integral') {
        checks.pass = false;
        checks.notes.push(`Favorite pin failed (got ${favStored})`);
      }

      if (!(await page.locator('[data-composition-sheet="1"]').getByText('Recent').isVisible().catch(() => false))) {
        checks.pass = false;
        checks.notes.push('Recent structures section missing after insert');
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      if ((await countVisible(sheet)) > 0) {
        checks.pass = false;
        checks.notes.push('Sheet did not close on Escape');
      }
    }

    const gutterBtn = page.locator('[data-composition-gutter="1"] button[aria-label="Insert block"]').first();
    if (await gutterBtn.isVisible().catch(() => false)) {
      const box = await gutterBtn.boundingBox();
      if (!box || box.width < 44 || box.height < 44) {
        checks.pass = false;
        checks.notes.push(`Gutter + not 44pt (got ${box?.width}x${box?.height})`);
      }
      const blocksBefore = await page.locator('[data-nb-surface-block]').count();
      await gutterBtn.click();
      await page.waitForTimeout(200);
      await page.locator('[data-composition-gutter-menu="1"] button', { hasText: 'Step' }).click();
      await page.waitForTimeout(400);
      const blocksAfter = await page.locator('[data-nb-surface-block]').count();
      if (blocksAfter <= blocksBefore) {
        checks.pass = false;
        checks.notes.push('Step insert may have failed');
      }
    } else {
      checks.pass = false;
      checks.notes.push('Gutter + not discoverable');
    }
  }

  results.interactions.push(checks);
  return checks;
}

async function runScenario(browser, scenario, results) {
  const context = await browser.newContext({
    ...scenario.device,
    viewport: scenario.viewport,
    isMobile: scenario.isMobile ?? false,
    hasTouch: scenario.hasTouch ?? false,
  });
  const page = await context.newPage();
  await setupMocks(page);
  await injectSeed(page, scenario.seed);

  const entry = {
    id: scenario.id,
    name: scenario.name,
    pass: true,
    notes: [],
    screenshot: null,
  };

  try {
    await gotoSection(page);
    await dismissCoach(page);

    if (scenario.setup) await scenario.setup(page);

    await page.waitForTimeout(scenario.settleMs ?? 600);
    entry.screenshot = await shot(page, scenario.id);

    if (scenario.verify) {
      const ok = await scenario.verify(page);
      if (!ok.pass) {
        entry.pass = false;
        entry.notes.push(...ok.notes);
      }
    }

    if (scenario.runInteractions) {
      const ic = await runInteractionChecks(page, results, scenario.id);
      if (!ic.pass) {
        entry.pass = false;
        entry.notes.push(...ic.notes);
      }
      entry.screenshot = await shot(page, `${scenario.id}-after-interactions`);
    }
  } catch (err) {
    entry.pass = false;
    entry.notes.push(String(err.message || err));
    try {
      entry.screenshot = await shot(page, `${scenario.id}-error`);
    } catch {
      /* ignore */
    }
  } finally {
    await context.close();
  }

  results.scenarios.push(entry);
  return entry;
}

async function main() {
  await ensureOutDir();

  let devProc = null;
  try {
    await fetch(BASE_URL);
  } catch {
    devProc = startDevServer();
    await waitForServer(BASE_URL);
  }

  const results = { scenarios: [], interactions: [], generatedAt: new Date().toISOString() };

  const browser = await chromium.launch({ headless: true });

  const scenarios = [
    {
      id: '01-normal',
      name: 'Math notebook normal mode',
      seed: seedPayload(makeObjects(), POSITIONS),
      setup: async page => {
        await openNotebookOnCanvas(page);
      },
      runInteractions: true,
    },
    {
      id: '02-pdf-split',
      name: 'PDF + notebook split',
      seed: seedPayload(
        makeObjects({
          notebook: { viewMode: 'split', splitSide: 'right', updatedAt: Date.now() + 1 },
          pdf: { viewMode: 'split', splitSide: 'left', updatedAt: Date.now() + 2 },
        }),
        POSITIONS,
      ),
      setup: async page => {
        await page.waitForTimeout(1200);
      },
      verify: async page => {
        const notes = [];
        let pass = true;
        const chip = await countVisible(page.locator('[data-composition-chip="1"]'));
        if (chip !== 1) {
          pass = false;
          notes.push(`Chip count ${chip} in split mode`);
        }
        return { pass, notes };
      },
    },
    {
      id: '03-fullscreen',
      name: 'Fullscreen notebook',
      seed: seedPayload(
        makeObjects({ notebook: { viewMode: 'fullscreen', updatedAt: Date.now() + 5 } }),
        POSITIONS,
      ),
      setup: async page => {
        await page.locator('[data-editable-id]').first().waitFor({ timeout: 15000 });
      },
      verify: async page => {
        const chip = await countVisible(page.locator('[data-composition-chip="1"]'));
        return { pass: chip === 1, notes: chip !== 1 ? [`Chip count ${chip}`] : [] };
      },
    },
    {
      id: '04-deep-focus',
      name: 'Deep Focus',
      seed: seedPayload(makeObjects(), POSITIONS),
      setup: async page => {
        await openNotebookOnCanvas(page);
        await page.locator('button[title="Focus mode"]').first().click();
        await page.waitForTimeout(800);
      },
      verify: async page => {
        const chip = await countVisible(page.locator('[data-composition-chip="1"]'));
        const notes = [];
        let pass = chip === 1;
        if (!pass) notes.push(`Chip missing in deep focus (${chip})`);
        await focusMathLine(page, 0);
        const bubble = await countVisible(page.locator('[data-composition-bubble="1"]'));
        if (bubble < 1) {
          pass = false;
          notes.push('Bubble missing in deep focus');
        }
        return { pass, notes };
      },
    },
    {
      id: '05-ipad-landscape',
      name: 'iPad landscape simulation',
      device: devices['iPad Pro 11'],
      viewport: { width: 1194, height: 834 },
      hasTouch: true,
      isMobile: true,
      seed: seedPayload(makeObjects(), POSITIONS),
      setup: async page => {
        await openNotebookOnCanvas(page);
        await focusMathLine(page, 0);
      },
      verify: async page => {
        const chip = await countVisible(page.locator('[data-composition-chip="1"]'));
        return { pass: chip === 1, notes: chip !== 1 ? ['Chip not visible on iPad landscape'] : [] };
      },
    },
    {
      id: '06-ipad-portrait',
      name: 'iPad portrait simulation',
      device: devices['iPad Pro 11'],
      viewport: { width: 834, height: 1194 },
      hasTouch: true,
      isMobile: true,
      seed: seedPayload(makeObjects(), POSITIONS),
      setup: async page => {
        await openNotebookOnCanvas(page);
        await focusMathLine(page, 1);
      },
      verify: async page => {
        const chip = await countVisible(page.locator('[data-composition-chip="1"]'));
        return { pass: chip === 1, notes: chip !== 1 ? ['Chip not visible on iPad portrait'] : [] };
      },
    },
    {
      id: '07-handwriting-focus',
      name: 'Handwriting block focus',
      seed: seedPayload(makeObjects(), POSITIONS),
      setup: async page => {
        await openNotebookOnCanvas(page);
        const hw = page.locator('[data-nb-surface-block]').filter({ has: page.locator('[class*="handwriting"], canvas, svg') }).last();
        if (await hw.count() === 0) {
          await page.locator('[data-nb-surface-block]').last().click();
        } else {
          await hw.click();
        }
        await page.waitForTimeout(500);
      },
      verify: async page => {
        const chrome = await countVisible(page.locator('[data-composition-chip="1"], [data-composition-bubble="1"], [data-composition-gutter="1"]'));
        return {
          pass: chrome === 0,
          notes: chrome > 0 ? ['Composition chrome visible during handwriting focus'] : [],
        };
      },
    },
    {
      id: '08-preview',
      name: 'Preview mode',
      seed: seedPayload(makeObjects(), POSITIONS),
      setup: async page => {
        await openNotebookOnCanvas(page);
        await page.getByRole('button', { name: 'Preview' }).first().click();
        await page.waitForTimeout(500);
      },
      verify: async page => {
        const chrome = await countVisible(page.locator('[data-composition-chip="1"], [data-composition-bubble="1"], [data-composition-gutter="1"], [data-composition-sheet="1"]'));
        return {
          pass: chrome === 0,
          notes: chrome > 0 ? ['Composition chrome visible in preview'] : [],
        };
      },
    },
    {
      id: '09-exam-focus',
      name: 'Exam focus mode',
      seed: seedPayload(
        makeObjects({
          pdf: { viewMode: 'split', splitSide: 'left', updatedAt: Date.now() + 3 },
          notebook: { viewMode: 'split', splitSide: 'right', updatedAt: Date.now() + 2 },
        }),
        POSITIONS,
      ),
      setup: async page => {
        await seedPdfBlob(page);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        await dismissCoach(page);
        const studyBtn = page.getByRole('button', { name: 'Study this exam' });
        await studyBtn.waitFor({ state: 'visible', timeout: 15000 });
        await studyBtn.click();
        await page.waitForTimeout(1500);
        const focusExam = page.getByRole('button', { name: 'Focus exam' });
        if (await focusExam.isVisible().catch(() => false)) {
          await focusExam.click();
          await page.waitForTimeout(600);
        }
      },
      verify: async page => {
        const shell = page.locator('[aria-label="Study session"]');
        const shellVisible = await shell.isVisible().catch(() => false);
        const notes = [];
        let pass = shellVisible;
        if (!shellVisible) notes.push('Study session shell not visible');

        const workChrome = await countVisible(
          page.locator('[data-composition-chip="1"], [data-composition-bubble="1"], [data-composition-gutter="1"]'),
        );
        if (workChrome > 0) {
          pass = false;
          notes.push('Composition chrome visible in exam focus');
        }
        return { pass, notes };
      },
    },
  ];

  for (const scenario of scenarios) {
    console.log(`Running: ${scenario.name}`);
    await runScenario(browser, scenario, results);
  }

  await browser.close();

  if (devProc) devProc.kill('SIGTERM');

  const reportPath = path.join(OUT_DIR, 'qa-report.json');
  await writeFile(reportPath, JSON.stringify(results, null, 2));

  const passed = results.scenarios.filter(s => s.pass).length;
  const failed = results.scenarios.filter(s => !s.pass);

  console.log('\n=== Composition UI QA ===');
  for (const s of results.scenarios) {
    console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.id}  ${s.name}`);
    if (s.notes.length) console.log('      ', s.notes.join('; '));
    if (s.screenshot) console.log('       screenshot:', s.screenshot);
  }
  console.log(`\n${passed}/${results.scenarios.length} scenarios passed`);
  if (failed.length) process.exitCode = 1;

  return results;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
