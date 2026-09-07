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
} from '../notebookDialect';
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

function richFromContent(node: JSONContent): { text: string; marks?: InlineMark[] } {
  const { plain, marks } = tiptapInlineToRichLine(node.content);
  return marks.length ? { text: plain, marks } : { text: plain };
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

  if (!ALLOWED_BLOCK_TYPES.has(node.type)) {
    throw new NotebookTiptapConversionError(
      'unsupported_node',
      `Unsupported TipTap node "${node.type}" cannot be represented in Notebook dialect`,
      node.type,
    );
  }

  // Nested block content (e.g. multi-paragraph list items) is never allowed.
  if (node.content?.some(c => c.type && c.type !== 'text' && c.type !== 'hardBreak')) {
    const bad = node.content.find(c => c.type && c.type !== 'text');
    if (bad?.type === 'hardBreak') {
      throw new NotebookTiptapConversionError(
        'hard_break',
        'hardBreak is unsupported in Notebook dialect (newline is a block boundary)',
      );
    }
    if (bad && bad.type !== 'text') {
      throw new NotebookTiptapConversionError(
        'multi_block_list_item',
        `Block "${node.type}" may only contain inline text; found "${bad.type}"`,
        bad.type,
      );
    }
  }

  switch (node.type) {
    case 'nbParagraph': {
      const rich = richFromContent(node);
      const variant = asParagraphVariant(node.attrs?.variant);
      return {
        kind: 'paragraph',
        text: rich.text,
        ...(rich.marks ? { marks: rich.marks } : {}),
        ...(variant ? { variant } : {}),
      };
    }
    case 'nbTitle': {
      const rich = richFromContent(node);
      return { kind: 'title', text: rich.text, ...(rich.marks ? { marks: rich.marks } : {}) };
    }
    case 'nbSection': {
      const rich = richFromContent(node);
      return { kind: 'section', text: rich.text, ...(rich.marks ? { marks: rich.marks } : {}) };
    }
    case 'nbQuote': {
      const rich = richFromContent(node);
      return { kind: 'quote', text: rich.text, ...(rich.marks ? { marks: rich.marks } : {}) };
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
      if (!/^[a-z0-9-]+$/.test(key)) {
        throw new NotebookTiptapConversionError(
          'malformed_input',
          `Invalid image-ref key "${key}"`,
          key,
        );
      }
      return { kind: 'image-ref', key, alt };
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
export function tiptapDocToBody(doc: JSONContent): string {
  return serializeNotebookBlocks(tiptapDocToBlocks(doc));
}
