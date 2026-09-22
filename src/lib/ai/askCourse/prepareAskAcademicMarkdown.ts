/**
 * M0.9C3 — prepare Ask assistant text for safe Markdown rendering.
 *
 * Protects fenced code and existing KaTeX math (via parseAiExplanationSegments)
 * behind opaque placeholders so react-markdown cannot alter them.
 * Does not interpret HTML.
 */

import { parseAiExplanationSegments } from '../explainSelection/parseAiExplanationSegments';

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
  const segments = parseAiExplanationSegments(afterCode);
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
