/**
 * TipTap JSON → canonical Notebook documentBody.
 * FAIL CLOSED on anything the dialect cannot represent.
 */

import type { JSONContent } from '@tiptap/core';
import type { InlineMark } from '../notebookInlineMarks';
import {
  CALLOUT_TONES,
  serializeNotebookBlocks,
  type CalloutTone,
  type NotebookDialectBlock,
  type ParagraphVariant,
  type TextAlignment,
} from '../notebookDialect';
import type { TableCellV1 } from '../notebookTableCodec';
import { MAX_TABLE_COLS, MAX_TABLE_ROWS, validateTablePayloadV1 } from '../notebookTableCodec';
import { NotebookTiptapConversionError } from './errors';
import { ALLOWED_BLOCK_TYPES } from './extensions';
import { tiptapInlineToRichLine } from './inlineBridge';

function asCalloutTone(raw: unknown): CalloutTone {
  if (typeof raw === 'string' && (CALLOUT_TONES as readonly string[]).includes(raw)) {
    return raw as CalloutTone;
  }
  throw new NotebookTiptapConversionError(
    'unsupported_attr',
    `Invalid callout tone "${String(raw)}"`,
    String(raw),
  );
}

function asParagraphVariant(raw: unknown): ParagraphVariant | undefined {
  if (raw == null || raw === '') return undefined;
  if (raw === 'muted' || raw === 'fine') return raw;
  throw new NotebookTiptapConversionError(
    'unsupported_attr',
    `Invalid paragraph variant "${String(raw)}"`,
    String(raw),
  );
}

function asAlignment(raw: unknown): TextAlignment | undefined {
  if (raw == null || raw === '' || raw === 'start') return undefined;
  if (raw === 'left' || raw === 'center' || raw === 'right') return raw;
  throw new NotebookTiptapConversionError(
    'unsupported_attr',
    `Invalid text alignment "${String(raw)}"`,
    String(raw),
  );
}

function richFromContent(node: JSONContent): { text: string; marks?: InlineMark[] } {
  const { plain, marks } = tiptapInlineToRichLine(node.content);
  return marks.length ? { text: plain, marks } : { text: plain };
}

/**
 * M6.4A TablePayloadV1 supports only a simple rectangular grid of normal cells.
 * Structural attrs beyond schema defaults, and header cells, MUST fail closed —
 * never flatten into ordinary `{ t, m? }` cells.
 */
function assertSupportedTableCellAttrs(attrs: Record<string, unknown> | undefined): void {
  const colspan = attrs?.colspan === undefined ? 1 : attrs.colspan;
  const rowspan = attrs?.rowspan === undefined ? 1 : attrs.rowspan;
  const colwidth = attrs?.colwidth === undefined ? null : attrs.colwidth;
  const align = attrs?.align === undefined ? null : attrs.align;

  if (colspan !== 1) {
    throw new NotebookTiptapConversionError(
      'unsupported_attr',
      `Table cell colspan ${String(colspan)} is not supported by TablePayloadV1`,
      String(colspan),
    );
  }
  if (rowspan !== 1) {
    throw new NotebookTiptapConversionError(
      'unsupported_attr',
      `Table cell rowspan ${String(rowspan)} is not supported by TablePayloadV1`,
      String(rowspan),
    );
  }
  if (colwidth != null) {
    throw new NotebookTiptapConversionError(
      'unsupported_attr',
      'Table cell colwidth is not supported by TablePayloadV1',
      JSON.stringify(colwidth),
    );
  }
  if (align != null) {
    throw new NotebookTiptapConversionError(
      'unsupported_attr',
      `Table cell align "${String(align)}" is not supported by TablePayloadV1`,
      String(align),
    );
  }
}

function tipTapTableToBlock(node: JSONContent): NotebookDialectBlock {
  const rowsJson = node.content ?? [];
  if (rowsJson.length < 1 || rowsJson.length > MAX_TABLE_ROWS) {
    throw new NotebookTiptapConversionError(
      'malformed_input',
      `Table must have 1–${MAX_TABLE_ROWS} rows`,
      String(rowsJson.length),
    );
  }

  const rows: TableCellV1[][] = [];
  let colCount: number | null = null;

  for (const rowNode of rowsJson) {
    if (!rowNode || rowNode.type !== 'nbTableRow') {
      throw new NotebookTiptapConversionError(
        'unsupported_node',
        `Unsupported table child "${rowNode?.type ?? 'unknown'}"`,
        rowNode?.type,
      );
    }
    const cellNodes = rowNode.content ?? [];
    if (cellNodes.length < 1 || cellNodes.length > MAX_TABLE_COLS) {
      throw new NotebookTiptapConversionError(
        'malformed_input',
        `Table row must have 1–${MAX_TABLE_COLS} cells`,
        String(cellNodes.length),
      );
    }
    if (colCount === null) colCount = cellNodes.length;
    else if (cellNodes.length !== colCount) {
      throw new NotebookTiptapConversionError(
        'malformed_input',
        'Table rows must be rectangular',
        String(cellNodes.length),
      );
    }

    const row: TableCellV1[] = [];
    for (const cellNode of cellNodes) {
      if (!cellNode || typeof cellNode.type !== 'string') {
        throw new NotebookTiptapConversionError(
          'unsupported_node',
          'Unsupported table cell "unknown"',
          'unknown',
        );
      }
      // TablePayloadV1 has no header semantics — never flatten headers to ordinary cells.
      if (cellNode.type === 'nbTableHeader') {
        throw new NotebookTiptapConversionError(
          'unsupported_node',
          'nbTableHeader is not supported by TablePayloadV1 (header semantics cannot be persisted)',
          'nbTableHeader',
        );
      }
      if (cellNode.type !== 'nbTableCell') {
        throw new NotebookTiptapConversionError(
          'unsupported_node',
          `Unsupported table cell "${cellNode.type}"`,
          cellNode.type,
        );
      }
      assertSupportedTableCellAttrs(cellNode.attrs as Record<string, unknown> | undefined);

      const paragraphs = cellNode.content ?? [];
      if (paragraphs.length !== 1 || paragraphs[0]?.type !== 'nbParagraph') {
        throw new NotebookTiptapConversionError(
          'malformed_input',
          'Table cell must contain exactly one nbParagraph',
          paragraphs[0]?.type ?? 'empty',
        );
      }
      const para = paragraphs[0]!;
      // Cell paragraph may not carry block-level align in M6.4A canonical payload.
      if (para.attrs?.align != null && para.attrs.align !== '' && para.attrs.align !== 'start') {
        throw new NotebookTiptapConversionError(
          'unsupported_attr',
          'Alignment is not supported inside table cells',
          String(para.attrs.align),
        );
      }
      if (para.attrs?.variant != null && para.attrs.variant !== '') {
        throw new NotebookTiptapConversionError(
          'unsupported_attr',
          'Paragraph variants are not supported inside table cells',
          String(para.attrs.variant),
        );
      }
      const nested = para.content ?? [];
      if (nested.some(c => c.type && c.type !== 'text' && c.type !== 'nbInlineMath')) {
        const bad = nested.find(c => c.type && c.type !== 'text' && c.type !== 'nbInlineMath');
        throw new NotebookTiptapConversionError(
          'unsupported_node',
          `Unsupported inline in table cell: "${bad?.type ?? 'unknown'}"`,
          bad?.type,
        );
      }
      const rich = richFromContent(para);
      row.push(rich.marks ? { t: rich.text, m: rich.marks } : { t: rich.text });
    }
    rows.push(row);
  }

  // Re-validate as TablePayloadV1. In-memory `{ kind:'table', rows }` represents ONLY v:1.
  // Encoder may re-emit `v:1` solely because this block shape is the V1 rows carrier.
  validateTablePayloadV1({ v: 1, rows });
  return { kind: 'table', rows };
}

function tipTapNodeToBlock(node: JSONContent): NotebookDialectBlock {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
    throw new NotebookTiptapConversionError(
      'malformed_input',
      'Malformed TipTap node (missing type)',
    );
  }

  if (node.type === 'hardBreak') {
    throw new NotebookTiptapConversionError(
      'hard_break',
      'hardBreak is unsupported in Notebook dialect (newline is a block boundary)',
    );
  }

  if (node.type === 'doc') {
    throw new NotebookTiptapConversionError(
      'malformed_input',
      'Unexpected nested doc node',
    );
  }

  if (node.type === 'nbTable') {
    return tipTapTableToBlock(node);
  }

  if (!ALLOWED_BLOCK_TYPES.has(node.type)) {
    throw new NotebookTiptapConversionError(
      'unsupported_node',
      `Unsupported TipTap node "${node.type}" cannot be represented in Notebook dialect`,
      node.type,
    );
  }

  // Nested block content (e.g. multi-paragraph list items) is never allowed.
  if (node.content?.some(c => c.type && c.type !== 'text' && c.type !== 'nbInlineMath' && c.type !== 'hardBreak')) {
    const bad = node.content.find(c => c.type && c.type !== 'text' && c.type !== 'nbInlineMath');
    if (bad?.type === 'hardBreak') {
      throw new NotebookTiptapConversionError(
        'hard_break',
        'hardBreak is unsupported in Notebook dialect (newline is a block boundary)',
      );
    }
    if (bad && bad.type !== 'text' && bad.type !== 'nbInlineMath') {
      throw new NotebookTiptapConversionError(
        'multi_block_list_item',
        `Block "${node.type}" may only contain inline text; found "${bad.type}"`,
        bad.type,
      );
    }
  }

  const allowsAlign =
    node.type === 'nbParagraph' ||
    node.type === 'nbTitle' ||
    node.type === 'nbSection' ||
    node.type === 'nbQuote';
  if (!allowsAlign && node.attrs?.align != null && node.attrs.align !== '' && node.attrs.align !== 'start') {
    throw new NotebookTiptapConversionError(
      'unsupported_attr',
      `Alignment is not supported on block "${node.type}"`,
      String(node.attrs.align),
    );
  }

  switch (node.type) {
    case 'nbParagraph': {
      const rich = richFromContent(node);
      const variant = asParagraphVariant(node.attrs?.variant);
      const align = asAlignment(node.attrs?.align);
      return {
        kind: 'paragraph',
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
        ...(variant ? { variant } : {}),
        ...(align ? { align } : {}),
      };
    }
    case 'nbTitle': {
      const rich = richFromContent(node);
      const align = asAlignment(node.attrs?.align);
      return {
        kind: 'title',
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
        ...(align ? { align } : {}),
      };
    }
    case 'nbSection': {
      const rich = richFromContent(node);
      const align = asAlignment(node.attrs?.align);
      return {
        kind: 'section',
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
        ...(align ? { align } : {}),
      };
    }
    case 'nbQuote': {
      const rich = richFromContent(node);
      const align = asAlignment(node.attrs?.align);
      return {
        kind: 'quote',
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
        ...(align ? { align } : {}),
      };
    }
    case 'nbStep': {
      const rich = richFromContent(node);
      return { kind: 'step', text: rich.text, ...(rich.marks ? { marks: rich.marks } : {}) };
    }
    case 'nbMath': {
      const rich = richFromContent(node);
      return { kind: 'math', text: rich.text, ...(rich.marks ? { marks: rich.marks } : {}) };
    }
    case 'nbBullet': {
      const depth = Number(node.attrs?.depth ?? 0);
      if (!Number.isInteger(depth) || depth < 0 || depth > 2) {
        throw new NotebookTiptapConversionError(
          'list_depth',
          `Bullet depth ${depth} exceeds Notebook dialect max (0–2)`,
          String(depth),
        );
      }
      const rich = richFromContent(node);
      return {
        kind: 'bullet',
        depth,
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
      };
    }
    case 'nbOrdered': {
      const number = Math.max(1, Number(node.attrs?.number ?? 1) || 1);
      const rich = richFromContent(node);
      return {
        kind: 'ordered',
        number,
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
      };
    }
    case 'nbTask': {
      const checked = Boolean(node.attrs?.checked);
      const rich = richFromContent(node);
      return {
        kind: 'task',
        checked,
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
      };
    }
    case 'nbCallout': {
      const tone = asCalloutTone(node.attrs?.tone ?? 'concept');
      const rich = richFromContent(node);
      return {
        kind: 'callout',
        tone,
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
      };
    }
    case 'nbDivider':
      return { kind: 'divider' };
    case 'nbImageRef': {
      const key = String(node.attrs?.key ?? '');
      const alt = String(node.attrs?.alt ?? '');
      const rawWidth = node.attrs?.width;
      let width: number | null = null;
      if (typeof rawWidth === 'number' && Number.isFinite(rawWidth) && rawWidth >= 50 && rawWidth <= 3000) {
        width = Math.round(rawWidth);
      }
      if (!/^[a-z0-9-]+$/.test(key)) {
        throw new NotebookTiptapConversionError(
          'malformed_input',
          `Invalid image-ref key "${key}"`,
          key,
        );
      }
      return { kind: 'image-ref', key, alt, ...(width !== null ? { width } : {}) };
    }
    case 'nbHandwriting': {
      const key = String(node.attrs?.key ?? '');
      if (!/^[a-z0-9-]+$/.test(key)) {
        throw new NotebookTiptapConversionError(
          'malformed_input',
          `Invalid handwriting key "${key}"`,
          key,
        );
      }
      return { kind: 'handwriting', key };
    }
    default:
      throw new NotebookTiptapConversionError(
        'unsupported_node',
        `Unsupported TipTap node "${node.type}"`,
        node.type,
      );
  }
}

export function tiptapDocToBlocks(doc: JSONContent): NotebookDialectBlock[] {
  if (!doc || typeof doc !== 'object') {
    throw new NotebookTiptapConversionError('malformed_input', 'TipTap doc must be an object');
  }
  if (doc.type !== 'doc') {
    throw new NotebookTiptapConversionError(
      'malformed_input',
      `Expected doc root, got "${doc.type ?? 'unknown'}"`,
      doc.type,
    );
  }
  const content = doc.content ?? [];
  // Walk entire tree for hardBreak anywhere (including unexpected nesting).
  assertNoHardBreak(doc);
  return content.map(tipTapNodeToBlock);
}

function assertNoHardBreak(node: JSONContent): void {
  if (node.type === 'hardBreak') {
    throw new NotebookTiptapConversionError(
      'hard_break',
      'hardBreak is unsupported in Notebook dialect (newline is a block boundary)',
    );
  }
  if (node.content) {
    for (const child of node.content) assertNoHardBreak(child);
  }
}

/** TipTap JSON → canonical documentBody. Throws NotebookTiptapConversionError on lossy input. */
export function tiptapDocToBody(doc: JSONContent, codecVersion?: number): string {
  return serializeNotebookBlocks(tiptapDocToBlocks(doc), codecVersion);
}
