/**
 * Editable-sandbox visual BiDi isolation for inline `$...$` / `$$...$$` *source*.
 *
 * Architecture:
 * - Inline math while editing is PLAIN TEXT (not a TipTap node/mark, not MathRichText).
 * - Read-only viewer uses MathRichText → KatexPreview with LTR isolate.
 * - This plugin applies ProseMirror Decoration.inline only — document JSON/body unchanged.
 * - Never injects Unicode bidi control characters; never rewrites LaTeX.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

export type MathSourceRange = { from: number; to: number };

/**
 * Offsets into a single textblock's textContent, inclusive of `$` / `$$` delimiters.
 * Mirrors notebookMath.parseMathSegments pairing rules (complete pairs only).
 */
export function findDelimitedMathSourceRanges(text: string): MathSourceRange[] {
  if (!text || !text.includes('$')) return [];
  const ranges: MathSourceRange[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const close = text.indexOf('$$', i + 2);
      if (close !== -1) {
        const latex = text.slice(i + 2, close).trim();
        if (latex) ranges.push({ from: i, to: close + 2 });
        i = close + 2;
        continue;
      }
    }
    if (text[i] === '$' && text[i + 1] !== '$') {
      const close = text.indexOf('$', i + 1);
      if (close !== -1) {
        const latex = text.slice(i + 1, close).trim();
        if (latex) ranges.push({ from: i, to: close + 1 });
        i = close + 1;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
}

const ISOLATE_ATTRS = {
  nodeName: 'span',
  class: 'nb-tiptap-math-src-isolate',
  dir: 'ltr',
  'data-nb-math-src-isolate': '1',
  style: 'direction:ltr;unicode-bidi:isolate',
} as const;

export function buildInlineMathSourceDecorations(doc: PmNode): DecorationSet {
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textContent;
    const ranges = findDelimitedMathSourceRanges(text);
    if (!ranges.length) return;
    // For textblocks of only inline text, char index maps to pos+1+index.
    for (const r of ranges) {
      out.push(Decoration.inline(pos + 1 + r.from, pos + 1 + r.to, { ...ISOLATE_ATTRS }));
    }
  });
  return DecorationSet.create(doc, out);
}

const pluginKey = new PluginKey('notebookSandboxInlineMathIsolate');

/** DEV sandbox only — visual isolate for math source while typing. */
export const NotebookSandboxInlineMathIsolate = Extension.create({
  name: 'notebookSandboxInlineMathIsolate',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_cfg, state) => buildInlineMathSourceDecorations(state.doc),
          apply: (tr, old) =>
            tr.docChanged ? buildInlineMathSourceDecorations(tr.doc) : old,
        },
        props: {
          decorations: state => pluginKey.getState(state),
        },
      }),
    ];
  },
});
