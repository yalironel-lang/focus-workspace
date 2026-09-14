import { assertNotebookTextCodec, decodeNotebookTextV1, encodeNotebookTextV1 } from './notebookTextCodec';
/**
 * Pure ZIKUK Notebook dialect parse/serialize.
 * Authoritative line grammar shared by the CE editor and TipTap adapters.
 * Keep in sync with ProjectNotebookBlock storage contracts.
 */

import type { InlineMark } from './notebookInlineMarks';
import { attachMarksToText, serializeBlockText } from './notebookBlockRichText';

export type ParagraphVariant = 'muted' | 'fine';
export type CalloutTone =
  | 'summary'
  | 'concept'
  | 'review'
  | 'definition'
  | 'theorem'
  | 'example'
  | 'mistake';

export const CALLOUT_TONES: readonly CalloutTone[] = [
  'summary',
  'concept',
  'review',
  'definition',
  'theorem',
  'example',
  'mistake',
] as const;

export type NotebookLine =
  | { kind: 'blank' }
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'divider' }
  | { kind: 'bullet'; text: string; depth: number }
  | { kind: 'ordered'; number: number; text: string }
  | { kind: 'task'; checked: boolean; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'step'; text: string }
  | { kind: 'callout'; tone: CalloutTone; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'image-ref'; key: string; alt: string; width?: number | null }
  | { kind: 'handwriting'; key: string }
  | { kind: 'paragraph'; text: string; variant?: ParagraphVariant };

type BlockMarks = { marks?: InlineMark[] };

/** Block shape used for dialect serialize (ids optional for adapter paths). */
export type NotebookDialectBlock =
  | ({ id?: string; kind: 'title'; text: string } & BlockMarks)
  | ({ id?: string; kind: 'section'; text: string } & BlockMarks)
  | ({ id?: string; kind: 'bullet'; text: string; depth: number } & BlockMarks)
  | ({ id?: string; kind: 'ordered'; number: number; text: string } & BlockMarks)
  | ({ id?: string; kind: 'task'; text: string; checked: boolean } & BlockMarks)
  | ({ id?: string; kind: 'quote'; text: string } & BlockMarks)
  | ({ id?: string; kind: 'step'; text: string } & BlockMarks)
  | ({ id?: string; kind: 'callout'; tone: CalloutTone; text: string } & BlockMarks)
  | ({ id?: string; kind: 'math'; text: string } & BlockMarks)
  | { id?: string; kind: 'image-ref'; key: string; alt: string; width?: number | null }
  | { id?: string; kind: 'handwriting'; key: string }
  | { id?: string; kind: 'divider' }
  | ({ id?: string; kind: 'paragraph'; text: string; variant?: ParagraphVariant } & BlockMarks);

/** Normalize invisible spaces so markdown-lite lines classify reliably (e.g. NBSP from paste). */
export function normalizeNotebookSpaces(s: string): string {
  return s.replace(/\u00a0/g, ' ');
}

/**
 * Parse one storage line into a notebook line shape.
 * Prefixes are never part of title/section/task/quote text.
 */
export function parseNotebookLine(raw: string): NotebookLine {
  const normalized = normalizeNotebookSpaces(raw);
  const trimmed = normalized.trim();
  if (trimmed === '') return { kind: 'blank' };
  if (trimmed === '---') return { kind: 'divider' };

  const sectionMatch = trimmed.match(/^##\s*(.*)$/);
  if (sectionMatch) return { kind: 'section', text: (sectionMatch[1] ?? '').trimEnd() };

  const titleMatch = trimmed.match(/^#(?!\#)\s*(.*)$/);
  if (titleMatch) return { kind: 'title', text: (titleMatch[1] ?? '').trimEnd() };

  const orderedMatch = trimmed.match(/^(\d+)\.\s*(.*)$/);
  if (orderedMatch) {
    return {
      kind: 'ordered',
      number: Math.max(1, Number(orderedMatch[1] ?? 1) || 1),
      text: (orderedMatch[2] ?? '').trimEnd(),
    };
  }

  const taskMatch = trimmed.match(/^- \[\s*([xX ])\s*\]\s*(.*)$/);
  if (taskMatch) {
    const checked = taskMatch[1]!.trim().toLowerCase() === 'x';
    return { kind: 'task', checked, text: (taskMatch[2] ?? '').trimEnd() };
  }

  const bulletIndentMatch = normalized.match(/^(\s*)- (?!\[)\s*(.*)$/);
  if (bulletIndentMatch) {
    const depth = Math.min(2, Math.floor((bulletIndentMatch[1]?.length ?? 0) / 2));
    return { kind: 'bullet', depth, text: (bulletIndentMatch[2] ?? '').trimEnd() };
  }

  const quoteMatch = trimmed.match(/^>\s?(.*)$/);
  if (quoteMatch && trimmed.startsWith('>')) return { kind: 'quote', text: (quoteMatch[1] ?? '').trimEnd() };

  const calloutMatch = trimmed.match(/^!(summary|concept|review|definition|theorem|example|mistake)\s*(.*)$/i);
  if (calloutMatch) {
    return {
      kind: 'callout',
      tone: calloutMatch[1]!.toLowerCase() as CalloutTone,
      text: (calloutMatch[2] ?? '').trimEnd(),
    };
  }

  // Slash/equation-block prefix is `$$ <latex>` (whitespace required).
  const mathMatch = trimmed.match(/^\$\$\s+(.*)$/);
  if (mathMatch) return { kind: 'math', text: (mathMatch[1] ?? '').trimEnd() };

  const imgWithWidth = trimmed.match(/^::img::([a-z0-9-]+)::(.+)::([0-9]+)::$/);
  if (imgWithWidth) {
    const w = parseInt(imgWithWidth[3]!, 10);
    return {
      kind: 'image-ref',
      key: imgWithWidth[1]!,
      alt: imgWithWidth[2]!,
      ...(Number.isInteger(w) && w >= 50 && w <= 3000 ? { width: w } : {}),
    };
  }

  const imgMatch = trimmed.match(/^::img::([a-z0-9-]+)::(.*)::$/);
  if (imgMatch) return { kind: 'image-ref', key: imgMatch[1]!, alt: imgMatch[2] ?? '' };

  const hwMatch = trimmed.match(/^::hw::([a-z0-9-]+)::$/);
  if (hwMatch) return { kind: 'handwriting', key: hwMatch[1]! };

  const stepMatch = trimmed.match(/^=>\s*(.*)$/);
  if (stepMatch) return { kind: 'step', text: (stepMatch[1] ?? '').trimEnd() };

  if (trimmed.startsWith('\u00b6\u00b6')) {
    const rest = trimmed.slice(2).trimStart();
    return { kind: 'paragraph', text: rest.trimEnd(), variant: 'fine' };
  }
  if (trimmed.startsWith('\u00b6')) {
    const rest = trimmed.slice(1).trimStart();
    return { kind: 'paragraph', text: rest.trimEnd(), variant: 'muted' };
  }

  return { kind: 'paragraph', text: normalized };
}

function withLineMarks<T extends NotebookDialectBlock & { text: string }>(b: T): T {
  return attachMarksToText(b) as T;
}

export function notebookLineToBlock(line: NotebookLine, id?: string): NotebookDialectBlock {
  switch (line.kind) {
    case 'blank':
      return withLineMarks({ id, kind: 'paragraph' as const, text: '' });
    case 'title':
      return withLineMarks({ id, kind: 'title' as const, text: line.text });
    case 'section':
      return withLineMarks({ id, kind: 'section' as const, text: line.text });
    case 'ordered':
      return withLineMarks({
        id,
        kind: 'ordered' as const,
        number: line.number,
        text: line.text,
      });
    case 'bullet':
      return withLineMarks({
        id,
        kind: 'bullet' as const,
        depth: line.depth,
        text: line.text,
      });
    case 'divider':
      return { id, kind: 'divider' };
    case 'task':
      return withLineMarks({
        id,
        kind: 'task' as const,
        text: line.text,
        checked: line.checked,
      });
    case 'quote':
      return withLineMarks({ id, kind: 'quote' as const, text: line.text });
    case 'step':
      return withLineMarks({ id, kind: 'step' as const, text: line.text });
    case 'callout':
      return withLineMarks({
        id,
        kind: 'callout' as const,
        tone: line.tone,
        text: line.text,
      });
    case 'math':
      return withLineMarks({ id, kind: 'math' as const, text: line.text });
    case 'image-ref':
      return {
        id,
        kind: 'image-ref',
        key: line.key,
        alt: line.alt,
        ...(line.width ? { width: line.width } : {}),
      };
    case 'handwriting':
      return { id, kind: 'handwriting', key: line.key };
    case 'paragraph':
      return withLineMarks({
        id,
        kind: 'paragraph' as const,
        text: line.text,
        ...(line.variant ? { variant: line.variant } : {}),
      });
  }
}

/** Parse body → dialect blocks (no React id-reuse). Empty → title + blank paragraph. */
export function parseNotebookBody(body: string, codecVersion?: number): NotebookDialectBlock[] {
  assertNotebookTextCodec(codecVersion);
  if (codecVersion === 1) return decodeNotebookTextV1(body);
  if (body.trim().length === 0) {
    return [
      { id: 'empty-title', kind: 'title', text: '' },
      { id: 'empty-body', kind: 'paragraph', text: '' },
    ];
  }
  return body.split(/\r?\n/).map((raw, index) =>
    notebookLineToBlock(parseNotebookLine(raw), `nb-${index}`),
  );
}

export function normalizeOrderedSequences(
  blocks: NotebookDialectBlock[],
): NotebookDialectBlock[] {
  let changed = false;
  const out: NotebookDialectBlock[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.kind !== 'ordered') {
      out.push(block);
      continue;
    }
    const prev = out[out.length - 1];
    const nextNumber = prev?.kind === 'ordered' ? prev.number + 1 : Math.max(1, block.number);
    if (block.number !== nextNumber) {
      changed = true;
      out.push({ ...block, number: nextNumber });
    } else {
      out.push(block);
    }
  }
  return changed ? out : blocks;
}

function blockTextPayload(b: { text: string; marks?: InlineMark[] }): string {
  return serializeBlockText(b.text, b.marks);
}

/** Serialize one dialect block to a storage line (canonical). */
export function notebookBlockToLine(b: NotebookDialectBlock): string {
  switch (b.kind) {
    case 'title':
      return `# ${blockTextPayload(b)}`;
    case 'section':
      return `## ${blockTextPayload(b)}`;
    case 'ordered':
      return `${b.number}. ${blockTextPayload(b)}`;
    case 'bullet':
      return `${'  '.repeat(b.depth)}- ${blockTextPayload(b)}`;
    case 'task':
      return `- [${b.checked ? 'x' : ' '}] ${blockTextPayload(b)}`;
    case 'quote':
      return `> ${blockTextPayload(b)}`;
    case 'step':
      return `=> ${blockTextPayload(b)}`;
    case 'callout':
      return `!${b.tone} ${blockTextPayload(b)}`;
    case 'math':
      return `$$ ${blockTextPayload(b)}`;
    case 'image-ref':
      return b.width ? `::img::${b.key}::${b.alt}::${b.width}::` : `::img::${b.key}::${b.alt}::`;
    case 'handwriting':
      return `::hw::${b.key}::`;
    case 'divider':
      return '---';
    case 'paragraph':
      if (b.variant === 'muted') return `\u00b6 ${blockTextPayload(b)}`;
      if (b.variant === 'fine') return `\u00b6\u00b6 ${blockTextPayload(b)}`;
      return blockTextPayload(b);
  }
}

/** Canonical body serialization (matches ProjectNotebookBlock.serializeBlocks). */
export function serializeNotebookBlocks(blocks: NotebookDialectBlock[], codecVersion?: number): string {
  assertNotebookTextCodec(codecVersion);
  if (codecVersion === 1) return encodeNotebookTextV1(blocks);
  const normalized = normalizeOrderedSequences(blocks);
  if (
    normalized.length === 2 &&
    normalized[0]?.kind === 'title' &&
    normalized[0].text === '' &&
    normalized[1]?.kind === 'paragraph' &&
    normalized[1].text === '' &&
    !normalized[1].variant
  ) {
    return '';
  }
  if (
    normalized.length === 1 &&
    normalized[0]?.kind === 'paragraph' &&
    normalized[0].text === '' &&
    !normalized[0].variant
  ) {
    return '';
  }
  return normalized.map(notebookBlockToLine).join('\n');
}
