#!/usr/bin/env node
/**
 * Fail-closed static checks on a Vite `dist/` output.
 * Does not print secrets — only project-ref presence and staging-UI markers.
 *
 * Usage:
 *   node scripts/verify-build-target.mjs --target production --dist dist-production
 *   node scripts/verify-build-target.mjs --target staging --dist dist-staging
 */
import fs from 'node:fs';
import path from 'node:path';

const PROD_REF = 'comxmviofnotfwzbupxg';
const STAGING_REF = 'lmgrhmyurhjlwwdedojk';
const STAGING_UI_MARKERS = ['staging-magic-link-form', 'staging-magic-link-email'];

function fail(msg) {
  console.error(`[verify-build-target] FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`[verify-build-target] PASS: ${msg}`);
}

function parseArgs(argv) {
  const out = { target: null, dist: 'dist' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') out.target = argv[++i];
    else if (a === '--dist') out.dist = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/verify-build-target.mjs --target production|staging [--dist DIR]`);
      process.exit(0);
    } else fail(`unknown arg ${a}`);
  }
  if (out.target !== 'production' && out.target !== 'staging') {
    fail('--target must be production or staging');
  }
  return out;
}

function collectAssets(distDir) {
  const indexHtml = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtml)) fail(`missing ${indexHtml}`);
  const html = fs.readFileSync(indexHtml, 'utf8');
  const assetsDir = path.join(distDir, 'assets');
  const files = [];
  if (fs.existsSync(assetsDir)) {
    for (const name of fs.readdirSync(assetsDir)) {
      if (/\.(js|mjs|css|html)$/.test(name)) {
        files.push(path.join(assetsDir, name));
      }
    }
  }
  files.push(indexHtml);
  return { html, files };
}

function fileContains(filePath, needle) {
  const buf = fs.readFileSync(filePath);
  return buf.includes(Buffer.from(needle));
}

function anyContains(files, needle) {
  return files.some((f) => fileContains(f, needle));
}

const { target, dist } = parseArgs(process.argv);
const distDir = path.resolve(process.cwd(), dist);
if (!fs.existsSync(distDir)) fail(`dist dir missing: ${distDir}`);

const { files } = collectAssets(distDir);
const hasProd = anyContains(files, PROD_REF);
const hasStaging = anyContains(files, STAGING_REF);
const hasStagingUi = STAGING_UI_MARKERS.some((m) => anyContains(files, m));

if (target === 'production') {
  if (!hasProd) fail(`production build missing Supabase ref ${PROD_REF}`);
  if (hasStaging) fail(`production build must not embed staging ref ${STAGING_REF}`);
  if (hasStagingUi) fail('production build must not include staging-only auth UI markers');
  pass(`production bundle embeds ${PROD_REF} only; staging UI absent`);
} else {
  if (!hasStaging) fail(`staging build missing Supabase ref ${STAGING_REF}`);
  if (hasProd) fail(`staging build must not embed production ref ${PROD_REF}`);
  if (!hasStagingUi) fail('staging build expected staging-only auth UI markers (flag true)');
  pass(`staging bundle embeds ${STAGING_REF} only; staging UI present`);
}

console.log(`[verify-build-target] target=${target} dist=${distDir} files_scanned=${files.length}`);
