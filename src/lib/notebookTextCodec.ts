/** Versioned canonical text records. Never infer the codec from body contents. */
import type { NotebookDialectBlock } from './notebookDialect';
import type { InlineMark } from './notebookInlineMarks';

export const NOTEBOOK_TEXT_CODEC_V1 = 1;
const PREFIX = '~nb1:';
const tones = new Set(['summary', 'concept', 'review', 'definition', 'theorem', 'example', 'mistake']);
const kinds = new Set(['paragraph', 'title', 'section', 'bullet', 'ordered', 'task', 'quote', 'step', 'callout', 'math']);
const markTypes = new Set(['b', 'i', 'u', 's', 'fs', 'fg', 'bg', 'hl']);
function invalid(): never { throw new Error('Invalid versioned Notebook text record'); }
export function assertNotebookTextCodec(version?: number): void {
  if (version !== undefined && version !== NOTEBOOK_TEXT_CODEC_V1) throw new Error(`Unsupported Notebook text codec: ${version}`);
}
function key(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9-]+$/.test(value)) return invalid();
  return value;
}
function marks(value: unknown, length: number): InlineMark[] {
  if (!Array.isArray(value)) return invalid();
  return value.map(mark => {
    if (!mark || !markTypes.has(mark.t) || !Number.isInteger(mark.s) || !Number.isInteger(mark.e)
      || mark.s < 0 || mark.e <= mark.s || mark.e > length || (mark.v !== undefined && typeof mark.v !== 'string')) return invalid();
    return { s: mark.s, e: mark.e, t: mark.t, ...(mark.v !== undefined ? { v: mark.v } : {}) };
  });
}
export function encodeNotebookTextV1(blocks: readonly NotebookDialectBlock[]): string {
  if (
    blocks.length === 0 ||
    (blocks.length === 1 &&
      blocks[0].kind === 'paragraph' &&
      blocks[0].text === '' &&
      !blocks[0].variant &&
      (!blocks[0].marks || blocks[0].marks.length === 0))
  ) {
    return '';
  }
  return blocks.map(block => {
    if (block.kind === 'divider') return '---';
    if (block.kind === 'handwriting') return `::hw::${key(block.key)}::`;
    if (block.kind === 'image-ref') {
      const k = key(block.key);
      const a = JSON.stringify(block.alt);
      let line = `::img::${k}::${a}::`;
      if (block.width != null) {
        if (!Number.isInteger(block.width) || block.width < 50 || block.width > 3000) return invalid();
        line = `::img::${k}::${a}::${block.width}::`;
      }
      decodeNotebookTextV1(line);
      return line;
    }
    const detail = block.kind === 'paragraph' ? block.variant ?? null
      : block.kind === 'bullet' ? block.depth : block.kind === 'ordered' ? block.number
        : block.kind === 'task' ? block.checked : block.kind === 'callout' ? block.tone : null;
    const line = PREFIX + JSON.stringify([block.kind, block.text, marks(block.marks ?? [], block.text.length), detail]);
    // Use the same validation for incoming and outgoing canonical records.
    decodeNotebookTextV1(line);
    return line;
  }).join('\n');
}
export function decodeNotebookTextV1(body: string): NotebookDialectBlock[] {
  if (body === '') return [];
  return body.split(/\r?\n/).map((line, i) => {
    const id = `nb-${i}`;
    if (line === '---') return { id, kind: 'divider' };
    const hw = /^::hw::([a-z0-9-]+)::$/.exec(line);
    if (hw) return { id, kind: 'handwriting', key: hw[1] };
    const imgWithWidth = /^::img::([a-z0-9-]+)::(.+)::([0-9]+)::$/.exec(line);
    if (imgWithWidth) {
      const alt: unknown = JSON.parse(imgWithWidth[2]);
      if (typeof alt !== 'string') return invalid();
      const width = parseInt(imgWithWidth[3], 10);
      if (!Number.isInteger(width) || width < 50 || width > 3000) return invalid();
      return { id, kind: 'image-ref', key: imgWithWidth[1], alt, width };
    }
    const image = /^::img::([a-z0-9-]+)::(.*)::$/.exec(line);
    if (image) {
      const alt: unknown = JSON.parse(image[2]);
      if (typeof alt !== 'string') return invalid();
      return { id, kind: 'image-ref', key: image[1], alt };
    }
    if (!line.startsWith(PREFIX)) return invalid();
    const row: unknown = JSON.parse(line.slice(PREFIX.length));
    if (!Array.isArray(row) || row.length !== 4) return invalid();
    const [kind, text, rawMarks, detail] = row;
    if (!kinds.has(kind) || typeof text !== 'string') return invalid();
    const inline = marks(rawMarks, text.length);
    const base = { id, text, ...(inline.length ? { marks: inline } : {}) };
    switch (kind) {
      case 'paragraph':
        if (detail !== null && detail !== 'muted' && detail !== 'fine') return invalid();
        return { ...base, kind, ...(detail !== null ? { variant: detail } : {}) };
      case 'bullet':
        if (!Number.isInteger(detail) || detail < 0 || detail > 2) return invalid();
        return { ...base, kind, depth: detail };
      case 'ordered':
        if (!Number.isInteger(detail) || detail < 1) return invalid();
        return { ...base, kind, number: detail };
      case 'task':
        if (typeof detail !== 'boolean') return invalid();
        return { ...base, kind, checked: detail };
      case 'callout':
        if (!tones.has(detail)) return invalid();
        return { ...base, kind, tone: detail };
      default:
        if (detail !== null) return invalid();
        return { ...base, kind };
    }
  });
}
