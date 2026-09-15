/**
 * Notebook dialect blocks → closed TipTap JSON document (in-memory only).
 */

import type { JSONContent } from '@tiptap/core';
import type { InlineMark } from '../notebookInlineMarks';
import {
  parseNotebookBody,
  type NotebookDialectBlock,
} from '../notebookDialect';
import { richLineToTiptapInline } from './inlineBridge';

function inlineContent(block: { text: string; marks?: InlineMark[] }): JSONContent[] {
  return richLineToTiptapInline(block.text, block.marks);
}

export function blockToTiptapNode(block: NotebookDialectBlock): JSONContent {
  switch (block.kind) {
    case 'paragraph':
      return {
        type: 'nbParagraph',
        attrs: { variant: block.variant ?? null, align: block.align ?? null },
        content: inlineContent(block),
      };
    case 'title':
      return { type: 'nbTitle', attrs: { align: block.align ?? null }, content: inlineContent(block) };
    case 'section':
      return { type: 'nbSection', attrs: { align: block.align ?? null }, content: inlineContent(block) };
    case 'quote':
      return { type: 'nbQuote', attrs: { align: block.align ?? null }, content: inlineContent(block) };
    case 'step':
      return { type: 'nbStep', content: inlineContent(block) };
    case 'math':
      return { type: 'nbMath', content: inlineContent(block) };
    case 'bullet':
      return {
        type: 'nbBullet',
        attrs: { depth: block.depth },
        content: inlineContent(block),
      };
    case 'ordered':
      return {
        type: 'nbOrdered',
        attrs: { number: block.number },
        content: inlineContent(block),
      };
    case 'task':
      return {
        type: 'nbTask',
        attrs: { checked: block.checked },
        content: inlineContent(block),
      };
    case 'callout':
      return {
        type: 'nbCallout',
        attrs: { tone: block.tone },
        content: inlineContent(block),
      };
    case 'divider':
      return { type: 'nbDivider' };
    case 'image-ref':
      return {
        type: 'nbImageRef',
        attrs: { key: block.key, alt: block.alt, width: block.width ?? null },
      };
    case 'handwriting':
      return { type: 'nbHandwriting', attrs: { key: block.key } };
    case 'table': {
      return {
        type: 'nbTable',
        content: block.rows.map(row => ({
          type: 'nbTableRow',
          content: row.map(cell => ({
            type: 'nbTableCell',
            content: [
              {
                type: 'nbParagraph',
                content: inlineContent({ text: cell.t, marks: cell.m }),
              },
            ],
          })),
        })),
      };
    }
  }
}

export function blocksToTiptapDoc(blocks: NotebookDialectBlock[]): JSONContent {
  const nodes = blocks.map(blockToTiptapNode);
  return {
    type: 'doc',
    content: nodes.length > 0 ? nodes : [{ type: 'nbParagraph' }],
  };
}

/** documentBody → TipTap JSON (parse dialect, then convert). */
export function bodyToTiptapDoc(body: string, codecVersion?: number): JSONContent {
  return blocksToTiptapDoc(parseNotebookBody(body, codecVersion));
}
