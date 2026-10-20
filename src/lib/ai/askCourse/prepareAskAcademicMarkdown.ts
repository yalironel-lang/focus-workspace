/**
 * M0.9C3 — prepare Ask assistant text for safe Markdown rendering.
 *
 * Protects fenced code and existing KaTeX math (via parseAiExplanationSegments)
 * behind opaque placeholders so react-markdown cannot alter them.
 * Does not interpret HTML.
 */

import { parseAiExplanationSegments } from '../explainSelection/parseAiExplanationSegments';
import { wrapBareLatex } from './presentBareLatex';

export type AskProtectedSlot =
  | { kind: 'inline_math'; latex: string }
  | { kind: 'display_math'; latex: string }
  | { kind: 'fenced_code'; language: string; code: string };

/** Opaque tokens unlikely to appear in model output or Markdown syntax. */
const SLOT_OPEN = '\uE000ASK';
const SLOT_CLOSE = '\uE001';

export function askSlotToken(index: number): string {
  return `${SLOT_OPEN}${index}${SLOT_CLOSE}`;
}

export function parseAskSlotToken(value: string): number | null {
  if (!value.startsWith(SLOT_OPEN) || !value.endsWith(SLOT_CLOSE)) return null;
  const inner = value.slice(SLOT_OPEN.length, -SLOT_CLOSE.length);
  if (!/^\d+$/.test(inner)) return null;
  return Number(inner);
}

const FENCE_RE = /^([ \t]*)```([^\n`]*)\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;

function extractFencedCode(input: string): {
  text: string;
  slots: AskProtectedSlot[];
} {
  const slots: AskProtectedSlot[] = [];
  const text = input.replace(FENCE_RE, (_full, _indent, langRaw: string, body: string) => {
    const language = String(langRaw ?? '')
      .trim()
      .split(/\s+/)[0]
      ?.slice(0, 32) ?? '';
    const code = body.replace(/\n$/, '');
    const idx = slots.length;
    slots.push({ kind: 'fenced_code', language, code });
    // Place fence on its own lines so Markdown treats it as a block.
    return `\n\n${askSlotToken(idx)}\n\n`;
  });
  return { text, slots };
}

type LayoutKind = 'blank' | 'heading' | 'ul' | 'ol' | 'rule' | 'slot' | 'cont' | 'prose';

function indentOf(line: string): number {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0].replace(/\t/g, '  ').length : 0;
}

function markerIsStructural(line: string, markerIndex: number): boolean {
  let i = markerIndex - 1;
  while (i >= 0 && /[ \t]/.test(line[i] ?? '')) i -= 1;
  if (i < 0) return true;
  return /[:;.!?]/.test(line[i] ?? '');
}

/**
 * Turn "1. Alpha 2. Beta" into separate lines when the numbering is a real list.
 * Leaves "Theorem 1. The result" alone.
 */
function splitInlineOrdered(line: string): string[] | null {
  const re = /(^|\s)(\d{1,2})([.)])(\s+)(?=\S)/g;
  const hits: Array<{ index: number; num: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const index = match.index + match[1].length;
    const num = Number(match[2]);
    if (hits.length === 0) {
      if (!markerIsStructural(line, index) || num !== 1) continue;
    } else if (num !== hits[hits.length - 1]!.num + 1) {
      return null;
    }
    hits.push({ index, num });
  }
  if (hits.length < 2) return null;
  return sliceListParts(line, hits.map(hit => hit.index));
}

function splitInlineBullets(line: string): string[] | null {
  // `+` is an arithmetic operator. A line that already begins with `+ ` is
  // still a CommonMark list and does not need this inline split.
  const re = /(^|\s)([-*•·●\u2013\u2014])(?=\s+\S)/g;
  const hits: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const index = match.index + match[1].length;
    const marker = match[2] ?? '';
    if (line[index + 1] === marker) continue;
    if (marker === '*' && line[index - 1] === '*') continue;
    hits.push(index);
  }
  if (hits.length < 1) return null;
  // One dash in a sentence stays prose. A repeated run is a list even when
  // the first marker does not follow punctuation.
  const selected = hits.length >= 3 || markerIsStructural(line, hits[0]!) ? hits : [];
  if (selected.length === 0) return null;
  const parts = sliceListParts(line, selected);
  return parts.length > 1 ? parts : null;
}

function sliceListParts(line: string, indexes: number[]): string[] {
  const parts: string[] = [];
  const preface = line.slice(0, indexes[0]).trimEnd();
  if (preface) parts.push(preface);
  for (let i = 0; i < indexes.length; i += 1) {
    const start = indexes[i]!;
    const end = i + 1 < indexes.length ? indexes[i + 1]! : line.length;
    const chunk = line.slice(start, end).trim();
    if (chunk) parts.push(chunk);
  }
  return parts.length > 1 ? parts : [line];
}

function explodeInlineLists(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [line];
  if (/^#{1,6}(?:\s+\S|\S)/.test(trimmed)) return [line];
  if (/^(?:---|\*\*\*|___+)$/.test(trimmed)) return [line];
  return splitInlineOrdered(line) ?? splitInlineBullets(line) ?? [line];
}

function boldSpanIsStructural(text: string): boolean {
  if (text.length > 100) return true;
  if (/#{2,6}\s*\S/.test(text)) return true;
  if (/[A-Za-z]{3,}[.?!]["')\]]*\s+\S/.test(text)) return true;
  if (/(?:^|\s)(?:---|\*\*\*|___)(?:\s|$)/.test(text)) return true;
  if (/(?:^|\s)[-*•·●\u2013\u2014]\s+\S/.test(text)) return true;
  return false;
}

/**
 * Bold may emphasize a short title or one sentence. A span that also holds a
 * list, a rule, a heading, or a whole paragraph is unwrapped so those markers
 * can become blocks. The stored answer is unchanged.
 */
function unwrapWideBold(line: string): string {
  return line.replace(/\*\*([^*\n]+)\*\*/g, (full, inner: string) => {
    const text = inner.trim();
    if (!text || !boldSpanIsStructural(text)) return full;
    return text;
  });
}

/**
 * A bold region may span several lines and may contain `*` bullets. Those
 * delimiters are removed only when the region also holds a list, a heading,
 * a rule, or more than one sentence. A short one-sentence emphasis stays.
 */
function unwrapStructuralEmphasis(text: string): string {
  const unwrap = (full: string, inner: string) => {
    const body = inner.trim();
    if (!body || !boldSpanIsStructural(body)) return full;
    return inner;
  };
  return text.replace(/\*\*([\s\S]*?)\*\*/g, unwrap).replace(/__([\s\S]*?)__/g, unwrap);
}

function liftThematicBreaks(line: string): string[] {
  if (/^\s*(?:---|\*\*\*|___+)\s*$/.test(line)) return [line.trim()];
  const re = /(?:^|[ \t])(---|\*\*\*|___)(?=[ \t]|$)/g;
  const indexes: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    indexes.push(match.index + match[0].length - match[1]!.length);
  }
  if (indexes.length === 0) return [line];
  return sliceListParts(line, indexes).map(part => part.trim()).filter(Boolean);
}

/**
 * `prose. ### Example ... ### Step 2 ...` is not an ATX heading until each
 * marker begins its own line. One hash is left alone so `C#` and `# 12` stay prose.
 */
function splitInlineHeadings(line: string): string[] {
  const re = /#{2,6}/g;
  const indexes: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const at = match.index;
    if (at === 0) continue;
    let before = at - 1;
    while (before >= 0 && /[ \t]/.test(line[before] ?? '')) before -= 1;
    if (before < 0) continue;
    const prev = line[before] ?? '';
    const after = line[at + match[0].length] ?? '';
    const hasSpace = /[ \t]/.test(after);
    if (!hasSpace && /[A-Za-z0-9]/.test(prev)) continue;
    if (!hasSpace && !/[.!?:,;)\]]/.test(prev) && !/[ \t]/.test(line[at - 1] ?? '')) continue;
    if (hasSpace && !/\S/.test(line.slice(at + match[0].length))) continue;
    indexes.push(at);
  }
  if (indexes.length === 0) return [line];
  return sliceListParts(line, indexes);
}

const HEADING_BODY_START = new Set([
  'A', 'An', 'After', 'Assume', 'At', 'Because', 'Before', 'Begin', 'But', 'By',
  'Capital', 'Compute', 'Consider', 'Continue', 'Define', 'Differentiate', 'Finally',
  'Find', 'First', 'For', 'From', 'Given', 'Hence', 'Here', 'However', 'If', 'In',
  'Let', 'Next', 'Note', 'Notice', 'Now', 'Observe', 'On', 'Once', 'Output',
  'Recall', 'Show', 'Since', 'Solve', 'Suppose', 'Take', 'The', 'Then', 'Therefore',
  'This', 'Thus', 'To', 'Using', 'We', 'When', 'Where', 'While', 'With',
]);

function headingBodyWord(word: string): string {
  return word.replace(/^[("']+/, '').replace(/[.,:;]+$/, '');
}

/**
 * Once a heading shares its line with the following sentence, keep a short
 * label (`Example`, `Step 2`) and put the sentence back into a paragraph.
 * A heading that already occupies the line alone is unchanged.
 */
function peelHeadingBody(line: string): string[] {
  const match = /^(\s*)(#{2,6})\s+(\S[\s\S]*)$/.exec(line);
  if (!match) return [line];
  const indent = match[1] ?? '';
  const marks = match[2] ?? '##';
  const rest = (match[3] ?? '').trim();
  const words = rest.split(/[ \t]+/).filter(Boolean);
  if (words.length < 2) return [line];

  const limit = Math.min(words.length - 1, 6);
  for (let i = 1; i <= limit; i += 1) {
    const title = words.slice(0, i).join(' ');
    const next = words[i] ?? '';
    const nextBare = headingBodyWord(next);
    const slot = next.startsWith(SLOT_OPEN);
    const starter = HEADING_BODY_START.has(nextBare);
    const numbered = /\d$/.test(title) && (slot || starter || /^[A-Z]/.test(nextBare));
    const shortLabel = i >= 2 && i <= 4 && /[a-z]/.test(title) && (slot || starter);
    const oneWord = i === 1 && (slot || starter);
    // "Step 1. Define the production function" is one heading. "Step 2 Solve"
    // still peels, because that number is not followed by numbering punctuation.
    if (/\d{1,2}[.)]$/.test(title)) continue;
    if (oneWord || numbered || shortLabel) {
      return [`${indent}${marks} ${title}`, words.slice(i).join(' ')];
    }
  }

  const glued = findGlueIndex(words);
  if (glued >= 2) {
    return [`${indent}${marks} ${words.slice(0, glued).join(' ')}`, words.slice(glued).join(' ')];
  }
  for (let i = 2; i <= Math.min(words.length - 1, 14); i += 1) {
    const bare = bareWord(words[i] ?? '');
    if (!/[a-z]/.test(words[i - 1] ?? '')) continue;
    if (!/^[A-Z]/.test(bare)) continue;
    if (!words.slice(i + 1).some(word => /^[a-z]/.test(bareWord(word)))) continue;
    const title = words.slice(0, i).join(' ');
    const titlePunct = title.replace(/^\d{1,2}[.)]\s+/, '');
    if (/[.?!]/.test(titlePunct) || title.includes(SLOT_OPEN) || title.length > 90) continue;
    return [`${indent}${marks} ${title}`, words.slice(i).join(' ')];
  }

  const punct = /^(.{1,80}?)[.?!]["')\]]*\s+(\S[\s\S]*)$/.exec(rest);
  if (!punct) return [line];
  const title = punct[1]?.trim() ?? '';
  // "1. Start…" and "Step 1. Define…" keep the number with the heading.
  // The period belongs to the numbering, not to a sentence that should peel.
  if (!title || /\d{1,2}$/.test(title) || title.split(/\s+/).length > 8) return [line];
  return [`${indent}${marks} ${title}`, punct[2]?.trim() ?? ''];
}

function closeDanglingBoldTitle(line: string): string {
  const match = /^(\s*)\*\*([^*\n]+)$/.exec(line);
  if (!match) return line;
  const title = match[2].trim();
  if (!title || title.length > 100) return line;
  return `${match[1]}**${title}**`;
}

function promoteBoldTitle(line: string): string {
  const match = /^\s*\*\*([^*]+)\*\*\s*$/.exec(line);
  if (!match) return line;
  const title = match[1].trim();
  if (title.length < 2 || title.length > 80) return line;
  if (/[.?!]["')\]]*$/.test(title)) return line;
  if (/[\\^_]/.test(title) || title.includes(SLOT_OPEN)) return line;
  if (/^\[[^\]]+\]$/.test(title)) return line;
  return `### ${title}`;
}

function normalizeLayoutLine(line: string): string {
  let next = line.replace(/^(\s*)[•·●\u2013\u2014]\s+/, '$1- ');
  next = next.replace(/^(#{1,6})([^\s#])/, '$1 $2');
  next = closeDanglingBoldTitle(next);
  return promoteBoldTitle(next);
}

const GLUE_START = new Set([
  'A', 'After', 'An', 'Before', 'Consider', 'Here', 'If', 'In', 'It', 'Let',
  'Next', 'Once', 'Suppose', 'That', 'The', 'Then', 'Therefore', 'These',
  'This', 'Thus', 'To', 'We', 'When',
]);

function bareWord(word: string): string {
  return word.replace(/^[("']+/, '').replace(/[.,:;]+$/, '');
}

function findGlueIndex(words: string[]): number {
  const limit = Math.min(words.length - 1, 14);
  for (let i = 2; i <= limit; i += 1) {
    const bare = bareWord(words[i] ?? '');
    if (!/[a-z]/.test(words[i - 1] ?? '')) continue;
    const title = words.slice(0, i).join(' ');
    const titlePunct = title.replace(/^\d{1,2}[.)]\s+/, '');
    if (/[.?!]/.test(titlePunct) || title.includes(SLOT_OPEN) || title.length > 90) continue;
    if (!GLUE_START.has(bare)) continue;
    return i;
  }
  return -1;
}

function stripWrappingBold(text: string): string {
  return text.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
}

/**
 * "Start with the production function The economy produces…" is a heading
 * glued to the next sentence. The same shape inside a list item keeps the
 * short label on the item and returns the sentence to a paragraph.
 */
function splitGluedClause(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || /^(?:---|\*\*\*|___+)$/.test(trimmed)) return [line];
  const list = /^(\s*(?:[-*+]|\d{1,2}[.)])\s+)([\s\S]+)$/.exec(line);
  const content = list ? list[2] ?? '' : trimmed;
  const words = content.split(/[ \t]+/).filter(Boolean);
  const at = findGlueIndex(words);
  if (at < 0) return [line];
  const title = stripWrappingBold(words.slice(0, at).join(' '));
  const rest = words.slice(at).join(' ');
  if (!title || !rest) return [line];
  if (list) return [`${list[1]}${title}`, rest];
  return [`### ${title}`, rest];
}

function nextContentIndex(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i]?.trim()) return i;
  }
  return -1;
}

function joinOrphanSteps(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const nextAt = nextContentIndex(lines, i + 1);
    const next = nextAt >= 0 ? lines[nextAt] : undefined;
    const nextTrim = next?.trim() ?? '';
    if (/^\d{1,2}[.)]?$/.test(line.trim()) && nextTrim) {
      const n = line.trim().replace(/[.)]$/, '');
      const heading = /^(#{1,6})\s+([\s\S]+)$/.exec(nextTrim);
      if (heading) {
        for (const piece of peelHeadingBody(`${heading[1]} ${n}. ${heading[2]}`)) out.push(piece);
        i = nextAt;
        continue;
      }
      const nextIsBlock = /^(?:---|\*\*\*|___|[-*+]\s)/.test(nextTrim);
      if (!nextIsBlock) {
        const merged = `${n}. ${nextTrim.replace(/^\d{1,2}[.)]\s+/, '')}`;
        for (const piece of splitGluedClause(merged)) out.push(piece);
        i = nextAt;
        continue;
      }
    }
    const numericHeading = /^(#{1,6})\s+(\d{1,2})[.)]?\s*$/.exec(line.trim());
    if (numericHeading && nextTrim && !/^(?:---|\*\*\*|___|[-*+]\s|\d{1,2}[.)]?(?:\s|$))/.test(nextTrim)) {
      const marks = numericHeading[1] ?? '###';
      const n = numericHeading[2] ?? '';
      const body = nextTrim.replace(/^#{1,6}\s+/, '');
      for (const piece of peelHeadingBody(`${marks} ${n}. ${body}`)) out.push(piece);
      i = nextAt;
      continue;
    }
    out.push(line);
  }
  return out;
}

function kindOf(line: string, prev: LayoutKind): LayoutKind {
  if (!line.trim()) return 'blank';
  const trimmed = line.trim();
  if (/^#{1,6}\s+\S/.test(trimmed)) return 'heading';
  if (/^(?:---+|\*\*\*+|___+)\s*$/.test(trimmed)) return 'rule';
  if (new RegExp(`^${SLOT_OPEN}\\d+${SLOT_CLOSE}$`).test(trimmed)) return 'slot';
  if (/^\s*[-*+]\s+\S/.test(line)) return 'ul';
  if (/^\s*\d{1,3}[.)]\s+\S/.test(line)) return 'ol';
  if ((prev === 'ul' || prev === 'ol' || prev === 'cont') && /^\s{2,}\S/.test(line)) return 'cont';
  return 'prose';
}

function shouldSeparate(prev: LayoutKind, next: LayoutKind, prevLine: string, nextLine: string): boolean {
  if (next === 'cont') return false;
  if ((prev === 'ul' || prev === 'ol' || prev === 'cont') && (next === 'ul' || next === 'ol')) {
    if (indentOf(nextLine) > indentOf(prevLine)) return false;
    if (prev === 'cont') return false;
    if ((prev === 'ul' && next === 'ul') || (prev === 'ol' && next === 'ol')) return false;
    return true;
  }
  return true;
}

/**
 * Display-only structure repair. Model answers often keep headings, lists,
 * rules, and the next sentence on one line, sometimes inside one bold span.
 * Math and code slots are already extracted. This pass only inserts block
 * boundaries, then CommonMark renders them. Stored text is unchanged.
 */
export function normalizeTutorAnswerLayout(markdown: string): string {
  const text = unwrapStructuralEmphasis(markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  const expanded: string[] = [];
  for (const rawLine of text.split('\n')) {
    for (const ruled of liftThematicBreaks(unwrapWideBold(rawLine))) {
      for (const headed of splitInlineHeadings(ruled)) {
        for (const peeled of peelHeadingBody(normalizeLayoutLine(headed))) {
          for (const listed of explodeInlineLists(peeled)) {
            for (const glued of splitGluedClause(normalizeLayoutLine(listed))) {
              expanded.push(glued);
            }
          }
        }
      }
    }
  }
  const lines = joinOrphanSteps(expanded);

  const out: string[] = [];
  let prevKind: LayoutKind = 'blank';
  let prevLine = '';
  for (const line of lines) {
    const kind = kindOf(line, prevKind);
    if (kind === 'blank') {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      prevKind = 'blank';
      prevLine = '';
      continue;
    }
    if (prevKind !== 'blank' && out.length > 0 && shouldSeparate(prevKind, kind, prevLine, line)) {
      out.push('');
    }
    out.push(line);
    prevKind = kind;
    prevLine = line;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

/**
 * Extract code fences first, then math from remaining text.
 * Returns Markdown-safe string + slot table for React expansion.
 */
export function prepareAskAcademicMarkdown(input: string): {
  markdown: string;
  slots: AskProtectedSlot[];
} {
  if (!input) return { markdown: '', slots: [] };

  const { text: afterCode, slots } = extractFencedCode(input);
  const segments = parseAiExplanationSegments(wrapBareLatex(afterCode));
  let markdown = '';

  for (const seg of segments) {
    if (seg.type === 'text') {
      markdown += seg.value;
      continue;
    }
    const idx = slots.length;
    if (seg.type === 'inline') {
      slots.push({ kind: 'inline_math', latex: seg.latex });
      markdown += askSlotToken(idx);
    } else {
      slots.push({ kind: 'display_math', latex: seg.latex });
      // Block math as its own paragraph for Markdown structure.
      markdown += `\n\n${askSlotToken(idx)}\n\n`;
    }
  }

  markdown = normalizeTutorAnswerLayout(markdown);

  // Keep citation markers on the same prose line (M0.9B.1).
  markdown = markdown.replace(/([^\n\r])[\t ]*[\r\n]+[\t ]*(\[\d+\])/g, '$1 $2');

  return { markdown, slots };
}

/**
 * Split a plain string into text / slot tokens / citation markers.
 * Used inside Markdown text nodes.
 */
export type AskInlinePiece =
  | { type: 'text'; value: string }
  | { type: 'slot'; index: number }
  | { type: 'citation'; index: number };

/** Collapse newlines immediately before a citation so markers stay inline with prose. */
function trimTrailingBreaksForInlineCitation(value: string): string {
  if (!value) return value;
  const withoutBreaks = value.replace(/[\t ]*[\r\n]+[\t ]*$/g, ' ');
  return withoutBreaks.replace(/[ \t]{2,}$/g, ' ');
}

const CITATION_OR_SLOT_RE = new RegExp(
  `${SLOT_OPEN}\\d+${SLOT_CLOSE}|\\[(\\d+)\\]`,
  'g',
);

export function splitAskInlinePieces(value: string): AskInlinePiece[] {
  if (!value) return [];
  const parts: AskInlinePiece[] = [];
  let last = 0;
  CITATION_OR_SLOT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION_OR_SLOT_RE.exec(value)) !== null) {
    if (m.index > last) {
      let text = value.slice(last, m.index);
      const token = m[0];
      const slotIdx = parseAskSlotToken(token);
      if (slotIdx == null) {
        text = trimTrailingBreaksForInlineCitation(text);
      }
      if (text) parts.push({ type: 'text', value: text });
    }
    const token = m[0];
    const slotIdx = parseAskSlotToken(token);
    if (slotIdx != null) {
      parts.push({ type: 'slot', index: slotIdx });
    } else {
      parts.push({ type: 'citation', index: Number(m[1]) });
    }
    last = m.index + token.length;
  }
  if (last < value.length) {
    parts.push({ type: 'text', value: value.slice(last) });
  }
  return parts.length > 0 ? parts : [{ type: 'text', value }];
}
