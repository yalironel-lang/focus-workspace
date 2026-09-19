/**
 * Normalize a TipTap top-level Notebook block into provider-independent content.
 * Transient AI context only — does NOT use dialect serialization.
 */

import type { Node as PmNode } from '@tiptap/pm/model';
import {
  MAX_BLOCK_CHARS,
  MAX_TABLE_PREVIEW_CHARS,
  truncateWithFlag,
} from './bounds';
import type {
  ZikukAiBlockKind,
  ZikukAiNormalizedContent,
  ZikukAiSurroundingBlockKind,
} from './types';

const TEXT_BLOCK_MAP: Record<string, ZikukAiBlockKind> = {
  nbParagraph: 'paragraph',
  nbTitle: 'title',
  nbSection: 'section',
  nbQuote: 'quote',
  nbStep: 'step',
  nbBullet: 'bullet',
  nbOrdered: 'ordered',
  nbTask: 'task',
  nbCallout: 'callout',
  nbMath: 'math',
};

/** Map TipTap node type → AI block kind for textblocks. */
export function mapTextBlockKind(typeName: string): ZikukAiBlockKind {
  return TEXT_BLOCK_MAP[typeName] ?? 'other';
}

export function mapSurroundingBlockKind(typeName: string): ZikukAiSurroundingBlockKind {
  if (typeName === 'nbImageRef') return 'image';
  if (typeName === 'nbHandwriting') return 'handwriting';
  if (typeName === 'nbTable') return 'table';
  if (typeName === 'nbDivider') return 'divider';
  return mapTextBlockKind(typeName);
}

/**
 * Plain text from a node, substituting nbInlineMath atoms with attrs.text
 * so KaTeX DOM noise is never captured.
 */
export function plainTextFromNode(node: PmNode): string {
  let out = '';
  node.descendants(child => {
    if (child.type.name === 'nbInlineMath') {
      out += String(child.attrs.text ?? '');
      return false;
    }
    if (child.isText && child.text) {
      out += child.text;
    }
    return undefined;
  });
  return out;
}

function tableTextPreview(table: PmNode): string {
  const parts: string[] = [];
  table.forEach(row => {
    if (row.type.name !== 'nbTableRow') return;
    const cells: string[] = [];
    row.forEach(cell => {
      if (cell.type.name !== 'nbTableCell' && cell.type.name !== 'nbTableHeader') return;
      cells.push(plainTextFromNode(cell).trim());
    });
    parts.push(cells.join(' | '));
  });
  return parts.join('\n');
}

export type NormalizeBlockResult = {
  content: ZikukAiNormalizedContent;
  blockKind: ZikukAiSurroundingBlockKind;
  truncated: boolean;
};

export function normalizeTopLevelBlock(node: PmNode): NormalizeBlockResult {
  const name = node.type.name;
  const blockKind = mapSurroundingBlockKind(name);

  if (name === 'nbDivider') {
    return { content: { type: 'empty' }, blockKind: 'divider', truncated: false };
  }

  if (name === 'nbImageRef') {
    const assetKey = String(node.attrs.key ?? '');
    const alt = String(node.attrs.alt ?? '');
    return {
      content: alt
        ? { type: 'image', assetKey, alt }
        : { type: 'image', assetKey },
      blockKind: 'image',
      truncated: false,
    };
  }

  if (name === 'nbHandwriting') {
    return {
      content: { type: 'handwriting', assetKey: String(node.attrs.key ?? '') },
      blockKind: 'handwriting',
      truncated: false,
    };
  }

  if (name === 'nbMath') {
    const raw = plainTextFromNode(node);
    const { text, truncated } = truncateWithFlag(raw, MAX_BLOCK_CHARS);
    return { content: { type: 'math', latex: text }, blockKind: 'math', truncated };
  }

  if (name === 'nbTable') {
    const rows = node.childCount;
    const cols = node.firstChild?.childCount ?? 0;
    const previewRaw = tableTextPreview(node);
    const { text, truncated } = truncateWithFlag(previewRaw, MAX_TABLE_PREVIEW_CHARS);
    return {
      content: { type: 'table', rows, cols, textPreview: text },
      blockKind: 'table',
      truncated,
    };
  }

  // Textblocks (paragraph, title, callout, lists, …)
  if (node.isTextblock) {
    const raw = plainTextFromNode(node);
    const { text, truncated } = truncateWithFlag(raw, MAX_BLOCK_CHARS);
    return { content: { type: 'text', text }, blockKind, truncated };
  }

  return { content: { type: 'empty' }, blockKind: 'other', truncated: false };
}

/** Leaf text for doc.textBetween — inline math uses attrs.text. */
export function inlineMathLeafText(node: PmNode): string {
  if (node.type.name === 'nbInlineMath') {
    return String(node.attrs.text ?? '');
  }
  return '';
}
