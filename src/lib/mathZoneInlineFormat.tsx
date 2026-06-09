/**
 * MathZone inline formatting — TipTap ↔ rich-line storage ↔ read-mode render.
 * Storage uses notebookInlineMarks offset format; legacy **bold** / *italic* still loads.
 */

import type { ReactNode } from 'react';
import type { JSONContent } from '@tiptap/react';
import {
  type InlineMark,
  type InlineMarkType,
  parseRichLine,
  serializeRichLine,
  mergeAdjacentMarks,
  sortMarks,
  TEXT_COLOR_PRESETS,
  HIGHLIGHT_PRESETS,
} from './notebookInlineMarks';

export { TEXT_COLOR_PRESETS, HIGHLIGHT_PRESETS };

export const FONT_SIZE_PRESETS = [
  { label: 'Small', px: 14 },
  { label: 'Normal', px: 16 },
  { label: 'Large', px: 20 },
  { label: 'Extra Large', px: 24 },
] as const;

export const DEFAULT_FONT_SIZE_PX = 16;

type InlineMarkSeg = { kind: 'plain' | 'bold' | 'italic'; text: string };

type MarkSegment = {
  start: number;
  end: number;
  types: Map<InlineMarkType, string | undefined>;
};

function parseInlineMarkdownSegments(text: string): InlineMarkSeg[] {
  if (!text) return [];
  const segs: InlineMarkSeg[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segs.push({ kind: 'plain', text: text.slice(last, m.index) });
    }
    if (m[1] != null) {
      segs.push({ kind: 'bold', text: m[1] });
    } else if (m[2] != null) {
      segs.push({ kind: 'italic', text: m[2] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segs.push({ kind: 'plain', text: text.slice(last) });
  }
  return segs.length ? segs : [{ kind: 'plain', text }];
}

function buildSegments(marks: InlineMark[], len: number): MarkSegment[] {
  if (!len) return [];
  const boundaries = new Set<number>([0, len]);
  for (const m of marks) {
    boundaries.add(Math.max(0, Math.min(len, m.s)));
    boundaries.add(Math.max(0, Math.min(len, m.e)));
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments: MarkSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (start >= end) continue;
    const types = new Map<InlineMarkType, string | undefined>();
    for (const m of marks) {
      if (m.s <= start && m.e >= end) {
        types.set(m.t, m.v);
      }
    }
    segments.push({ start, end, types });
  }
  return segments;
}

function segmentToTiptapMarks(types: Map<InlineMarkType, string | undefined>): JSONContent['marks'] {
  const marks: NonNullable<JSONContent['marks']> = [];
  if (types.has('b')) marks.push({ type: 'bold' });
  if (types.has('i')) marks.push({ type: 'italic' });
  if (types.has('u')) marks.push({ type: 'underline' });

  const fs = types.get('fs');
  const fg = types.get('fg');
  const textStyleAttrs: Record<string, string> = {};
  if (fs) textStyleAttrs.fontSize = fs.includes('px') ? fs : `${fs}px`;
  if (fg) textStyleAttrs.color = fg;
  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push({ type: 'textStyle', attrs: textStyleAttrs });
  }

  const hl = types.get('hl');
  if (hl) marks.push({ type: 'highlight', attrs: { color: hl } });

  return marks.length ? marks : undefined;
}

function richLineToTiptapNodes(plain: string, marks: InlineMark[]): JSONContent[] {
  if (!plain) return [];
  const segments = buildSegments(sortMarks(marks), plain.length);
  return segments.map(seg => {
    const text = plain.slice(seg.start, seg.end);
    const nodeMarks = segmentToTiptapMarks(seg.types);
    return nodeMarks ? { type: 'text', text, marks: nodeMarks } : { type: 'text', text };
  });
}

function parseInlineMarkdownToTiptap(text: string): JSONContent[] {
  return parseInlineMarkdownSegments(text).map(seg => {
    if (seg.kind === 'bold') {
      return { type: 'text', text: seg.text, marks: [{ type: 'bold' }] };
    }
    if (seg.kind === 'italic') {
      return { type: 'text', text: seg.text, marks: [{ type: 'italic' }] };
    }
    return { type: 'text', text: seg.text };
  });
}

/** Parse stored inline payload into TipTap text nodes. */
export function parseInlineForTiptap(raw: string): JSONContent[] {
  const { plain, marks } = parseRichLine(raw);
  if (marks.length > 0) {
    return richLineToTiptapNodes(plain, marks);
  }
  return parseInlineMarkdownToTiptap(plain);
}

function tiptapMarkToInline(
  mark: NonNullable<JSONContent['marks']>[number],
  start: number,
  end: number,
  out: InlineMark[],
): void {
  switch (mark.type) {
    case 'bold':
      out.push({ s: start, e: end, t: 'b' });
      break;
    case 'italic':
      out.push({ s: start, e: end, t: 'i' });
      break;
    case 'underline':
      out.push({ s: start, e: end, t: 'u' });
      break;
    case 'textStyle': {
      const fs = mark.attrs?.fontSize;
      if (typeof fs === 'string' && fs) {
        const px = parseInt(fs.replace(/px$/i, ''), 10);
        if (!Number.isNaN(px) && px !== DEFAULT_FONT_SIZE_PX) {
          out.push({ s: start, e: end, t: 'fs', v: String(px) });
        }
      }
      const color = mark.attrs?.color;
      if (typeof color === 'string' && color) {
        out.push({ s: start, e: end, t: 'fg', v: color });
      }
      break;
    }
    case 'highlight': {
      const color = mark.attrs?.color;
      if (typeof color === 'string' && color) {
        out.push({ s: start, e: end, t: 'hl', v: color });
      }
      break;
    }
    default:
      break;
  }
}

function tiptapInlineToRichLine(nodes: JSONContent[]): { plain: string; marks: InlineMark[] } {
  let plain = '';
  const marks: InlineMark[] = [];
  for (const node of nodes) {
    if (node.type !== 'text') continue;
    const text = node.text ?? '';
    const start = plain.length;
    const end = start + text.length;
    plain += text;
    for (const mark of node.marks ?? []) {
      tiptapMarkToInline(mark, start, end, marks);
    }
  }
  return { plain, marks: mergeAdjacentMarks(marks) };
}

/** Serialize TipTap paragraph inline nodes to a storage string. */
export function serializeTiptapInline(nodes: JSONContent[]): string {
  const { plain, marks } = tiptapInlineToRichLine(nodes);
  if (!marks.length) return plain;
  return serializeRichLine({ plain, marks });
}

function renderInlineMarkdownLegacy(text: string): ReactNode {
  return parseInlineMarkdownSegments(text).map((seg, i) => {
    if (seg.kind === 'bold') {
      return (
        <strong key={i} style={{ fontWeight: 650 }}>
          {seg.text}
        </strong>
      );
    }
    if (seg.kind === 'italic') {
      return (
        <em key={i} style={{ fontStyle: 'italic', fontSynthesis: 'style' }}>
          {seg.text}
        </em>
      );
    }
    return <span key={i}>{seg.text}</span>;
  });
}

function wrapSegmentReact(
  text: string,
  types: Map<InlineMarkType, string | undefined>,
  key: string,
): ReactNode {
  let node: ReactNode = text;
  const order: InlineMarkType[] = ['fs', 'fg', 'hl', 'b', 'i', 'u'];
  for (const t of order) {
    if (!types.has(t)) continue;
    const v = types.get(t);
    switch (t) {
      case 'b':
        node = <strong style={{ fontWeight: 650 }}>{node}</strong>;
        break;
      case 'i':
        node = (
          <em style={{ fontStyle: 'italic', fontSynthesis: 'style' }}>{node}</em>
        );
        break;
      case 'u':
        node = (
          <u style={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}>{node}</u>
        );
        break;
      case 'fs':
        node = <span style={{ fontSize: `${v ?? DEFAULT_FONT_SIZE_PX}px` }}>{node}</span>;
        break;
      case 'fg':
        node = <span style={{ color: v }}>{node}</span>;
        break;
      case 'hl':
        node = (
          <mark style={{ backgroundColor: v, color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
            {node}
          </mark>
        );
        break;
      default:
        break;
    }
  }
  return <span key={key}>{node}</span>;
}

/** Read-mode renderer for plain text + offset marks (no storage envelope). */
export function renderPlainWithMarks(plain: string, marks: InlineMark[]): ReactNode {
  if (!plain) return null;
  if (!marks.length) return renderInlineMarkdownLegacy(plain);
  const segments = buildSegments(sortMarks(marks), plain.length);
  return segments.map((seg, i) =>
    wrapSegmentReact(plain.slice(seg.start, seg.end), seg.types, String(i)),
  );
}

/** Read-mode renderer for inline text (rich marks + legacy markdown). */
export function renderInlineFormatted(raw: string): ReactNode {
  const { plain, marks } = parseRichLine(raw);
  if (marks.length > 0) {
    return renderPlainWithMarks(plain, marks);
  }
  return renderInlineMarkdownLegacy(plain);
}

/** Map TipTap fontSize attribute to select value (px string without unit). */
export function fontSizeSelectValue(fontSize: string | null | undefined): string {
  if (!fontSize) return String(DEFAULT_FONT_SIZE_PX);
  const px = parseInt(fontSize.replace(/px$/i, ''), 10);
  if (Number.isNaN(px)) return String(DEFAULT_FONT_SIZE_PX);
  const preset = FONT_SIZE_PRESETS.find(p => p.px === px);
  return preset ? String(preset.px) : String(DEFAULT_FONT_SIZE_PX);
}
