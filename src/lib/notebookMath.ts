/**
 * KaTeX helpers for notebook math — pure functions, safe to memoize in React.
 */

import katex from 'katex';

export type MathSegment =
  | { type: 'text'; value: string }
  | { type: 'inline'; latex: string }
  | { type: 'display'; latex: string };

export interface KatexRenderResult {
  html: string;
  error: string | null;
}

/** True if string contains $ delimiters worth parsing. */
export function textHasMathDelimiters(text: string): boolean {
  return /\$/.test(text);
}

/**
 * Split paragraph text into text / inline / display segments.
 * Supports $...$ and $$...$$ (non-greedy, no multiline display across lines in one pass).
 */
export function parseMathSegments(input: string): MathSegment[] {
  if (!input) return [{ type: 'text', value: '' }];
  if (!textHasMathDelimiters(input)) return [{ type: 'text', value: input }];

  const segments: MathSegment[] = [];
  let i = 0;

  while (i < input.length) {
    if (input.startsWith('$$', i)) {
      const close = input.indexOf('$$', i + 2);
      if (close !== -1) {
        const latex = input.slice(i + 2, close).trim();
        if (latex) segments.push({ type: 'display', latex });
        i = close + 2;
        continue;
      }
    }
    if (input[i] === '$' && input[i + 1] !== '$') {
      const close = input.indexOf('$', i + 1);
      if (close !== -1) {
        const latex = input.slice(i + 1, close).trim();
        if (latex) segments.push({ type: 'inline', latex });
        i = close + 1;
        continue;
      }
    }

    let next = input.length;
    for (let j = i + 1; j < input.length; j += 1) {
      if (input[j] === '$') {
        next = j;
        break;
      }
    }
    const chunk = input.slice(i, next);
    if (chunk) segments.push({ type: 'text', value: chunk });
    i = next === input.length ? input.length : next;
    if (i < input.length && input[i] === '$') continue;
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: input }];
}

export function renderKatexHtml(latex: string, displayMode: boolean): KatexRenderResult {
  const trimmed = latex.trim();
  if (!trimmed) {
    return { html: '', error: null };
  }
  try {
    const html = katex.renderToString(trimmed, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'html',
    });
    const hasError = html.includes('katex-error');
    return {
      html,
      error: hasError ? 'Could not render this expression' : null,
    };
  } catch (err) {
    return {
      html: '',
      error: err instanceof Error ? err.message : 'Invalid LaTeX',
    };
  }
}

/** Normalize student shorthand to LaTeX when no backslashes present. */
export function normalizeMathInput(raw: string): string {
  const t = raw.trim();
  if (!t || t.includes('\\')) return raw;
  return t
    .replace(/\^(\d+)/g, '^{$1}')
    .replace(/sqrt\(([^)]+)\)/gi, '\\sqrt{$1}');
}
