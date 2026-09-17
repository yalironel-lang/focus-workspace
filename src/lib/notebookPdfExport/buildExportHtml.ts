/**
 * Build a complete printable HTML document from canonical Notebook pages.
 * Fail-closed on malformed versioned bodies — never normalizes/rewrites storage.
 */

import { parseNotebookBody, type NotebookDialectBlock } from '../notebookDialect';
import { inkPageKeyForNotebookPage } from '../notebookPages/inkPageKey';
import type { NotebookContentWithPages, NotebookPage } from '../notebookPages/types';
import { collectExportPageSlices, type ExportPageSlice } from './collectPages';
import { escapeHtml } from './renderInlineHtml';
import { renderDialectBlocksHtml, type PdfAssetResolver } from './renderBlocksHtml';
import { NOTEBOOK_PDF_PRINT_CSS } from './printCss';
import { notebookPdfFilename } from './filename';
import {
  isGenericNotebookPageTitle,
  meaningfulExportPageTitle,
} from './pageTitles';

export type BuildExportHtmlResult =
  | {
      ok: true;
      html: string;
      filename: string;
      pageCount: number;
      imageKeys: string[];
      handwritingKeys: string[];
      /** Structural snapshot used for tests / zero-write checks (not persisted). */
      pagesExported: Array<{ id: string; kind: string; title: string }>;
    }
  | {
      ok: false;
      error: string;
      pageId?: string;
      pageTitle?: string;
    };

function collectAssetKeysFromBlocks(blocks: NotebookDialectBlock[]): {
  imageKeys: string[];
  handwritingKeys: string[];
} {
  const imageKeys: string[] = [];
  const handwritingKeys: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'image-ref') imageKeys.push(b.key);
    if (b.kind === 'handwriting') handwritingKeys.push(b.key);
  }
  return { imageKeys, handwritingKeys };
}

function parsePageBody(page: NotebookPage): NotebookDialectBlock[] {
  const body = page.documentBody ?? '';
  return parseNotebookBody(body, page.documentBodyCodecVersion);
}

/**
 * Drop a leading content title that duplicates notebook/page chrome or is a
 * generic “Page N” label — avoids Notebook / Page 1 / Page 1 stacks.
 */
function stripRedundantLeadTitle(
  blocks: NotebookDialectBlock[],
  opts: { pageTitle: string | null; notebookTitle: string | null },
): NotebookDialectBlock[] {
  if (blocks.length === 0) return blocks;
  const lead = blocks[0]!;
  if (lead.kind !== 'title') return blocks;
  const text = lead.text.trim();
  if (!text) return blocks.slice(1);
  if (isGenericNotebookPageTitle(text)) return blocks.slice(1);
  if (opts.pageTitle && text === opts.pageTitle) return blocks.slice(1);
  if (opts.notebookTitle && text === opts.notebookTitle) return blocks.slice(1);
  return blocks;
}

function renderDocumentPageHtml(
  slice: ExportPageSlice,
  assets: PdfAssetResolver,
  pageTitle: string | null,
  notebookTitleHtml: string,
  notebookTitleText: string | null,
): string {
  const blocks = stripRedundantLeadTitle(parsePageBody(slice.page), {
    pageTitle,
    notebookTitle: notebookTitleText,
  });
  const bodyHtml = renderDialectBlocksHtml(blocks, assets);
  const heading = pageTitle
    ? `<h2 class="nb-pdf-page-title">${escapeHtml(pageTitle)}</h2>`
    : '';
  return `<section class="nb-pdf-page" data-nb-pdf-page-id="${escapeHtml(slice.page.id)}" data-nb-pdf-page-index="${slice.index}" data-nb-pdf-page-kind="document">${notebookTitleHtml}${heading}${bodyHtml}</section>`;
}

function renderWritePageHtml(
  slice: ExportPageSlice,
  assets: PdfAssetResolver,
  pageTitle: string | null,
  notebookTitleHtml: string,
): string {
  const inkKey = inkPageKeyForNotebookPage(slice.page);
  const src = inkKey ? assets.handwritingSrc(inkKey) : null;
  const heading = pageTitle
    ? `<h2 class="nb-pdf-page-title">${escapeHtml(pageTitle)}</h2>`
    : '';
  const body = src
    ? `<figure class="nb-pdf-figure nb-pdf-hw nb-pdf-write-page"><img class="nb-pdf-hw-image" src="${escapeHtml(src)}" alt="${escapeHtml(pageTitle ?? slice.title)} handwriting" /></figure>`
    : `<div class="nb-pdf-missing" data-nb-pdf-missing="write-ink">Write page ink unavailable</div>`;
  return `<section class="nb-pdf-page" data-nb-pdf-page-id="${escapeHtml(slice.page.id)}" data-nb-pdf-page-index="${slice.index}" data-nb-pdf-page-kind="write">${notebookTitleHtml}${heading}${body}</section>`;
}

type BuildExtractFail = {
  ok: false;
  error: string;
  pageId?: string;
  pageTitle?: string;
};

export function planExportDocument(
  content: Pick<NotebookContentWithPages, 'pages' | 'sections' | 'body' | 'bodyCodecVersion'>,
):
  | {
      ok: true;
      slices: ExportPageSlice[];
      imageKeys: string[];
      handwritingKeys: string[];
    }
  | BuildExtractFail {
  const slices = collectExportPageSlices(content);
  const imageKeys: string[] = [];
  const handwritingKeys: string[] = [];

  for (const slice of slices) {
    try {
      if (slice.page.kind === 'write') {
        const inkKey = inkPageKeyForNotebookPage(slice.page);
        if (inkKey) handwritingKeys.push(inkKey);
        continue;
      }
      const blocks = parsePageBody(slice.page);
      const keys = collectAssetKeysFromBlocks(blocks);
      imageKeys.push(...keys.imageKeys);
      handwritingKeys.push(...keys.handwritingKeys);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'This page could not be read safely for export.',
        pageId: slice.page.id,
        pageTitle: slice.title,
      };
    }
  }

  return {
    ok: true,
    slices,
    imageKeys: [...new Set(imageKeys)],
    handwritingKeys: [...new Set(handwritingKeys)],
  };
}

export function buildExportHtmlDocument(opts: {
  content: Pick<NotebookContentWithPages, 'pages' | 'sections' | 'body' | 'bodyCodecVersion'>;
  notebookTitle: string | null | undefined;
  assets: PdfAssetResolver;
  /** Optional extra CSS (e.g. KaTeX) injected into <head>. */
  extraCss?: string;
}): BuildExportHtmlResult {
  const plan = planExportDocument(opts.content);
  if (!plan.ok) return plan;

  const filename = notebookPdfFilename(opts.notebookTitle);
  const titleText = (opts.notebookTitle ?? '').trim();
  // Emit notebook title once on the first page when a non-empty title exists.
  const showNotebookTitle = Boolean(titleText);
  const notebookTitleText = showNotebookTitle ? titleText : null;

  const pageHtml: string[] = [];
  for (let i = 0; i < plan.slices.length; i += 1) {
    const slice = plan.slices[i]!;
    const pageTitle = meaningfulExportPageTitle(slice.page);
    // Notebook title lives INSIDE the first page section (pagination-safe).
    const notebookTitleHtml =
      i === 0 && notebookTitleText
        ? `<h1 class="nb-pdf-notebook-title">${escapeHtml(notebookTitleText)}</h1>`
        : '';
    try {
      if (slice.page.kind === 'write') {
        pageHtml.push(
          renderWritePageHtml(slice, opts.assets, pageTitle, notebookTitleHtml),
        );
      } else {
        pageHtml.push(
          renderDocumentPageHtml(
            slice,
            opts.assets,
            pageTitle,
            notebookTitleHtml,
            i === 0 ? notebookTitleText : null,
          ),
        );
      }
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'This page could not be rendered safely for export.',
        pageId: slice.page.id,
        pageTitle: slice.title,
      };
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(filename.replace(/\.pdf$/i, ''))}</title>
<style>${NOTEBOOK_PDF_PRINT_CSS}</style>
${opts.extraCss ? `<style>${opts.extraCss}</style>` : ''}
</head>
<body>
<main class="nb-pdf-doc" data-nb-pdf-export="1" data-nb-pdf-pages="${plan.slices.length}">
${pageHtml.join('\n')}
</main>
</body>
</html>`;

  return {
    ok: true,
    html,
    filename,
    pageCount: plan.slices.length,
    imageKeys: plan.imageKeys,
    handwritingKeys: plan.handwritingKeys,
    pagesExported: plan.slices.map(s => ({
      id: s.page.id,
      kind: s.page.kind,
      title: s.title,
    })),
  };
}
