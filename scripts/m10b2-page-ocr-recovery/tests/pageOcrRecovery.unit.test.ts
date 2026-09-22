/**
 * @vitest-environment node
 *
 * M1.0B B2 — unit tests for isolated OCR recovery worker (no Tesseract / no PDF render).
 */

import { access, constants } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  PAGE_OCR_DEFAULT_DPI,
  PAGE_OCR_MAX_OUTPUT_CHARS,
  PAGE_OCR_RECOVERY_VERSION,
} from '../src/bounds.ts';
import { formatPageOcrRecoveryLogLine } from '../src/privacyLog.ts';
import { buildRecoveryIdentity } from '../src/recoveryIdentity.ts';
import { createLocalFixtureResolver } from '../src/resolveLocalFixtureSource.ts';
import { scoreMvtTheoremEvidence } from '../src/scoreMvtSemantic.ts';
import { createTempRenderSession, writeTempPng } from '../src/tempArtifacts.ts';
import { validatePageOcrRecoveryRequest } from '../src/validateRequest.ts';

describe('M1.0B B2 validatePageOcrRecoveryRequest', () => {
  const good = {
    sourceId: 'mvt-fixture-1',
    sourceVersion: 1,
    pageNumber: 3,
    extractionVersion: 'pdf-extract-v2-metrics',
    recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
  };

  it('accepts a valid identity request and defaults DPI', () => {
    const r = validatePageOcrRecoveryRequest(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.renderDpi).toBe(PAGE_OCR_DEFAULT_DPI);
    expect(r.request.recoveryVersion).toBe(PAGE_OCR_RECOVERY_VERSION);
  });

  it('rejects forbidden path / storage fields', () => {
    expect(
      validatePageOcrRecoveryRequest({ ...good, filePath: '/tmp/x.pdf' }).ok,
    ).toBe(false);
    expect(
      validatePageOcrRecoveryRequest({ ...good, storagePath: 'a/b/c' }).ok,
    ).toBe(false);
    expect(validatePageOcrRecoveryRequest({ ...good, path: 'x' }).ok).toBe(false);
  });

  it('rejects path-like sourceId and invalid page numbers', () => {
    expect(
      validatePageOcrRecoveryRequest({ ...good, sourceId: '../etc/passwd' }).ok,
    ).toBe(false);
    const badPage = validatePageOcrRecoveryRequest({ ...good, pageNumber: 0 });
    expect(badPage.ok).toBe(false);
    if (badPage.ok) return;
    expect(badPage.errorCode).toBe('invalid_page');
  });

  it('rejects unsupported recoveryVersion', () => {
    const r = validatePageOcrRecoveryRequest({ ...good, recoveryVersion: 'v0' });
    expect(r.ok).toBe(false);
  });
});

describe('M1.0B B2 recovery identity + fixture adapter', () => {
  it('builds deterministic recovery identity', () => {
    const a = buildRecoveryIdentity({
      sourceId: 'src',
      sourceVersion: 2,
      pageNumber: 3,
    });
    const b = buildRecoveryIdentity({
      sourceId: 'src',
      sourceVersion: 2,
      pageNumber: 3,
      recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
    });
    expect(a).toBe(b);
    expect(a).toBe(`src@v2:p3:${PAGE_OCR_RECOVERY_VERSION}`);
  });

  it('local fixture resolver only serves registered opaque ids', async () => {
    const resolver = createLocalFixtureResolver({
      'mvt-fixture-1': {
        sourceVersion: 1,
        absolutePath: '/no/such/file-should-fail-read.pdf',
      },
    });
    expect(await resolver({ sourceId: '/tmp/evil.pdf', sourceVersion: 1 })).toBeNull();
    expect(await resolver({ sourceId: 'mvt-fixture-1', sourceVersion: 99 })).toBeNull();
    expect(await resolver({ sourceId: 'mvt-fixture-1', sourceVersion: 1 })).toBeNull();
  });
});

describe('M1.0B B2 temp artifacts', () => {
  it('creates unique temp dirs and cleans up after dispose', async () => {
    const a = await createTempRenderSession();
    const b = await createTempRenderSession();
    expect(a.dir).not.toBe(b.dir);
    await writeTempPng(a, new Uint8Array([137, 80, 78, 71]));
    await access(a.imagePath, constants.F_OK);
    await a.dispose();
    await expect(access(a.dir, constants.F_OK)).rejects.toBeTruthy();
    await b.dispose();
  });
});

describe('M1.0B B2 privacy log + semantic scorer', () => {
  it('privacy log omits recovered text', () => {
    const line = formatPageOcrRecoveryLogLine({
      sourceId: 's',
      sourceVersion: 1,
      pageNumber: 3,
      recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
      status: 'recovered',
      recoveredText: 'SECRET THEOREM TEXT continuous differentiable',
      metadata: {
        durationMs: 10,
        renderDpi: 220,
        engine: 'tesseract',
        engineVersion: 'tesseract 5',
        renderer: 'pdfjs+napi-canvas',
        recoveredCharCount: 40,
        recoveryIdentity: 's@v1:p3:page-ocr-recovery-v1',
      },
    });
    expect(line).not.toMatch(/SECRET|continuous|differentiable/);
    expect(JSON.parse(line).recoveredCharCount).toBe(40);
  });

  it('scores MVT evidence without LLM fill-in', () => {
    const passish = scoreMvtTheoremEvidence(
      'If f is continuous on [a,b] and differentiable on (a,b), then there exists c in (a,b) such that f\'(c)=(f(b)-f(a))/(b-a).',
    );
    expect(passish.overall).toBe('PASS');
    expect(passish.score).toBe(6);

    const shell = scoreMvtTheoremEvidence(
      'If is a continuous function on and differentiable on its interior. Then: Theorem',
    );
    expect(shell.checks.continuity).toBe(true);
    expect(shell.checks.interval_domain).toBe(false);
    expect(shell.overall).not.toBe('PASS');
  });

  it('documents output size bound constant', () => {
    expect(PAGE_OCR_MAX_OUTPUT_CHARS).toBe(50_000);
  });
});

describe('M1.0B B2 recoverPage failure mapping (mocked source)', () => {
  it('maps missing source and does not throw', async () => {
    const { recoverPdfPage } = await import('../src/recoverPage.ts');
    const result = await recoverPdfPage(
      {
        sourceId: 'missing',
        sourceVersion: 1,
        pageNumber: 1,
        extractionVersion: 'pdf-extract-v2-metrics',
        recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
      },
      {
        resolveSource: async () => null,
      },
    );
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('source_unavailable');
    expect(result.recoveredText).toBeUndefined();
  });

  it('rejects path smuggling before resolve', async () => {
    const { recoverPdfPage } = await import('../src/recoverPage.ts');
    const resolve = vi.fn(async () => null);
    const result = await recoverPdfPage(
      {
        sourceId: 'ok',
        sourceVersion: 1,
        pageNumber: 1,
        extractionVersion: 'pdf-extract-v2-metrics',
        recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
        filePath: '/etc/passwd',
      },
      { resolveSource: resolve },
    );
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('invalid_request');
    expect(resolve).not.toHaveBeenCalled();
  });
});
