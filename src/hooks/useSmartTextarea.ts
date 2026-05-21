/**
 * useSmartTextarea — shared editing intelligence for plain textarea surfaces.
 *
 * Features:
 *   1. Arrow text transforms  — ->→, =>→, <=>↔, <=←, <-← on Space
 *   2. Smart bullet lists     — Enter continues `- ` bullets; double-Enter exits;
 *                               Backspace clears empty bullet prefix
 *
 * Usage:
 *   const { onKeyDown } = useSmartTextarea({ value, onChange });
 *   <textarea onKeyDown={onKeyDown} ... />
 */

import { useCallback } from 'react';

// ── Arrow transforms ──────────────────────────────────────────────────────────

/**
 * Ordered longest-first so `<=>` is matched before `<=` or `=>`.
 */
const ARROW_TRANSFORMS: [pattern: string, replacement: string][] = [
  ['<=>',  '↔'],
  ['=>',   '→'],
  ['->',   '→'],
  ['<=',   '←'],
  ['<-',   '←'],
];

/**
 * Check if the text immediately before the cursor ends with a known arrow pattern.
 * Returns the match details or null.
 */
export function applyArrowTransform(
  textBefore: string,
): { replacement: string; patternLength: number } | null {
  for (const [pattern, replacement] of ARROW_TRANSFORMS) {
    if (textBefore.endsWith(pattern)) {
      return { replacement, patternLength: pattern.length };
    }
  }
  return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface SmartTextareaOptions {
  value: string;
  onChange: (newValue: string) => void;
  /** Enable smart bullet continuation on Enter. Default: true */
  bullets?: boolean;
  /** Enable arrow text transforms on Space. Default: true */
  arrows?: boolean;
}

export function useSmartTextarea({
  value,
  onChange,
  bullets = true,
  arrows  = true,
}: SmartTextareaOptions) {
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const { selectionStart, selectionEnd } = el;

      // Only act on collapsed cursor (no text selected)
      if (selectionStart !== selectionEnd) return;

      const pos    = selectionStart ?? 0;
      const before = value.slice(0, pos);
      const after  = value.slice(pos);

      // ── Arrow transforms — fired on Space ──────────────────────────────────
      if (arrows && e.key === ' ') {
        const match = applyArrowTransform(before);
        if (match) {
          e.preventDefault();
          const newBefore = before.slice(0, before.length - match.patternLength) + match.replacement;
          const newValue  = newBefore + ' ' + after;
          onChange(newValue);
          // Restore cursor after the replacement character + the space we inserted
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = newBefore.length + 1;
          });
          return;
        }
      }

      // ── Smart bullets — fired on Enter ─────────────────────────────────────
      if (bullets && e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const lineStart   = before.lastIndexOf('\n') + 1; // 0 if no prior newline
        const currentLine = before.slice(lineStart);

        // Empty bullet → exit bullet mode
        if (currentLine === '- ') {
          e.preventDefault();
          // Replace the trailing `- ` with a plain newline
          const newValue = value.slice(0, lineStart) + '\n' + after;
          onChange(newValue);
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = lineStart + 1;
          });
          return;
        }

        // Bullet with content → continue bullet on next line
        if (/^- .+/.test(currentLine)) {
          e.preventDefault();
          const insert  = '\n- ';
          const newValue = before + insert + after;
          onChange(newValue);
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = pos + insert.length;
          });
          return;
        }
      }

      // ── Backspace — clean empty bullet prefix ──────────────────────────────
      if (bullets && e.key === 'Backspace') {
        const lineStart   = before.lastIndexOf('\n') + 1;
        const currentLine = before.slice(lineStart);
        // Cursor is right after `- ` and the line is otherwise empty
        if (currentLine === '- ' && pos === lineStart + 2) {
          e.preventDefault();
          const newValue = value.slice(0, lineStart) + after;
          onChange(newValue);
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = lineStart;
          });
          return;
        }
      }
    },
    [value, onChange, bullets, arrows],
  );

  return { onKeyDown };
}
