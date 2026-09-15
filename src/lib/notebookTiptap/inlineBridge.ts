/**
 * Fail-closed TipTap ↔ InlineMark bridge for Notebook dialect.
 * Unlike MathZone helpers, unsupported marks NEVER silently drop.
 */

import type { JSONContent } from '@tiptap/core';
import {
  type InlineMark,
  type InlineMarkType,
  mergeAdjacentMarks,
  sortMarks,
  DEFAULT_NOTEBOOK_FONT_SIZE,
} from '../notebookInlineMarks';
import { NotebookTiptapConversionError } from './errors';
import { ALLOWED_MARK_TYPES } from './extensions';
import { sanitizeUrl } from '../urlSanitizer';

const MARK_TYPE_ORDER: Record<InlineMarkType, number> = {
  b: 0,
  i: 1,
  u: 2,
  s: 3,
  fs: 4,
  fg: 5,
  bg: 6,
  hl: 7,
  m: 8,
  a: 9,
};

/** Merge touching/overlapping ranges of the same type+value (TipTap segments fragment spans). */
function coalesceMarks(marks: InlineMark[]): InlineMark[] {
  const groups = new Map<string, InlineMark[]>();
  for (const m of marks) {
    const key = `${m.t}\0${m.v ?? ''}`;
    const list = groups.get(key);
    if (list) list.push({ ...m });
    else groups.set(key, [{ ...m }]);
  }
  const out: InlineMark[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.s - b.s || a.e - b.e);
    const merged: InlineMark[] = [];
    for (const m of list) {
      const prev = merged[merged.length - 1];
      if (prev && prev.e >= m.s) {
        prev.e = Math.max(prev.e, m.e);
      } else {
        merged.push(m);
      }
    }
    out.push(...merged);
  }
  return out.sort(
    (a, b) => a.s - b.s || a.e - b.e || MARK_TYPE_ORDER[a.t] - MARK_TYPE_ORDER[b.t],
  );
}

function canonicalizeMarks(marks: InlineMark[]): InlineMark[] {
  return coalesceMarks(mergeAdjacentMarks(marks));
}

type MarkSegment = {
  start: number;
  end: number;
  types: Map<InlineMarkType, string | undefined>;
};

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

/** Deterministic TipTap mark order on a text node. */
function segmentToTiptapMarks(
  types: Map<InlineMarkType, string | undefined>,
): JSONContent['marks'] {
  const marks: NonNullable<JSONContent['marks']> = [];
  if (types.has('b')) marks.push({ type: 'bold' });
  if (types.has('i')) marks.push({ type: 'italic' });
  if (types.has('u')) marks.push({ type: 'underline' });
  if (types.has('s')) marks.push({ type: 'strike' });
  if (types.has('m')) marks.push({ type: 'math' });

  const fs = types.get('fs');
  const fg = types.get('fg');
  const bg = types.get('bg');
  const textStyleAttrs: Record<string, string> = {};
  if (fs) textStyleAttrs.fontSize = fs.includes('px') ? fs : `${fs}px`;
  if (fg) textStyleAttrs.color = fg;
  if (bg) textStyleAttrs.backgroundColor = bg;
  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push({ type: 'textStyle', attrs: textStyleAttrs });
  }

  const hl = types.get('hl');
  if (hl) marks.push({ type: 'highlight', attrs: { color: hl } });

  const a = types.get('a');
  if (a) marks.push({ type: 'link', attrs: { href: a } });

  return marks.length ? marks : undefined;
}

/** Plain + marks → TipTap inline text nodes (deterministic segments). */
export function richLineToTiptapInline(plain: string, marks: InlineMark[] = []): JSONContent[] {
  if (!plain) return [];
  const segments = buildSegments(sortMarks(marks), plain.length);
  return segments.map(seg => {
    const text = plain.slice(seg.start, seg.end);
    if (seg.types.has('m')) {
      const nonMathTypes = new Map(seg.types);
      nonMathTypes.delete('m');
      nonMathTypes.delete('a');
      const otherMarks = segmentToTiptapMarks(nonMathTypes);
      return otherMarks
        ? { type: 'nbInlineMath', attrs: { text }, marks: otherMarks }
        : { type: 'nbInlineMath', attrs: { text } };
    }
    const nodeMarks = segmentToTiptapMarks(seg.types);
    return nodeMarks ? { type: 'text', text, marks: nodeMarks } : { type: 'text', text };
  });
}

function assertAllowedMark(type: string): void {
  if (!ALLOWED_MARK_TYPES.has(type)) {
    throw new NotebookTiptapConversionError(
      'unsupported_mark',
      `Unsupported TipTap mark "${type}" cannot be represented in Notebook dialect`,
      type,
    );
  }
}

function tiptapMarkToInline(
  mark: NonNullable<JSONContent['marks']>[number],
  start: number,
  end: number,
  out: InlineMark[],
): void {
  assertAllowedMark(mark.type);
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
    case 'strike':
      out.push({ s: start, e: end, t: 's' });
      break;
    case 'math':
      out.push({ s: start, e: end, t: 'm' });
      break;
    case 'textStyle': {
      const attrs = mark.attrs ?? {};
      for (const key of Object.keys(attrs)) {
        if (key === 'fontSize' || key === 'color' || key === 'backgroundColor') continue;
        if (attrs[key] == null || attrs[key] === '') continue;
        throw new NotebookTiptapConversionError(
          'unsupported_attr',
          `Unsupported textStyle attribute "${key}"`,
          key,
        );
      }
      const fs = attrs.fontSize;
      if (typeof fs === 'string' && fs) {
        const px = parseInt(fs.replace(/px$/i, ''), 10);
        if (!Number.isNaN(px) && px !== DEFAULT_NOTEBOOK_FONT_SIZE) {
          out.push({ s: start, e: end, t: 'fs', v: String(px) });
        }
      }
      const color = attrs.color;
      if (typeof color === 'string' && color) {
        out.push({ s: start, e: end, t: 'fg', v: color });
      }
      const bg = attrs.backgroundColor;
      if (typeof bg === 'string' && bg) {
        out.push({ s: start, e: end, t: 'bg', v: bg });
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
    case 'link': {
      const rawHref = mark.attrs?.href;
      const sanitized = sanitizeUrl(rawHref);
      if (!sanitized) {
        throw new NotebookTiptapConversionError(
          'unsupported_attr',
          `Unsafe or invalid link href "${String(rawHref)}" cannot be persisted`,
          'href',
        );
      }
      out.push({ s: start, e: end, t: 'a', v: sanitized });
      break;
    }
    default:
      throw new NotebookTiptapConversionError(
        'unsupported_mark',
        `Unsupported TipTap mark "${mark.type}"`,
        mark.type,
      );
  }
}

/** TipTap inline nodes → plain + marks. Fails closed on hardBreak / unknown nodes / marks. */
export function tiptapInlineToRichLine(nodes: JSONContent[] | undefined): {
  plain: string;
  marks: InlineMark[];
} {
  if (!nodes || nodes.length === 0) return { plain: '', marks: [] };
  let plain = '';
  const marks: InlineMark[] = [];
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      throw new NotebookTiptapConversionError(
        'hard_break',
        'hardBreak is unsupported in Notebook dialect (newline is a block boundary)',
      );
    }
    if (node.type === 'nbInlineMath') {
      const mathText = node.attrs?.text;
      if (typeof mathText !== 'string') {
        throw new NotebookTiptapConversionError(
          'malformed_input',
          'nbInlineMath node missing required string text attribute',
          'nbInlineMath',
        );
      }
      if (!mathText) continue;
      const start = plain.length;
      const end = start + mathText.length;
      plain += mathText;
      marks.push({ s: start, e: end, t: 'm' });
      for (const mark of node.marks ?? []) {
        if (mark.type !== 'math' && mark.type !== 'link') {
          tiptapMarkToInline(mark, start, end, marks);
        }
      }
      continue;
    }
    if (node.type !== 'text') {
      throw new NotebookTiptapConversionError(
        'unsupported_node',
        `Unsupported inline node "${node.type ?? 'unknown'}"`,
        node.type,
      );
    }
    const text = node.text ?? '';
    if (!text) continue;
    const start = plain.length;
    const end = start + text.length;
    plain += text;
    for (const mark of node.marks ?? []) {
      tiptapMarkToInline(mark, start, end, marks);
    }
  }
  return { plain, marks: canonicalizeMarks(marks) };
}
