/**
 * Local Tesseract CLI OCR — argv array only (no shell interpolation).
 */

import { spawn } from 'node:child_process';
import { PAGE_OCR_SUBPROCESS_KILL_GRACE_MS, PAGE_OCR_TESSERACT_LANG } from './bounds.ts';

export type TesseractRunSuccess = {
  ok: true;
  text: string;
  ocrMs: number;
  engineVersion: string;
};

export type TesseractRunFailure = {
  ok: false;
  code: 'ocr_failed' | 'timeout';
  detail?: string;
  ocrMs: number;
  engineVersion: string;
};

export type TesseractRunResult = TesseractRunSuccess | TesseractRunFailure;

let cachedVersion: string | null = null;

export async function getTesseractVersion(
  tesseractBin = 'tesseract',
): Promise<string> {
  if (cachedVersion) return cachedVersion;
  const r = await runProcess(tesseractBin, ['--version'], 5_000);
  const first = (r.stdout || r.stderr).split('\n')[0]?.trim() || 'tesseract-unknown';
  cachedVersion = first.slice(0, 80);
  return cachedVersion;
}

export async function runLocalTesseract(input: {
  imagePath: string;
  timeoutMs: number;
  lang?: string;
  tesseractBin?: string;
}): Promise<TesseractRunResult> {
  const bin = input.tesseractBin ?? 'tesseract';
  const lang = input.lang ?? PAGE_OCR_TESSERACT_LANG;
  const engineVersion = await getTesseractVersion(bin).catch(() => 'tesseract-unknown');
  const started = Date.now();

  // stdout text: tesseract <image> stdout -l eng
  // Never pass untrusted strings into a shell — argv only.
  const args = [input.imagePath, 'stdout', '-l', lang, '--psm', '6'];
  const r = await runProcess(bin, args, input.timeoutMs);

  const ocrMs = Date.now() - started;
  if (r.timedOut) {
    return { ok: false, code: 'timeout', detail: 'tesseract_timeout', ocrMs, engineVersion };
  }
  if (r.exitCode !== 0) {
    return {
      ok: false,
      code: 'ocr_failed',
      detail: (r.stderr || `exit_${r.exitCode}`).replace(/\s+/g, ' ').slice(0, 200),
      ocrMs,
      engineVersion,
    };
  }
  return {
    ok: true,
    text: r.stdout,
    ocrMs,
    engineVersion,
  };
}

function runProcess(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, exitCode, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      setTimeout(() => finish(null), PAGE_OCR_SUBPROCESS_KILL_GRACE_MS);
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
      if (stdout.length > 2_000_000) stdout = stdout.slice(0, 2_000_000);
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
      if (stderr.length > 200_000) stderr = stderr.slice(0, 200_000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      stderr = err.message;
      finish(1);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(code);
    });
  });
}
