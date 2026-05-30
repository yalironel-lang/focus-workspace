import type { InlineMark } from './notebookInlineMarks';
import { parseRichLine, serializeRichLine } from './notebookInlineMarks';
import type { BlockMorphTarget } from './notebookSelectionToolbar';
import type { NotebookBlockSnapshot } from './knowledge/knowledgeTypes';

export type RichBlockBase = {
  id: string;
  text: string;
  marks?: InlineMark[];
};

export function attachMarksToText<T extends { text: string }>(block: T): T & { marks?: InlineMark[] } {
  const { plain, marks } = parseRichLine(block.text);
  if (!marks.length) return { ...block, text: plain };
  return { ...block, text: plain, marks };
}

export function serializeBlockText(text: string, marks?: InlineMark[]): string {
  return serializeRichLine({ plain: text, marks: marks ?? [] });
}

/** Build storage line text payload for a block's rich content. */
export function formatRichBlockContent(block: RichBlockBase): string {
  return serializeBlockText(block.text, block.marks);
}

export interface MorphableBlock extends RichBlockBase {
  kind: string;
  [key: string]: unknown;
}

export function morphBlockKind(
  block: MorphableBlock,
  target: BlockMorphTarget,
): MorphableBlock {
  const { id, text, marks } = block;
  const base = { id, text, ...(marks?.length ? { marks } : {}) };
  switch (target) {
    case 'paragraph':
      return { ...base, kind: 'paragraph' };
    case 'title':
      return { ...base, kind: 'title' };
    case 'section':
      return { ...base, kind: 'section' };
    case 'quote':
      return { ...base, kind: 'quote' };
    case 'callout':
      return { ...base, kind: 'callout', tone: 'concept' };
    case 'bullet':
      return { ...base, kind: 'bullet', depth: 0 };
    case 'ordered':
      return { ...base, kind: 'ordered', number: 1 };
    case 'task':
      return { ...base, kind: 'task', checked: false };
    default:
      return block;
  }
}

export function mergeBlockMarks(
  prevText: string,
  prevMarks: InlineMark[] | undefined,
  nextText: string,
  nextMarks: InlineMark[] | undefined,
): { text: string; marks?: InlineMark[] } {
  const mergedText = prevText + nextText;
  const shiftedNext = (nextMarks ?? []).map(m => ({
    ...m,
    s: m.s + prevText.length,
    e: m.e + prevText.length,
  }));
  const marks = [...(prevMarks ?? []), ...shiftedNext];
  return marks.length ? { text: mergedText, marks } : { text: mergedText };
}

/** Mirror ProjectNotebookBlock.blockToLine for tombstone restore (includes mark prefix). */
export function serializeBlockSnapshot(block: NotebookBlockSnapshot): string {
  const kind = block.kind;
  const text = typeof block.text === 'string' ? block.text : '';
  const marks = Array.isArray(block.marks) ? (block.marks as InlineMark[]) : undefined;
  const payload = serializeBlockText(text, marks);
  switch (kind) {
    case 'title': return `# ${payload}`;
    case 'section': return `## ${payload}`;
    case 'ordered':
      return `${typeof block.number === 'number' ? block.number : 1}. ${payload}`;
    case 'bullet': {
      const depth = typeof block.depth === 'number' ? block.depth : 0;
      return `${'  '.repeat(depth)}- ${payload}`;
    }
    case 'task':
      return `- [${block.checked ? 'x' : ' '}] ${payload}`;
    case 'quote': return `> ${payload}`;
    case 'step': return `=> ${payload}`;
    case 'callout': {
      const tone = typeof block.tone === 'string' ? block.tone : 'concept';
      return `!${tone} ${payload}`;
    }
    case 'math': return `$$ ${payload}`;
    case 'image-ref': {
      const key = typeof block.key === 'string' ? block.key : '';
      const alt = typeof block.alt === 'string' ? block.alt : '';
      return `::img::${key}::${alt}::`;
    }
    case 'divider': return '---';
    case 'paragraph': {
      if (block.variant === 'muted') return `\u00b6 ${payload}`;
      if (block.variant === 'fine') return `\u00b6\u00b6 ${payload}`;
      return payload;
    }
    default: return payload;
  }
}
