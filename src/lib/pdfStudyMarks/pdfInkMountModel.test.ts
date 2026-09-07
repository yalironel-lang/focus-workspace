/**
 * Overlay mount model: every in-window page gets its own overlay, not only visiblePage.
 *
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PdfJsScrollViewer overlay mount model', () => {
  const src = readFileSync(
    resolve(__dirname, '../../components/project-space/PdfJsScrollViewer.tsx'),
    'utf8',
  );

  it('mounts overlay for all inWindow pages (not visiblePage-only)', () => {
    expect(src).toMatch(/renderPageOverlay && inWindow \? renderPageOverlay\(pageNum\)/);
    expect(src).toMatch(/data-pdf-scroll-host="1"/);
    // must not gate overlay solely on visiblePage
    expect(src).not.toMatch(/visiblePage === pageNum[\s\S]{0,80}renderPageOverlay/);
  });
});

describe('FreeSpacePdfCard ink wiring', () => {
  const src = readFileSync(
    resolve(__dirname, '../../components/project-space/FreeSpacePdfCard.tsx'),
    'utf8',
  );

  it('passes per-page regions/strokes into overlay', () => {
    expect(src).toMatch(/regions=\{studyMarks\.regionsForPage\(pageNum\)\}/);
    expect(src).toMatch(/strokes=\{studyMarks\.strokesForPage\(pageNum\)\}/);
    expect(src).toMatch(/onAddStroke=\{studyMarks\.addStroke\}/);
  });

  it('enables study marks when PDF ready (not only study session)', () => {
    expect(src).toMatch(/enabled:\s*loadState === 'ready' && !suspendViewer/);
  });

  it('exposes Annotate / View / Clear page chrome', () => {
    expect(src).toMatch(/Annotate/);
    expect(src).toMatch(/Clear page/);
    expect(src).toMatch(/setTool\('view'\)/);
  });
});
