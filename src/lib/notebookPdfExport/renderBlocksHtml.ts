/**
 * Notebook dialect blocks → semantic HTML for PDF export.
 */

import type { NotebookDialectBlock, CalloutTone } from '../notebookDialect';
import type { TableCellV1 } from '../notebookTableCodec';
import {
  blockDirAttr,
  escapeHtml,
  katexDisplayHtml,
  renderRichLineHtml,
} from './renderInlineHtml';

export type PdfAssetResolver = {
  /** data URL or null when missing */
  imageSrc: (key: string) => string | null;
  /** PNG data URL or null when missing / empty */
  handwritingSrc: (blockKey: string) => string | null;
};

const CALLOUT_LABEL: Record<CalloutTone, string> = {
  definition: 'Definition',
  concept: 'Key Concept',
  theorem: 'Theorem',
  example: 'Example',
  mistake: 'Common Mistake',
  summary: 'Summary',
  review: 'Review',
};

function alignStyle(align: string | undefined): string {
  if (align === 'center' || align === 'right') return ` style="text-align:${align}"`;
  return '';
}

function renderTableCell(cell: TableCellV1): string {
  const inner = renderRichLineHtml(cell.t, cell.m);
  const dir = blockDirAttr(cell.t);
  return `<td${dir}>${inner || '&nbsp;'}</td>`;
}

function renderTable(rows: TableCellV1[][]): string {
  const body = rows
    .map(row => `<tr>${row.map(renderTableCell).join('')}</tr>`)
    .join('');
  return `<div class="nb-pdf-table-wrap"><table class="nb-pdf-table">${body}</table></div>`;
}

function renderImage(key: string, alt: string, width: number | null | undefined, assets: PdfAssetResolver): string {
  const src = assets.imageSrc(key);
  // Printable content width ≈ 174mm; prefer ~88% (~580px) unless stored width is smaller.
  const PRINT_MAX_PX = 580;
  const w =
    typeof width === 'number' && width >= 50 && width <= 3000
      ? Math.min(width, PRINT_MAX_PX)
      : null;
  if (!src) {
    return `<div class="nb-pdf-missing" data-nb-pdf-missing="image">Image unavailable${alt ? ` — ${escapeHtml(alt)}` : ''}</div>`;
  }
  // Prefer CSS figure max-width (90%); only set inline width when stored width is useful.
  const style = w
    ? `width:${w}px;max-width:100%;height:auto`
    : 'max-width:100%;height:auto';
  return `<figure class="nb-pdf-figure nb-pdf-image-figure"><img class="nb-pdf-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="${style}" /></figure>`;
}

function renderHandwriting(key: string, assets: PdfAssetResolver): string {
  const src = assets.handwritingSrc(key);
  if (!src) {
    return `<div class="nb-pdf-missing" data-nb-pdf-missing="handwriting">Handwriting unavailable</div>`;
  }
  return `<figure class="nb-pdf-figure nb-pdf-hw"><img class="nb-pdf-hw-image" src="${escapeHtml(src)}" alt="Handwriting" /></figure>`;
}

export function renderDialectBlockHtml(block: NotebookDialectBlock, assets: PdfAssetResolver): string {
  switch (block.kind) {
    case 'divider':
      return `<hr class="nb-pdf-divider" />`;
    case 'title': {
      const inner = renderRichLineHtml(block.text, block.marks);
      return `<h1 class="nb-pdf-title"${blockDirAttr(block.text)}${alignStyle(block.align)}>${inner}</h1>`;
    }
    case 'section': {
      const inner = renderRichLineHtml(block.text, block.marks);
      return `<h2 class="nb-pdf-section"${blockDirAttr(block.text)}${alignStyle(block.align)}>${inner}</h2>`;
    }
    case 'paragraph': {
      const inner = renderRichLineHtml(block.text, block.marks);
      const variant =
        block.variant === 'muted'
          ? ' nb-pdf-muted'
          : block.variant === 'fine'
            ? ' nb-pdf-fine'
            : '';
      return `<p class="nb-pdf-p${variant}"${blockDirAttr(block.text)}${alignStyle(block.align)}>${inner || '&nbsp;'}</p>`;
    }
    case 'bullet': {
      const inner = renderRichLineHtml(block.text, block.marks);
      const depth = Math.max(0, Math.min(2, block.depth));
      return `<li class="nb-pdf-li" data-depth="${depth}"${blockDirAttr(block.text)}>${inner}</li>`;
    }
    case 'ordered': {
      const inner = renderRichLineHtml(block.text, block.marks);
      return `<li class="nb-pdf-oli" value="${block.number}"${blockDirAttr(block.text)}>${inner}</li>`;
    }
    case 'task': {
      const inner = renderRichLineHtml(block.text, block.marks);
      const box = block.checked ? '☑' : '☐';
      return `<div class="nb-pdf-task"${blockDirAttr(block.text)}><span class="nb-pdf-task-box" aria-hidden="true">${box}</span><span>${inner}</span></div>`;
    }
    case 'quote': {
      const inner = renderRichLineHtml(block.text, block.marks);
      return `<blockquote class="nb-pdf-quote"${blockDirAttr(block.text)}${alignStyle(block.align)}>${inner}</blockquote>`;
    }
    case 'step': {
      const inner = renderRichLineHtml(block.text, block.marks);
      return `<div class="nb-pdf-step"${blockDirAttr(block.text)}><span class="nb-pdf-step-label">Step</span> ${inner}</div>`;
    }
    case 'callout': {
      const label = CALLOUT_LABEL[block.tone] ?? block.tone;
      const inner = renderRichLineHtml(block.text, block.marks);
      return `<aside class="nb-pdf-callout nb-pdf-callout-${escapeHtml(block.tone)}"${blockDirAttr(block.text)}><div class="nb-pdf-callout-label">${escapeHtml(label)}</div><div class="nb-pdf-callout-body">${inner}</div></aside>`;
    }
    case 'math':
      return katexDisplayHtml(block.text);
    case 'table':
      return renderTable(block.rows);
    case 'image-ref':
      return renderImage(block.key, block.alt, block.width, assets);
    case 'handwriting':
      return renderHandwriting(block.key, assets);
    default:
      return '';
  }
}

/** Group consecutive list items into ul/ol for cleaner pagination. */
export function renderDialectBlocksHtml(blocks: NotebookDialectBlock[], assets: PdfAssetResolver): string {
  const out: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.kind === 'bullet') {
      const items: string[] = [];
      while (i < blocks.length && blocks[i]!.kind === 'bullet') {
        items.push(renderDialectBlockHtml(blocks[i]!, assets));
        i += 1;
      }
      out.push(`<ul class="nb-pdf-ul">${items.join('')}</ul>`);
      continue;
    }
    if (b.kind === 'ordered') {
      const items: string[] = [];
      const start = b.number;
      while (i < blocks.length && blocks[i]!.kind === 'ordered') {
        items.push(renderDialectBlockHtml(blocks[i]!, assets));
        i += 1;
      }
      out.push(`<ol class="nb-pdf-ol" start="${start}">${items.join('')}</ol>`);
      continue;
    }
    out.push(renderDialectBlockHtml(b, assets));
    i += 1;
  }
  return out.join('\n');
}
