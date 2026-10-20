/**
 * Display-only wrapping of bare LaTeX commands in Tutor answers.
 * Stored conversation text is not changed. Delimited math is left alone.
 * A span is wrapped only when the existing KaTeX renderer accepts it.
 */

import { parseAiExplanationSegments } from '../explainSelection/parseAiExplanationSegments';
import { renderKatexHtml } from '../../notebookMath';

const MAX_BARE_EXPR_CHARS = 240;

function readBalanced(text: string, openIndex: number): number | null {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

/** End index of a lettered LaTeX command, or null when its braces are broken. */
function readCommand(text: string, slash: number): number | null {
  if (text[slash] !== '\\' || !/[a-zA-Z]/.test(text[slash + 1] ?? '')) return null;
  let i = slash + 1;
  while (i < text.length && /[a-zA-Z]/.test(text[i] ?? '')) i += 1;
  while (i < text.length && text[i] === '{') {
    const end = readBalanced(text, i);
    if (end === null) return null;
    i = end;
  }
  while (i < text.length && (text[i] === '_' || text[i] === '^')) {
    const next = text[i + 1];
    if (next === '{') {
      const end = readBalanced(text, i + 1);
      if (end === null) return null;
      i = end;
    } else if (next && /[A-Za-z0-9]/.test(next)) {
      i += 2;
    } else {
      break;
    }
  }
  return i;
}

function expandLeft(text: string, slash: number): number {
  let i = slash;
  while (i > 0) {
    let j = i;
    while (j > 0 && text[j - 1] === ' ') j -= 1;
    const ch = text[j - 1];
    if (!ch || ch === '\n') break;
    if (/[+\-*/=<>|()[\],]/.test(ch)) {
      i = j - 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      while (j > 0 && /[0-9.]/.test(text[j - 1] ?? '')) j -= 1;
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let k = j;
      while (k > 0 && /[A-Za-z]/.test(text[k - 1] ?? '')) k -= 1;
      if (j - k >= 3) break;
      if (k > 0 && (text[k - 1] === '_' || text[k - 1] === '^')) {
        k -= 1;
        if (k > 0 && /[A-Za-z0-9]/.test(text[k - 1] ?? '')) {
          let p = k;
          while (p > 0 && /[A-Za-z0-9]/.test(text[p - 1] ?? '')) p -= 1;
          if (k - p >= 3) break;
          k = p;
        }
      }
      i = k;
      continue;
    }
    break;
  }
  return i;
}

function expandRight(text: string, end: number): number {
  let i = end;
  while (i < text.length) {
    let j = i;
    while (j < text.length && text[j] === ' ') j += 1;
    const ch = text[j];
    if (!ch || ch === '\n') break;
    if (/[+\-*/=<>|()[\],]/.test(ch)) {
      i = j + 1;
      continue;
    }
    if (ch === '\\') {
      const cmdEnd = readCommand(text, j);
      if (cmdEnd === null) break;
      i = cmdEnd;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      while (j < text.length && /[0-9.]/.test(text[j] ?? '')) j += 1;
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let k = j;
      while (k < text.length && /[A-Za-z]/.test(text[k] ?? '')) k += 1;
      if (k - j >= 3) break;
      if (text[k] === '_' || text[k] === '^') {
        if (text[k + 1] === '{') {
          const balanced = readBalanced(text, k + 1);
          if (balanced === null) break;
          k = balanced;
        } else if (text[k + 1] && /[A-Za-z0-9]/.test(text[k + 1])) {
          k += 2;
        }
      }
      i = k;
      continue;
    }
    break;
  }
  return i;
}

function wrappedSpan(text: string, from: number, to: number): string | null {
  if (to - from > MAX_BARE_EXPR_CHARS) return null;
  const raw = text.slice(from, to);
  const expr = raw.trim();
  if (!expr.includes('\\') || renderKatexHtml(expr, false).error) return null;
  const lead = raw.slice(0, raw.length - raw.trimStart().length);
  const trail = raw.slice(raw.trimEnd().length);
  return `${lead}\\(${expr}\\)${trail}`;
}

function wrapBareCommands(text: string): string {
  if (!text.includes('\\')) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const slash = text.indexOf('\\', i);
    if (slash < 0) {
      out += text.slice(i);
      break;
    }
    const commandEnd = readCommand(text, slash);
    if (commandEnd === null) {
      out += text.slice(i, slash + 1);
      i = slash + 1;
      continue;
    }
    const start = expandLeft(text, slash);
    const end = expandRight(text, commandEnd);
    const expanded = wrappedSpan(text, start, end);
    const commandOnly = expanded ? null : wrappedSpan(text, slash, commandEnd);
    const wrapped = expanded ?? commandOnly;
    if (!wrapped) {
      out += text.slice(i, slash + 1);
      i = slash + 1;
      continue;
    }
    out += text.slice(i, expanded ? start : slash) + wrapped;
    i = expanded ? end : commandEnd;
  }
  return out;
}

/**
 * Wrap bare commands that KaTeX can render. Existing \( \), \[ \], and $
 * spans are preserved. Currency and broken commands stay as text.
 */
export function wrapBareLatex(input: string): string {
  if (!input.includes('\\')) return input;
  const segments = parseAiExplanationSegments(input);
  let out = '';
  for (const seg of segments) {
    if (seg.type === 'text') {
      out += wrapBareCommands(seg.value);
    } else if (seg.type === 'inline') {
      out += `\\(${seg.latex}\\)`;
    } else {
      out += `\\[${seg.latex}\\]`;
    }
  }
  return out;
}
