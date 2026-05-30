/**
 * Inline mark model for notebook rich text.
 * Marks are stored as character offsets over plain text (no TipTap).
 */

export type InlineMarkType = 'b' | 'i' | 'u' | 's' | 'fs' | 'fg' | 'bg' | 'hl';

export interface InlineMark {
  s: number;
  e: number;
  t: InlineMarkType;
  v?: string;
}

export interface RichTextLine {
  plain: string;
  marks: InlineMark[];
}

const MARK_PREFIX_OPEN = '\u27e8m\u27e9';
const MARK_PREFIX_CLOSE = '\u27e8/m\u27e9';

const VALID_TYPES = new Set<InlineMarkType>(['b', 'i', 'u', 's', 'fs', 'fg', 'bg', 'hl']);

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeMark(m: InlineMark, len: number): InlineMark | null {
  const s = clamp(Math.floor(m.s), 0, len);
  const e = clamp(Math.floor(m.e), 0, len);
  if (e <= s || !VALID_TYPES.has(m.t)) return null;
  const out: InlineMark = { s, e, t: m.t };
  if (m.v != null && m.v !== '') out.v = String(m.v);
  return out;
}

/** Sort marks by start, then end (shorter first for same start). */
export function sortMarks(marks: InlineMark[]): InlineMark[] {
  return [...marks].sort((a, b) => a.s - b.s || a.e - b.e);
}

export function mergeAdjacentMarks(marks: InlineMark[]): InlineMark[] {
  const sorted = sortMarks(marks);
  const out: InlineMark[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.t === m.t &&
      last.v === m.v &&
      last.e >= m.s
    ) {
      last.e = Math.max(last.e, m.e);
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

export function parseRichLine(raw: string): RichTextLine {
  if (!raw.startsWith(MARK_PREFIX_OPEN)) {
    return { plain: raw, marks: [] };
  }
  const closeIdx = raw.indexOf(MARK_PREFIX_CLOSE);
  if (closeIdx === -1) {
    return { plain: raw, marks: [] };
  }
  const jsonPart = raw.slice(MARK_PREFIX_OPEN.length, closeIdx);
  const plain = raw.slice(closeIdx + MARK_PREFIX_CLOSE.length);
  try {
    const parsed: unknown = JSON.parse(jsonPart);
    if (!Array.isArray(parsed)) return { plain, marks: [] };
    const marks: InlineMark[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const s = typeof rec.s === 'number' ? rec.s : NaN;
      const e = typeof rec.e === 'number' ? rec.e : NaN;
      const t = rec.t as InlineMarkType;
      const nm = normalizeMark({ s, e, t, v: typeof rec.v === 'string' ? rec.v : undefined }, plain.length);
      if (nm) marks.push(nm);
    }
    return { plain, marks: mergeAdjacentMarks(marks) };
  } catch {
    return { plain, marks: [] };
  }
}

export function serializeRichLine(line: RichTextLine): string {
  const { plain, marks } = line;
  if (!marks.length) return plain;
  const normalized = mergeAdjacentMarks(
    marks.map(m => normalizeMark(m, plain.length)).filter((m): m is InlineMark => m != null),
  );
  if (!normalized.length) return plain;
  return `${MARK_PREFIX_OPEN}${JSON.stringify(normalized)}${MARK_PREFIX_CLOSE}${plain}`;
}

/** Strip mark prefix for plain-text search/export (marks may follow block kind prefix). */
const INLINE_MARKS_RE = /\u27e8m\u27e9[\s\S]*?\u27e8\/m\u27e9/g;

export function stripInlineMarks(raw: string): string {
  return raw.replace(INLINE_MARKS_RE, '');
}

/** Strip mark prefix when it leads the string (parseRichLine input). */
export function stripMarkPrefix(raw: string): string {
  return parseRichLine(raw).plain;
}

function marksCoveringRange(marks: InlineMark[], start: number, end: number, type: InlineMarkType, value?: string): boolean {
  return marks.some(m => {
    if (m.t !== type) return false;
    if (value !== undefined && m.v !== value) return false;
    return m.s <= start && m.e >= end;
  });
}

export function marksAtSelection(
  marks: InlineMark[],
  start: number,
  end: number,
): Partial<Record<InlineMarkType, string | true>> {
  if (end <= start) return {};
  const active: Partial<Record<InlineMarkType, string | true>> = {};
  for (const t of VALID_TYPES) {
    if (t === 'fs' || t === 'fg' || t === 'bg' || t === 'hl') continue;
    if (marksCoveringRange(marks, start, end, t)) active[t] = true;
  }
  for (const t of ['fs', 'fg', 'bg', 'hl'] as const) {
    const covering = marks.filter(m => m.t === t && m.s <= start && m.e >= end);
    if (covering.length === 1 && covering[0]!.v) active[t] = covering[0]!.v;
  }
  return active;
}

function removeMarksInRange(marks: InlineMark[], start: number, end: number, types?: Set<InlineMarkType>): InlineMark[] {
  const out: InlineMark[] = [];
  for (const m of marks) {
    if (types && !types.has(m.t)) {
      out.push(m);
      continue;
    }
    if (m.e <= start || m.s >= end) {
      out.push(m);
      continue;
    }
    if (m.s < start) out.push({ ...m, e: start });
    if (m.e > end) out.push({ ...m, s: end });
  }
  return mergeAdjacentMarks(out);
}

export function clearMarksInRange(
  marks: InlineMark[],
  start: number,
  end: number,
  types?: InlineMarkType[],
): InlineMark[] {
  const set = types ? new Set(types) : undefined;
  return removeMarksInRange(marks, start, end, set);
}

export function applyMarkRange(
  marks: InlineMark[],
  start: number,
  end: number,
  type: InlineMarkType,
  value?: string,
): InlineMark[] {
  if (end <= start) return marks;
  const without = removeMarksInRange(marks, start, end, new Set([type]));
  const next: InlineMark = { s: start, e: end, t: type };
  if (value != null && value !== '') next.v = value;
  return mergeAdjacentMarks([...without, next]);
}

export function applyMarkToggle(
  marks: InlineMark[],
  start: number,
  end: number,
  type: InlineMarkType,
  value?: string,
): InlineMark[] {
  if (end <= start) return marks;
  const valued = type === 'fs' || type === 'fg' || type === 'bg' || type === 'hl';
  if (!valued && marksCoveringRange(marks, start, end, type)) {
    return removeMarksInRange(marks, start, end, new Set([type]));
  }
  if (valued && value && marksCoveringRange(marks, start, end, type, value)) {
    return removeMarksInRange(marks, start, end, new Set([type]));
  }
  return applyMarkRange(marks, start, end, type, value);
}

export function clearAllMarksInRange(marks: InlineMark[], start: number, end: number): InlineMark[] {
  return removeMarksInRange(marks, start, end);
}

export function duplicateRange(
  plain: string,
  marks: InlineMark[],
  start: number,
  end: number,
): { plain: string; marks: InlineMark[]; selectionStart: number; selectionEnd: number } {
  if (end <= start) {
    return { plain, marks, selectionStart: start, selectionEnd: end };
  }
  const slice = plain.slice(start, end);
  const len = slice.length;
  const dupMarks: InlineMark[] = marks
    .filter(m => m.e > start && m.s < end)
    .map(m => ({
      t: m.t,
      v: m.v,
      s: Math.max(0, m.s - start) + end,
      e: Math.min(end, m.e) - Math.max(start, m.s) + end,
    }));
  const newPlain = plain.slice(0, end) + slice + plain.slice(end);
  const shifted = marks.map(m => (m.s >= end ? { ...m, s: m.s + len, e: m.e + len } : m));
  return {
    plain: newPlain,
    marks: mergeAdjacentMarks([...shifted, ...dupMarks]),
    selectionStart: end,
    selectionEnd: end + len,
  };
}

/** Shift mark offsets after plain-text edit (simple insert/delete at offset). */
export function shiftMarksForEdit(
  marks: InlineMark[],
  editStart: number,
  removedLen: number,
  insertedLen: number,
  newPlainLen: number,
): InlineMark[] {
  const delta = insertedLen - removedLen;
  if (delta === 0 && removedLen === 0) return marks;
  const out: InlineMark[] = [];
  for (const m of marks) {
    let s = m.s;
    let e = m.e;
    if (e <= editStart) {
      out.push(m);
      continue;
    }
    if (s >= editStart + removedLen) {
      s += delta;
      e += delta;
    } else if (s >= editStart) {
      s = editStart + insertedLen;
      e = Math.max(s, e + delta);
    } else {
      e = Math.min(newPlainLen, Math.max(editStart + insertedLen, e + delta));
    }
    const nm = normalizeMark({ ...m, s, e }, newPlainLen);
    if (nm) out.push(nm);
  }
  return mergeAdjacentMarks(out);
}

export const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 32, 48] as const;

export const HIGHLIGHT_PRESETS = [
  '#fef08a',
  '#bbf7d0',
  '#bfdbfe',
  '#fbcfe8',
  '#fed7aa',
] as const;

export const TEXT_COLOR_PRESETS = [
  '#f8fafc',
  '#fca5a5',
  '#fdba74',
  '#fde047',
  '#86efac',
  '#93c5fd',
  '#c4b5fd',
  '#f0abfc',
] as const;
