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

/** Strip mark envelopes anywhere in a line (marks may follow block kind prefix). */
const INLINE_MARKS_RE = /\u27e8m\u27e9[\s\S]*?\u27e8\/m\u27e9/g;

export function stripInlineMarks(raw: string): string {
  return raw.replace(INLINE_MARKS_RE, '');
}

function parseMarksJson(jsonPart: string, baseOffset: number): InlineMark[] {
  try {
    const parsed: unknown = JSON.parse(jsonPart);
    if (!Array.isArray(parsed)) return [];
    const marks: InlineMark[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const s = typeof rec.s === 'number' ? rec.s : NaN;
      const e = typeof rec.e === 'number' ? rec.e : NaN;
      const t = rec.t as InlineMarkType;
      if (!VALID_TYPES.has(t)) continue;
      marks.push({
        s: s + baseOffset,
        e: e + baseOffset,
        t,
        ...(typeof rec.v === 'string' && rec.v !== '' ? { v: rec.v } : {}),
      });
    }
    return marks;
  } catch {
    return [];
  }
}

/**
 * Parse inline marks from storage text. Envelopes may appear anywhere in the line
 * (e.g. after "# " or "1. "), not only at index 0.
 */
export function parseRichLine(raw: string): RichTextLine {
  if (!raw.includes(MARK_PREFIX_OPEN)) {
    return { plain: raw, marks: [] };
  }

  let plain = '';
  const marks: InlineMark[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const openIdx = raw.indexOf(MARK_PREFIX_OPEN, cursor);
    if (openIdx === -1) {
      plain += raw.slice(cursor);
      break;
    }
    plain += raw.slice(cursor, openIdx);
    const closeIdx = raw.indexOf(MARK_PREFIX_CLOSE, openIdx + MARK_PREFIX_OPEN.length);
    if (closeIdx === -1) {
      plain += raw.slice(openIdx);
      break;
    }
    const jsonPart = raw.slice(openIdx + MARK_PREFIX_OPEN.length, closeIdx);
    marks.push(...parseMarksJson(jsonPart, plain.length));
    cursor = closeIdx + MARK_PREFIX_CLOSE.length;
  }

  if (plain.includes(MARK_PREFIX_OPEN) || plain.includes(MARK_PREFIX_CLOSE)) {
    plain = stripInlineMarks(plain);
  }

  const normalized = marks
    .map(m => normalizeMark(m, plain.length))
    .filter((m): m is InlineMark => m != null);

  return { plain, marks: mergeAdjacentMarks(normalized) };
}

export function serializeRichLine(line: RichTextLine): string {
  const plain = stripInlineMarks(line.plain);
  const marks = line.marks;
  if (!marks.length) return plain;
  const normalized = mergeAdjacentMarks(
    marks.map(m => normalizeMark(m, plain.length)).filter((m): m is InlineMark => m != null),
  );
  if (!normalized.length) return plain;
  return `${MARK_PREFIX_OPEN}${JSON.stringify(normalized)}${MARK_PREFIX_CLOSE}${plain}`;
}

/** Strip mark prefix when it leads the string (parseRichLine input). */
export function stripMarkPrefix(raw: string): string {
  return parseRichLine(raw).plain;
}

/** True when every index in [start, end) carries mark type T (supports fragmented marks). */
export function isMarkActiveOnRange(
  marks: InlineMark[],
  start: number,
  end: number,
  type: InlineMarkType,
  value?: string,
): boolean {
  if (end <= start) return false;
  const valued = type === 'fs' || type === 'fg' || type === 'bg' || type === 'hl';
  for (let i = start; i < end; i++) {
    const hit = marks.some(m => {
      if (m.t !== type) return false;
      if (valued && value !== undefined && m.v !== value) return false;
      return m.s <= i && m.e > i;
    });
    if (!hit) return false;
  }
  return true;
}

/** Canonical default paragraph size — must match ProjectNotebookBlock typeScale.l3. */
export const DEFAULT_NOTEBOOK_FONT_SIZE = 18;

export const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 32, 48] as const;

/** Resolve toolbar display value for a selection's font-size marks. */
export function fontSizeAtSelection(
  marks: InlineMark[],
  start: number,
  end: number,
): { value: string; mixed: boolean } {
  if (end <= start) return { value: String(DEFAULT_NOTEBOOK_FONT_SIZE), mixed: false };
  const sizes = new Set<string>();
  for (let i = start; i < end; i += 1) {
    const hit = marks.find(m => m.t === 'fs' && m.s <= i && m.e > i);
    sizes.add(hit?.v ?? String(DEFAULT_NOTEBOOK_FONT_SIZE));
  }
  if (sizes.size === 0) return { value: String(DEFAULT_NOTEBOOK_FONT_SIZE), mixed: false };
  if (sizes.size > 1) return { value: '', mixed: true };
  return { value: [...sizes][0]!, mixed: false };
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
    if (isMarkActiveOnRange(marks, start, end, t)) active[t] = true;
  }
  for (const t of ['fg', 'bg', 'hl'] as const) {
    const covering = marks.filter(m => m.t === t && m.s <= start && m.e >= end);
    if (covering.length === 1 && covering[0]!.v) active[t] = covering[0]!.v;
  }
  // Only report fs when an explicit mark covers the range (toolbar uses fontSizeAtSelection for default/mixed UI).
  const coveringFs = marks.filter(m => m.t === 'fs' && m.s <= start && m.e >= end);
  if (coveringFs.length === 1 && coveringFs[0]!.v) {
    const fs = fontSizeAtSelection(marks, start, end);
    if (!fs.mixed && fs.value) active.fs = fs.value;
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
  if (!valued && isMarkActiveOnRange(marks, start, end, type)) {
    return removeMarksInRange(marks, start, end, new Set([type]));
  }
  if (valued && value && isMarkActiveOnRange(marks, start, end, type, value)) {
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
