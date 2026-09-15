/**
 * Plain-text paste for TipTap sandbox.
 * Newlines → dialect blocks (via parseNotebookLine), never hardBreak.
 * HTML-only paste is refused.
 *
 * M6.4B: paste inside a table cell stays in that cell as single-line plain text.
 * No top-level block creation, no HTML/TSV table import.
 *
 * Policy: do NOT strip Unicode bidi control characters from user paste.
 * ZIKUK implements RTL via DOM dir/isolation and never injects bidi controls.
 */

import { Extension } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import { parseNotebookLine, notebookLineToBlock } from '../notebookDialect';
import { blockToTiptapNode } from './blocksToTiptapDoc';

function linesToJsonNodes(text: string): JSONContent[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  return lines.map(line => {
    const block = notebookLineToBlock(parseNotebookLine(line));
    if (block.kind === 'bullet' && block.depth > 2) {
      return blockToTiptapNode({ ...block, depth: 2 });
    }
    return blockToTiptapNode(block);
  });
}

function selectionInsideTableCell(state: {
  selection: { $from: { depth: number; node: (d: number) => { type: { name: string } } } };
}): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'nbTableCell' || name === 'nbTableHeader') return true;
    if (name === 'nbTable') return false;
  }
  return false;
}

/** Collapse pasted plain text into one cell-safe string (no new rows/cols/blocks). */
function normalizeCellPasteText(plain: string): string {
  return plain
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\n+/g, ' ');
}

export const NotebookSandboxPaste = Extension.create({
  name: 'notebookSandboxPaste',
  // Registered after table extensions; keep priority high within that slot.
  priority: 1200,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('notebookSandboxPaste'),
        props: {
          handlePaste(view, event) {
            const plain = event.clipboardData?.getData('text/plain') ?? '';
            if (!plain) {
              // HTML-only (incl. HTML tables) — refuse.
              event.preventDefault();
              return true;
            }

            // M6.4B: keep paste inside the active cell; never create top-level blocks.
            if (selectionInsideTableCell(view.state)) {
              event.preventDefault();
              const text = normalizeCellPasteText(plain);
              if (!text) return true;
              const { from, to } = view.state.selection;
              view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView());
              return true;
            }

            event.preventDefault();
            const nodesJson = linesToJsonNodes(plain);
            const schema = view.state.schema;
            const pmNodes = [];
            for (const j of nodesJson) {
              try {
                pmNodes.push(schema.nodeFromJSON(j));
              } catch {
                pmNodes.push(schema.node('nbParagraph', { variant: null }));
              }
            }
            if (!pmNodes.length) return true;
            const fragment = Fragment.fromArray(pmNodes);
            const first = pmNodes[0];
            const last = pmNodes[pmNodes.length - 1];
            const openStart = first.type.name === 'nbParagraph' && first.attrs.variant == null ? 1 : 0;
            const openEnd = last.type.name === 'nbParagraph' && last.attrs.variant == null ? 1 : 0;
            const slice = new Slice(fragment, openStart, openEnd);
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            return true;
          },
          handleDrop(_view, event) {
            if (event.dataTransfer?.files?.length) {
              event.preventDefault();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
