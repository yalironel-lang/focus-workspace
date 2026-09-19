/**
 * Split AI explanation text into plain / inline / display math segments.
 * Supports \(...\) and \[...\] (model-common). Also $...$ / $$...$$ for robustness.
 * Unclosed delimiters and non-math content stay as plain text — never HTML.
 */

import type { MathSegment } from '../../notebookMath';

export type AiExplanationSegment = MathSegment;

function findClose(input: string, from: number, closer: string): number {
  return input.indexOf(closer, from);
}

/**
 * Parse mixed educational text from explain_selection into render segments.
 */
export function parseAiExplanationSegments(input: string): AiExplanationSegment[] {
  if (!input) return [{ type: 'text', value: '' }];

  const segments: AiExplanationSegment[] = [];
  let i = 0;

  const pushText = (value: string) => {
    if (!value) return;
    const last = segments[segments.length - 1];
    if (last?.type === 'text') {
      last.value += value;
    } else {
      segments.push({ type: 'text', value });
    }
  };

  while (i < input.length) {
    // Display: \[ ... \] (may span lines)
    if (input.startsWith('\\[', i)) {
      const close = findClose(input, i + 2, '\\]');
      if (close !== -1) {
        const latex = input.slice(i + 2, close).trim();
        if (latex) segments.push({ type: 'display', latex });
        else pushText(input.slice(i, close + 2));
        i = close + 2;
        continue;
      }
      pushText('\\[');
      i += 2;
      continue;
    }

    // Display: $$ ... $$
    if (input.startsWith('$$', i)) {
      const close = findClose(input, i + 2, '$$');
      if (close !== -1) {
        const latex = input.slice(i + 2, close).trim();
        if (latex) segments.push({ type: 'display', latex });
        else pushText(input.slice(i, close + 2));
        i = close + 2;
        continue;
      }
      pushText('$$');
      i += 2;
      continue;
    }

    // Inline: \( ... \)
    if (input.startsWith('\\(', i)) {
      const close = findClose(input, i + 2, '\\)');
      if (close !== -1) {
        const latex = input.slice(i + 2, close).trim();
        if (latex) segments.push({ type: 'inline', latex });
        else pushText(input.slice(i, close + 2));
        i = close + 2;
        continue;
      }
      pushText('\\(');
      i += 2;
      continue;
    }

    // Inline: $ ... $ (not $$)
    if (input[i] === '$') {
      const close = findClose(input, i + 1, '$');
      if (close !== -1 && input[close + 1] !== '$') {
        const latex = input.slice(i + 1, close).trim();
        if (latex) segments.push({ type: 'inline', latex });
        else pushText(input.slice(i, close + 1));
        i = close + 1;
        continue;
      }
      pushText('$');
      i += 1;
      continue;
    }

    // Accumulate plain text until next candidate delimiter.
    let next = input.length;
    for (let j = i + 1; j < input.length; j += 1) {
      const ch = input[j];
      if (ch === '$') {
        next = j;
        break;
      }
      if (ch === '\\' && (input[j + 1] === '[' || input[j + 1] === '(')) {
        next = j;
        break;
      }
    }
    pushText(input.slice(i, next));
    i = next;
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: input }];
}
