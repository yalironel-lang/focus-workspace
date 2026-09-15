/** Versioned canonical text records. Never infer the codec from body contents. */
import type { NotebookDialectBlock } from './notebookDialect';
import type { InlineMark } from './notebookInlineMarks';
import { canonicalizeTablePayloadV1, validateTablePayloadV1 } from './notebookTableCodec';
import { isCanonicalUrl } from './urlSanitizer';

export const NOTEBOOK_TEXT_CODEC_V1 = 1;
const PREFIX = '~nb1:';
const tones = new Set(['summary', 'concept', 'review', 'definition', 'theorem', 'example', 'mistake']);
const kinds = new Set([
  'paragraph',
  'title',
  'section',
  'bullet',
  'ordered',
  'task',
  'quote',
  'step',
  'callout',
  'math',
  'table',
]);
const markTypes = new Set(['b', 'i', 'u', 's', 'fs', 'fg', 'bg', 'hl', 'm', 'a']);
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
    if (mark.t === 'a' && !isCanonicalUrl(mark.v)) return invalid();
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
    if (block.kind === 'table') {
      // In-memory `{ kind:'table', rows }` is the V1 rows carrier only.
      // Emitting `v:1` is safe solely because decode rejected any other payload version.
      // Future TablePayloadV2 must not reuse this path without version-aware handling.
      const payload = canonicalizeTablePayloadV1({ v: 1, rows: block.rows });
      const row: unknown[] = ['table', '', [], payload];
      const line = PREFIX + JSON.stringify(row);
      decodeNotebookTextV1(line);
      return line;
    }
    const align = 'align' in block ? block.align : undefined;
    const eligibleAlign = block.kind === 'paragraph' || block.kind === 'title' || block.kind === 'section' || block.kind === 'quote';
    if (align != null) {
      if (!eligibleAlign) return invalid();
      if (align !== 'left' && align !== 'center' && align !== 'right') return invalid();
    }
    const detail = block.kind === 'paragraph' ? block.variant ?? null
      : block.kind === 'bullet' ? block.depth : block.kind === 'ordered' ? block.number
        : block.kind === 'task' ? block.checked : block.kind === 'callout' ? block.tone : null;
    const row = align != null
      ? [block.kind, block.text, marks(block.marks ?? [], block.text.length), detail, align]
      : [block.kind, block.text, marks(block.marks ?? [], block.text.length), detail];
    const line = PREFIX + JSON.stringify(row);
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
    if (!Array.isArray(row) || (row.length !== 4 && row.length !== 5)) return invalid();
    const [kind, text, rawMarks, detail, rawAlign] = row;
    if (!kinds.has(kind) || typeof text !== 'string') return invalid();
    if (kind === 'table') {
      // Tables never use the M6.3 fifth alignment tuple element.
      if (row.length !== 4) return invalid();
      if (text !== '') return invalid();
      const tableMarks = marks(rawMarks, 0);
      if (tableMarks.length !== 0) return invalid();
      // `v` is validated then intentionally dropped: in-memory table block = V1 rows only.
      const payload = validateTablePayloadV1(detail);
      return { id, kind: 'table', rows: payload.rows };
    }
    if (row.length === 5) {
      if (rawAlign !== 'left' && rawAlign !== 'center' && rawAlign !== 'right') return invalid();
      if (kind !== 'paragraph' && kind !== 'title' && kind !== 'section' && kind !== 'quote') return invalid();
    }
    const inline = marks(rawMarks, text.length);
    const base = {
      id,
      text,
      ...(inline.length ? { marks: inline } : {}),
      ...(row.length === 5 ? { align: rawAlign as 'left' | 'center' | 'right' } : {}),
    };
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
