/**
 * M7.6 — Notebook PDF export (canonical pages[] → print HTML).
 * Read-only: never mutates bodies / activePageId / codecs.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { encodeNotebookTextV1 } from '../notebookTextCodec';
import type { NotebookContentWithPages, NotebookPage } from '../notebookPages/types';
import { hwSet, resetNotebookHandwritingStoreForTests } from '../notebookHandwritingStore';
import { emptyHandwritingData } from '../handwritingTypes';
import {
  collectNotebookPagesForExport,
  notebookPdfFilename,
  sanitizeNotebookPdfBasename,
  planExportDocument,
  buildExportHtmlDocument,
  exportNotebookPdf,
} from './index';
import { renderRichLineHtml } from './renderInlineHtml';
import { renderDialectBlocksHtml } from './renderBlocksHtml';
import type { PdfAssetResolver } from './renderBlocksHtml';
import { parseNotebookBody } from '../notebookDialect';
import { NOTEBOOK_PDF_PRINT_CSS } from './printCss';
import { __testOnlyIsKatexOnlyRule } from './printPdf';
import {
  computeHandwritingStrokeBounds,
} from './resolveAssets';

function docPage(
  id: string,
  title: string,
  body: string,
  codec?: number,
  sectionId = 'sec-1',
): NotebookPage {
  return {
    id,
    sectionId,
    kind: 'document',
    title,
    documentBody: body,
    ...(codec !== undefined ? { documentBodyCodecVersion: codec } : {}),
  };
}

function writePage(id: string, title: string, inkPageKey: string, sectionId = 'sec-1'): NotebookPage {
  return {
    id,
    sectionId,
    kind: 'write',
    title,
    inkPageKey,
  };
}

function notebook(
  pages: NotebookPage[],
  activePageId: string,
  extras?: Partial<NotebookContentWithPages>,
): NotebookContentWithPages {
  const active = pages.find(p => p.id === activePageId) ?? pages[0]!;
  return {
    type: 'notebook',
    body: active.documentBody ?? '',
    bodyCodecVersion: active.documentBodyCodecVersion,
    schemaVersion: 1,
    sections: [
      {
        id: 'sec-1',
        title: 'Notes',
        pageIds: pages.map(p => p.id),
      },
    ],
    pages,
    activeSectionId: 'sec-1',
    activePageId,
    ...extras,
  };
}

const emptyAssets: PdfAssetResolver = {
  imageSrc: () => null,
  handwritingSrc: () => null,
};

describe('M7.6 filename sanitization', () => {
  it('22. sanitizes invalid filename characters', () => {
    expect(sanitizeNotebookPdfBasename('Macro/Notes: Final*?')).toBe('MacroNotes Final');
    expect(notebookPdfFilename('Macroeconomics Notes')).toBe('Macroeconomics Notes.pdf');
    expect(notebookPdfFilename('')).toBe('Notebook.pdf');
    expect(notebookPdfFilename('   ')).toBe('Notebook.pdf');
    expect(notebookPdfFilename('con')).toBe('Notebook.pdf');
  });
});

describe('M7.6 multi-page collection + active isolation', () => {
  it('1+2. entire notebook exported; active page does not affect set/order', () => {
    const pages = [
      docPage('a', 'Page A', '# A\n'),
      docPage('b', 'Page B', '# B\n'),
      docPage('c', 'Page C', '# C\n'),
    ];
    const onB = notebook(pages, 'b');
    const onC = notebook(pages, 'c');
    const idsB = collectNotebookPagesForExport(onB).map(p => p.id);
    const idsC = collectNotebookPagesForExport(onC).map(p => p.id);
    expect(idsB).toEqual(['a', 'b', 'c']);
    expect(idsC).toEqual(['a', 'b', 'c']);
  });

  it('23. pages with different content remain isolated in HTML', () => {
    const pages = [
      docPage('a', 'Alpha', 'Only on A\n'),
      docPage('b', 'Beta', 'Only on B\n'),
    ];
    const content = notebook(pages, 'b');
    const built = buildExportHtmlDocument({
      content,
      notebookTitle: 'Isolation',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.html).toContain('data-nb-pdf-page-id="a"');
    expect(built.html).toContain('data-nb-pdf-page-id="b"');
    expect(built.html).toContain('Only on A');
    expect(built.html).toContain('Only on B');
    const idxA = built.html.indexOf('Only on A');
    const idxB = built.html.indexOf('Only on B');
    expect(idxA).toBeLessThan(idxB);
  });
});

describe('M7.6 content coverage', () => {
  it('3. paragraphs + inline formatting', () => {
    const body = encodeNotebookTextV1([
      {
        kind: 'paragraph',
        text: 'BoldItalic',
        marks: [
          { s: 0, e: 4, t: 'b' },
          { s: 4, e: 10, t: 'i' },
        ],
      },
    ]);
    const html = renderDialectBlocksHtml(parseNotebookBody(body, 1), emptyAssets);
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
  });

  it('4. academic blocks', () => {
    const body = encodeNotebookTextV1([
      { kind: 'callout', tone: 'definition', text: 'Def text' },
      { kind: 'callout', tone: 'theorem', text: 'Thm text' },
      { kind: 'callout', tone: 'example', text: 'Ex text' },
      { kind: 'callout', tone: 'mistake', text: 'Oops' },
      { kind: 'callout', tone: 'summary', text: 'Sum' },
      { kind: 'callout', tone: 'review', text: 'Rev' },
      { kind: 'callout', tone: 'concept', text: 'Key' },
    ]);
    const html = renderDialectBlocksHtml(parseNotebookBody(body, 1), emptyAssets);
    expect(html).toContain('Definition');
    expect(html).toContain('Theorem');
    expect(html).toContain('Example');
    expect(html).toContain('Common Mistake');
    expect(html).toContain('Summary');
    expect(html).toContain('Review');
    expect(html).toContain('Key Concept');
  });

  it('5. inline math', () => {
    const html = renderRichLineHtml('E=mc^2', [{ s: 0, e: 6, t: 'm' }]);
    expect(html).toContain('nb-pdf-math-inline');
    expect(html).toContain('dir="ltr"');
    expect(html).toMatch(/katex|E/);
  });

  it('6. standalone math', () => {
    const body = encodeNotebookTextV1([{ kind: 'math', text: 'x^2 + y^2' }]);
    const html = renderDialectBlocksHtml(parseNotebookBody(body, 1), emptyAssets);
    expect(html).toContain('nb-pdf-math-display');
    expect(html).toContain('dir="ltr"');
  });

  it('7. tables', () => {
    const body = encodeNotebookTextV1([
      {
        kind: 'table',
        rows: [
          [{ t: 'A' }, { t: 'B' }],
          [{ t: '1' }, { t: '2' }],
        ],
      },
    ]);
    const html = renderDialectBlocksHtml(parseNotebookBody(body, 1), emptyAssets);
    expect(html).toContain('nb-pdf-table');
    expect(html).toContain('<td');
    expect(html).toContain('A');
    expect(html).toContain('2');
  });

  it('8. images with stored width', () => {
    const assets: PdfAssetResolver = {
      imageSrc: key => (key === 'img1' ? 'data:image/png;base64,abc' : null),
      handwritingSrc: () => null,
    };
    const body = '::img::img1::"Photo"::480::';
    const html = renderDialectBlocksHtml(parseNotebookBody(body), assets);
    expect(html).toContain('nb-pdf-image');
    expect(html).toContain('width:480px');
    expect(html).toContain('max-width:100%');
  });

  it('9. handwriting renders when asset present', () => {
    const assets: PdfAssetResolver = {
      imageSrc: () => null,
      handwritingSrc: key => (key === 'hw1' ? 'data:image/png;base64,hw' : null),
    };
    const html = renderDialectBlocksHtml(parseNotebookBody('::hw::hw1::'), assets);
    expect(html).toContain('nb-pdf-hw-image');
  });

  it('10. Hebrew RTL', () => {
    const html = renderDialectBlocksHtml(
      parseNotebookBody('שלום עולם\n'),
      emptyAssets,
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('שלום');
  });

  it('11. English LTR', () => {
    const html = renderDialectBlocksHtml(
      parseNotebookBody('Hello world\n'),
      emptyAssets,
    );
    expect(html).toContain('dir="ltr"');
  });

  it('12. mixed RTL + math stays readable with LTR math isolate', () => {
    const html = renderRichLineHtml('נוסחה x^2 כאן', [{ s: 6, e: 9, t: 'm' }]);
    expect(html).toContain('nb-pdf-math-inline');
    expect(html).toContain('unicode-bidi:isolate');
  });

  it('13. links sanitized correctly', () => {
    const safe = renderRichLineHtml('safe', [{ s: 0, e: 4, t: 'a', v: 'https://example.com' }]);
    expect(safe).toContain('href="https://example.com"');
    const unsafe = renderRichLineHtml('bad', [
      { s: 0, e: 3, t: 'a', v: 'javascript:alert(1)' },
    ]);
    expect(unsafe).not.toContain('javascript:');
    expect(unsafe).not.toContain('href=');
    expect(unsafe).toContain('nb-pdf-link-unsafe');
  });
});

describe('M7.6 pagination / overflow safety (CSS contract)', () => {
  it('14+15+16. print CSS avoids naive clipping for images/tables/long content', () => {
    const pages = [
      docPage(
        'long',
        'Long',
        Array.from({ length: 40 }, (_, i) => `Paragraph ${i} with enough text to wrap across lines.`).join('\n'),
      ),
    ];
    const built = buildExportHtmlDocument({
      content: notebook(pages, 'long'),
      notebookTitle: 'Long Notes',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.html).toContain('@page');
    expect(built.html).toContain('size: A4');
    expect(built.html).toContain('break-inside: avoid');
    expect(built.html).toContain('nb-pdf-table');
    expect(built.html).toMatch(/max-width:\s*100%/);
    expect(built.html).toContain('Paragraph 39');
  });

  it('15. large image does not overflow (max-width + height auto + figure cap)', () => {
    const assets: PdfAssetResolver = {
      imageSrc: () => 'data:image/png;base64,xx',
      handwritingSrc: () => null,
    };
    const html = renderDialectBlocksHtml(
      parseNotebookBody('::img::big::"Wide"::2800::'),
      assets,
    );
    expect(html).toContain('nb-pdf-image');
    expect(html).toContain('nb-pdf-image-figure');
    expect(html).toContain('max-width:100%');
    expect(html).toContain('height:auto');
    // Stored width is capped to printable ~88% content width
    expect(html).toContain('width:580px');
    expect(html).not.toContain('width:2800px');
  });

  it('16. table wrap uses fixed layout + break-word', () => {
    const built = buildExportHtmlDocument({
      content: notebook(
        [
          docPage(
            't',
            'T',
            encodeNotebookTextV1([
              {
                kind: 'table',
                rows: [[{ t: 'verylongcellcontentwithoutspaces' }, { t: 'b' }]],
              },
            ]),
            1,
          ),
        ],
        't',
      ),
      notebookTitle: 'T',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.html).toContain('table-layout: fixed');
    expect(built.html).toContain('overflow-wrap: anywhere');
  });
});

describe('M7.6 missing assets + fail-closed + zero-write', () => {
  beforeEach(() => {
    resetNotebookHandwritingStoreForTests();
  });

  it('17. missing image handled safely', () => {
    const html = renderDialectBlocksHtml(
      parseNotebookBody('::img::missing::"Gone"::'),
      emptyAssets,
    );
    expect(html).toContain('data-nb-pdf-missing="image"');
    expect(html).not.toContain('<img');
  });

  it('18. malformed versioned body fails safely (no rewrite)', () => {
    const pages = [
      docPage('ok', 'OK', 'Hello\n'),
      docPage('bad', 'Bad', '~nb1:NOT_JSON', 1),
    ];
    const content = notebook(pages, 'ok');
    const before = JSON.stringify(content);
    const plan = planExportDocument(content);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.pageId).toBe('bad');
    expect(JSON.stringify(content)).toBe(before);
  });

  it('19+20+21. export causes zero persistence writes / no activePageId / body mutation', async () => {
    const pages = [
      docPage('a', 'A', '# Page A body\n'),
      docPage('b', 'B', '# Page B body\n'),
    ];
    const content = notebook(pages, 'b');
    const before = JSON.stringify(content);
    const activeBefore = content.activePageId;
    const bodiesBefore = pages.map(p => p.documentBody);

    const result = await exportNotebookPdf({
      content,
      notebookTitle: 'Zero Write',
      openPrintDialog: false,
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(content)).toBe(before);
    expect(content.activePageId).toBe(activeBefore);
    expect(content.pages!.map(p => p.documentBody)).toEqual(bodiesBefore);
  });

  it('write pages included via ink (not silently dropped)', async () => {
    const pages = [
      docPage('a', 'Doc', 'Text page\n'),
      writePage('w', 'Write', 'ink-w'),
    ];
    const content = notebook(pages, 'a');
    await hwSet('obj-1', 'ink-w', {
      ...emptyHandwritingData(200, 120),
      strokes: [
        {
          id: 's1',
          tool: 'pen',
          color: '#111',
          width: 2,
          points: [
            { x: 0.1, y: 0.1, t: 0 },
            { x: 0.5, y: 0.5, t: 10 },
          ],
        },
      ],
    });
    const result = await exportNotebookPdf({
      content,
      notebookTitle: 'With Write',
      objectId: 'obj-1',
      openPrintDialog: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pagesExported.map(p => p.id)).toEqual(['a', 'w']);
    expect(result.html).toContain('data-nb-pdf-page-kind="write"');
    expect(result.html).toContain('nb-pdf-hw-image');
  });

  it('async export hydrates image when present', async () => {
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const pages = [docPage('a', 'Img', '::img::img-export::dot::')];
    const content = notebook(pages, 'a');
    const plan = planExportDocument(content);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.imageKeys).toContain('img-export');

    const result = await exportNotebookPdf({
      content,
      notebookTitle: 'Img Notes',
      openPrintDialog: false,
      assets: {
        imageSrc: key => (key === 'img-export' ? tinyPng : null),
        handwritingSrc: () => null,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('nb-pdf-image');
    expect(result.html).toContain('src="data:image/');
    expect(result.html).not.toContain('data-nb-pdf-missing="image"');
  });
});

describe('M7.6 UX wiring presence', () => {
  it('ProjectNotebookBlock exposes Export PDF action', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/components/project-space/ProjectNotebookBlock.tsx'),
      'utf8',
    );
    expect(src).toContain('exportNotebookPdf');
    expect(src).toContain('exportNotebookAsPdf');
    expect(src).toContain('onExportPdf');
    expect(src).toContain('Export PDF');
  });

  it('TipTap product toolbar More menu wires Export PDF', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const editorSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/notebook/tiptap/NotebookTiptapCandidateEditor.tsx'),
      'utf8',
    );
    const moreSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/notebook/tiptap/NotebookTiptapProductMoreMenu.tsx'),
      'utf8',
    );
    expect(editorSrc).toContain('NotebookTiptapProductMoreMenu');
    expect(editorSrc).toContain('onExportPdf');
    expect(editorSrc).toContain('data-nb-product-toolbar-group="more"');
    expect(moreSrc).toContain('data-nb-product-export-pdf');
    expect(moreSrc).toContain('Export PDF');
    expect(moreSrc).toContain('onExportPdf');
  });
});

describe('M7.6 print dialog not required for build path', () => {
  it('openPrintDialog false completes without opening print UI', async () => {
    const result = await exportNotebookPdf({
      content: notebook([docPage('a', 'A', 'Hi\n')], 'a'),
      notebookTitle: 'No Print',
      openPrintDialog: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('Hi');
    expect(result.filename).toBe('No Print.pdf');
  });
});

describe('M7.6 print layout contract (blank-page + theme isolation)', () => {
  it('1+2. first notebook page has no forced break; later pages do via adjacent sibling', () => {
    // Adjacent-sibling pagination — not :first-child (title used to break that).
    expect(NOTEBOOK_PDF_PRINT_CSS).toContain('.nb-pdf-page + .nb-pdf-page');
    expect(NOTEBOOK_PDF_PRINT_CSS).toMatch(
      /\.nb-pdf-page\s*\+\s*\.nb-pdf-page\s*\{[^}]*page-break-before:\s*always/s,
    );
    expect(NOTEBOOK_PDF_PRINT_CSS).toMatch(
      /\.nb-pdf-page\s*\{[^}]*page-break-before:\s*auto/s,
    );
    // Must NOT rely on broken :first-child selector for pagination.
    expect(NOTEBOOK_PDF_PRINT_CSS).not.toContain('.nb-pdf-page:first-child');
  });

  it('3. notebook title is inside first page section — no wrapper blank page', () => {
    const pages = [
      docPage('a', 'Page A', 'Content A\n'),
      docPage('b', 'Page B', 'Content B\n'),
    ];
    const built = buildExportHtmlDocument({
      content: notebook(pages, 'b'),
      notebookTitle: 'Macro Notes',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.html).toMatch(
      /<main class="nb-pdf-doc"[^>]*>\s*<section class="nb-pdf-page"[^>]*data-nb-pdf-page-index="0"/,
    );
    const titleElIdx = built.html.indexOf('<h1 class="nb-pdf-notebook-title">');
    const firstSectionIdx = built.html.indexOf('data-nb-pdf-page-index="0"');
    const secondSectionIdx = built.html.indexOf('data-nb-pdf-page-index="1"');
    expect(firstSectionIdx).toBeGreaterThan(-1);
    expect(secondSectionIdx).toBeGreaterThan(firstSectionIdx);
    expect(titleElIdx).toBeGreaterThan(firstSectionIdx);
    expect(titleElIdx).toBeLessThan(secondSectionIdx);
    expect(built.html.match(/class="nb-pdf-page"/g)?.length).toBe(2);
    expect(built.pageCount).toBe(2);
  });

  it('4. print CSS forces white background / dark text', () => {
    expect(NOTEBOOK_PDF_PRINT_CSS).toMatch(/background:\s*#ffffff\s*!important/);
    expect(NOTEBOOK_PDF_PRINT_CSS).toMatch(/color:\s*#1c1917\s*!important/);
  });

  it('4b. built HTML declares light-only color-scheme and white canvas', () => {
    const built = buildExportHtmlDocument({
      content: notebook([docPage('a', 'A', 'Hi\n')], 'a'),
      notebookTitle: 'Light',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.html).toContain('color-scheme" content="light only"');
    expect(built.html).toMatch(/background:\s*#ffffff\s*!important/);
    expect(built.html).not.toMatch(/rgba\(15,\s*23,\s*42/); // app dark slate
  });

  it('5. media has print-safe width/height constraints in CSS', () => {
    expect(NOTEBOOK_PDF_PRINT_CSS).toMatch(/\.nb-pdf-figure\s*\{[\s\S]*max-width:\s*90%/);
    expect(NOTEBOOK_PDF_PRINT_CSS).toMatch(/\.nb-pdf-image\s*\{[\s\S]*max-width:\s*100%\s*!important/);
    expect(NOTEBOOK_PDF_PRINT_CSS).toMatch(/\.nb-pdf-image\s*\{[\s\S]*height:\s*auto\s*!important/);
    expect(NOTEBOOK_PDF_PRINT_CSS).toMatch(/\.nb-pdf-hw-image\s*\{[\s\S]*max-height:\s*110mm/);
    expect(NOTEBOOK_PDF_PRINT_CSS).not.toMatch(/\.nb-pdf-hw-image\s*\{[\s\S]*border:\s*1px solid/);
  });

  it('6. no app chrome classes/selectors in export document', () => {
    const built = buildExportHtmlDocument({
      content: notebook(
        [
          docPage('a', 'A', 'Hello\n'),
          docPage('b', 'B', 'World\n'),
        ],
        'a',
      ),
      notebookTitle: 'Clean',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.html).not.toContain('data-nb-product-toolbar');
    expect(built.html).not.toContain('data-nb-candidate');
    expect(built.html).not.toContain('ProseMirror');
    expect(built.html).not.toContain('nb-selection-toolbar');
    expect(built.html).toContain('data-nb-pdf-export="1"');
  });

  it('7+8. zero-write + pages[] order preserved after print-layout fix', async () => {
    const pages = [
      docPage('a', 'A', 'Only A\n'),
      docPage('b', 'B', 'Only B\n'),
    ];
    const content = notebook(pages, 'b');
    const before = JSON.stringify(content);
    const result = await exportNotebookPdf({
      content,
      notebookTitle: 'Order',
      openPrintDialog: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(content)).toBe(before);
    expect(content.activePageId).toBe('b');
    expect(result.pagesExported.map(p => p.id)).toEqual(['a', 'b']);
    expect(result.html.indexOf('Only A')).toBeLessThan(result.html.indexOf('Only B'));
  });

  it('katex host filter rejects dark-theme body rules', () => {
    expect(__testOnlyIsKatexOnlyRule('.katex { font-size: 1.2em; }')).toBe(true);
    expect(__testOnlyIsKatexOnlyRule('@font-face { font-family: KaTeX_Main; src: url(x); }')).toBe(
      true,
    );
    expect(
      __testOnlyIsKatexOnlyRule('body { background: #0f172a; color: #f8fafc; }'),
    ).toBe(false);
    expect(
      __testOnlyIsKatexOnlyRule('.nb-workspace { background: rgba(15,23,42,0.92); }'),
    ).toBe(false);
  });
});

describe('M7.6 visual polish — title hierarchy + handwriting crop', () => {
  it('suppresses generic Page N chrome headings (no Notebook/Page 1/Page 1 stack)', () => {
    const pages = [
      docPage('a', 'Page 1', '# Page 1\nBody on A\n'),
      docPage('b', 'Page 2', 'Body on B\n'),
    ];
    const built = buildExportHtmlDocument({
      content: notebook(pages, 'a'),
      notebookTitle: 'Notebook',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Notebook title once
    expect(built.html.match(/<h1 class="nb-pdf-notebook-title">/g)?.length).toBe(1);
    expect(built.html).toContain('<h1 class="nb-pdf-notebook-title">Notebook</h1>');
    // No generic page chrome headings
    expect(built.html).not.toContain('class="nb-pdf-page-title"');
    // Leading content title “Page 1” stripped as generic/redundant
    expect(built.html).not.toMatch(/class="nb-pdf-title"[^>]*>Page 1</);
    expect(built.html).toContain('Body on A');
    expect(built.html).toContain('Body on B');
  });

  it('preserves meaningful renamed page titles', () => {
    const pages = [
      docPage('a', 'Lecture Notes', 'Intro paragraph\n'),
      docPage('b', 'Problem Set', 'Q1\n'),
    ];
    const built = buildExportHtmlDocument({
      content: notebook(pages, 'b'),
      notebookTitle: 'Macroeconomics',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.html.match(/<h1 class="nb-pdf-notebook-title">/g)?.length).toBe(1);
    expect(built.html).toContain('<h1 class="nb-pdf-notebook-title">Macroeconomics</h1>');
    expect(built.html).toContain('<h2 class="nb-pdf-page-title">Lecture Notes</h2>');
    expect(built.html).toContain('<h2 class="nb-pdf-page-title">Problem Set</h2>');
    // Title only on first page section
    const first = built.html.indexOf('data-nb-pdf-page-index="0"');
    const second = built.html.indexOf('data-nb-pdf-page-index="1"');
    const nbTitle = built.html.indexOf('<h1 class="nb-pdf-notebook-title">');
    expect(nbTitle).toBeGreaterThan(first);
    expect(nbTitle).toBeLessThan(second);
  });

  it('strips lead content title that duplicates page chrome title', () => {
    const pages = [docPage('a', 'Derivatives', '# Derivatives\nBody text\n')];
    const built = buildExportHtmlDocument({
      content: notebook(pages, 'a'),
      notebookTitle: 'Calc',
      assets: emptyAssets,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.html).toContain('<h2 class="nb-pdf-page-title">Derivatives</h2>');
    expect(built.html.match(/Derivatives/g)?.length).toBe(1); // chrome only, not duplicated in body
    expect(built.html).toContain('Body text');
  });

  it('handwriting stroke bounds crop empty margins without mutating strokes', () => {
    const strokes = [
      {
        id: 's1',
        tool: 'pen' as const,
        color: '#111',
        width: 2,
        points: [
          { x: 0.1, y: 0.1, t: 0 },
          { x: 0.5, y: 0.5, t: 10 },
        ],
      },
    ];
    const bounds = computeHandwritingStrokeBounds(strokes);
    expect(bounds).toEqual({ minX: 0.1, minY: 0.1, maxX: 0.5, maxY: 0.5 });
    // Padding expands the crop but stays inside the canvas — export-only geometry.
    const pad = 0.035;
    expect(bounds!.minX - pad).toBeGreaterThan(0);
    expect(bounds!.maxX + pad).toBeLessThan(1);
    // Input strokes unchanged (crop must never rewrite stored points).
    expect(strokes[0]!.points[0]).toEqual({ x: 0.1, y: 0.1, t: 0 });
    expect(strokes[0]!.points[1]).toEqual({ x: 0.5, y: 0.5, t: 10 });
  });
});
